import test from 'node:test';
import assert from 'node:assert/strict';
import {createCheckoutService} from '../src/services/checkout.js';

test('confirmação incerta mantém a mesma chave e recupera após recarregar',async()=>{
  const values=new Map();globalThis.sessionStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const sent=[];let count=0;
  const client={functions:{invoke:async(_,{body})=>{sent.push(body);return ++count===1?{error:{}}:{data:{order_id:'pedido'}};}}};
  const first=createCheckoutService(client,'user');
  await assert.rejects(()=>first.confirm('quote'),{code:'REQUEST_FAILED'});
  assert.equal(first.pending().quoteId,'quote');
  const reloaded=createCheckoutService(client,'user');
  assert.equal(await reloaded.confirm('quote'),'pedido');
  assert.equal(sent[0].request_key,sent[1].request_key);assert.equal(reloaded.pending(),null);
  delete globalThis.sessionStorage;
});
