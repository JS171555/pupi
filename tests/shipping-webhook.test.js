import test from 'node:test';
import assert from 'node:assert/strict';
import {createShippingWebhookHandler} from '../supabase/functions/pupi-shipping-webhook/handler.js';

test('webhook exige HMAC válido e não confia em pedidos não relacionados',async()=>{
  const secret='test-secret',id='80000000-0000-4000-8000-000000000001';let calls=[];let found=true;
  const handler=createShippingWebhookHandler({env:name=>({MELHOR_ENVIO_WEBHOOK_SECRET:secret,SUPABASE_URL:'https://example.test',SUPABASE_SERVICE_ROLE_KEY:'test-only'}[name]),
    createClient:()=>({rpc:async(name,params)=>{calls.push({name,params});return {data:found,error:null};}})});
  const payload=JSON.stringify({event:'order.posted',data:{id,tracking:'COD123',posted_at:'2026-01-01T10:00:00Z'}});
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(payload)));
  const signature=btoa(String.fromCharCode(...bytes));
  const send=sig=>handler(new Request('https://example.test/webhook',{method:'POST',headers:{'x-me-signature':sig},body:payload}));
  assert.equal((await send(btoa('x'.repeat(32)))).status,401);assert.equal(calls.length,0);
  assert.equal((await send(signature)).status,200);assert.equal(calls[0].params.p_external_id,id);assert.equal(calls[0].params.p_tracking,'COD123');
  assert.match(calls[0].params.p_digest,/^[0-9a-f]{64}$/);
  found=false;assert.equal((await send(signature)).status,503);
  const oversized=await handler(new Request('https://example.test/webhook',{method:'POST',body:'x'.repeat(65537)}));assert.equal(oversized.status,413);
});
