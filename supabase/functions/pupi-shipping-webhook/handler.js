const json=(status,body)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
const validUuid=value=>typeof value==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const supported=new Set(['order.created','order.pending','order.released','order.generated','order.received','order.posted','order.delivered','order.cancelled','order.undelivered','order.paused','order.suspended']);
const timestamps={'order.created':'created_at','order.released':'paid_at','order.generated':'generated_at','order.posted':'posted_at','order.delivered':'delivered_at','order.cancelled':'canceled_at'};
export function createShippingWebhookHandler({createClient,env}) {
  return async request=>{
    if(request.method!=='POST')return json(405,{error:'Método não permitido.'});
    const secret=env('MELHOR_ENVIO_WEBHOOK_SECRET'),url=env('SUPABASE_URL'),service=env('SUPABASE_SERVICE_ROLE_KEY');
    if(!secret||!url||!service)return json(503,{error:'Serviço indisponível.'});
    const length=Number(request.headers.get('content-length')||0);
    if(length>65536)return json(413,{error:'Requisição muito grande.'});
    try {
      const reader=request.body?.getReader();const chunks=[];let size=0;
      if(reader) for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>65536){await reader.cancel();return json(413,{error:'Requisição muito grande.'});}chunks.push(part.value);}
      const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}
      const encoded=request.headers.get('x-me-signature')||'';
      if(!/^[A-Za-z0-9+/]{43}=$/.test(encoded))return json(401,{error:'Assinatura inválida.'});
      const signature=Uint8Array.from(atob(encoded),character=>character.charCodeAt(0));
      const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['verify']);
      if(!await crypto.subtle.verify('HMAC',key,signature,raw))return json(401,{error:'Assinatura inválida.'});
      const body=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
      if(!supported.has(body?.event))return json(200,{received:true});
      if(!validUuid(body?.data?.id))return json(400,{error:'Evento inválido.'});
      const dateValue=body.data[timestamps[body.event]] || body.data.updated_at || new Date().toISOString();
      if(typeof dateValue!=='string' || !Number.isFinite(Date.parse(dateValue)))return json(400,{error:'Data do evento inválida.'});
      const tracking=body.data.tracking || null;
      if(tracking!==null && (typeof tracking!=='string' || !/^[a-zA-Z0-9._-]{1,120}$/.test(tracking)))return json(400,{error:'Rastreamento inválido.'});
      const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),byte=>byte.toString(16).padStart(2,'0')).join('');
      const client=createClient(url,service,{auth:{persistSession:false}});
      const {data,error}=await client.rpc('service_apply_shipping_event',{p_external_id:body.data.id,p_event:body.event,p_digest:digest,p_occurred_at:new Date(dateValue).toISOString(),p_tracking:tracking});
      if(error||data!==true)return json(503,{error:'Evento não processado. Tente novamente.'});
      return json(200,{received:true});
    } catch {return json(503,{error:'Evento não processado. Tente novamente.'});}
  };
}
