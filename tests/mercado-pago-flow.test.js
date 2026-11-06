import test from 'node:test';
import assert from 'node:assert/strict';
import {createPaymentCheckoutHandler} from '../supabase/functions/_shared/mercado-pago/checkout.js';
import {createPaymentProcessor} from '../supabase/functions/_shared/mercado-pago/processor.js';
const order='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',product='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const snapshot={order_id:order,currency:'BRL',subtotal_cents:1000,shipping_cents:500,total_cents:1500,items:[{product_id:product,name:'Produto',quantity:1,unit_price_cents:1000}]};
const config={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',MERCADO_PAGO_ACCESS_TOKEN:'token',MERCADO_PAGO_WEBHOOK_SECRET:'secret',MERCADO_PAGO_COLLECTOR_ID:'12',MERCADO_PAGO_ENV:'sandbox',PUPI_STORE_ORIGIN:'https://pupi.example',MERCADO_PAGO_CHECKOUT_ENABLED:'true'};
function fixture({enabled=true,created=true,providerFail=false,badUrl=false}={}) {
 const calls=[];const env=name=>name==='MERCADO_PAGO_CHECKOUT_ENABLED'&&!enabled?'false':config[name];
 const client={auth:{getUser:async()=>({data:{user:{id:order}}})}};
 const admin={rpc:async(name,args)=>{calls.push({name,args});if(name==='service_begin_payment_attempt')return {data:{created,snapshot}};if(name==='service_payment_attempt_state')return {data:{status:'started'}};if(name==='service_finish_payment_preference')return {data:true};throw Error(name);}};
 const handler=createPaymentCheckoutHandler({env,createClient:(_u,key)=>key==='anon'?client:admin,fetchImpl:async(_url,options)=>{calls.push({name:'provider',body:JSON.parse(options.body)});if(providerFail)throw Error('network');return new Response(JSON.stringify({id:'123-abc',external_reference:order,init_point:badUrl?'https://evil.test':'https://www.mercadopago.com.br/checkout/123'}),{status:201});}});
 return {calls,run:()=>handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:JSON.stringify({order_id:order,total_cents:1})}))};
}
test('preferência usa valores do banco e só retorna link depois de salvar',async()=>{const f=fixture();const res=await f.run();assert.equal(res.status,200);assert.equal((await res.json()).code,'READY');assert.equal(f.calls.find(x=>x.name==='provider').body.items[0].unit_price,10);assert.equal(f.calls.at(-1).name,'service_finish_payment_preference');});
test('configuração ausente, tentativa existente e resposta perdida não criam segunda preferência',async()=>{for(const opts of [{enabled:false},{created:false}]){const f=fixture(opts);assert.equal((await f.run()).status,503);assert.equal(f.calls.some(x=>x.name==='provider'),false);}const f=fixture({providerFail:true});assert.equal((await f.run()).status,503);assert.equal(f.calls.filter(x=>x.name==='provider').length,1);assert.equal(f.calls.some(x=>x.name==='service_finish_payment_preference'),false);});
test('link externo inesperado nunca é entregue ao cliente',async()=>{const f=fixture({badUrl:true});assert.equal((await f.run()).status,503);assert.equal(f.calls.some(x=>x.name==='service_finish_payment_preference'),false);});
test('processador confere vendedor, pedido, valor e ambiente antes de salvar',async()=>{
 const calls=[];const env=name=>config[name];const admin={rpc:async(name,args)=>{calls.push({name,args});return name==='service_payment_context'?{data:{order_id:order,total_cents:1500}}:{data:'paid'};}};
 const processor=createPaymentProcessor({admin,env});const payment={id:123,collector_id:12,external_reference:order,currency_id:'BRL',live_mode:false,transaction_amount:15,transaction_amount_refunded:0,status:'approved',date_last_updated:'2026-01-01T00:00:00Z'};
 assert.equal(await processor({paymentId:'123',payment}),true);assert.equal(calls.at(-1).args.p_state,'paid');calls.length=0;
 assert.equal(await processor({paymentId:'123',payment:{...payment,transaction_amount:1}}),false);assert.equal(calls.length,1);
});
