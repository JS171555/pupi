import {createPaymentProcessor} from './processor.js';
import {providerFailureStage} from './provider-error.js';
import {runOrdersCheckout,orderCredentialsValid} from './orders.js';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(status,code,error,extra={})=>new Response(JSON.stringify({code,error,...extra}),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const uncertain=()=>reply(503,'PAYMENT_UNCERTAIN','Pagamento em verificação. Consulte o resultado antes de tentar novamente.');
function fields(form,{allowMissingPixDocument=false,diagnose=()=>{}}={}) {
  const invalid=stage=>{diagnose(stage);throw Error('invalid');};
  if(!form||typeof form!=='object')invalid('PAYMENT_INPUT_INVALID');
  const email=form.payer?.email,doc=form.payer?.identification,method=form.payment_method_id;
  if(typeof email!=='string'||email.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))invalid('PAYMENT_INPUT_EMAIL_INVALID');
  if(typeof method!=='string'||!/^[a-z0-9_]{1,40}$/.test(method)||['account_money','mercado_credit','bolbradesco'].includes(method))invalid('PAYMENT_INPUT_METHOD_INVALID');
  const result={payment_method_id:method,payer:{email}};
  const missingDocument=doc===undefined||doc===null||(typeof doc==='object'&&(doc.number===undefined||doc.number===null||doc.number===''));
  if(!(allowMissingPixDocument&&method==='pix'&&missingDocument)){
    if(!['CPF','CNPJ'].includes(doc?.type)||typeof doc.number!=='string'||!(doc.type==='CPF'?/^\d{11}$/:/^\d{14}$/).test(doc.number))invalid('PAYMENT_INPUT_DOCUMENT_INVALID');
    result.payer.identification={type:doc.type,number:doc.number};
  }
  if(method!=='pix') {
    if(typeof form.token!=='string'||!/^[a-zA-Z0-9_-]{20,200}$/.test(form.token))invalid('PAYMENT_INPUT_TOKEN_INVALID');
    if(!Number.isSafeInteger(form.installments)||form.installments<1||form.installments>12)invalid('PAYMENT_INPUT_INSTALLMENTS_INVALID');
    result.token=form.token;result.installments=form.installments;
    if(form.issuer_id!==undefined&&form.issuer_id!==null&&form.issuer_id!==''){if(!/^\d{1,20}$/.test(String(form.issuer_id)))invalid('PAYMENT_INPUT_ISSUER_INVALID');result.issuer_id=String(form.issuer_id);}
  }
  return result;
}
export function createTransparentPaymentHandler({createClient,env,fetchImpl=fetch,diagnose=()=>{},apiKind='payments'}) {
  return async request=>{
    if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
    if(request.method!=='POST')return reply(405,'METHOD','Método não permitido.');
    try {
      const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY'),authorization=request.headers.get('Authorization')||'';
      if(!url||!anon||!service)return reply(503,'UNAVAILABLE','Pagamento indisponível.');
      if(!/^Bearer\s+\S+$/i.test(authorization))return reply(401,'AUTH','Entre novamente na sua conta.');
      const client=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
      const {data:{user},error:authError}=await client.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
      if(authError||!user)return reply(401,'AUTH','Entre novamente na sua conta.');
      const body=await request.json();if(!uuid(body?.order_id)||!['init','pay','refresh'].includes(body.action))return reply(400,'INVALID','Solicitação inválida.');
      body.order_id=body.order_id.toLowerCase();if(typeof body.request_key==='string')body.request_key=body.request_key.toLowerCase();
      const token=env('MERCADO_PAGO_ACCESS_TOKEN'),publicKey=env('MERCADO_PAGO_PUBLIC_KEY'),mode=env('MERCADO_PAGO_ENV'),collector=env('MERCADO_PAGO_COLLECTOR_ID');
      if(env('MERCADO_PAGO_CHECKOUT_ENABLED')!=='true'||!token||!publicKey||!/^(?:TEST|APP_USR)-[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(publicKey)||publicKey===token||!['sandbox','production'].includes(mode)||!/^\d{1,30}$/.test(collector||'')||!env('MERCADO_PAGO_WEBHOOK_SECRET'))return reply(503,'CONFIG_MISSING','Pagamento ainda não está configurado.');
      const admin=createClient(url,service,{auth:{persistSession:false}});
      const context=await admin.rpc('service_transparent_context',{p_user_id:user.id,p_order_id:body.order_id});
      if(context.error?.message==='legacy_payment_attempt')return reply(409,'LEGACY_PAYMENT','Este pedido já iniciou um pagamento externo. Confira-o antes de criar um novo pedido para pagar dentro do Pupi.');
      if(context.error||!context.data)return reply(409,'ORDER_UNAVAILABLE','Pedido indisponível para pagamento.');
      const data=context.data;
      if(!Number.isSafeInteger(data.total_cents)||data.total_cents<=0)return reply(409,'ORDER_UNAVAILABLE','Valor do pedido indisponível.');
      const process=createPaymentProcessor({admin,env,diagnose});
      const getContext=async()=>admin.rpc('service_transparent_context',{p_user_id:user.id,p_order_id:body.order_id});
      const ready=(ctx,extra={})=>reply(200,'READY',null,{public_key:publicKey,test_mode:(ctx.payment_environment||(ctx.submission?.state!=='failed'?ctx.submission?.provider_mode:null)||mode)==='sandbox',total_cents:ctx.total_cents,payment_status:ctx.payment_status,payment_review_required:ctx.payment_review_required===true,submission:ctx.submission?{request_key:ctx.submission.request_key,state:ctx.submission.state,result:ctx.submission.result}:null,...extra});
      if(body.action==='init'&&apiKind!=='orders')return ready(data);
      // Confere a conta antes de enviar pagamentos; os IDs e a resposta não são registrados.
      const accountResponse=await fetchImpl('https://api.mercadopago.com/users/me',{headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'});
      if(!accountResponse.ok){diagnose('PAYMENT_ACCOUNT_HTTP',{http_status:accountResponse.status});return reply(503,'CONFIG_MISMATCH','A configuração de pagamento precisa ser conferida pela loja.');}
      const account=await accountResponse.json();
      if((typeof account.id==='number'&&!Number.isSafeInteger(account.id))||String(account.id)!==collector){diagnose('PAYMENT_ACCOUNT_COLLECTOR_MISMATCH');return reply(503,'CONFIG_MISMATCH','A configuração de pagamento precisa ser conferida pela loja.');}
      if(apiKind==='orders'&&mode==='production'&&publicKey.startsWith('TEST-'))return reply(503,'CONFIG_ORDERS_CREDENTIALS','Confira a Public Key de produção da API Orders.');
      if(body.action==='init'){
        if(!orderCredentialsValid(account,token,mode)){diagnose('PAYMENT_ORDERS_CREDENTIALS_REQUIRED');return reply(503,'CONFIG_ORDERS_CREDENTIALS','Confira as credenciais da API Orders.');}
        if(data.payment_status==='pending'&&((data.payment_environment&&data.payment_environment!==mode)||(data.submission?.api_kind==='orders'&&data.submission.state!=='failed'&&data.submission.provider_mode!==mode)))return reply(409,'PAYMENT_ENVIRONMENT','Este pedido pertence a outro ambiente de pagamento.');
        return ready(data);
      }

      const activeApi=body.action==='refresh'&&data.submission?(data.submission.api_kind||'payments'):apiKind;
      if(activeApi==='orders'){
        let input;if(body.action==='pay'){try{input=fields(body.form_data,{allowMissingPixDocument:true,diagnose});}catch{return reply(400,'INVALID_DATA','Confira os dados de pagamento.');}}
        return await runOrdersCheckout({body,data,user,input,account,admin,env,fetchImpl,diagnose,reply,ready,uncertain});
      }

      if(body.action==='refresh') {
        if(!data.submission||(data.submission.state==='failed'&&!data.submission.result?.payment_id))return ready(data);
        const options={headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(12000),redirect:'error'};
        if(data.submission.result?.payment_id) {
          const id=data.submission.result.payment_id;if(!/^\d{1,30}$/.test(id))return uncertain();
          const response=await fetchImpl(`https://api.mercadopago.com/v1/payments/${id}`,options);
          if(!response.ok||!await process({paymentId:id,payment:await response.json()}))return uncertain();
        } else {
          const response=await fetchImpl(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(body.order_id)}&limit=50`,options);
          if(!response.ok){diagnose('PAYMENT_PROVIDER_HTTP',{http_status:response.status});return uncertain();}
          const found=await response.json();if(!Array.isArray(found.results)||!Number.isSafeInteger(found.paging?.total)||found.paging.total>50)return uncertain();
          // A busca pode omitir metadados: a decisão usa sempre o recurso completo.
          const candidates=found.results.filter(payment=>!payment.metadata?.pupi_submission_id||payment.metadata.pupi_submission_id===data.submission.request_key);
          if(candidates.length>10){diagnose('PAYMENT_SEARCH_AMBIGUOUS',{candidate_count:candidates.length});return uncertain();}
          const details=[];
          for(const candidate of candidates) {
            const id=String(candidate.id);if(!/^\d{1,30}$/.test(id))return uncertain();
            const detail=await fetchImpl(`https://api.mercadopago.com/v1/payments/${id}`,options);
            if(!detail.ok){diagnose('PAYMENT_PROVIDER_HTTP',{http_status:detail.status});return uncertain();}
            const payment=await detail.json();if(String(payment.id)!==id)return uncertain();details.push(payment);
          }
          const matches=details.filter(payment=>payment.metadata?.pupi_submission_id===data.submission.request_key);
          if(matches.length!==1){diagnose(matches.length?'PAYMENT_SEARCH_AMBIGUOUS':'PAYMENT_SEARCH_EMPTY',{candidate_count:candidates.length,match_count:matches.length});return uncertain();}
          if(!await process({paymentId:String(matches[0].id),payment:matches[0]}))return uncertain();
        }
        const refreshed=await getContext();return refreshed.error?uncertain():ready(refreshed.data);
      }
      // O modo de testes deve ser sustentado pela credencial ou pela conta de teste.
      if(mode==='sandbox'&&!token.startsWith('TEST-')&&!(Array.isArray(account.tags)&&account.tags.includes('test_user'))){diagnose('PAYMENT_SANDBOX_CREDENTIALS_UNCONFIRMED');return reply(503,'CONFIG_MISMATCH','Confira as credenciais de teste da loja.');}
      if(data.submission?.result?.reason==='test_attempt_released'&&mode!=='sandbox'){diagnose('PAYMENT_TEST_RECOVERY_REQUIRES_SANDBOX');return reply(503,'CONFIG_MISMATCH','Este pedido foi liberado somente para teste.');}
      if(!['confirmed','preparing'].includes(data.order_status)||data.payment_status!=='pending')return reply(409,'ORDER_UNAVAILABLE','Pedido indisponível para pagamento.');
      if(!uuid(body.request_key))return reply(400,'INVALID','Solicitação inválida.');
      let input;try{input=fields(body.form_data,{diagnose});}catch{return reply(400,'INVALID_DATA','Confira os dados de pagamento.');}
      const payload={...input,transaction_amount:data.total_cents/100,description:`Pedido Pupi #${data.order_number}`,external_reference:body.order_id,notification_url:`${url}/functions/v1/pupi-mercadopago-webhook`,metadata:{pupi_submission_id:body.request_key,pupi_order_id:body.order_id}};
      const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload)));const fingerprint=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
      const begin=await admin.rpc('service_begin_transparent_payment',{p_user_id:user.id,p_order_id:body.order_id,p_request_key:body.request_key,p_fingerprint:fingerprint});
      if(begin.error||!begin.data)return reply(409,'PAYMENT_BLOCKED','Já existe uma tentativa de pagamento. Verifique o resultado.');
      if(!begin.data.can_submit){const current=await getContext();return current.error||!current.data?uncertain():ready(current.data);}
      if(!uuid(begin.data.idempotency_key))return uncertain();
      try {
        const response=await fetchImpl('https://api.mercadopago.com/v1/payments',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json','X-Idempotency-Key':begin.data.idempotency_key},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),redirect:'error'});
        if(!response.ok) {
          const providerError=await response.json().catch(()=>null),stage=providerFailureStage(response.status,providerError);
          diagnose(stage,{http_status:response.status});
          if(stage==='PAYMENT_AUTHORIZATION_REJECTED')return reply(503,'CONFIG_MISMATCH','O provedor não autorizou a configuração de pagamento da loja.');
          if(stage==='PAYMENT_IDEMPOTENCY_CONFLICT')return uncertain();
          if([400,422].includes(response.status)){const rejected=await admin.rpc('service_reject_transparent_payment',{p_order_id:body.order_id,p_request_key:body.request_key});if(!rejected.error&&rejected.data===true)return reply(422,'PAYMENT_REJECTED','O pagamento foi recusado. Confira os dados e tente novamente.');}
          return uncertain();
        }
        const payment=await response.json(),id=String(payment.id);
        if(!/^\d{1,30}$/.test(id)){diagnose('PAYMENT_RESPONSE_ID_INVALID');return uncertain();}
        if(payment.metadata?.pupi_submission_id!==body.request_key){diagnose('PAYMENT_METADATA_MISMATCH');return uncertain();}
        if(!await process({paymentId:id,payment}))return uncertain();
        const final=await getContext();return final.error?uncertain():ready(final.data);
      }catch{diagnose('PAYMENT_OPERATION_FAILURE');return uncertain();}
    }catch{diagnose('PAYMENT_HANDLER_FAILURE');return uncertain();}
  };
}
