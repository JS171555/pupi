import {providerProducts,parseProviderOptions} from './calculation.js';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=(s)=>typeof s==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export function createCheckoutHandler({createClient,env,fetchImpl=fetch}) {
return async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
  if(req.method!=='POST')return reply(405,{error:'Método não permitido.'});
  try {
    const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),secret=env('SUPABASE_SERVICE_ROLE_KEY');
    const authorization=req.headers.get('Authorization') || '';
    if(!url || !anon || !secret)return reply(503,{error:'Serviço de checkout indisponível.'});
    if(!/^Bearer\s+\S+$/i.test(authorization))return reply(401,{error:'Entre na sua conta.'});
    const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
    const {data:{user},error:authError}=await userClient.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
    if(authError || !user)return reply(401,{error:'Entre novamente na sua conta.'});
    const {data:profile,error:profileError}=await userClient.from('profiles').select('terms_accepted_at,terms_version').eq('id',user.id).maybeSingle();
    if(profileError || !profile?.terms_accepted_at || profile.terms_version!=='testing-v1')return reply(403,{error:'Conclua o cadastro antes de continuar.'});
    const admin=createClient(url,secret,{auth:{persistSession:false}});
    const body=await req.json();
    if(body?.action==='confirm') {
      if(!uuid(body.quote_id)||!uuid(body.request_key))return reply(400,{error:'Solicitação inválida.'});
      const {data,error}=await admin.rpc('service_confirm_shipping_order',{p_user_id:user.id,p_quote_id:body.quote_id,p_request_key:body.request_key});
      if(error) {
        const deterministic=['quote_expired','quote_stale','cart_empty','invalid_cart_size','cart_unavailable_or_dimensions_missing','address_not_owned','origin_not_configured'].includes(error.message);
        return reply(deterministic?409:503,{error:deterministic?'A cotação expirou ou os dados mudaram. Solicite outra cotação.':'Confirmação não verificada. Tente novamente com a mesma solicitação.',code:deterministic?'QUOTE_STALE':'CONFIRM_UNCERTAIN'});
      }
      if(!uuid(data))return reply(503,{error:'Confirmação não verificada. Tente novamente com a mesma solicitação.',code:'CONFIRM_UNCERTAIN'});
      return reply(200,{order_id:data});
    }
    if(body?.action!=='quote'||!uuid(body.address_id))return reply(400,{error:'Escolha um endereço válido.'});
    const token=env('MELHOR_ENVIO_TOKEN'),environment=env('MELHOR_ENVIO_ENV'),contact=env('MELHOR_ENVIO_USER_AGENT');
    if(!token||!contact||!['sandbox','production'].includes(environment||''))return reply(503,{error:'Cotação de entrega ainda não está configurada.'});
    const {data:snapshot,error:snapshotError}=await admin.rpc('service_quote_snapshot',{p_user_id:user.id,p_address_id:body.address_id});
    if(snapshotError||!snapshot)return reply(409,{error:'Confira o estoque e as dimensões dos produtos no carrinho.'});
    if(!/^\d{8}$/.test(snapshot.origin_postal_code||'') || !/^\d{8}$/.test(snapshot.destination_postal_code||''))return reply(503,{error:'CEP de origem ainda não está configurado.'});
    const host=environment==='sandbox'?'https://sandbox.melhorenvio.com.br':'https://www.melhorenvio.com.br';
    const provider=await fetchImpl(`${host}/api/v2/me/shipment/calculate`,{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'User-Agent':contact,'Content-Type':'application/json',Accept:'application/json'},
      body:JSON.stringify({from:{postal_code:snapshot.origin_postal_code},to:{postal_code:snapshot.destination_postal_code},products:providerProducts(snapshot)})});
    if(!provider.ok)return reply(503,{error:'Não foi possível consultar as entregas. Tente novamente.'});
    const subtotal=snapshot.items.reduce((sum,item)=>sum+item.price_cents*item.quantity,0);
    if(!Number.isSafeInteger(subtotal) || subtotal<=0)return reply(409,{error:'Confira os produtos do carrinho.'});
    const options=parseProviderOptions(await provider.json());const expiresAt=new Date(Date.now()+10*60*1000).toISOString();const quotes=[];
    for(const option of options.slice(0,30)) {
      const {data,error}=await admin.rpc('service_register_shipping_quote_v2',{p_user_id:user.id,p_address_id:body.address_id,p_snapshot:snapshot,p_shipping_cents:option.cents,
        p_carrier:option.carrier,p_service_name:option.serviceName,p_service_id:option.serviceId,p_expires_at:expiresAt,p_packages:option.packages});
      if(error)return reply(409,{error:'Seu carrinho mudou. Atualize e solicite outra cotação.'});
      quotes.push({id:data,carrier:option.carrier,service_name:option.serviceName,price_cents:option.cents,subtotal_cents:subtotal,days:option.days,expires_at:expiresAt});
    }
    return reply(200,{quotes});
  } catch {return reply(503,{error:'Serviço de checkout indisponível. Tente novamente.'});}
};
}
