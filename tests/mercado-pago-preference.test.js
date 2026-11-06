import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCheckoutPreference} from '../supabase/functions/_shared/mercado-pago/preference.js';
const order='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',product='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const config={storeOrigin:'https://pupi.example',supabaseOrigin:'https://example.supabase.co'};
const snapshot={order_id:order,currency:'BRL',subtotal_cents:3998,shipping_cents:500,total_cents:4498,items:[{product_id:product,name:'Ração',quantity:2,unit_price_cents:1999}]};
test('preferência usa itens e frete do snapshot e mantém a referência do pedido',()=>{
  const result=buildCheckoutPreference(snapshot,config);
  assert.deepEqual(result.items,[{id:product,title:'Ração',quantity:2,currency_id:'BRL',unit_price:19.99},{id:'shipping',title:'Frete',quantity:1,currency_id:'BRL',unit_price:5}]);
  assert.equal(result.external_reference,order);assert.equal(result.back_urls.success,`https://pupi.example/#/pedidos/${order}`);
  assert.equal(result.notification_url,'https://example.supabase.co/functions/v1/pupi-mercadopago-webhook');
});
test('não acrescenta frete gratuito nem aceita totais, moeda e itens inconsistentes',()=>{
  let s={...snapshot,shipping_cents:0,total_cents:3998};assert.equal(buildCheckoutPreference(s,config).items.length,1);
  for(s of [{...snapshot,total_cents:1},{...snapshot,currency:'USD'},{...snapshot,items:[]},{...snapshot,items:[...snapshot.items,...snapshot.items]},{...snapshot,items:[{...snapshot.items[0],unit_price_cents:19.99}]}])assert.throws(()=>buildCheckoutPreference(s,config));
});
test('recusa destinos inseguros ou caminhos de notificação externos ao Supabase',()=>{
  for(const c of [{...config,storeOrigin:'http://pupi.example'},{...config,storeOrigin:'https://pupi.example/path'},{...config,storeOrigin:'https://user:pass@pupi.example'},{...config,supabaseOrigin:'https://example.supabase.co.evil.test'}])assert.throws(()=>buildCheckoutPreference(snapshot,c));
});
