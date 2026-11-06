import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransparentPaymentHandler} from '../supabase/functions/_shared/mercado-pago/transparent.js';
const order='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',requestKey='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',idempotency='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const form={payment_method_id:'master',token:'a'.repeat(32),installments:1,payer:{email:'buyer@example.test',identification:{type:'CPF',number:'12345678909'}}};
function fixture({enabled=true,legacy=false,failedNetwork=false,pix=false,providerStatus=201,accountId=12,recover=false,detailMatch=true}={}) {
  const calls=[],events=[];let submission=recover?{request_key:requestKey,state:'started'}:null;
  const config={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',MERCADO_PAGO_CHECKOUT_ENABLED:enabled?'true':'false',MERCADO_PAGO_ACCESS_TOKEN:'secret-token',MERCADO_PAGO_PUBLIC_KEY:'TEST-12345678-1234-1234-1234-123456789012',MERCADO_PAGO_ENV:'sandbox',MERCADO_PAGO_COLLECTOR_ID:'12',MERCADO_PAGO_WEBHOOK_SECRET:'secret-webhook'};
  const context=()=>({order_id:order,order_number:1,total_cents:1500,order_status:'confirmed',payment_status:'pending',submission});
  const client={auth:{getUser:async()=>({data:{user:{id:order}}})}};
  const admin={rpc:async(name,args)=>{calls.push({name,args});if(name==='service_transparent_context')return legacy?{error:{message:'legacy_payment_attempt'}}:{data:context()};if(name==='service_begin_transparent_payment'){submission={request_key:requestKey,state:'started'};return {data:{can_submit:true,idempotency_key:idempotency}};}if(name==='service_payment_context')return {data:context()};if(name==='service_apply_provider_payment')return {data:pix?'pending':'paid'};if(name==='service_complete_transparent_payment'){submission={request_key:requestKey,state:args.p_state,result:args.p_result};return {data:true};}if(name==='service_reject_transparent_payment')return {data:true};throw Error(name);}};
  const handler=createTransparentPaymentHandler({diagnose:(stage,details)=>events.push({stage,...details}),env:name=>config[name],createClient:(_u,key)=>key==='anon'?client:admin,fetchImpl:async(url,options)=>{calls.push({name:'provider',url,options});if(url.endsWith('/users/me'))return new Response(JSON.stringify({id:accountId}),{status:200});if(url.includes('/payments/search?'))return new Response(JSON.stringify({results:[{id:123}],paging:{total:1}}));if(failedNetwork)throw Error('network');return new Response(JSON.stringify({id:123,collector_id:12,external_reference:order,live_mode:false,currency_id:'BRL',transaction_amount:15,transaction_amount_refunded:0,status:pix?'pending':'approved',payment_method_id:pix?'pix':'master',date_last_updated:'2026-01-01T00:00:00Z',metadata:{pupi_submission_id:detailMatch?requestKey:idempotency},point_of_interaction:{transaction_data:{qr_code:'codigo-pix-teste',ticket_url:'https://external.test'}}}),{status:providerStatus});}});
  const run=async(action='pay',data={})=>handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:JSON.stringify({action,order_id:order,request_key:requestKey,form_data:pix?{...form,payment_method_id:'pix'}:form,...data})}));
  return {run,calls,config,events};
}
test('cartão usa total do banco, token e idempotência sem retornar links ou dados pessoais',async()=>{
  const f=fixture();const response=await f.run('pay',{transaction_amount:1});assert.equal(response.status,200);const result=await response.json();assert.equal(result.submission.result.status,'paid');assert.equal(result.checkout_url,undefined);assert.ok(!JSON.stringify(result).includes('buyer@'));
  const call=f.calls.find(c=>c.name==='provider'&&c.options.method==='POST');assert.equal(call.url,'https://api.mercadopago.com/v1/payments');assert.equal(call.options.headers['X-Idempotency-Key'],idempotency);assert.equal(JSON.parse(call.options.body).transaction_amount,15);
});
test('Pix retorna código na aplicação sem ticket_url e não transmite token de cartão',async()=>{const f=fixture({pix:true});const result=await(await f.run()).json();assert.equal(result.submission.result.qr_code,'codigo-pix-teste');assert.ok(!JSON.stringify(result).includes('external.test'));assert.equal(JSON.parse(f.calls.find(c=>c.name==='provider'&&c.options.method==='POST').options.body).token,undefined);});
test('erro de rede mantém tentativa; checkout antigo e configuração ausente não cobram',async()=>{
 const f=fixture({failedNetwork:true});assert.equal((await f.run()).status,503);assert.ok(!f.calls.some(c=>c.name==='service_reject_transparent_payment'));
 for(const opts of [{legacy:true},{enabled:false}]){const s=fixture(opts);assert.notEqual((await s.run()).status,200);assert.ok(!s.calls.some(c=>c.name==='provider'&&c.options.method==='POST'));}
});
test('inicialização não reserva pagamento; public key não pode ser o access token',async()=>{const f=fixture();assert.equal((await f.run('init')).status,200);assert.ok(!f.calls.some(c=>c.name==='service_begin_transparent_payment'));f.config.MERCADO_PAGO_PUBLIC_KEY=f.config.MERCADO_PAGO_ACCESS_TOKEN;assert.equal((await f.run('init')).status,503);});

test('verificar Pix existente consulta o provedor sem criar outro pagamento',async()=>{
 const f=fixture({pix:true});await f.run('pay');const response=await f.run('refresh');assert.equal(response.status,200);
 const requests=f.calls.filter(call=>call.name==='provider'&&!call.url.endsWith('/users/me'));assert.equal(requests.length,2);assert.equal(requests[0].options.method,'POST');assert.equal(requests[1].options.method,undefined);assert.equal(requests[1].url,'https://api.mercadopago.com/v1/payments/123');
});
test('reenvio de tentativa usa mesma chave e a mesma impressão digital',async()=>{
 const f=fixture({failedNetwork:true});await f.run('pay');await f.run('pay');const requests=f.calls.filter(call=>call.name==='provider'&&!call.url.endsWith('/users/me'));assert.equal(requests[0].options.headers['X-Idempotency-Key'],requests[1].options.headers['X-Idempotency-Key']);
 const claims=f.calls.filter(call=>call.name==='service_begin_transparent_payment');assert.equal(claims[0].args.p_fingerprint,claims[1].args.p_fingerprint);
});

test('UUIDs são normalizados antes de enviar referência e metadados ao provedor',async()=>{
 const f=fixture();const response=await f.run('pay',{order_id:order.toUpperCase(),request_key:requestKey.toUpperCase()});assert.equal(response.status,200);
 const payload=JSON.parse(f.calls.find(c=>c.name==='provider'&&c.options.method==='POST').options.body);assert.equal(payload.external_reference,order);assert.equal(payload.metadata.pupi_submission_id,requestKey);
});

test('conta do token divergente bloqueia antes de reservar ou enviar cobrança',async()=>{
 const f=fixture({accountId:99});const response=await f.run();assert.equal(response.status,503);assert.equal((await response.json()).code,'CONFIG_MISMATCH');
 assert.deepEqual(f.events,[{stage:'PAYMENT_ACCOUNT_COLLECTOR_MISMATCH'}]);assert.ok(!f.calls.some(c=>c.name==='service_begin_transparent_payment'||(c.name==='provider'&&c.options.method==='POST')));
});
test('recuperação consulta detalhes quando a busca não inclui metadados',async()=>{
 const f=fixture({recover:true});assert.equal((await f.run('refresh')).status,200);
 const requests=f.calls.filter(c=>c.name==='provider');assert.ok(requests.some(c=>c.url.includes('/payments/search?')));assert.ok(requests.some(c=>c.url.endsWith('/payments/123')));assert.ok(requests.every(c=>c.options.method!=='POST'));
 assert.ok(f.calls.some(c=>c.name==='service_complete_transparent_payment'));
});
test('resultado com vínculo diferente preserva tentativa e não aplica pagamento',async()=>{
 const f=fixture({recover:true,detailMatch:false});assert.equal((await f.run('refresh')).status,503);
 assert.deepEqual(f.events,[{stage:'PAYMENT_SEARCH_EMPTY',candidate_count:1,match_count:0}]);
 assert.ok(!f.calls.some(c=>['service_apply_provider_payment','service_reject_transparent_payment','service_complete_transparent_payment'].includes(c.name)));
 assert.ok(f.calls.filter(c=>c.name==='provider').every(c=>c.options.method!=='POST'));
});
