import {paymentResult} from './payment-result.js';
import {challengeAction} from './three-ds.js';
export const orderId=value=>typeof value==='string'&&/^ORD[A-Z0-9]{10,60}$/.test(value);
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
export const orderHeaders=(token,mode)=>({Authorization:`Bearer ${token}`,Accept:'application/json',...(mode==='sandbox'?{'X-Test-Token':'true'}:{})});
export function orderCredentialsValid(account,token,mode) {
  const test=Array.isArray(account?.tags)&&account.tags.includes('test_user');
  return typeof token==='string'&&!token.startsWith('TEST-')&&(mode==='sandbox'?test:mode==='production'&&!test);
}
const amount=cents=>`${Math.floor(cents/100)}.${String(cents%100).padStart(2,'0')}`;
const cents=value=>typeof value==='string'&&/^\d{1,12}(\.\d{1,2})?$/.test(value)?Number(value.split('.')[0])*100+Number((value.split('.')[1]||'').padEnd(2,'0')):null;

// Orders informa duração ISO 8601; Pix sem duração explícita vence em 24h.
export function pixExpiration(order,tx) {
  if(typeof tx.date_of_expiration==='string'&&Number.isFinite(Date.parse(tx.date_of_expiration)))return tx.date_of_expiration;
  const created=Date.parse(tx.created_date||order.created_date),duration=tx.expiration_time??'P1D';
  if(!Number.isFinite(created)||typeof duration!=='string')return undefined;
  const match=/^P(?:(\d{1,2})D)?(?:T(?:(\d{1,3})H)?(?:(\d{1,4})M)?(?:(\d{1,7}(?:\.\d{1,3})?)S)?)?$/.exec(duration);
  if(!match)return undefined;
  const seconds=Number(match[1]||0)*86400+Number(match[2]||0)*3600+Number(match[3]||0)*60+Number(match[4]||0);
  return seconds>=1800&&seconds<=2592000?new Date(created+seconds*1000).toISOString():undefined;
}

export function createOrderProcessor({admin,env,diagnose=()=>{},onAction=()=>{}}) {
  return async({paymentId,payment:order})=>{
    if(!orderId(paymentId)||order?.id!==paymentId||!uuid(order.external_reference)){diagnose('PAYMENT_ORDER_RESPONSE_INVALID');return false;}
    const context=await admin.rpc('service_orders_payment_context',{p_request_key:order.external_reference});
    const ctx=context.data;
    if(context.error||!ctx){diagnose('PAYMENT_ORDER_CONTEXT_INVALID',{sql_code:context.error?.code});return false;}
    const mode=env('MERCADO_PAGO_ENV'),collector=env('MERCADO_PAGO_COLLECTOR_ID');
    if(ctx.provider_mode!==mode||ctx.collector_id!==collector||String(order.user_id)!==collector||(typeof order.user_id==='number'&&!Number.isSafeInteger(order.user_id))){diagnose('PAYMENT_ORDER_ACCOUNT_MISMATCH');return false;}
    if(ctx.payment_id&&ctx.payment_id!==order.id){diagnose('PAYMENT_ORDER_LINK_MISMATCH');return false;}
    if(order.type!=='online'||order.country_code!=='BRA'||(order.currency!==undefined&&order.currency!=='BRL')||(order.currency_id!==undefined&&order.currency_id!=='BRL')||(order.live_mode!==undefined&&order.live_mode!==(mode==='production'))){diagnose('PAYMENT_ORDER_MARKET_MISMATCH');return false;}
    const transactions=order.transactions?.payments;
    if(!Number.isSafeInteger(ctx.total_cents)||ctx.total_cents<=0||cents(order.total_amount)!==ctx.total_cents||!Array.isArray(transactions)||transactions.length!==1||cents(transactions[0].amount)!==ctx.total_cents){diagnose('PAYMENT_ORDER_AMOUNT_MISMATCH');return false;}
    const tx=transactions[0],updated=order.last_updated_date;
    if(typeof updated!=='string'||!Number.isFinite(Date.parse(updated))){diagnose('PAYMENT_TIMESTAMP_INVALID');return false;}
    let state='review';
    const refunds=order.transactions.refunds,chargebacks=order.transactions.chargebacks;
    if((refunds!==undefined&&!Array.isArray(refunds))||(chargebacks!==undefined&&!Array.isArray(chargebacks)))return false;
    const refunded=(refunds||[]).reduce((sum,refund)=>{const value=cents(refund.amount);return sum===null||value===null?null:sum+value;},0);
    if(refunded===null||refunded>ctx.total_cents)return false;
    if(chargebacks?.length)state='review';
    else if(refunded===ctx.total_cents&&order.status==='refunded'&&tx.status==='refunded'&&refunds.every(refund=>refund.status==='processed'))state='refunded';
    else if(refunds?.length||order.status_detail==='partially_refunded'||tx.status_detail==='partially_refunded')state='review';
    else if(order.status==='processed'&&order.status_detail==='accredited'&&tx.status==='processed'&&tx.status_detail==='accredited'&&cents(order.total_paid_amount)===ctx.total_cents)state='paid';
    else if(['created','processing','action_required'].includes(order.status)&&['created','processing','action_required'].includes(tx.status))state='pending';
    else if(['failed','canceled','cancelled'].includes(order.status)&&['failed','canceled','cancelled'].includes(tx.status)&&cents(order.total_paid_amount)===0)state='failed';
    const method=tx.payment_method||{};
    const result=paymentResult({id:order.id,payment_method_id:method.id,date_of_expiration:method.id==='pix'?pixExpiration(order,tx):undefined,point_of_interaction:{transaction_data:method}},state);
    result.method=method.id==='pix'?'pix':['credit_card','debit_card'].includes(method.type)?method.type:'unknown';
    if(state==='pending'&&tx.status_detail==='pending_challenge')result.requires_action=true;
    const saved=await admin.rpc('service_record_order_payment',{p_request_key:ctx.request_key,p_payment_id:order.id,p_state:state,p_updated_at:updated,p_total_cents:ctx.total_cents,p_result:result});
    if(saved.error||!['paid','pending','refunded','review','stale','duplicate'].includes(saved.data)){diagnose('PAYMENT_RECORD_RPC',{sql_code:saved.error?.code});return false;}
    if(state==='pending'&&!['stale','review'].includes(saved.data))onAction(challengeAction(order));
    return true;
  };
}

export async function runOrdersCheckout({body,data,user,input,account,admin,env,fetchImpl,diagnose,reply,ready,uncertain}) {
  const mode=env('MERCADO_PAGO_ENV'),collector=env('MERCADO_PAGO_COLLECTOR_ID'),token=env('MERCADO_PAGO_ACCESS_TOKEN');
  if(!orderCredentialsValid(account,token,mode)){
    diagnose('PAYMENT_ORDERS_CREDENTIALS_REQUIRED');return reply(503,'CONFIG_ORDERS_CREDENTIALS','Confira as credenciais da API Orders.');
  }
  const submission=data.submission;
  if(submission?.api_kind==='orders'&&(submission.state!=='failed'||(body.action==='refresh'&&submission.result?.payment_id))&&(submission.provider_mode!==mode||submission.collector_id!==collector))return reply(503,'CONFIG_MISMATCH','A conta ou ambiente mudou durante esta tentativa.');
  let action=null;
  const process=createOrderProcessor({admin,env,diagnose,onAction:value=>{action=value;}});
  const options=()=>({headers:orderHeaders(token,mode),signal:AbortSignal.timeout(12000),redirect:'error'});
  const expectedReference=body.action==='refresh'?submission?.request_key:body.request_key;
  const apply=async id=>{
    if(!orderId(id))return false;
    const response=await fetchImpl(`https://api.mercadopago.com/v1/orders/${id}`,options());
    if(!response.ok){diagnose('PAYMENT_ORDER_HTTP',{http_status:response.status});return false;}
    const order=await response.json();
    if(order.external_reference!==expectedReference)return false;
    return process({paymentId:id,payment:order});
  };
  const updated=async()=>{const result=await admin.rpc('service_transparent_context',{p_user_id:user.id,p_order_id:body.order_id});return result.error||!result.data?uncertain():ready(result.data,action?{action}:{});};
  if(body.action==='refresh') {
    if(!submission||(submission.state==='failed'&&!submission.result?.payment_id))return ready(data);
    if(submission.result?.payment_id){if(!await apply(submission.result.payment_id))return uncertain();}
    else {
      const created=Date.parse(submission.created_at);if(!Number.isFinite(created))return uncertain();
      const params=new URLSearchParams({begin_date:new Date(created-60000).toISOString(),end_date:new Date(Date.now()+60000).toISOString(),external_reference:submission.request_key,type:'online',page:'1',page_size:'10'});
      const response=await fetchImpl(`https://api.mercadopago.com/v1/orders?${params}`,options());
      if(!response.ok){diagnose('PAYMENT_ORDER_HTTP',{http_status:response.status});return uncertain();}
      const found=await response.json(),total=typeof found.paging?.total==='string'&&/^\d{1,6}$/.test(found.paging.total)?Number(found.paging.total):found.paging?.total;
      if(!Array.isArray(found.data)||total!==1||found.data.length!==1){diagnose('PAYMENT_ORDER_SEARCH_UNRESOLVED');return uncertain();}
      if(!await apply(found.data[0].id))return uncertain();
    }
    return updated();
  }
  if(!['confirmed','preparing'].includes(data.order_status)||data.payment_status!=='pending'||!uuid(body.request_key))return reply(409,'ORDER_UNAVAILABLE','Pedido indisponível para pagamento.');
  const type=input.payment_method_id==='pix'?'bank_transfer':body.form_data?.payment_type_id;
  if(!['credit_card','debit_card','bank_transfer'].includes(type)||(input.payment_method_id!=='pix'&&type==='bank_transfer'))return reply(400,'INVALID_DATA','Confira o tipo do pagamento.');
  const method={id:input.payment_method_id,type,...(type==='bank_transfer'?{}:{token:input.token,installments:input.installments})};
  // Cenário oficial Pix/APRO: a simulação ocorre no provedor, somente com conta de teste.
  const payer=mode==='sandbox'&&type==='bank_transfer'?{...input.payer,first_name:'APRO'}:input.payer;
  const payload={type:'online',processing_mode:'automatic',total_amount:amount(data.total_cents),external_reference:body.request_key,payer,transactions:{payments:[{amount:amount(data.total_cents),payment_method:method}]}};
  // Mantém o corpo original de tentativas anteriores ao suporte 3DS.
  const version=submission?.request_key===body.request_key?(submission.payload_version||1):2;
  if(version>=2&&type!=='bank_transfer')payload.config={online:{transaction_security:{validation:'on_fraud_risk',liability_shift:'required'}}};
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))),fingerprint=Array.from(new Uint8Array(hash),v=>v.toString(16).padStart(2,'0')).join('');
  const begin=await admin.rpc('service_begin_order_payment',{p_user_id:user.id,p_order_id:body.order_id,p_request_key:body.request_key,p_fingerprint:fingerprint,p_mode:mode,p_collector_id:collector});
  if(begin.error||!begin.data)return reply(409,'PAYMENT_BLOCKED','Já existe uma tentativa de pagamento. Verifique o resultado.');
  if(!begin.data.can_submit)return updated();
  if(!uuid(begin.data.idempotency_key))return uncertain();
  const response=await fetchImpl('https://api.mercadopago.com/v1/orders',{method:'POST',headers:{...orderHeaders(token,mode),'Content-Type':'application/json','X-Idempotency-Key':begin.data.idempotency_key},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!response.ok){
    const error=await response.json().catch(()=>null),codes=[error?.error,error?.code,...(Array.isArray(error?.errors)?error.errors.slice(0,10).map(item=>item.code):[])];
    const authorization=[401,403].includes(response.status),validation=[400,422].includes(response.status)&&codes.some(code=>['unsupported_properties','minimum_properties','property_value','invalid_total_amount','empty_required_header','invalid_payment_method','card_token_creation_failed'].includes(code));
    diagnose(authorization?'PAYMENT_ORDERS_AUTHORIZATION_REJECTED':'PAYMENT_ORDER_HTTP',{http_status:response.status});
    if(begin.data.fresh&&(authorization||validation)){
      const rejected=await admin.rpc('service_reject_transparent_payment',{p_order_id:body.order_id,p_request_key:body.request_key});
      if(rejected.error||rejected.data!==true)return uncertain();
      return authorization?reply(503,'CONFIG_ORDERS_CREDENTIALS','O Mercado Pago não autorizou as credenciais da API Orders.'):reply(422,'PAYMENT_REJECTED','Confira os dados de pagamento e tente novamente.');
    }
    return uncertain();
  }
  const order=await response.json();
  if(!orderId(order.id)||!await apply(order.id))return uncertain();
  return updated();
}
