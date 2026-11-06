import test from 'node:test';
import assert from 'node:assert/strict';
import {providerProducts,providerPackages,parseProviderOptions} from '../supabase/functions/pupi-checkout/calculation.js';

test('frete converte dimensões, peso e seguro unitário sem arredondar preços',()=>{
  assert.deepEqual(providerProducts({items:[{product_id:'p',quantity:2,price_cents:1599,weight_grams:500,width_mm:120,height_mm:80,length_mm:130}]}),
    [{id:'p',quantity:2,width:12,height:8,length:13,weight:.5,insurance_value:15.99}]);
  assert.throws(()=>providerProducts({items:[{quantity:1}]}));
});
test('frete usa preço customizado e exclui modalidades inválidas ou recusadas',()=>{
  const data=[{id:1,name:'PAC',company:{name:'Correios'},custom_price:'19.90',custom_delivery_time:5},
    {id:2,name:'ruim',company:{name:'X'},custom_price:'1e3'},
    {id:3,name:'negado',company:{name:'X'},custom_price:'5.00',error:'erro'}];
  assert.deepEqual(parseProviderOptions(data),[{serviceId:'1',carrier:'Correios',serviceName:'PAC',cents:1990,days:5,packages:null}]);
  assert.throws(()=>parseProviderOptions({}));
});

test('servidor cota com dados próprios e registra valor retornado pela transportadora',async()=>{
  const {createCheckoutHandler}=await import('../supabase/functions/pupi-checkout/handler.js');
  const userId='00000000-0000-4000-8000-000000000001',address='30000000-0000-4000-8000-000000000001',quoteId='60000000-0000-4000-8000-000000000001';
  const snapshot={origin_postal_code:'01001000',destination_postal_code:'20040020',items:[{product_id:'p',quantity:2,price_cents:1500,weight_grams:500,width_mm:100,height_mm:100,length_mm:100}]};
  const calls=[];
  const createClient=(_url,key)=>key==='anon'?{
    auth:{getUser:async token=>({data:{user:token==='valid'?{id:userId}:null},error:null})},
    from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{terms_accepted_at:'2026-01-01',terms_version:'testing-v1'},error:null})})})}),
  }:{rpc:async(name,params)=>{calls.push({name,params});return {data:name==='service_quote_snapshot'?snapshot:quoteId,error:null};}};
  const envs={SUPABASE_URL:'https://pupi.test',SUPABASE_ANON_KEY:'anon',SUPABASE_SERVICE_ROLE_KEY:'secret',MELHOR_ENVIO_TOKEN:'token',MELHOR_ENVIO_ENV:'sandbox',MELHOR_ENVIO_USER_AGENT:'Pupi (suporte@example.com)'};
  let providerRequest;
  const handler=createCheckoutHandler({createClient,env:key=>envs[key],fetchImpl:async(url,options)=>{
    providerRequest={url,options};return new Response(JSON.stringify([{id:1,name:'PAC',company:{name:'Correios'},custom_price:'12.34',custom_delivery_time:4,packages:[{weight:'0.5',dimensions:{height:10,width:10,length:10}}]}]),{status:200});
  }});
  const response=await handler(new Request('https://pupi.test/functions/v1/pupi-checkout',{method:'POST',headers:{Authorization:'Bearer valid','Content-Type':'application/json'},body:JSON.stringify({action:'quote',address_id:address,shipping_cents:1,user_id:'attacker'})}));
  const result=await response.json();assert.equal(response.status,200);assert.equal(result.quotes[0].price_cents,1234);assert.equal(result.quotes[0].subtotal_cents,3000);
  assert.equal(calls[0].params.p_user_id,userId);assert.equal(calls[1].name,'service_register_shipping_quote_v2');assert.equal(calls[1].params.p_shipping_cents,1234);
  assert.deepEqual(calls[1].params.p_packages,[{height:10,width:10,length:10,weight:0.5}]);
  const sent=JSON.parse(providerRequest.options.body);assert.equal(sent.from.postal_code,'01001000');assert.equal(sent.to.postal_code,'20040020');assert.equal(sent.products[0].insurance_value,15);
  assert.ok(!JSON.stringify(result).includes('token'));
  const denied=await handler(new Request('https://pupi.test/functions/v1/pupi-checkout',{method:'POST',headers:{Authorization:'Bearer invalid','Content-Type':'application/json'},body:JSON.stringify({action:'quote',address_id:address})}));assert.equal(denied.status,401);
});


test('volumes do provedor preservam unidades sem inventar dados faltantes',()=>{
  assert.deepEqual(providerPackages([{weight:'1.25',dimensions:{width:20,height:10,length:30}}]),[{width:20,height:10,length:30,weight:1.25}]);
  assert.equal(providerPackages([{weight:'1.25',dimensions:{width:20,height:10}}]),null);
  assert.equal(providerPackages([{weight:'0',dimensions:{width:20,height:10,length:30}}]),null);
  assert.equal(providerPackages([]),null);
});
