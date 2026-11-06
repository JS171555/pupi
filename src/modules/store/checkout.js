import {el,link,heading,money} from '../../ui/dom.js';
import {pagination} from '../account/views.js';

export function checkoutReview({cart,addresses,page,go}) {
  const select=el('select',{id:'delivery-address'},[el('option',{value:''},'Selecione um endereço'),
    ...addresses.items.map(address=>el('option',{value:address.id},`${address.label} · ${address.street}, ${address.number} · ${address.city}/${address.state}`))]);
  const addressContent=addresses.items.length ? el('div',{className:'field'},[el('label',{for:'delivery-address'},'Endereço de entrega'),select,
    pagination(page,addresses.hasMore,'/checkout',go)]) : el('p',{},'Cadastre um endereço para continuar.');
  const items=cart.items.map(item=>{
    const p=item.products;
    if (!p || !p.active || p.status!=='published' || !p.categories?.active) return el('li',{},'Produto indisponível');
    return el('li',{},`${p.name} · ${item.quantity} × ${money(p.sale_price_cents ?? p.price_cents)}`);
  });
  return el('section',{className:'panel'},[heading('Revisar pedido','Confira seus produtos e o endereço de entrega.'),
    el('h2',{},'Produtos'),items.length?el('ul',{},items):el('p',{},'Seu carrinho está vazio.'),
    cart.hasMore?el('p',{},['Mostrando os primeiros 20 itens. ',link('Ver todo o carrinho','#/carrinho')]):null,
    el('p',{},`${cart.subtotalIncomplete?'Subtotal dos itens disponíveis':'Subtotal'}: ${money(cart.subtotalCents)}`),
    cart.subtotalIncomplete?el('p',{className:'muted'},'Itens indisponíveis ou não carregados não estão incluídos.'):null,
    el('h2',{},'Entrega'),addressContent,link('Gerenciar endereços','#/enderecos',{className:'button button-secondary'}),
    el('p',{role:'status'},'A cotação de entrega ainda não está disponível. Por enquanto não é possível confirmar o pedido.'),
    link('Voltar ao carrinho','#/carrinho',{className:'button button-secondary'})]);
}
