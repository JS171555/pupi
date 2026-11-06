// Conversões de unidades e valores para a API Melhor Envio.
export function providerProducts(snapshot) {
  if (!Array.isArray(snapshot?.items) || !snapshot.items.length || snapshot.items.length > 100) throw new Error('invalid_snapshot');
  return snapshot.items.map(item => {
    const {product_id,quantity,price_cents,weight_grams,width_mm,height_mm,length_mm}=item;
    if (![quantity,price_cents,weight_grams,width_mm,height_mm,length_mm].every(Number.isSafeInteger)
      || [quantity,price_cents,weight_grams,width_mm,height_mm,length_mm].some(value=>value<=0)) throw new Error('invalid_snapshot');
    return {id:product_id,quantity,width:width_mm/10,height:height_mm/10,length:length_mm/10,weight:weight_grams/1000,insurance_value:price_cents/100};
  });
}
export function parseProviderOptions(result) {
  if (!Array.isArray(result)) throw new Error('invalid_provider_response');
  const options=[];
  for (const option of result) {
    if (option.error || option.id==null || !option.name || !option.company?.name) continue;
    const value=String(option.custom_price ?? '');
    if (!/^\d{1,7}(?:\.\d{1,2})?$/.test(value)) continue;
    const [whole,fraction='']=value.split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));
    const serviceId=String(option.id),carrier=String(option.company.name).trim(),serviceName=String(option.name).trim();
    if (!Number.isSafeInteger(cents) || cents>2147483647 || serviceId.length>120 || !carrier || carrier.length>120 || !serviceName || serviceName.length>120) continue;
    const days=option.custom_delivery_time == null ? NaN : Number(option.custom_delivery_time);
    options.push({serviceId,carrier,serviceName,cents,days:Number.isSafeInteger(days)&&days>=0?days:null});
  }
  return options;
}
