import {buildCheckoutPreference} from './preference.js';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(status,code,error,extra={})=>new Response(JSON.stringify({code,error,...extra}),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
function safeCheckoutUrl(value) {
  try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&/^(www|sandbox)\.mercadopago\.(com|com\.br)$/.test(u.hostname);} catch{return false;}
}
const uncertain=()=>reply(503,'PAYMENT_UNCERTAIN','Não foi possível confirmar a preparação do pagamento. Consulte o pedido antes de tentar novamente.');
function preferenceMatches(actual,expected,collector) {
  const id=value=>typeof value==='string'&&/^\d{1,30}$/.test(value)?value:typeof value==='number'&&Number.isSafeInteger(value)?String(value):null;
  if(!actual||id(actual.collector_id)!==collector||actual.external_reference!==expected.external_reference||actual.notification_url!==expected.notification_url||!Array.isArray(actual.items)||actual.items.length!==expected.items.length)return false;
  if(['success','pending','failure'].some(name=>actual.back_urls?.[name]!==expected.back_urls[name]))return false;
  const items=new Map(expected.items.map(item=>[item.id,item]));
  for(const item of actual.items) {
    const target=items.get(item.id);
    if(!target||item.currency_id!==target.currency_id||item.quantity!==target.quantity||typeof item.unit_price!=='number'||!Number.isFinite(item.unit_price)||Math.round(item.unit_price*100)!==Math.round(target.unit_price*100)||Math.abs(item.unit_price*100-Math.round(item.unit_price*100))>0.000001)return false;
    items.delete(item.id);
  }
  return items.size===0;
}

export function createPaymentCheckoutHandler({createClient,env,fetchImpl=fetch}) {
  return async request=>{
    if(request.method==='OPTIONS')return new Response('ok',{headers:cors});
    if(request.method!=='POST')return reply(405,'METHOD','Método não permitido.');
    const authorization=request.headers.get('Authorization')||'',url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');
    if(!url||!anon||!service)return reply(503,'UNAVAILABLE','Pagamento indisponível.');
    if(!/^Bearer\s+\S+$/i.test(authorization))return reply(401,'AUTH','Entre novamente na sua conta.');
    try {
      const client=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
      const {data:{user},error:authError}=await client.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
      if(authError||!user)return reply(401,'AUTH','Entre novamente na sua conta.');
      const body=await request.json();if(!uuid(body?.order_id))return reply(400,'INVALID','Pedido inválido.');
      const token=env('MERCADO_PAGO_ACCESS_TOKEN'),secret=env('MERCADO_PAGO_WEBHOOK_SECRET'),collector=env('MERCADO_PAGO_COLLECTOR_ID'),mode=env('MERCADO_PAGO_ENV'),storeOrigin=env('PUPI_STORE_ORIGIN');
      if(env('MERCADO_PAGO_CHECKOUT_ENABLED')!=='true'||!token||!secret||!/^\d{1,30}$/.test(collector||'')||!['sandbox','production'].includes(mode||'')||!storeOrigin)return reply(503,'CONFIG_MISSING','Pagamento ainda não está configurado.');
      // Valida configuração antes de abrir uma tentativa persistente.
      try{buildCheckoutPreference({order_id:body.order_id,currency:'BRL',subtotal_cents:1,shipping_cents:0,total_cents:1,items:[{product_id:body.order_id,name:'Teste',quantity:1,unit_price_cents:1}]},{storeOrigin,supabaseOrigin:url});}catch{return reply(503,'CONFIG_MISSING','Pagamento ainda não está configurado.');}
      const admin=createClient(url,service,{auth:{persistSession:false}}),attempt=crypto.randomUUID();
      const {data:started,error:beginError}=await admin.rpc('service_begin_payment_attempt',{p_user_id:user.id,p_order_id:body.order_id,p_attempt_id:attempt});
      if(beginError||!started)return reply(409,'ORDER_UNAVAILABLE','Este pedido não está disponível para pagamento.');
      if(!started.created) {
        const state=await admin.rpc('service_payment_attempt_state',{p_user_id:user.id,p_order_id:body.order_id});
        if(!state.error&&state.data?.status==='ready'&&safeCheckoutUrl(state.data.checkout_url))return reply(200,'READY',null,{checkout_url:state.data.checkout_url});
        if(state.error||state.data?.status!=='started'||!uuid(started.attempt_id))return uncertain();
        // Uma busca vazia pode refletir atraso do provedor: nunca cria outra preferência.
        try {
          const expected=buildCheckoutPreference(started.snapshot,{storeOrigin,supabaseOrigin:url});
          const options={headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},signal:AbortSignal.timeout(10000),redirect:'error'};
          const search=await fetchImpl(`https://api.mercadopago.com/checkout/preferences/search?external_reference=${encodeURIComponent(body.order_id)}&limit=2`,options);
          if(!search.ok)return uncertain();
          const found=await search.json();
          if(found.total!==1||!Array.isArray(found.elements)||found.elements.length!==1)return uncertain();
          const id=found.elements[0]?.id;
          if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(id))return uncertain();
          const detail=await fetchImpl(`https://api.mercadopago.com/checkout/preferences/${id}`,options);
          if(!detail.ok)return uncertain();
          const preference=await detail.json();
          if(preference.id!==id||!safeCheckoutUrl(preference.init_point)||!preferenceMatches(preference,expected,collector))return uncertain();
          const saved=await admin.rpc('service_finish_payment_preference',{p_user_id:user.id,p_order_id:body.order_id,p_attempt_id:started.attempt_id,p_preference_id:id,p_checkout_url:preference.init_point});
          if(saved.error||saved.data!==true)return uncertain();
          const current=await admin.rpc('service_payment_attempt_state',{p_user_id:user.id,p_order_id:body.order_id});
          if(current.error||!safeCheckoutUrl(current.data?.checkout_url))return uncertain();
          return reply(200,'READY',null,{checkout_url:current.data.checkout_url});
        }catch{return uncertain();}
      }
      let payload;try {payload=buildCheckoutPreference(started.snapshot,{storeOrigin,supabaseOrigin:url});}catch{return uncertain();}
      try {
        const response=await fetchImpl('https://api.mercadopago.com/checkout/preferences',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(15000),redirect:'error'});
        if(!response.ok)return uncertain();
        const data=await response.json(),checkoutUrl=data.init_point;
        if(typeof data.id!=='string'||!/^[A-Za-z0-9_-]{1,200}$/.test(data.id)||data.external_reference!==body.order_id||!safeCheckoutUrl(checkoutUrl))return uncertain();
        const saved=await admin.rpc('service_finish_payment_preference',{p_user_id:user.id,p_order_id:body.order_id,p_attempt_id:attempt,p_preference_id:data.id,p_checkout_url:checkoutUrl});
        if(saved.error||saved.data!==true)return uncertain();
        return reply(200,'READY',null,{checkout_url:checkoutUrl});
      }catch{return uncertain();}
    } catch{return reply(503,'UNAVAILABLE','Pagamento indisponível.');}
  };
}
