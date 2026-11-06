import test from 'node:test';
import assert from 'node:assert/strict';
import {createNavigationIndicators} from '../src/services/navigation-indicators.js';
import {createPupiClient} from '../src/services/supabase.js';
import {createCartRepository} from '../src/repositories/cart.js';
import {createAccountRepository} from '../src/repositories/account.js';

const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const CART='30000000-0000-4000-8000-000000000001';
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};

test('indicadores consultam apenas a conta atual, uma linha e pedidos pendentes não cancelados',async()=>{
  const requests=[];
  const client=createPupiClient({SUPABASE_URL:'https://pupi.example.com',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test'},{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async url=>{
      const parsed=new URL(url);requests.push(parsed);
      const data=parsed.pathname.endsWith('/carts')?[{id:CART}]:[{id:'record'}];
      return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
    }},
  });
  assert.equal(await createCartRepository(client).hasItems(A),true);
  assert.equal(await createAccountRepository(client).hasPendingOrders(A),true);
  const [cart,items,orders]=requests;
  assert.equal(cart.searchParams.get('user_id'),'eq.'+A);
  assert.equal(items.searchParams.get('cart_id'),'eq.'+CART);assert.equal(items.searchParams.get('quantity'),'gt.0');
  for(const query of [items,orders]){assert.equal(query.searchParams.get('limit'),'1');assert.equal(query.searchParams.get('select'),'id');}
  assert.equal(orders.searchParams.get('user_id'),'eq.'+A);assert.equal(orders.searchParams.get('payment_status'),'eq.pending');
  assert.equal(orders.searchParams.get('status'),'neq.cancelled');
});

test('resposta de outra conta ou anterior ao logout não restaura indicadores',async()=>{
  const pending=[];const snapshots=[];
  const state=createNavigationIndicators({readCart:(id,signal)=>{const next=deferred();pending.push({...next,id,signal});return next.promise;},readOrders:async()=>false,onChange:value=>snapshots.push(value)});
  const one=state.refresh(A),two=state.refresh(B);
  assert.equal(pending[0].signal.aborted,true);
  pending[1].resolve(true);await two;pending[0].resolve(false);await one;
  assert.deepEqual(snapshots.at(-1),{cart:true,orders:false});
  const old=state.refresh(B);state.clear();pending[2].resolve(true);await old;
  assert.deepEqual(snapshots.at(-1),{cart:false,orders:false});assert.equal(pending[2].signal.aborted,true);
});

test('falha opcional preserva informação conhecida da mesma conta sem impedir atualização do outro indicador',async()=>{
  let fail=false;const snapshots=[];
  const state=createNavigationIndicators({readCart:async()=>{if(fail)throw Error('offline');return true;},readOrders:async()=>!fail,onChange:value=>snapshots.push(value)});
  await state.refresh(A);assert.deepEqual(snapshots.at(-1),{cart:true,orders:true});
  fail=true;await state.refresh(A);assert.deepEqual(snapshots.at(-1),{cart:true,orders:false});
  await state.refresh(B);assert.deepEqual(snapshots.at(-1),{cart:false,orders:false});
});
