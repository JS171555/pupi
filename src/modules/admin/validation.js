import { ValidationError } from '../auth/validation.js';

const clean = value => typeof value === 'string' ? value.trim() : '';
const end = (errors, data) => { if (Object.keys(errors).length) throw new ValidationError(errors); return data; };
export const PRODUCT_STATES = [['draft','Rascunho'],['published','Publicado'],['archived','Arquivado']];
export const ORDER_STATES = { confirmed:'Pedido confirmado', preparing:'Preparando pedido', shipped:'Enviado', in_transit:'Em trânsito', out_for_delivery:'Saiu para entrega', delivered:'Entregue', delivery_failed:'Falha na entrega', cancelled:'Cancelado' };
const transitions = { confirmed:['preparing','cancelled'], preparing:['shipped','cancelled'], shipped:['in_transit','delivery_failed'], in_transit:['out_for_delivery','delivered','delivery_failed'], out_for_delivery:['delivered','delivery_failed'], delivery_failed:['in_transit','out_for_delivery','cancelled'], delivered:[], cancelled:[] };
export const orderOptions = order => [order.status,...(transitions[order.status] || [])].filter(state => !(state==='cancelled' && order.payment_status==='paid')).map(state => [state,ORDER_STATES[state]]);
export const slugify = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function parseMoney(value) {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  const normalized = clean(value).replace(',','.');
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(normalized)) return null;
  const [whole,decimal=''] = normalized.split('.');
  const result = Number(whole)*100 + Number(decimal.padEnd(2,'0'));
  return result <= 2147483647 ? result : null;
}
export const editMoney = cents => cents === null || cents === undefined ? '' : (cents/100).toFixed(2).replace('.',',');
function integer(value, optional=false) {
  if (optional && (value===null || value===undefined || value==='')) return null;
  const text = String(value ?? '');
  return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) && Number(text)<=2147483647 ? Number(text) : undefined;
}
function required(errors, values, key, max) {
  const value = clean(values[key]);
  if (!value || value.length>max) errors[key]=`Preencha este campo com até ${max} caracteres.`;
  return value;
}
export function validateProduct(values) {
  const errors = {}; const result = {};
  for (const [name,max] of [['name',200],['sku',80],['slug',200]]) result[name]=required(errors,values,name,max);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug)) errors.slug='Use letras minúsculas, números e hífens.';
  result.category_id=clean(values.category_id);
  if (!/^[0-9a-f-]{36}$/i.test(result.category_id)) errors.category_id='Escolha uma categoria.';
  result.price_cents=parseMoney(values.price);
  result.sale_price_cents=clean(values.sale_price) ? parseMoney(values.sale_price) : null;
  if (!(result.price_cents>0)) errors.price='Informe um preço maior que zero. Ex.: 49,90.';
  if (clean(values.sale_price) && (!(result.sale_price_cents>0) || result.sale_price_cents>=result.price_cents)) errors.sale_price='A promoção deve ser maior que zero e menor que o preço de venda.';
  for (const [key,max] of [['title',200],['short_description',500],['description',30000]]) {
    result[key]=clean(values[key]); if (result[key].length>max) errors[key]=`Use até ${max} caracteres.`;
  }
  for (const key of ['minimum_stock','weight_grams','width_mm','height_mm','length_mm']) {
    const optional=key!=='minimum_stock'; result[key]=integer(values[key],optional);
    if (result[key]===undefined || (optional && result[key]!==null && result[key]<1)) errors[key]='Informe um número inteiro válido.';
  }
  result.featured=values.featured===true; result.active=values.active===true; result.status=clean(values.status);
  if (!PRODUCT_STATES.some(([key])=>key===result.status)) errors.status='Escolha o status.';
  return end(errors,result);
}
export function validateCategory(values) {
  const errors={}; const result={ name:required(errors,values,'name',120),slug:required(errors,values,'slug',160),description:clean(values.description),sort_order:integer(values.sort_order),active:values.active===true };
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug)) errors.slug='Use letras minúsculas, números e hífens.';
  if (result.description.length>3000) errors.description='Use até 3000 caracteres.';
  if (result.sort_order===undefined) errors.sort_order='Informe uma posição inteira a partir de zero.';
  return end(errors,result);
}
export function validateStock(values) {
  const errors={}; const amount=integer(values.quantity);
  if (amount===undefined || (values.kind!=='set' && amount===0) || !['in','out','set'].includes(values.kind)) errors.quantity='Informe uma quantidade inteira válida.';
  const reason=required(errors,values,'reason',300);
  const current=Number(values.current);
  const delta=values.kind==='set' ? amount-current : values.kind==='out' ? -amount : amount;
  if (delta===0) errors.quantity='A quantidade não altera o estoque.';
  if (Number.isFinite(delta) && current+delta<0) errors.quantity='A saída não pode ultrapassar o saldo disponível.';
  return end(errors,{delta,reason,expected_balance:current});
}
export function validateSettings(values) {
  const errors={}; const result={ store_name:required(errors,values,'store_name',160), contact_email:clean(values.contact_email).toLowerCase(), origin_postal_code:clean(values.origin_postal_code).replace(/[-\s]/g,''), low_stock_threshold:integer(values.low_stock_threshold) };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result.contact_email)) errors.contact_email='Informe um e-mail válido.';
  if (!/^\d{8}$/.test(result.origin_postal_code)) errors.origin_postal_code='Informe um CEP com 8 dígitos.';
  if (result.low_stock_threshold===undefined) errors.low_stock_threshold='Informe um número inteiro a partir de zero.';
  return end(errors,result);
}
