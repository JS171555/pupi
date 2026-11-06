import {el, link, heading, money} from '../../ui/dom.js';
import {makeForm} from '../../ui/forms.js';
import {AppError} from '../../utils/errors.js';
import {bannerCarousel} from '../../ui/banner-carousel.js';
import {createElement, PawPrint, ArrowUpRight, Sparkles, SlidersHorizontal} from 'lucide';

const icon=definition=>createElement(definition,{'aria-hidden':'true','stroke-width':1.7});

async function bannerUrls(media,item) {
  const [mobile,desktop]=await Promise.all([media.signedUrl('banner-images',item.mobile_path),media.signedUrl('banner-images',item.desktop_path)]);
  return {mobileUrl:mobile.signedUrl,desktopUrl:desktop.signedUrl};
}
async function homeBanners(repository,media,signal) {
  const deadline=signal?AbortSignal.any([signal,AbortSignal.timeout(3500)]):AbortSignal.timeout(3500);
  if(deadline.aborted)return [];
  let stop;
  const cancelled=new Promise(resolve=>{
    stop=()=>resolve([]);deadline.addEventListener('abort',stop,{once:true});
  });
  const request=(async()=>{
    const banners=await repository.listBanners(deadline);
    return (await Promise.all(banners.map(async item=>{
      try{return {...item,...await bannerUrls(media,item)};}catch{return null;}
    }))).filter(Boolean);
  })().catch(()=>[]);
  try{return await Promise.race([request,cancelled]);}
  finally{deadline.removeEventListener('abort',stop);}
}

async function primaryImages(repository, media, products) {
  if (!products.length) return new Map();
  try {
    const images = await repository.listPrimaryImages(products.map(product => product.id));
    const entries = await Promise.all(images.map(async image => {
      try { return [image.product_id, { ...image, url: (await media.signedUrl('product-images', image.storage_path)).signedUrl }]; }
      catch { return [image.product_id, null]; }
    }));
    return new Map(entries);
  } catch { return new Map(); }
}
function productImage(image, name) {
  const placeholder = () => el('div', {className:'media-placeholder store-image-empty'}, [icon(PawPrint),el('span',{},'Imagem indisponível')]);
  if (!image) return placeholder();
  const node = el('img', {src:image.url, alt:image.alt_text || name, width:180, height:180, loading:'lazy', className:'media-preview'});
  node.addEventListener('error', () => node.replaceWith(placeholder()), {once:true});
  return node;
}

export async function storeCatalog(repository, params, go, media, {signal}={}) {
  const page = Math.max(1, Number.parseInt(params.get('pagina'), 10) || 1);
  const category = params.get('categoria') || '';
  const search = (params.get('busca') || '').slice(0,120);
  const sort = params.get('ordem') === 'name' ? 'name' : 'recent';
  const filter = ['featured', 'sale'].includes(params.get('filtro')) ? params.get('filtro') : '';
  const filtered=Boolean(category||search||filter||sort!=='recent');
  const bannerRequest=!filtered&&page===1?homeBanners(repository,media,signal):Promise.resolve([]);
  const [categories, products, slides] = await Promise.all([
    repository.listCategories(), repository.listProducts({page, pageSize: 20, categoryId: category || undefined, search, sort, filter}),bannerRequest,
  ]);
  const select = el('select', {id:'store-category'}, [el('option',{value:''},'Todas as categorias'),
    ...categories.map(item=>el('option',{value:item.id,selected:item.id===category},item.name))]);
  const searchInput=el('input',{id:'store-search',type:'search',value:search,maxlength:120,placeholder:'O que seu pet precisa?',autocomplete:'off'});
  const order=el('select',{id:'store-order'},[el('option',{value:'recent',selected:sort==='recent'},'Mais recentes'),el('option',{value:'name',selected:sort==='name'},'Nome')]);
  const selection=el('select',{id:'store-filter'},[el('option',{value:'',selected:filter===''},'Todos os produtos'),el('option',{value:'featured',selected:filter==='featured'},'Destaques'),el('option',{value:'sale',selected:filter==='sale'},'Promoções')]);
  const form=el('form',{className:'admin-filters',novalidate:true},[
    el('div',{},[el('label',{for:'store-search'},'Buscar produto'),searchInput]),
    el('div',{},[el('label',{for:'store-category'},'Categoria'),select]),
    el('div',{},[el('label',{for:'store-filter'},'Exibir'),selection]),
    el('div',{},[el('label',{for:'store-order'},'Ordenar'),order]),
    el('button',{type:'submit',className:'button button-secondary'},'Filtrar'),
  ]);
  if(filtered)form.append(link('Limpar filtros','#/loja',{className:'button button-ghost'}));
  form.addEventListener('submit',event=>{event.preventDefault();const query=new URLSearchParams();if(select.value)query.set('categoria',select.value);if(searchInput.value.trim())query.set('busca',searchInput.value.trim());if(order.value!=='recent')query.set('ordem',order.value);if(selection.value)query.set('filtro',selection.value);go('/loja'+(query.size?'?'+query:''));});
  const images=await primaryImages(repository, media, products);
  const cards=products.map(product=>{
    const price=product.sale_price_cents!==null
      ? el('p',{className:'product-price'},[el('del',{},money(product.price_cents)),el('strong',{},money(product.sale_price_cents))])
      : el('p',{className:'product-price'},money(product.price_cents));
    return el('li',{className:'record-card product-card'},[link([
      el('div',{className:'product-image-wrap'},[productImage(images.get(product.id),product.name),product.featured?el('span',{className:'badge product-featured-badge'},'Destaque'):null]),
      el('div',{className:'product-card-content'},[
        el('h2',{},product.name),
        el('div',{className:'product-card-footer'},[price]),
      ]),
    ],`#/loja/${product.slug}`,{className:'product-card-link','aria-label':`Abrir detalhes de ${product.name}`})]);
  });
  const pageLink=(number,label)=>{const query=new URLSearchParams({pagina:String(number)});if(category)query.set('categoria',category);if(search)query.set('busca',search);if(sort!=='recent')query.set('ordem',sort);if(filter)query.set('filtro',filter);return link(label,`#/loja?${query}`,{className:'button button-secondary'});};
  const categoryLinks=categories.length?el('section',{className:'store-categories'},[
    el('div',{className:'store-section-heading'},[el('h2',{},'Categorias')]),
    el('div',{className:'category-chips'},[link('Todas','#/loja',{className:`category-chip${!category?' is-active':''}`}),...categories.map(item=>link([icon(PawPrint),item.name],`#/loja?categoria=${encodeURIComponent(item.id)}`,{className:`category-chip${category===item.id?' is-active':''}`}))]),
  ]):null;
  return el('section',{className:'store-page'},[heading('Loja'),bannerCarousel(slides,{signal,refresh:item=>bannerUrls(media,item)}),categoryLinks,
    el('div',{id:'catalogo',className:'store-section-heading'},[el('h2',{},'Produtos'),el('p',{className:'muted',role:'status'},`${products.length} ${products.length===1?'produto':'produtos'} nesta página`)]),
    el('details',{className:'store-filters',open:window.matchMedia('(min-width: 48rem)').matches||Boolean(category||search||filter||sort!=='recent')},[el('summary',{},[icon(SlidersHorizontal),'Buscar e filtrar produtos']),form]),
    cards.length?el('ul',{className:'record-list product-grid'},cards):el('div',{className:'store-empty'},[icon(PawPrint),el('h3',{},filtered?'Nenhum produto encontrado':'Nenhum produto disponível'),filtered?el('p',{className:'muted'},'Tente outra busca ou veja todos os produtos.'):null,filtered?link('Ver todos os produtos','#/loja',{className:'button button-primary'}):null]),
    el('nav',{className:'pagination','aria-label':'Páginas do catálogo'},[page>1?pageLink(page-1,'Anterior'):null,el('span',{},`Página ${page}`),products.length===20?pageLink(page+1,'Próxima'):null])]);
}

export async function storeProduct(repository, slug, media, params = new URLSearchParams(), context = {}) {
  const product=await repository.getProductBySlug(slug);
  if(!product)return el('section',{className:'panel'},[heading('Produto indisponível','Confira a loja para ver os produtos disponíveis.'),link('Voltar à loja','#/loja')]);
  let category;
  try {
    const data = await repository.getCategoryById(product.category_id);
    category = data ? el('p',{},['Categoria: ',link(data.name,`#/loja?categoria=${encodeURIComponent(data.id)}`)]) : el('p',{className:'muted'},'Categoria indisponível.');
  } catch { category = el('p',{role:'status'},'Não foi possível carregar a categoria.'); }
  const parsedPage=Number(params.get('fotos') || 1);
  const page=Number.isSafeInteger(parsedPage) && parsedPage>0 && parsedPage<=100000 ? parsedPage : 1;
  let gallery;
  try {
    const records=await repository.listProductImages(product.id,page);
    const images=await Promise.all(records.map(async image=>{
      try {return {...image,url:(await media.signedUrl('product-images',image.storage_path)).signedUrl};}
      catch {return null;}
    }));
    gallery=el('section',{'aria-label':'Fotos do produto'},[
      images.length ? el('ul',{className:'media-grid'},images.map(image=>el('li',{className:'record-card'},productImage(image,product.name)))) : el('p',{},'Nenhuma foto disponível nesta página.'),
      el('nav',{className:'pagination','aria-label':'Páginas das fotos'},[
        page>1 ? link('Fotos anteriores',`#/loja/${slug}?fotos=${page-1}`,{className:'button button-secondary'}) : null,
        records.length===20 ? link('Mais fotos',`#/loja/${slug}?fotos=${page+1}`,{className:'button button-secondary'}) : null,
      ])]);
  } catch {gallery=el('p',{role:'status'},'Não foi possível carregar as fotos. Recarregue a página para tentar novamente.');}
  category.classList.add('store-product-category');
  const cartForm = product.stock_quantity > 0 && context.addToCart ? makeForm({
    name:'Quantidade no carrinho', submitLabel:'Salvar no carrinho', onBusy:context.busy,
    fields:[{name:'quantity',label:'Quantidade',value:'1',required:true,inputmode:'numeric',hint:'Substitui a quantidade anterior deste produto no carrinho.'}],
    onSubmit:async values=>{
      const quantity=Number(values.quantity);
      if (!/^[0-9]+$/.test(values.quantity) || !Number.isSafeInteger(quantity) || quantity<1 || quantity>999) throw new AppError('INVALID_DATA','Informe uma quantidade inteira entre 1 e 999.');
      if (quantity>product.stock_quantity) throw new AppError('INVALID_DATA','A quantidade solicitada supera o estoque disponível.');
      await context.addToCart(product,quantity);
    },
  }) : null;
  if(cartForm)cartForm.classList.add('store-product-cart-form');
  const price=product.sale_price_cents!==null
    ? el('p',{className:'store-product-price'},[el('del',{},money(product.price_cents)),el('strong',{},money(product.sale_price_cents))])
    : el('p',{className:'store-product-price'},money(product.price_cents));
  return el('section',{className:'store-product-page'},[
    link('Voltar à loja','#/loja',{className:'store-product-back'}),
    el('div',{className:'store-product-layout'},[
      el('div',{className:'store-product-gallery'},gallery),
      el('div',{className:'store-product-info'},[
        category,
        heading(product.name,product.title),
        el('p',{className:'store-product-description'},product.description||product.short_description),
        el('div',{className:'store-product-purchase'},[
          price,
          el('p',{className:`store-product-availability${product.stock_quantity>0?'':' is-unavailable'}`},product.stock_quantity>0?'Disponível':'Indisponível'),
          cartForm,
        ]),
      ]),
    ]),
  ]);
}
