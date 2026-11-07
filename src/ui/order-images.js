import {createElement,Package} from 'lucide';
import {el} from './dom.js';

const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function orderProductImage(item={}) {
  return el('span',{className:'order-product-photo','data-order-product-id':uuid(item.product_id)?item.product_id:undefined,
    role:'img','aria-label':`Imagem indisponível: ${item.product_name||'produto do pedido'}`},
  createElement(Package,{'aria-hidden':'true','stroke-width':1.8}));
}

// Photos are optional: hydrate reserved thumbnails without delaying order/payment data.
export async function hydrateOrderImages(root,{catalogRepository,media,signal}={}) {
  const targets=[...root.querySelectorAll('[data-order-product-id]')];
  const ids=[...new Set(targets.map(node=>node.dataset.orderProductId))];
  if(!ids.length||!catalogRepository||!media||signal?.aborted)return;
  const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(5000)]):AbortSignal.timeout(5000);
  try {
    const records=await catalogRepository.listPrimaryImages(ids.slice(0,100),deadline);
    await Promise.all(records.map(async record=>{
      try {
        const {signedUrl}=await media.signedUrl('product-images',record.storage_path);
        if(deadline.aborted||!root.isConnected)return;
        for(const target of targets.filter(node=>node.dataset.orderProductId===record.product_id)){
          const fallback=target.firstElementChild;const label=target.getAttribute('aria-label');
          const image=el('img',{src:signedUrl,alt:label.replace('Imagem indisponível: ',''),width:64,height:64,loading:'lazy',decoding:'async'});
          image.addEventListener('error',()=>{
            if(signal?.aborted||!target.isConnected)return;
            target.replaceChildren(fallback);target.setAttribute('role','img');target.setAttribute('aria-label',label);
          },{once:true});
          target.removeAttribute('role');target.removeAttribute('aria-label');target.replaceChildren(image);
        }
      }catch{ /* Keep the labeled placeholder if this photo is unavailable. */ }
    }));
  }catch{ /* Order history remains readable when media is unavailable. */ }
}
