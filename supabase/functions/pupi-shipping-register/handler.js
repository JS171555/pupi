import {buildShipmentPayload} from './shipment-payload.js';

const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const reply=(status,code,error,extra={})=>new Response(JSON.stringify({code,error,...extra}),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
const uuid=s=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
const uncertain=()=>reply(503,'REGISTRATION_UNCERTAIN','Não foi possível confirmar o registro. Confira o carrinho do Melhor Envio antes de tentar novamente.');

export function createShippingRegistrationHandler({createClient,env,fetchImpl=fetch}) {
  return async req=>{
    if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
    if(req.method!=='POST')return reply(405,'METHOD','Método não permitido.');
    try {
      const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),secret=env('SUPABASE_SERVICE_ROLE_KEY');
      const authorization=req.headers.get('Authorization')||'';
      if(!url||!anon||!secret)return reply(503,'UNAVAILABLE','Serviço indisponível.');
      if(!/^Bearer\s+\S+$/i.test(authorization))return reply(401,'AUTH','Entre novamente na sua conta.');
      const client=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
      const {data:{user},error:authError}=await client.auth.getUser(authorization.replace(/^Bearer\s+/i,''));
      if(authError||!user)return reply(401,'AUTH','Entre novamente na sua conta.');
      const {data:isAdmin,error:adminError}=await client.rpc('admin_access_status');
      if(adminError||!isAdmin)return reply(403,'FORBIDDEN','Acesso restrito à administração.');
      const body=await req.json();
      if(!uuid(body?.order_id)||typeof body.recipient_document!=='string'||!/^\d{11}(?:\d{3})?$/.test(body.recipient_document))return reply(400,'DATA_INVALID','Informe o pedido e o CPF ou CNPJ do destinatário.');
      const token=env('MELHOR_ENVIO_TOKEN'),environment=env('MELHOR_ENVIO_ENV'),contact=env('MELHOR_ENVIO_USER_AGENT'),senderJson=env('MELHOR_ENVIO_SENDER');
      if(!token||!contact||!senderJson||!['sandbox','production'].includes(environment||''))return reply(503,'CONFIG_MISSING','O envio ainda precisa ser configurado no servidor.');
      let sender;try{sender=JSON.parse(senderJson);}catch{return reply(503,'CONFIG_MISSING','Os dados do remetente precisam ser configurados no servidor.');}
      const admin=createClient(url,secret,{auth:{persistSession:false}});
      const {data:context,error:contextError}=await admin.rpc('service_shipping_registration_context',{p_actor:user.id,p_order:body.order_id});
      if(contextError||!context)return reply(409,'PREREQUISITES','Confira a NF-e, a cotação com volumes e o status do pedido.');
      let payload;
      try {
        const recipient={email:context.recipient.email,phone:body.recipient_phone||context.recipient.phone,...(body.recipient_document.length===11?{document:body.recipient_document}:{company_document:body.recipient_document})};
        payload=buildShipmentPayload({order:context.order,quote:context.quote,invoice:context.invoice,sender,recipient,agency:body.agency});
      } catch(error) {
        const messages={multiple_labels_require_item_allocation:'Esta transportadora exige uma etiqueta por volume; a separação dos itens ainda não está disponível.',invoice_xml_required:'Esta transportadora exige dados adicionais do XML da NF-e, ainda não disponíveis.'};
        return reply(409,'DATA_INVALID',messages[error.message]||'Confira os dados de remetente, destinatário, NF-e e cotação.');
      }
      const attempt=crypto.randomUUID();
      const {data:state,error:beginError}=await admin.rpc('service_shipping_registration_begin',{p_actor:user.id,p_order:body.order_id,p_attempt:attempt,p_context:context});
      if(beginError)return reply(409,'CONTEXT_CHANGED','Os dados do pedido mudaram. Atualize a página.');
      if(state!=='started_now')return reply(409,'REGISTRATION_PENDING','Já existe uma tentativa para este pedido. Confira o carrinho do Melhor Envio.');
      try {
        const host=environment==='sandbox'?'https://sandbox.melhorenvio.com.br':'https://www.melhorenvio.com.br';
        const provider=await fetchImpl(`${host}/api/v2/me/cart`,{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'User-Agent':contact,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(payload)});
        if(provider.status===422) {
          const result=await admin.rpc('service_shipping_registration_finish',{p_order:body.order_id,p_attempt:attempt,p_external_id:null,p_rejected:true});
          return !result.error&&result.data==='rejected'?reply(422,'PROVIDER_REJECTED','O Melhor Envio recusou os dados. Confira-os antes de tentar novamente.'):uncertain();
        }
        if(provider.status!==201)return uncertain();
        const result=await provider.json();
        if(!uuid(result?.id))return uncertain();
        const saved=await admin.rpc('service_shipping_registration_finish',{p_order:body.order_id,p_attempt:attempt,p_external_id:result.id,p_rejected:false});
        if(saved.error||saved.data!=='registered')return uncertain();
        return reply(200,'REGISTERED',null,{external_id:result.id});
      } catch {return uncertain();}
    } catch {return reply(503,'UNAVAILABLE','Serviço indisponível.');}
  };
}
