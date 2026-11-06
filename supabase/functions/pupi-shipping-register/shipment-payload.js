/** Prepara dados de remessa comercial; não executa requisições nem armazena documentos. */
function text(value,max,name) {
  if(typeof value!=='string' || !value.trim() || value.trim().length>max)throw new Error(`invalid_${name}`);
  return value.trim();
}
function taxDocument(value) {
  if(typeof value!=='string' || !/^(?:[0-9]{11}|[0-9]{14})$/.test(value) || /^(\d)\1+$/.test(value))throw new Error('invalid_document');
  return value;
}
function email(value) {
  const result=text(value,254,'email');
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result))throw new Error('invalid_email');
  return result;
}
function phone(value) {
  if(typeof value!=='string' || !/^[0-9]{10,13}$/.test(value))throw new Error('invalid_phone');
  return value;
}
function postal(value) {
  if(typeof value!=='string' || !/^[0-9]{8}$/.test(value))throw new Error('invalid_postal_code');
  return value;
}
function state(value) {
  if(typeof value!=='string' || !/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(value))throw new Error('invalid_state');
  return value;
}
function invoiceKey(key) {
  if(typeof key!=='string'||!/^[0-9]{44}$/.test(key)||key.slice(20,22)!=='55')throw new Error('invalid_invoice');
  let sum=0,weight=2;
  for(let index=42;index>=0;index--){sum+=Number(key[index])*weight;weight=weight===9?2:weight+1;}
  const remainder=sum%11;if(Number(key[43])!==(remainder<2?0:11-remainder))throw new Error('invalid_invoice');
  return key;
}
function personDocument(person) {
  if(Boolean(person?.document)===Boolean(person?.company_document))throw new Error('invalid_document');
  const document=taxDocument(person.document||person.company_document);
  if(person.document && document.length!==11 || person.company_document && document.length!==14)throw new Error('invalid_document');
  return person.document ? {document} : {company_document:document};
}
function volumesFromQuote(packages,carrier) {
  if(!Array.isArray(packages)||!packages.length||packages.length>20)throw new Error('missing_quoted_packages');
  // Separar uma declaração fiscal em várias etiquetas exige atribuição real de itens a cada volume.
  if(packages.length>1 && /correios|loggi|j\s*&\s*t/i.test(carrier))throw new Error('multiple_labels_require_item_allocation');
  return packages.map(parcel=>{
    const dimensions=['height','width','length','weight'].map(name=>parcel?.[name]);
    if(!dimensions.every(value=>typeof value==='number'&&Number.isFinite(value)&&value>0&&value<=100000))throw new Error('invalid_quoted_package');
    return {height:parcel.height,width:parcel.width,length:parcel.length,weight:parcel.weight};
  });
}
export function buildShipmentPayload({order,quote,invoice,sender,recipient,agency,invoiceXml}) {
  if(!order || !quote || !sender || !recipient)throw new Error('missing_shipment_data');
  const key=invoiceKey(invoice?.access_key);
  const service=Number(quote.service_id);
  if(!Number.isSafeInteger(service)||service<=0||!/^\d+$/.test(String(quote.service_id)))throw new Error('invalid_service');
  const carrier=text(quote.carrier,120,'carrier');
  if(/azul/i.test(carrier) && (!invoiceXml || typeof invoiceXml!=='object' || Array.isArray(invoiceXml)))throw new Error('invoice_xml_required');
  const senderData={name:text(sender.name,120,'sender_name'),email:email(sender.email),phone:phone(sender.phone),...personDocument(sender),
    state_register:text(sender.state_register,60,'state_register'),address:text(sender.address,200,'sender_address'),
    number:text(sender.number,30,'sender_number'),district:text(sender.district,120,'sender_district'),city:text(sender.city,120,'sender_city'),
    postal_code:postal(sender.postal_code),state_abbr:state(sender.state_abbr)};
  if(sender.complement) senderData.complement=text(sender.complement,120,'sender_complement');
  const address=order.address_snapshot;
  if(!address || address.country!=='BR')throw new Error('invalid_delivery_address');
  const recipientData={name:text(address.recipient,160,'recipient_name'),email:email(recipient.email),phone:phone(recipient.phone),...personDocument(recipient),
    address:text(address.street,200,'recipient_address'),number:text(address.number,30,'recipient_number'),district:text(address.neighborhood,120,'recipient_district'),
    city:text(address.city,120,'recipient_city'),postal_code:postal(address.postal_code),state_abbr:state(address.state),country_id:'BR'};
  if(address.complement) recipientData.complement=text(address.complement,120,'recipient_complement');
  if(senderData.postal_code!==quote.snapshot?.origin_postal_code || recipientData.postal_code!==quote.snapshot?.destination_postal_code)throw new Error('postal_code_changed');
  if(!Array.isArray(order.items) || !order.items.length || order.items.length>100 || !Array.isArray(quote.snapshot?.items) || order.items.length!==quote.snapshot.items.length)throw new Error('invalid_order_items');
  const quoted=new Map(quote.snapshot.items.map(item=>[item.product_id,item]));let subtotal=0;
  const products=order.items.map(item=>{
    const previous=quoted.get(item.product_id);
    if(!previous || !Number.isSafeInteger(item.quantity) || item.quantity<1 || item.quantity!==previous.quantity || !Number.isSafeInteger(item.unit_price_cents) || item.unit_price_cents<=0 || item.unit_price_cents!==previous.price_cents)throw new Error('order_quote_mismatch');
    quoted.delete(item.product_id);subtotal+=item.unit_price_cents*item.quantity;
    return {name:text(item.product_name,200,'product_name'),quantity:item.quantity,unitary_value:item.unit_price_cents/100};
  });
  if(quoted.size || !Number.isSafeInteger(subtotal) || subtotal!==Number(order.subtotal_cents))throw new Error('order_quote_mismatch');
  const payload={service,from:senderData,to:recipientData,products,volumes:volumesFromQuote(quote.packages,carrier),
    options:{invoice:{key},insurance_value:subtotal/100,platform:'Pupi',tags:[{tag:String(order.order_number),url:null}]}};
  if(invoiceXml)payload.options.invoice.xml_content=invoiceXml;
  if(agency!==undefined && agency!==null && agency!=='') {
    const id=Number(agency);if(!Number.isSafeInteger(id)||id<=0||!/^\d+$/.test(String(agency)))throw new Error('invalid_agency');
    payload.agency=id;
  }
  return payload;
}
