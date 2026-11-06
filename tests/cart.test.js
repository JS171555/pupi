import test from 'node:test';
import assert from 'node:assert/strict';
import {createPupiClient} from '../src/services/supabase.js';
import {createCartRepository} from '../src/repositories/cart.js';

const user='00000000-0000-4000-8000-000000000001';
const product='20000000-0000-4000-8000-000000000001';
const cart='30000000-0000-4000-8000-000000000001';
function setup(stock=3) {
  const requests=[]; let inserted=false;
  const client=createPupiClient({SUPABASE_URL:'https://pupi.example.com',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'}, {
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(url,options)=>{
      const parsed=new URL(url);requests.push({url:parsed,options});
      if (parsed.pathname.endsWith('/cart_items') && options.method === 'POST' && inserted) return new Response(JSON.stringify({code:'23505'}),{status:409,headers:{'Content-Type':'application/json'}});
      if (parsed.pathname.endsWith('/cart_items') && options.method === 'POST') inserted=true;
      const body=parsed.pathname.endsWith('/products')?[{id:product,stock_quantity:stock}]:parsed.pathname.endsWith('/carts')?[{id:cart}]:null;
      return new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
    }},
  });
  return {requests,repository:createCartRepository(client)};
}
test('carrinho define quantidade absoluta e usa a conta e produto solicitados',async()=>{
  const {repository,requests}=setup();
  assert.deepEqual(await repository.setQuantity(user,product,2),{quantity:2});
  assert.equal(requests[1].url.searchParams.get('user_id'),`eq.${user}`);
  const write=requests[2];assert.equal(write.options.method,'POST');
  assert.deepEqual(JSON.parse(write.options.body),{cart_id:cart,product_id:product,quantity:2});
  await repository.setQuantity(user,product,2);
  assert.equal(requests[6].options.method,'PATCH');
  assert.deepEqual(JSON.parse(requests[6].options.body),{quantity:2});
  assert.equal(requests[6].url.searchParams.get('cart_id'),`eq.${cart}`);
  assert.equal(requests[6].url.searchParams.get('product_id'),`eq.${product}`);
});
test('quantidade inválida ou maior que estoque não grava carrinho',async()=>{
  const {repository,requests}=setup(1);
  await assert.rejects(()=>repository.setQuantity(user,product,2),{code:'INVALID_DATA'});
  assert.equal(requests.length,1);
  await assert.rejects(()=>repository.setQuantity(user,product,0),{code:'INVALID_DATA'});
  assert.equal(requests.length,1);
});
