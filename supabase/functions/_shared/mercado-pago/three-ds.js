const hosts=new Set(['mercadopago.com.br','www.mercadopago.com.br','mercadopago.com','www.mercadopago.com','mercadopago.com.ar','www.mercadopago.com.ar']);
// O URL contém uma credencial transitória: nunca persistir nem registrar seu valor.
export function challengeAction(order) {
  const tx=order?.transactions?.payments?.[0],value=tx?.payment_method?.transaction_security?.url;
  if(order?.status!=='action_required'||tx?.status!=='action_required'||tx.status_detail!=='pending_challenge'||typeof value!=='string'||value.length>4096)return null;
  try{
    const url=new URL(value);
    if(url.protocol!=='https:'||!hosts.has(url.hostname)||url.username||url.password||url.port||url.hash||!url.pathname.startsWith('/auth/card/validation/'))return null;
    return {type:'three_ds',url:url.href};
  }catch{return null;}
}
