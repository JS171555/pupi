import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMoney,validateProduct,validateStock,validateSettings,orderOptions} from '../src/modules/admin/validation.js';
import {validateImageBytes} from '../src/services/admin-media.js';
import {createAdminRepository} from '../src/repositories/admin.js';
import {AppError} from '../src/utils/errors.js';

test('preços são centavos inteiros e rejeitam expoente, separador ambíguo e casas extras',()=>{
  assert.equal(parseMoney('49,90'),4990);assert.equal(parseMoney('49.9'),4990);assert.equal(parseMoney('0,01'),1);
  for(const value of ['1e3','1.234,56','12,345','-1','NaN'])assert.equal(parseMoney(value),null);
});
test('produto valida promoção e não envia estoque ou campos privilegiados',()=>{
  const values={name:'Produto',sku:'TEST',slug:'produto',category_id:'10000000-0000-4000-8000-000000000001',price:'20,00',sale_price:'15,00',minimum_stock:'0',active:true,featured:false,status:'draft',stock_quantity:999,role:'admin'};
  const data=validateProduct(values);assert.equal(data.price_cents,2000);assert.equal(data.sale_price_cents,1500);assert.equal(data.stock_quantity,undefined);assert.equal(data.role,undefined);
  assert.throws(()=>validateProduct({...values,sale_price:'25,00'}),e=>Boolean(e.fields.sale_price));
});
test('estoque permite saldo final zero, mas rejeita saída acima do disponível e delta nulo',()=>{
  assert.deepEqual(validateStock({kind:'set',quantity:'0',current:10,reason:'Conferência'}),{delta:-10,expected_balance:10,reason:'Conferência'});
  assert.throws(()=>validateStock({kind:'out',quantity:'11',current:10,reason:'Saída'}),e=>Boolean(e.fields.quantity));
  assert.throws(()=>validateStock({kind:'set',quantity:'10',current:10,reason:'Sem mudança'}),e=>Boolean(e.fields.quantity));
});
test('configurações validam CEP e números sem incluir segredos',()=>{
  const values=validateSettings({store_name:'Pupi',contact_email:'loja@example.com',origin_postal_code:'01001-000',low_stock_threshold:'3',secret_key:'not-sent'});
  assert.equal(values.origin_postal_code,'01001000');assert.equal(values.low_stock_threshold,3);assert.equal(values.secret_key,undefined);
});
test('opções de pedido não oferecem salto inválido nem cancelamento de pagamento aprovado',()=>{
  assert.deepEqual(orderOptions({status:'confirmed',payment_status:'pending'}).map(([key])=>key),['confirmed','preparing','cancelled']);
  assert.ok(!orderOptions({status:'preparing',payment_status:'paid'}).some(([key])=>key==='cancelled'));
});
test('upload rejeita conteúdo incompatível com o MIME declarado',async()=>{
  const invalid=new File(['<svg>invalid</svg>'],'foto.png',{type:'image/png'});
  await assert.rejects(()=>validateImageBytes(invalid),{code:'INVALID_DATA'});
  const valid=new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'foto.png',{type:'image/png'});
  await validateImageBytes(valid);
});
test('repositório repete a chave após falha e usa nova chave após sucesso confirmado',async()=>{
  const keys=[];let count=0;
  const client={rpc:(_name,request)=>({abortSignal:async()=>{keys.push(request.p_request_key);count++;return count===1?{data:null,error:{code:'network'}}:{data:{balance:11},error:null};}})};
  const repository=createAdminRepository(client);const data={delta:1,reason:'Entrada',expected_balance:10};
  await assert.rejects(()=>repository.mutate('stock_adjust',null,data),AppError);
  await repository.mutate('stock_adjust',null,data);await repository.mutate('stock_adjust',null,data);
  assert.equal(keys[0],keys[1]);assert.notEqual(keys[1],keys[2]);
});
