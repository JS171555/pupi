import {el, link, heading, money} from '../../ui/dom.js';

export async function storeCatalog(repository, params, go) {
  const page = Math.max(1, Number.parseInt(params.get('pagina'), 10) || 1);
  const category = params.get('categoria') || '';
  const search = (params.get('busca') || '').slice(0,120);
  const sort = params.get('ordem') === 'name' ? 'name' : 'recent';
  const [categories, products] = await Promise.all([
    repository.listCategories(), repository.listProducts({page, pageSize: 20, categoryId: category || undefined, search, sort}),
  ]);
  const select = el('select', {id:'store-category'}, [el('option',{value:''},'Todas as categorias'),
    ...categories.map(item=>el('option',{value:item.id,selected:item.id===category},item.name))]);
  const searchInput=el('input',{id:'store-search',type:'search',value:search,maxlength:120});
  const order=el('select',{id:'store-order'},[el('option',{value:'recent',selected:sort==='recent'},'Mais recentes'),el('option',{value:'name',selected:sort==='name'},'Nome')]);
  const form=el('form',{className:'admin-filters',novalidate:true},[
    el('div',{},[el('label',{for:'store-search'},'Buscar produto'),searchInput]),
    el('div',{},[el('label',{for:'store-category'},'Categoria'),select]),
    el('div',{},[el('label',{for:'store-order'},'Ordenar'),order]),
    el('button',{type:'submit',className:'button button-secondary'},'Filtrar'),
  ]);
  form.addEventListener('submit',event=>{event.preventDefault();const query=new URLSearchParams();if(select.value)query.set('categoria',select.value);if(searchInput.value.trim())query.set('busca',searchInput.value.trim());if(order.value!=='recent')query.set('ordem',order.value);go('/loja'+(query.size?'?'+query:''));});
  const cards=products.map(product=>el('li',{className:'record-card'},[
    el('h2',{},link(product.name,`#/loja/${product.slug}`)),
    el('p',{},product.short_description),
    product.sale_price_cents!==null ? el('p',{},[el('del',{},money(product.price_cents)), ' ', el('strong',{},money(product.sale_price_cents))]) : el('p',{},money(product.price_cents)),
    el('p',{className:'muted'},product.stock_quantity>0?'Disponível':'Indisponível'),
  ]));
  const pageLink=(number,label)=>{const query=new URLSearchParams({pagina:String(number)});if(category)query.set('categoria',category);if(search)query.set('busca',search);if(sort!=='recent')query.set('ordem',sort);return link(label,`#/loja?${query}`,{className:'button button-secondary'});};
  return el('section',{className:'panel'},[heading('Loja','Produtos para cuidar de quem está sempre ao seu lado.'),form,
    cards.length?el('ul',{className:'record-list'},cards):el('p',{},'Nenhum produto encontrado nesta página.'),
    el('nav',{className:'pagination','aria-label':'Páginas do catálogo'},[page>1?pageLink(page-1,'Anterior'):null,el('span',{},`Página ${page}`),products.length===20?pageLink(page+1,'Próxima'):null])]);
}

export async function storeProduct(repository, slug) {
  const product=await repository.getProductBySlug(slug);
  if(!product)return el('section',{className:'panel'},[heading('Produto indisponível','Confira a loja para ver os produtos disponíveis.'),link('Voltar à loja','#/loja')]);
  return el('section',{className:'panel'},[heading(product.name,product.title),el('p',{},product.description||product.short_description),
    product.sale_price_cents!==null?el('p',{},[el('del',{},money(product.price_cents)),' ',el('strong',{},money(product.sale_price_cents))]):el('p',{},money(product.price_cents)),
    el('p',{},product.stock_quantity>0?'Disponível':'Indisponível'),link('Voltar à loja','#/loja',{className:'button button-secondary'})]);
}
