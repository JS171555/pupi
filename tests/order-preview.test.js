import test from 'node:test';
import assert from 'node:assert/strict';
import {createPupiClient} from '../src/services/supabase.js';
import {createAccountRepository} from '../src/repositories/account.js';

test('pedidos mantêm filtro da conta e paginação, com prévia limitada e ordenada dos produtos',async()=>{
  const requests=[];const user='00000000-0000-4000-8000-000000000001';
  const client=createPupiClient({SUPABASE_URL:'https://pupi.example.com',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async url=>{
      requests.push(new URL(url));
      return new Response(JSON.stringify(Array.from({length:11},(_,id)=>({id,items:[]}))),{headers:{'Content-Type':'application/json'}});
    }},
  });
  const result=await createAccountRepository(client).listOrders(user,2);
  assert.equal(result.items.length,10);assert.equal(result.hasMore,true);
  const query=requests[0].searchParams;
  assert.equal(query.get('user_id'),'eq.'+user);assert.equal(query.get('offset'),'10');assert.equal(query.get('limit'),'11');
  assert.equal(query.get('items.limit'),'3');assert.equal(query.get('items.order'),'created_at.asc,id.asc');
  assert.ok(query.get('select').includes('items:order_items(product_id,product_name)'));
});
