import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaymentWebhookHandler} from '../supabase/functions/_shared/mercado-pago/webhook.js';

const id='123456789',requestId='aa11-bb22',ts='1742505638683',secret='segredo-de-teste';
async function request({valid=true,type='payment',method='POST'}={}) {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const value=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`id:${id};request-id:${requestId};ts:${ts};`));
  const digest=Array.from(new Uint8Array(value),v=>v.toString(16).padStart(2,'0')).join('');
  return new Request(`https://example.test/hook?data.id=${id}&type=${type}`,{method,headers:{'x-request-id':requestId,'x-signature':`ts=${ts},v1=${valid?digest:'0'.repeat(64)}`}});
}
function setup({config=true,providerStatus=200,responseId=id,processed=true}={}) {
  const calls={fetch:[],processed:[]};
  const env=name=>({MERCADO_PAGO_WEBHOOK_SECRET:config?secret:'',MERCADO_PAGO_ACCESS_TOKEN:'token-teste'})[name];
  const handler=createPaymentWebhookHandler({env,fetchImpl:async(url,options)=>{calls.fetch.push({url,options});return new Response(JSON.stringify({id:responseId,status:'approved'}),{status:providerStatus});},processPayment:async value=>{calls.processed.push(value);return processed;}});
  return {handler,calls};
}
test('webhook rejeita assinatura inválida antes de consultar o provedor',async()=>{
  const {handler,calls}=setup();assert.equal((await handler(await request({valid:false}))).status,401);assert.equal(calls.fetch.length,0);assert.equal(calls.processed.length,0);
});
test('webhook consulta pagamento autenticado e confirma apenas depois do processamento',async()=>{
  const {handler,calls}=setup();assert.equal((await handler(await request())).status,200);assert.equal(calls.fetch[0].url,`https://api.mercadopago.com/v1/payments/${id}`);assert.equal(calls.fetch[0].options.headers.Authorization,'Bearer token-teste');assert.equal(calls.processed[0].paymentId,id);
});
test('configuração ausente, falha do provedor ou processamento pendente permitem nova notificação',async()=>{
  for(const opts of [{config:false},{providerStatus:503},{responseId:'999'},{processed:false}]) {const {handler}=setup(opts);assert.equal((await handler(await request())).status,503);}
});
test('webhook aceita somente POST e evento de pagamento',async()=>{
  const {handler,calls}=setup();assert.equal((await handler(await request({method:'GET'}))).status,405);assert.equal((await handler(await request({type:'other'}))).status,400);assert.equal(calls.fetch.length,0);
});
