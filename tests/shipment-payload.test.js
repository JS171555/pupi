import test from 'node:test';
import assert from 'node:assert/strict';
import {buildShipmentPayload} from '../supabase/functions/pupi-shipping-register/shipment-payload.js';

function input() {
  return {
    order:{order_number:7,subtotal_cents:3000,address_snapshot:{recipient:'Pessoa teste',street:'Rua teste',number:'1',neighborhood:'Centro',city:'São Paulo',state:'SP',postal_code:'01001000',country:'BR'},items:[{product_id:'p1',product_name:'Produto',quantity:2,unit_price_cents:1500}]},
    quote:{service_id:'1',carrier:'Correios',packages:[{width:20,height:10,length:30,weight:.5}],snapshot:{origin_postal_code:'20040020',destination_postal_code:'01001000',items:[{product_id:'p1',quantity:2,price_cents:1500}]}},
    invoice:{access_key:'35261112345678000195550010000001231123456788'},
    sender:{name:'Loja teste',email:'loja@example.test',phone:'11999999999',company_document:'12345678000195',state_register:'12345',address:'Rua origem',number:'2',district:'Centro',city:'Rio de Janeiro',postal_code:'20040020',state_abbr:'RJ'},
    recipient:{email:'cliente@example.test',phone:'11999999999',document:'12345678909'},
  };
}
test('remessa usa nota emitida, itens históricos e volumes da cotação',()=>{
  const data=buildShipmentPayload(input());
  assert.equal(data.options.invoice.key,input().invoice.access_key);assert.equal(data.options.insurance_value,30);
  assert.deepEqual(data.products,[{name:'Produto',quantity:2,unitary_value:15}]);
  assert.deepEqual(data.volumes,[{height:10,width:20,length:30,weight:.5}]);
  assert.equal(data.from.postal_code,'20040020');assert.equal(data.to.postal_code,'01001000');
});
test('remessa recusa dados inconsistentes e não inventa volumes nem nota',()=>{
  let value=input();value.quote.packages=null;assert.throws(()=>buildShipmentPayload(value),/missing_quoted_packages/);
  value=input();value.invoice.access_key='123';assert.throws(()=>buildShipmentPayload(value),/invalid_invoice/);
  value=input();value.order.items[0].quantity=1;assert.throws(()=>buildShipmentPayload(value),/order_quote_mismatch/);
  value=input();value.sender.postal_code='01001000';assert.throws(()=>buildShipmentPayload(value),/postal_code_changed/);
  value=input();value.quote.packages.push({...value.quote.packages[0]});assert.throws(()=>buildShipmentPayload(value),/multiple_labels_require_item_allocation/);
  value=input();value.quote.carrier='Azul Cargo';assert.throws(()=>buildShipmentPayload(value),/invoice_xml_required/);
});
