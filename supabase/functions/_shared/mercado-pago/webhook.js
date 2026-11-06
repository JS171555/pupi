import {verifyPaymentNotification} from './verification.js';

const reply=status=>new Response(null,{status,headers:{'Cache-Control':'no-store'}});
const paymentId=value=>typeof value==='string'&&/^\d{1,30}$/.test(value)?value:typeof value==='number'&&Number.isSafeInteger(value)&&value>=0?String(value):null;

/** Recebe somente notificações autenticadas. O callback deve validar e persistir o resultado de forma idempotente. */
export function createPaymentWebhookHandler({env,processPayment,fetchImpl=fetch}) {
  return async request=>{
    if(request.method!=='POST')return reply(405);
    const secret=env('MERCADO_PAGO_WEBHOOK_SECRET'),token=env('MERCADO_PAGO_ACCESS_TOKEN');
    if(!secret||!token||typeof processPayment!=='function')return reply(503);
    let verified;
    try {verified=await verifyPaymentNotification({url:request.url,headers:request.headers,secret});}catch{return reply(401);}
    if(!verified)return reply(401);
    const types=new URL(request.url).searchParams.getAll('type');
    if(types.length!==1||types[0]!=='payment')return reply(400);
    try {
      const response=await fetchImpl(`https://api.mercadopago.com/v1/payments/${verified.paymentId}`,{
        method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error',
      });
      if(!response.ok)return reply(503);
      const payment=await response.json();
      if(!payment||paymentId(payment.id)!==verified.paymentId)return reply(503);
      // A confirmação só pode ser enviada após validação de pedido/valor/vendedor e gravação durável.
      if(await processPayment({paymentId:verified.paymentId,payment})!==true)return reply(503);
      return reply(200);
    } catch {return reply(503);}
  };
}
