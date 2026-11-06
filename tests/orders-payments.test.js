import test from 'node:test';
import assert from 'node:assert/strict';
import {createTransparentPaymentHandler} from '../supabase/functions/_shared/mercado-pago/transparent.js';
import {createOrderProcessor,orderCredentialsValid} from '../supabase/functions/_shared/mercado-pago/orders.js';
const order='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',key='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',idempotency='cccccccc-cccc-4ccc-8ccc-cccccccccccc',providerId='ORD01JS2V6CM8KJ0EC4H502TGK1WP';
const form={payment_method_id:'master',payment_type_id:'credit_card',token:'a'.repeat(32),installments:1,issuer_id:'310',payer:{email:'buyer@example.test',identification:{type:'CPF',number:'12345678909'}}};
const canonical=()=>({id:providerId,user_id:'12',external_reference:key,type:'online',processing_mode:'automatic',total_amount:'15.00',total_paid_amount:'15.00',country_code:'BRA',status:'processed',status_detail:'accredited',last_updated_date:'2026-11-06T16:00:00Z',transactions:{payments:[{id:'PAY01JS2V6CM8KJ0EC4H504R7YE34',amount:'15.00',paid_amount:'14.00',status:'processed',status_detail:'accredited',payment_method:{id:'master',type:'credit_card',token:'must-not-leak'}}]}});
function fixture({status=201,error=null,recover=false,network=false,pix=false,accountTest=true,legacy=false,emptySearch=false}={}){
 const calls=[],events=[],config={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'service',MERCADO_PAGO_CHECKOUT_ENABLED:'true',MERCADO_PAGO_ACCESS_TOKEN:'APP_USR-test-placeholder',MERCADO_PAGO_PUBLIC_KEY:'APP_USR-12345678-1234-1234-1234-123456789012',MERCADO_PAGO_ENV:'sandbox',MERCADO_PAGO_COLLECTOR_ID:'12',MERCADO_PAGO_WEBHOOK_SECRET:'secret'};
 const details=canonical();if(pix){details.status=details.transactions.payments[0].status='action_required';details.status_detail=details.transactions.payments[0].status_detail='waiting_transfer';details.total_paid_amount='0.00';details.transactions.payments[0].payment_method={id:'pix',type:'bank_transfer',qr_code:'pix-test',ticket_url:'https://must-not-leak.test'};}
 let submission=recover?{api_kind:legacy?'payments':'orders',request_key:key,state:'started',provider_mode:'sandbox',collector_id:'12',created_at:'2026-11-06T16:00:00Z'}:null,paid=false,begun=recover;
 const context=()=>({order_id:order,order_number:4,order_status:'confirmed',payment_status:paid?'paid':'pending',total_cents:1500,submission});
 const admin={rpc:async(name,args)=>{calls.push({name,args});if(name==='service_transparent_context')return {data:context()};if(name==='service_begin_order_payment'){const fresh=!begun;begun=true;submission={api_kind:'orders',request_key:key,state:'started',provider_mode:config.MERCADO_PAGO_ENV,collector_id:config.MERCADO_PAGO_COLLECTOR_ID,created_at:'2026-11-06T16:00:00Z'};return {data:{can_submit:true,idempotency_key:idempotency,fresh}};}if(name==='service_orders_payment_context')return {data:{order_id:order,total_cents:1500,request_key:key,provider_mode:submission?.provider_mode||config.MERCADO_PAGO_ENV,collector_id:submission?.collector_id||config.MERCADO_PAGO_COLLECTOR_ID,payment_id:submission?.result?.payment_id}};if(name==='service_apply_provider_payment'){paid=args.p_state==='paid';return {data:paid?'paid':'pending'};}if(name==='service_complete_transparent_payment'){submission={...submission,state:args.p_state,result:args.p_result};return {data:true};}if(name==='service_reject_transparent_payment'){submission={...submission,state:'failed',result:{status:'failed'}};return {data:true};}throw Error(name);}};
 const handler=createTransparentPaymentHandler({apiKind:'orders',env:n=>config[n],diagnose:(stage,info)=>events.push({stage,...info}),createClient:(_u,k)=>k==='anon'?{auth:{getUser:async()=>({data:{user:{id:order}}})}}:admin,fetchImpl:async(url,options)=>{
  calls.push({name:'fetch',url,options});if(url.endsWith('/users/me'))return Response.json({id:12,tags:accountTest?['test_user']:[]});
  if(url.includes('/orders?'))return Response.json({data:emptySearch?[]:[{id:providerId}],paging:{total:emptySearch?'0':'1'}});
  if(options.method==='POST'){if(network)throw Error('network');return Response.json(error||{id:providerId},{status});}
  if(url.endsWith('/orders/'+providerId))return Response.json(details);
  if(url.includes('/payments/search?'))return Response.json({results:[],paging:{total:0}});
  throw Error('unexpected endpoint');
 }});
 const run=(action='pay',values={})=>handler(new Request('https://example.test',{method:'POST',headers:{Authorization:'Bearer valid'},body:JSON.stringify({action,order_id:order,request_key:key,form_data:pix?{...form,payment_method_id:'pix'}:form,...values})}));
 return {run,calls,events,config,details,admin};
}
test('Orders cria formato oficial com total do banco e confirma pelo GET canônico',async()=>{
 const f=fixture();const response=await f.run('pay',{total_amount:'0.01'});assert.equal(response.status,200);const result=await response.json();assert.equal(result.payment_status,'paid');assert.equal(result.submission.result.payment_id,providerId);
 const sent=f.calls.find(c=>c.name==='fetch'&&c.options.method==='POST');assert.equal(sent.url,'https://api.mercadopago.com/v1/orders');assert.equal(sent.options.headers['X-Test-Token'],'true');assert.equal(sent.options.headers['X-Idempotency-Key'],idempotency);
 const body=JSON.parse(sent.options.body);assert.equal(body.total_amount,'15.00');assert.equal(body.transactions.payments[0].amount,'15.00');assert.equal(body.external_reference,key);assert.equal(body.transactions.payments[0].payment_method.type,'credit_card');assert.equal(body.notification_url,undefined);assert.equal(body.transaction_amount,undefined);assert.equal(body.metadata,undefined);assert.equal(body.transactions.payments[0].payment_method.issuer_id,undefined);
 assert.ok(f.calls.some(c=>c.name==='fetch'&&c.url.endsWith('/orders/'+providerId)));assert.ok(!JSON.stringify(result).includes('must-not-leak'));assert.ok(!JSON.stringify(result).includes('buyer@'));assert.equal(result.submission.collector_id,undefined);
});
test('Orders Pix permanece dentro do Pupi com código sanitizado',async()=>{const f=fixture({pix:true});const response=await f.run();assert.equal(response.status,200);const data=await response.json();assert.equal(data.submission.result.status,'pending');assert.equal(data.submission.result.qr_code,'pix-test');assert.ok(!JSON.stringify(data).includes('ticket_url'));assert.equal(JSON.parse(f.calls.find(c=>c.name==='fetch'&&c.options.method==='POST').options.body).transactions.payments[0].payment_method.token,undefined);});
test('credenciais incompatíveis são barradas antes de tokenizar ou reservar cobrança',async()=>{
 for(const options of [{accountTest:false},{accountTest:true}]){const f=fixture(options);if(options.accountTest)f.config.MERCADO_PAGO_ACCESS_TOKEN='TEST-wrong-api';assert.equal((await f.run('init')).status,503);assert.equal(f.calls.some(c=>c.name==='service_begin_order_payment'),false);assert.equal(f.calls.some(c=>c.name==='fetch'&&c.options.method==='POST'),false);}
 assert.equal(orderCredentialsValid({tags:['test_user']},'APP_USR-x','production'),false);
});
test('recuperação Orders usa datas e referência da tentativa sem criar outra order',async()=>{
 const f=fixture({recover:true});assert.equal((await f.run('refresh')).status,200);const found=f.calls.find(c=>c.name==='fetch'&&c.url.includes('/orders?'));const url=new URL(found.url);assert.equal(url.searchParams.get('external_reference'),key);assert.ok(url.searchParams.get('begin_date'));assert.ok(url.searchParams.get('end_date'));assert.equal(f.calls.some(c=>c.name==='fetch'&&c.options.method==='POST'),false);
});
test('busca vazia e timeout não liberam nova tentativa',async()=>{
 const f=fixture({recover:true,emptySearch:true});assert.equal((await f.run('refresh')).status,503);assert.ok(!f.calls.some(c=>c.name==='service_reject_transparent_payment'));
 const n=fixture({network:true});assert.equal((await n.run()).status,503);assert.ok(!n.calls.some(c=>c.name==='service_reject_transparent_payment'));
});
test('401 na primeira criação Orders encerra tentativa; reenvio incerto permanece preservado',async()=>{
 const f=fixture({status:401,error:{error:'invalid_credentials'}});assert.equal((await(await f.run()).json()).code,'CONFIG_ORDERS_CREDENTIALS');assert.ok(f.calls.some(c=>c.name==='service_reject_transparent_payment'));
 const replay=fixture({recover:true,status:401,error:{error:'invalid_credentials'}});assert.equal((await replay.run()).status,503);assert.ok(!replay.calls.some(c=>c.name==='service_reject_transparent_payment'));
});
test('conflito de idempotência Orders nunca libera cobrança, mesmo com HTTP 400',async()=>{
 const f=fixture({status:400,error:{errors:[{code:'idempotency_key_already_used'}]}});assert.equal((await f.run()).status,503);assert.ok(!f.calls.some(c=>c.name==='service_reject_transparent_payment'));
});
test('tentativa histórica Payments continua sendo consultada pela API original',async()=>{
 const f=fixture({recover:true,legacy:true});assert.equal((await f.run('refresh')).status,503);assert.ok(f.calls.some(c=>c.name==='fetch'&&c.url.includes('/payments/search?')));assert.ok(!f.calls.some(c=>c.name==='fetch'&&c.url.includes('/orders')));
});
test('Orders não aplica divergências de vendedor, valor, país ou vínculo',async()=>{
 for(const change of [o=>o.user_id='99',o=>o.total_amount='0.01',o=>o.country_code='ARG',o=>o.external_reference=order,o=>o.transactions.payments.push({...o.transactions.payments[0]})]){const f=fixture();change(f.details);assert.equal((await f.run()).status,503);assert.ok(!f.calls.some(c=>c.name==='service_apply_provider_payment'));}
});
test('estorno parcial e contestação Orders exigem conferência',async()=>{
 for(const field of ['refunds','chargebacks']){const f=fixture();f.details.transactions[field]=[{amount:'1.00'}];const data=await(await f.run()).json();assert.equal(data.submission.result.status,'review');assert.ok(f.calls.find(c=>c.name==='service_apply_provider_payment').args.p_state==='review');}
});

test('estorno completo Orders confirmado usa estado refunded, sem inventar devolução parcial',async()=>{
 const f=fixture();assert.equal((await f.run()).status,200);f.details.status=f.details.transactions.payments[0].status='refunded';f.details.last_updated_date='2026-11-06T16:01:00Z';f.details.transactions.refunds=[{amount:'15.00',status:'processed'}];
 const process=createOrderProcessor({admin:f.admin,env:n=>f.config[n]});assert.equal(await process({paymentId:providerId,payment:f.details}),true);assert.equal(f.calls.filter(c=>c.name==='service_apply_provider_payment').at(-1).args.p_state,'refunded');
});

test('tentativa Orders recusada não prende a configuração de uma tentativa nova',async()=>{
 const f=fixture({status:401,error:{error:'invalid_credentials'}});await f.run();
 const ctx=await f.admin.rpc('service_transparent_context',{});ctx.data.submission.collector_id='99';
 await f.run('pay',{request_key:idempotency});assert.equal(f.calls.filter(c=>c.name==='service_begin_order_payment').length,2);
});

test('Pix APRO é enviado somente ao sandbox com conta de teste; cartão e produção não o recebem',async()=>{
 const sandbox=fixture({pix:true});assert.equal((await sandbox.run()).status,200);
 const payload=JSON.parse(sandbox.calls.find(c=>c.name==='fetch'&&c.options.method==='POST').options.body);assert.equal(payload.payer.first_name,'APRO');assert.equal(payload.total_amount,'15.00');assert.equal(payload.payer.email,form.payer.email);
 const production=fixture({pix:true,accountTest:false});production.config.MERCADO_PAGO_ENV='production';assert.equal((await production.run()).status,200);
 const sent=production.calls.find(c=>c.name==='fetch'&&c.options.method==='POST');assert.equal(JSON.parse(sent.options.body).payer.first_name,undefined);assert.equal(sent.options.headers['X-Test-Token'],undefined);
 const card=fixture();await card.run();assert.equal(JSON.parse(card.calls.find(c=>c.name==='fetch'&&c.options.method==='POST').options.body).payer.first_name,undefined);
});
test('Pix pendente passa a pago pela consulta canônica sem gerar outro pagamento',async()=>{
 const f=fixture({pix:true});const pending=await(await f.run()).json();assert.equal(pending.submission.result.status,'pending');assert.equal(pending.test_mode,true);
 f.details.status=f.details.transactions.payments[0].status='processed';f.details.status_detail=f.details.transactions.payments[0].status_detail='accredited';f.details.total_paid_amount='15.00';f.details.last_updated_date='2026-11-06T16:01:00Z';
 const result=await(await f.run('refresh')).json();assert.equal(result.payment_status,'paid');assert.equal(result.submission.result.status,'paid');assert.equal(result.submission.result.qr_code,undefined);assert.equal(f.calls.filter(c=>c.name==='fetch'&&c.options.method==='POST').length,1);
});
