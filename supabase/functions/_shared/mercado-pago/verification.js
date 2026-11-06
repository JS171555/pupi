/** Verifica o manifesto HMAC da notificação; não consulta nem altera pagamentos. */
export async function verifyPaymentNotification({url,headers,secret}) {
  if(typeof secret!=='string'||!secret.trim()||secret.length>1000)return null;
  let parsed;try{parsed=new URL(url);}catch{return null;}
  const ids=parsed.searchParams.getAll('data.id');
  const requestId=headers.get('x-request-id');const signature=headers.get('x-signature');
  if(ids.length!==1 || !/^\d{1,30}$/.test(ids[0]) || !requestId || requestId.length>200 || !/^[a-zA-Z0-9-]+$/.test(requestId) || !signature || signature.length>500)return null;
  const parts=new Map();
  for(const fragment of signature.split(',')) {
    const match=fragment.trim().match(/^([a-z0-9]+)=([^=]+)$/i);
    if(!match || parts.has(match[1]))return null;
    parts.set(match[1],match[2]);
  }
  const timestamp=parts.get('ts'),digest=parts.get('v1');
  if(!/^\d{1,20}$/.test(timestamp||'')||!/^[a-f0-9]{64}$/i.test(digest||''))return null;
  const manifest=`id:${ids[0]};request-id:${requestId};ts:${timestamp};`;
  const bytes=new Uint8Array(digest.match(/../g).map(pair=>parseInt(pair,16)));
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
  return await crypto.subtle.verify('HMAC',key,bytes,new TextEncoder().encode(manifest)) ? {paymentId:ids[0]} : null;
}

const paymentId=value=>typeof value==='string'&&/^\d{1,30}$/.test(value)?value:typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?String(value):null;
const cents=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0&&Number.isSafeInteger(Math.round(value*100))&&Math.abs(value*100-Math.round(value*100))<0.000001?Math.round(value*100):null;
export function paymentValidationIssue(payment,{paymentId:expectedId,orderId,totalCents,collectorId,liveMode}) {
  if(!payment||!paymentId(expectedId)||!paymentId(collectorId)||typeof orderId!=='string'||!Number.isSafeInteger(totalCents)||totalCents<=0||typeof liveMode!=='boolean')return 'PAYMENT_INVALID_CONTEXT';
  if(paymentId(payment.id)!==paymentId(expectedId))return 'PAYMENT_ID_MISMATCH';
  if(paymentId(payment.collector_id)!==paymentId(collectorId))return 'PAYMENT_COLLECTOR_MISMATCH';
  if(payment.external_reference!==orderId)return 'PAYMENT_ORDER_MISMATCH';
  if(payment.currency_id!=='BRL')return 'PAYMENT_CURRENCY_MISMATCH';
  if(payment.live_mode!==liveMode)return 'PAYMENT_MODE_MISMATCH';
  if(cents(payment.transaction_amount)!==totalCents)return 'PAYMENT_AMOUNT_MISMATCH';
  const refunded=cents(payment.transaction_amount_refunded);
  if(refunded===null||refunded>totalCents)return 'PAYMENT_REFUND_INVALID';
  return null;
}
/** Confere o resultado obtido diretamente da API; retornos do navegador não provam pagamento. */
export function inspectProviderPayment(payment,context) {
  if(paymentValidationIssue(payment,context))return {valid:false};
  const refunded=cents(payment.transaction_amount_refunded),totalCents=context.totalCents;
  if(refunded>0 && refunded<totalCents)return {valid:true,status:'review'};
  if(payment.status==='refunded' && refunded===totalCents)return {valid:true,status:'refunded'};
  if(payment.status==='approved' && refunded===0)return {valid:true,status:'paid'};
  if(['pending','in_process','in_mediation','authorized'].includes(payment.status)&&refunded===0)return {valid:true,status:'pending'};
  if(['rejected','cancelled'].includes(payment.status)&&refunded===0)return {valid:true,status:'failed'};
  if(['charged_back','refunded'].includes(payment.status))return {valid:true,status:'review'};
  return {valid:true,status:'review'};
}
