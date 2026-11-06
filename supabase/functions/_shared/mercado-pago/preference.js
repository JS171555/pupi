/** Prepara preferência a partir do snapshot privado do banco. Não cria pagamento. */
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const integer=(value,min)=>Number.isSafeInteger(value)&&value>=min;
function origin(value) {
  let parsed;try { parsed=new URL(value); } catch { throw new Error('invalid_origin'); }
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.port)throw new Error('invalid_origin');
  return parsed.origin;
}
export function buildCheckoutPreference(snapshot,{storeOrigin,supabaseOrigin}) {
  if(!snapshot||!uuid(snapshot.order_id)||snapshot.currency!=='BRL'||!integer(snapshot.subtotal_cents,1)||!integer(snapshot.shipping_cents,0)||!integer(snapshot.total_cents,1)||!Array.isArray(snapshot.items)||snapshot.items.length<1||snapshot.items.length>100)throw new Error('invalid_snapshot');
  const shop=origin(storeOrigin),supabase=origin(supabaseOrigin);
  if(!/^[a-z0-9-]+\.supabase\.co$/.test(new URL(supabase).hostname))throw new Error('invalid_supabase_origin');
  let subtotal=0;const seen=new Set();
  const items=snapshot.items.map(item=>{
    if(!item||!uuid(item.product_id)||seen.has(item.product_id.toLowerCase())||typeof item.name!=='string'||!item.name.trim()||item.name.length>200||!integer(item.quantity,1)||item.quantity>999||!integer(item.unit_price_cents,1))throw new Error('invalid_item');
    seen.add(item.product_id.toLowerCase());subtotal+=item.quantity*item.unit_price_cents;
    if(!Number.isSafeInteger(subtotal)||Math.round((item.unit_price_cents/100)*100)!==item.unit_price_cents)throw new Error('invalid_total');
    return {id:item.product_id,title:item.name.trim(),quantity:item.quantity,currency_id:'BRL',unit_price:item.unit_price_cents/100};
  });
  if(subtotal!==snapshot.subtotal_cents||!Number.isSafeInteger(subtotal+snapshot.shipping_cents)||subtotal+snapshot.shipping_cents!==snapshot.total_cents||Math.round((snapshot.shipping_cents/100)*100)!==snapshot.shipping_cents)throw new Error('invalid_total');
  if(snapshot.shipping_cents>0)items.push({id:'shipping',title:'Frete',quantity:1,currency_id:'BRL',unit_price:snapshot.shipping_cents/100});
  const returnUrl=`${shop}/#/pedidos/${snapshot.order_id}`;
  return {items,external_reference:snapshot.order_id,back_urls:{success:returnUrl,pending:returnUrl,failure:returnUrl},notification_url:`${supabase}/functions/v1/pupi-mercadopago-webhook`};
}
