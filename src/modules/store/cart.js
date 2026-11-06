import {el,link,button,heading,money} from '../../ui/dom.js';
import {pagination} from '../account/views.js';
import {confirmAction} from '../../ui/feedback.js';
import {makeForm,cleanForm} from '../../ui/forms.js';
import {AppError} from '../../utils/errors.js';

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
    const form=makeForm({name:`Quantidade de ${product.name}`,submitLabel:'Atualizar quantidade',onBusy:busy,persist:true,
      fields:[{name:'quantity',label:'Quantidade',value:String(item.quantity),required:true,inputmode:'numeric'}],
      onSubmit:async(values,node)=>{
        const quantity=Number(values.quantity);
        if (!/^[0-9]+$/.test(values.quantity) || !Number.isSafeInteger(quantity) || quantity<1 || quantity>999) throw new AppError('INVALID_DATA','Informe uma quantidade inteira entre 1 e 999.');
        await repository.updateItemQuantity(user.id,item.id,item.product_id,quantity,item.updated_at);
        cleanForm(node);await go(`/carrinho?pagina=${page}`,{force:true});announce('Quantidade atualizada.','success');
      },
    });
    const price=product.sale_price_cents ?? product.price_cents;
    const stockMessage=product.stock_quantity < item.quantity ? 'Quantidade indisponível no estoque atual.' : 'Disponível no momento.';
    return el('li',{className:'record-card'},[
      el('h2',{},link(product.name,`#/loja/${product.slug}`)),el('p',{},`Quantidade: ${item.quantity}`),
      el('p',{},`Preço unitário: ${money(price)}`),el('p',{},`Total do item: ${money(price*item.quantity)}`),
      el('p',{className:'muted'},stockMessage),form,remove,
    ]);
  });
  return el('section',{className:'panel'},[heading('Carrinho','Preços e estoque podem mudar antes da confirmação do pedido.'),
    rows.length ? el('ul',{className:'record-list'},rows) : el('p',{},'Seu carrinho está vazio.'),
    pagination(page,hasMore,'/carrinho',go),link('Continuar na loja','#/loja',{className:'button button-secondary'})]);
}
