import {el,link,heading,money} from '../../ui/dom.js';
import {pagination} from '../account/views.js';
import {makeForm} from '../../ui/forms.js';
import {AppError} from '../../utils/errors.js';
import {createElement,Package,MapPin,CreditCard,ArrowLeft,ShieldCheck} from 'lucide';
const icon=definition=>createElement(definition,{'aria-hidden':'true','stroke-width':1.8});

export function checkoutReview({cart,addresses,page,go,busy,announce,checkout}) {
  const items=cart.items.map(item=>{
    const p=item.products;
    if (!p || !p.active || p.status!=='published' || !p.categories?.active) return el('li',{className:'checkout-item'},[icon(Package),el('p',{},'Produto indisponível')]);
    return el('li',{className:'checkout-item'},[el('span',{className:'checkout-item-icon'},icon(Package)),el('div',{},[el('strong',{},p.name),el('span',{className:'muted'},`${item.quantity} × ${money(p.sale_price_cents ?? p.price_cents)}`)]),el('strong',{},money(item.quantity*(p.sale_price_cents ?? p.price_cents)))]);
  });
  const results=el('div',{className:'checkout-delivery-results','aria-live':'polite'});
  const pending=checkout.pending();
  const confirmForm=(options,defaultId='',quotes=[])=>{
    const form=makeForm({name:'Escolher entrega',submitLabel:pending?'Verificar confirmação':'Confirmar pedido',onBusy:busy,
      fields:[{name:'quote',label:'Entrega',required:true,value:defaultId,options}],onSubmit:async values=>{
        if(!values.quote || !options.some(([id])=>id===values.quote))throw new AppError('INVALID_DATA','Escolha uma entrega.');
        const id=await checkout.confirm(values.quote);await go(`/pedidos/${id}`,{force:true});announce('Pedido confirmado. O pagamento está pendente.','success');
      }});
    const summary=el('p',{className:'checkout-quote-total','aria-live':'polite'});
    const updateSummary=()=>{
      const chosen=quotes.find(q=>q.id===form.elements.namedItem('quote').value);
      summary.textContent=chosen ? `Frete: ${money(chosen.price_cents)} · Total: ${money(chosen.subtotal_cents+chosen.price_cents)}` : '';
    };
    form.elements.namedItem('quote').addEventListener('change',updateSummary);
    form.querySelector('fieldset').insertBefore(summary,form.querySelector('button[type="submit"]'));
    updateSummary();return form;
  };
  let addressContent;
  if(pending) {
    addressContent=el('div',{},[el('p',{},'Há uma confirmação pendente. Verifique seu resultado antes de iniciar outra.'),
      confirmForm([[pending.quoteId,'Confirmação pendente']],pending.quoteId),link('Consultar pedidos','#/pedidos'),link('Recarregar revisão','#/checkout')]);
  } else if(addresses.items.length) {
    const quoteForm=makeForm({name:'Calcular entrega',submitLabel:'Consultar entregas',onBusy:busy,fields:[
      {name:'address',label:'Endereço de entrega',required:true,options:[['','Selecione um endereço'],...addresses.items.map(a=>[a.id,`${a.label} · ${a.street}, ${a.number} · ${a.city}/${a.state}`])]},
    ],onSubmit:async values=>{
      if(!values.address)throw new AppError('INVALID_DATA','Selecione um endereço.');
      results.replaceChildren();
      const quotes=await checkout.quotes(values.address);
      if(!quotes.length){results.append(el('p',{},'Nenhuma entrega disponível para este endereço.'));return;}
      const options=quotes.map(q=>[q.id,`${q.carrier} · ${q.service_name} · Frete ${money(q.price_cents)} · Total ${money(q.subtotal_cents+q.price_cents)}${q.days!==null?` · ${q.days} dia(s)`:''}`]);
      results.append(el('p',{},`Subtotal confirmado na cotação: ${money(quotes[0].subtotal_cents)}`),el('h3',{},'Escolha a entrega'),confirmForm([['','Selecione uma entrega'],...options],'',quotes));
    }});
    quoteForm.elements.namedItem('address').addEventListener('change',()=>results.replaceChildren());
    addressContent=el('div',{},[quoteForm,pagination(page,addresses.hasMore,'/checkout',go)]);
  } else addressContent=el('div',{className:'checkout-empty-address'},[el('p',{},'Onde seu pet vai receber o pedido? Adicione um endereço para consultar as opções de entrega.'),link('Adicionar endereço','#/enderecos/novo',{className:'button button-primary'})]);
  return el('section',{className:'checkout-page'},[
    link([icon(ArrowLeft),'Voltar ao carrinho'],'#/carrinho',{className:'order-back-link'}),
    heading('Revisar pedido'),
    el('ol',{className:'checkout-steps','aria-label':'Etapas da compra'},[
      el('li',{},[icon(Package),'Carrinho']),el('li',{'aria-current':'step'},[icon(MapPin),'Entrega']),el('li',{},[icon(CreditCard),'Pagamento']),
    ]),
    el('div',{className:'checkout-layout'},[
      el('section',{className:'checkout-delivery'},[
        el('div',{className:'checkout-card-heading'},[icon(MapPin),el('h2',{},'Entrega')]),
        items.length||pending?addressContent:el('p',{},'Adicione produtos ao carrinho antes de escolher a entrega.'),
        results,
        link('Gerenciar endereços','#/enderecos',{className:'checkout-address-link'}),
      ]),
      el('aside',{className:'checkout-summary'},[
        el('div',{className:'checkout-card-heading'},[icon(Package),el('h2',{},'Produtos')]),
        items.length?el('ul',{className:'checkout-items'},items):el('p',{},['Seu carrinho está vazio. ',link('Explorar a loja','#/loja')]),
        cart.hasMore?el('p',{className:'muted'},['Mostrando os primeiros 20 itens. ',link('Ver todo o carrinho','#/carrinho')]):null,
        el('dl',{className:'checkout-subtotal'},[el('dt',{},cart.subtotalIncomplete?'Subtotal dos itens disponíveis':'Subtotal'),el('dd',{},money(cart.subtotalCents))]),
        cart.subtotalIncomplete?el('p',{className:'muted'},'Itens indisponíveis ou não carregados não estão incluídos.'):null,
        el('p',{className:'checkout-shipping-note'},'Frete a calcular.'),
        el('div',{className:'checkout-next-step'},[icon(ShieldCheck),el('p',{},'Pagamento após confirmar o pedido.')]),
      ]),
    ]),
  ]);
}
