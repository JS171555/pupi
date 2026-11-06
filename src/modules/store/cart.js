import {el,link,button,money} from '../../ui/dom.js';
import {pagination} from '../account/views.js';
import {confirmAction} from '../../ui/feedback.js';
import {makeForm,cleanForm} from '../../ui/forms.js';
import {AppError} from '../../utils/errors.js';
import {createElement, PawPrint, Minus, Plus, Trash2, ArrowRight, ShoppingBag, ShieldCheck, Truck} from 'lucide';

const icon=definition=>createElement(definition,{'aria-hidden':'true','stroke-width':1.8});

async function cartImages(repository,media,items) {
  const productIds=[...new Set(items.map(item=>item.products?.id).filter(Boolean))];
  if (!productIds.length || !repository || !media) return new Map();
  try {
    const records=await repository.listPrimaryImages(productIds);
    const entries=await Promise.all(records.map(async image=>{
      try {return [image.product_id,{...image,url:(await media.signedUrl('product-images',image.storage_path)).signedUrl}];}
      catch {return [image.product_id,null];}
    }));
    return new Map(entries);
  } catch {return new Map();}
}

function unavailableItem(item,remove) {
  return el('li',{className:'cart-item cart-item-unavailable'},[
    el('div',{className:'cart-item-image cart-item-image-empty','aria-hidden':'true'},icon(PawPrint)),
    el('div',{className:'cart-item-main'},[
      el('span',{className:'cart-item-status'},'Indisponível'),
      el('h2',{},'Produto indisponível'),
      el('p',{className:'cart-item-note'},'Este produto não está disponível para compra no momento.'),
      el('p',{className:'cart-item-quantity-static'},`Quantidade: ${item.quantity}`),
    ]),
    el('div',{className:'cart-item-actions'},remove),
  ]);
}

export async function cartView({items,hasMore,page,go,user,busy,announce,repository,subtotalCents,subtotalIncomplete,catalogRepository,media}) {
  const images=await cartImages(catalogRepository,media,items);
  const itemCount=items.reduce((sum,item)=>sum+item.quantity,0);
  const rows=items.map(item=>{
    const product=item.products;
    const label=product?.name || 'produto indisponível';
    const remove=button([icon(Trash2),'Remover'],()=>confirmAction({
      title:'Remover item do carrinho?',description:`${label} será removido do seu carrinho.`,confirmLabel:'Remover item',danger:true,
      onConfirm:async()=>{
        busy(true);
        try {await repository.removeItem(user.id,item.id);await go(`/carrinho?pagina=${page}`,{force:true});announce('Item removido do carrinho.','success');}
        finally {busy(false);}
      },
    }),'ghost');
    remove.classList.add('cart-remove');
    remove.setAttribute('aria-label',`Remover ${label}`);
    if (!product || !product.active || product.status!=='published' || !product.categories?.active) return unavailableItem(item,remove);

    const price=product.sale_price_cents ?? product.price_cents;
    const stock=Number.isSafeInteger(product.stock_quantity)?product.stock_quantity:0;
    const stockIsLow=stock<item.quantity;
    const quantityForm=makeForm({
      name:`Quantidade de ${product.name}`,submitLabel:'Atualizar quantidade',onBusy:busy,persist:true,
      fields:[{name:'quantity',label:'Quantidade',value:String(item.quantity),required:true,inputmode:'numeric',hint:'Atualize manualmente ou use + e −.'}],
      onSubmit:async(values,node)=>{
        const quantity=Number(values.quantity);
        if (!/^[0-9]+$/.test(values.quantity) || !Number.isSafeInteger(quantity) || quantity<1 || quantity>999) throw new AppError('INVALID_DATA','Informe uma quantidade inteira entre 1 e 999.');
        await repository.updateItemQuantity(user.id,item.id,item.product_id,quantity,item.updated_at);
        cleanForm(node);await go(`/carrinho?pagina=${page}`,{force:true});announce('Quantidade atualizada.','success');
      },
    });
    quantityForm.classList.add('cart-quantity-form');
    const quantityInput=quantityForm.querySelector('input[name="quantity"]');
    quantityInput.setAttribute('aria-label',`Quantidade de ${product.name}`);
    quantityInput.setAttribute('min','1');
    quantityInput.setAttribute('max','999');
    const control=quantityForm.querySelector('.control-row');
    const adjust=(delta)=>{
      const next=Number(quantityInput.value)+delta;
      if(!Number.isSafeInteger(next)||next<1||next>999)return;
      quantityInput.value=String(next);
      quantityInput.dispatchEvent(new Event('input',{bubbles:true}));
      quantityForm.requestSubmit();
    };
    const decrease=el('button',{type:'button',className:'cart-stepper-button',disabled:item.quantity<=1,'aria-label':`Diminuir quantidade de ${product.name}`,on:{click:()=>adjust(-1)}},icon(Minus));
    const increase=el('button',{type:'button',className:'cart-stepper-button',disabled:item.quantity>=999||stock<=item.quantity,'aria-label':`Aumentar quantidade de ${product.name}`,on:{click:()=>adjust(1)}},icon(Plus));
    control.prepend(decrease);
    control.append(increase);
    const image=images.get(product.id);
    const productImage=image?el('img',{src:image.url,alt:image.alt_text||product.name,width:112,height:112,loading:'lazy'}):icon(PawPrint);
    const imageNode=el('div',{className:`cart-item-image${image?'':' cart-item-image-empty'}`},productImage);
    if(image)productImage.addEventListener('error',()=>{imageNode.replaceChildren(icon(PawPrint));imageNode.classList.add('cart-item-image-empty');},{once:true});
    const removeNode=el('div',{className:'cart-item-remove'},remove);
    return el('li',{className:'cart-item'},[
      imageNode,
      el('div',{className:'cart-item-main'},[
        el('div',{className:'cart-item-title-row'},[el('div',{},[el('span',{className:'cart-item-status cart-item-status-available'},'Disponível'),el('h2',{},link(product.name,`#/loja/${product.slug}`))]),removeNode]),
        el('p',{className:'cart-item-unit'},['Preço unitário ',el('strong',{},money(price))]),
        stockIsLow?el('p',{className:'cart-item-stock cart-item-stock-warning','role':'status'},`Estoque atual: ${stock} ${stock===1?'unidade':'unidades'}. Reduza a quantidade para continuar.`):el('p',{className:'cart-item-stock'},[icon(ShieldCheck),' Em estoque']),
        el('div',{className:'cart-item-bottom'},[
          el('div',{className:'cart-item-quantity'},[el('span',{className:'cart-item-label'},'Quantidade'),quantityForm]),
          el('div',{className:'cart-item-total'},[el('span',{className:'cart-item-label'},'Total do item'),el('strong',{},money(price*item.quantity))]),
        ]),
      ]),
    ]);
  });

  const headingNode=el('header',{className:'cart-heading'},[
    el('div',{},[el('p',{className:'cart-eyebrow'},'SUA SELEÇÃO'),el('h1',{tabindex:'-1'},'Meu carrinho'),el('p',{className:'muted'},'Revise seus produtos e quantidades antes de continuar.')]),
    items.length?el('span',{className:'cart-count'},[icon(ShoppingBag),`${itemCount} ${itemCount===1?'item':'itens'}`]):null,
  ]);

  if(!items.length) return el('section',{className:'cart-page'},[
    headingNode,
    el('div',{className:'cart-empty'},[el('div',{className:'cart-empty-icon','aria-hidden':'true'},icon(PawPrint)),el('h2',{},'Seu carrinho está vazio'),el('p',{className:'muted'},'Explore a loja e encontre algo especial para quem você ama.'),link([icon(ShoppingBag),'Explorar produtos'],'#/loja',{className:'button button-primary'})]),
  ]);

  const summary=el('aside',{className:'cart-summary','aria-labelledby':'cart-summary-title'},[
    el('p',{className:'cart-summary-eyebrow'},'RESUMO'),
    el('h2',{id:'cart-summary-title'},'Sua compra'),
    el('div',{className:'cart-summary-line'},[el('span',{},subtotalIncomplete?'Subtotal parcial':'Subtotal'),el('strong',{},money(subtotalCents))]),
    subtotalIncomplete?el('p',{className:'cart-summary-note'},'Alguns itens indisponíveis ou não carregados não entram no subtotal.') : null,
    el('div',{className:'cart-summary-divider'}),
    el('div',{className:'cart-summary-line cart-summary-shipping'},[icon(Truck),el('span',{},'Frete calculado na próxima etapa')]),
    link(['Continuar para entrega ',icon(ArrowRight)],'#/checkout',{className:'button button-primary cart-checkout'}),
    link('Continuar comprando','#/loja',{className:'cart-continue-shopping'}),
    el('div',{className:'cart-safe-note'},[icon(ShieldCheck),el('span',{},'Você revisará a entrega e o total antes de confirmar o pedido.')]),
  ]);
  const itemList=el('ul',{className:'cart-items','aria-label':'Produtos no carrinho'},rows);
  const itemRegion=el('section',{className:'cart-items-region','aria-label':'Itens do carrinho'},[
    el('div',{className:'cart-items-header'},[el('h2',{},'Produtos'),el('span',{className:'muted'},`${itemCount} ${itemCount===1?'unidade':'unidades'}`)]),
    itemList,
    pagination(page,hasMore,'/carrinho',go),
  ]);
  return el('section',{className:'cart-page'},[headingNode,el('div',{className:'cart-layout'},[itemRegion,summary])]);
}
