import {el,link,button,heading,money} from '../../ui/dom.js';
import {pagination} from '../account/views.js';
import {confirmAction} from '../../ui/feedback.js';

export function cartView({items,hasMore,page,go,user,busy,announce,repository}) {
  const rows=items.map(item=>{
    const product=item.products;
    const label=product?.name || 'produto indisponível';
    const remove=button('Remover',()=>confirmAction({
      title:'Remover item do carrinho?',description:`${label} será removido do seu carrinho.`,confirmLabel:'Remover item',danger:true,
      onConfirm:async()=>{
        busy(true);
        try { await repository.removeItem(user.id,item.id); await go(`/carrinho?pagina=${page}`,{force:true}); announce('Item removido do carrinho.','success'); }
        finally { busy(false); }
      },
    }),'danger');
    remove.setAttribute('aria-label',`Remover ${label}`);
    if (!product || !product.active || product.status!=='published' || !product.categories?.active) {
      return el('li',{className:'record-card'},[el('h2',{},'Produto indisponível'),el('p',{},`Quantidade: ${item.quantity}`),remove]);
    }
    const price=product.sale_price_cents ?? product.price_cents;
    const stockMessage=product.stock_quantity < item.quantity ? 'Quantidade indisponível no estoque atual.' : 'Disponível no momento.';
    return el('li',{className:'record-card'},[
      el('h2',{},link(product.name,`#/loja/${product.slug}`)),el('p',{},`Quantidade: ${item.quantity}`),
      el('p',{},`Preço unitário: ${money(price)}`),el('p',{},`Total do item: ${money(price*item.quantity)}`),
      el('p',{className:'muted'},stockMessage),remove,
    ]);
  });
  return el('section',{className:'panel'},[heading('Carrinho','Preços e estoque podem mudar antes da confirmação do pedido.'),
    rows.length ? el('ul',{className:'record-list'},rows) : el('p',{},'Seu carrinho está vazio.'),
    pagination(page,hasMore,'/carrinho',go),link('Continuar na loja','#/loja',{className:'button button-secondary'})]);
}
