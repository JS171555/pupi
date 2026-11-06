import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPaymentNotification,inspectProviderPayment} from '../supabase/functions/_shared/mercado-pago/verification.js';

const secret='segredo-exemplo-somente-teste',paymentId='123456789',requestId='8a9b-123',ts='1742505638683';
async function signed() {
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const digest=await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(`id:${paymentId};request-id:${requestId};ts:${ts};`));
  const hex=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  return {url:`https://example.test/webhook?data.id=${paymentId}&type=payment`,secret,headers:new Headers({'x-request-id':requestId,'x-signature':`ts=${ts},v1=${hex}`})};
}
test('assinatura do Mercado Pago valida ID, cabeçalhos e segredo sem confiar no corpo',async()=>{
  let input=await signed();assert.deepEqual(await verifyPaymentNotification(input),{paymentId});
  input=await signed();input.url=input.url.replace(paymentId,'987654321');assert.equal(await verifyPaymentNotification(input),null);
  input=await signed();input.secret='outro';assert.equal(await verifyPaymentNotification(input),null);
  input=await signed();input.headers.set('x-signature',`${input.headers.get('x-signature')},ts=2`);assert.equal(await verifyPaymentNotification(input),null);
  input=await signed();input.url+='&data.id=123';assert.equal(await verifyPaymentNotification(input),null);
});
const orderId='aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const options={paymentId,orderId,totalCents:3499,collectorId:'98765',liveMode:false};
const payment={id:123456789,collector_id:98765,external_reference:orderId,currency_id:'BRL',live_mode:false,transaction_amount:34.99,transaction_amount_refunded:0,status:'approved'};
test('pagamento aprovado exige vendedor, ambiente, moeda, pedido e valor corretos',()=>{
  assert.deepEqual(inspectProviderPayment(payment,options),{valid:true,status:'paid'});
  for(const update of [{collector_id:1},{currency_id:'USD'},{live_mode:true},{transaction_amount:34.98},{external_reference:'outro'},{id:3},{transaction_amount:34.999},{transaction_amount_refunded:undefined}])assert.deepEqual(inspectProviderPayment({...payment,...update},options),{valid:false});
});
test('estorno parcial e contestação exigem reconciliação; recusa permite nova tentativa',()=>{
  for(const update of [{status:'approved',transaction_amount_refunded:1},{status:'charged_back'}])assert.deepEqual(inspectProviderPayment({...payment,...update},options),{valid:true,status:'review'});
  assert.deepEqual(inspectProviderPayment({...payment,status:'rejected'},options),{valid:true,status:'failed'});
  assert.deepEqual(inspectProviderPayment({...payment,status:'refunded',transaction_amount_refunded:34.99},options),{valid:true,status:'refunded'});
  assert.deepEqual(inspectProviderPayment({...payment,status:'in_process'},options),{valid:true,status:'pending'});
});
