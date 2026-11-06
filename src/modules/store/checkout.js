import {el,link,heading,money} from '../../ui/dom.js';
import {pagination} from '../account/views.js';
import {makeForm} from '../../ui/forms.js';
import {AppError} from '../../utils/errors.js';

export function checkoutReview({cart,addresses,page,go,busy,announce,checkout}) {
  const items=cart.items.map(item=>{
    const p=item.products;
    if (!p || !p.active || p.status!=='published' || !p.categories?.active) return el('li',{},'Produto indisponível');
    return el('li',{},`${p.name} · ${item.quantity} × ${money(p.sale_price_cents ?? p.price_cents)}`);
  });
  const results=el('div',{'aria-live':'polite'});
  const pending=checkout.pending();
  const confirmForm=(options,defaultId='',quotes=[])=>{
    const form=makeForm({name:'Escolher entrega',submitLabel:pending?'Verificar confirmação':'Confirmar pedido',onBusy:busy,
      fields:[{name:'quote',label:'Entrega',required:true,value:defaultId,options}],onSubmit:async values=>{
        if(!values.quote || !options.some(([id])=>id===values.quote))throw new AppError('INVALID_DATA','Escolha uma entrega.');
        const id=await checkout.confirm(values.quote);await go(`/pedidos/${id}`,{force:true});announce('Pedido confirmado. O pagamento está pendente.','success');
      }});
    const summary=el('p',{'aria-live':'polite'});
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
  } else addressContent=el('p',{},'Cadastre um endereço para continuar.');
  return el('section',{className:'panel'},[heading('Revisar pedido','Confira seus produtos e o endereço de entrega.'),
    el('h2',{},'Produtos'),items.length?el('ul',{},items):el('p',{},'Seu carrinho está vazio.'),
    cart.hasMore?el('p',{},['Mostrando os primeiros 20 itens. ',link('Ver todo o carrinho','#/carrinho')]):null,
    el('p',{},`${cart.subtotalIncomplete?'Subtotal dos itens disponíveis':'Subtotal'}: ${money(cart.subtotalCents)}`),
    cart.subtotalIncomplete?el('p',{className:'muted'},'Itens indisponíveis ou não carregados não estão incluídos.'):null,
    el('p',{className:'muted'},'Os preços e a disponibilidade serão conferidos na confirmação. O pagamento ficará pendente.'),
    el('h2',{},'Entrega'),addressContent,results,link('Gerenciar endereços','#/enderecos',{className:'button button-secondary'}),
    link('Voltar ao carrinho','#/carrinho',{className:'button button-secondary'})]);
}
