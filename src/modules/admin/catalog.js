import {money} from '../../ui/dom.js';
import {makeForm,cleanForm} from '../../ui/forms.js';
import {el,link,button,adminURL,filterBar,adminLink,actionButton,panel,listContent,notFound} from './common.js';
import {validateProduct,validateCategory,editMoney,slugify,PRODUCT_STATES} from './validation.js';

export async function productsPage(context,options) {
  const data=await context.admin.query('products',options,context.signal);
  const filters=filterBar({search:options.search,fields:[
    {name:'status',label:'Publicação',value:options.status,options:[['','Todos os status'],...PRODUCT_STATES]},
    {name:'active',label:'Ativo',value:options.active,options:[['','Todos'],['true','Ativos'],['false','Inativos']]},
    {name:'sort',label:'Ordenar',value:options.sort,options:[['','Mais recentes'],['name','Nome'],['price','Preço'],['stock','Saldo de estoque']]},
  ],onCommit:values=>context.go(adminURL('/admin/produtos',{...values,page:1}))});
  const stateLabel=p=>PRODUCT_STATES.find(([key])=>key===p.status)?.[1]||p.status;
  const columns=[
    {label:'Produto',render:p=>el('div',{},[link(p.name,`#/admin/produtos/${p.id}`),el('small',{className:'muted'},`SKU ${p.sku}`)])},
    {label:'Categoria',render:p=>p.category_name},
    {label:'Preço',render:p=>money(p.sale_price_cents??p.price_cents)},
    {label:'Estoque',render:p=>String(p.stock_quantity)},
    {label:'Status',render:p=>`${stateLabel(p)} · ${p.active?'Ativo':'Inativo'}`},
    {label:'Ações',render:p=>el('div',{className:'row-actions'},[
      adminLink('Editar',`/admin/produtos/${p.id}`),adminLink('Imagens',`/admin/produtos/${p.id}/imagens`),
      actionButton(p.status==='published'?'Despublicar':'Publicar',()=>context.admin.mutate('product_save',p.id,{status:p.status==='published'?'draft':'published'},p.updated_at),context,{name:p.name,success:'Publicação atualizada.'}),
      actionButton(p.active?'Desativar':'Ativar',()=>context.admin.mutate('product_save',p.id,{active:!p.active},p.updated_at),context,{name:p.name,success:'Produto atualizado.'}),
    ])},
  ];
  return listContent({title:'Produtos',data,columns,filters,context,path:'/admin/produtos',options,actions:[adminLink('Novo produto','/admin/produtos/novo')]});
}

function setupSlug(form) {
  const name=form.elements.namedItem('name');const slug=form.elements.namedItem('slug');let manual=Boolean(slug.value);
  slug.addEventListener('input',()=>{manual=Boolean(slug.value);});
  name.addEventListener('input',()=>{if(!manual)slug.value=slugify(name.value);});
}
export async function productForm(context,id) {
  const [product,categories,settings]=await Promise.all([
    id?context.admin.query('product',{id},context.signal):null,
    context.admin.query('categories',{page:1,limit:100},context.signal),context.admin.query('settings',{},context.signal),
  ]);
  if(id&&!product)return notFound('Produto indisponível','/admin/produtos');
  if(!categories.items.length)return panel('Cadastre uma categoria primeiro','Um produto precisa estar associado a uma categoria.',[],[adminLink('Nova categoria','/admin/categorias/novo')]);
  const choices=categories.items.map(c=>[c.id,`${c.name}${c.active?'':' (inativa)'}`]);
  if(product&&!choices.some(([key])=>key===product.category_id))choices.push([product.category_id,product.category_name]);
  const value=name=>product?.[name]??'';
  const minimum=settings.find(s=>s.key==='low_stock_threshold')?.value??0;
  const fields=[
    {name:'name',label:'Nome do produto',value:value('name'),required:true,maxLength:200},
    {name:'title',label:'Título comercial',value:value('title'),maxLength:200},
    {name:'sku',label:'SKU',value:value('sku'),required:true,maxLength:80},
    {name:'slug',label:'Identificador na loja',value:value('slug'),required:true,maxLength:200,hint:'Letras minúsculas, números e hífens.'},
    {name:'category_id',label:'Categoria',value:value('category_id'),required:true,options:[['','Selecione uma categoria'],...choices]},
    {name:'status',label:'Publicação',value:product?.status||'draft',required:true,options:PRODUCT_STATES},
    {name:'price',label:'Preço de venda (R$)',value:editMoney(product?.price_cents),required:true,inputmode:'decimal',hint:'Ex.: 49,90. Sem separador de milhar.'},
    {name:'sale_price',label:'Preço promocional (R$)',value:editMoney(product?.sale_price_cents),inputmode:'decimal',hint:'Opcional. Deve ser menor que o preço de venda.'},
    {name:'short_description',label:'Descrição curta',value:value('short_description'),type:'textarea',rows:3,maxLength:500},
    {name:'description',label:'Descrição completa',value:value('description'),type:'textarea',rows:7,maxLength:30000},
    {name:'minimum_stock',label:'Estoque mínimo',value:product?.minimum_stock??minimum,inputmode:'numeric',required:true},
    {name:'weight_grams',label:'Peso (g)',value:value('weight_grams'),inputmode:'numeric',hint:'Opcional nesta fase.'},
    {name:'width_mm',label:'Largura (mm)',value:value('width_mm'),inputmode:'numeric'},
    {name:'height_mm',label:'Altura (mm)',value:value('height_mm'),inputmode:'numeric'},
    {name:'length_mm',label:'Comprimento (mm)',value:value('length_mm'),inputmode:'numeric'},
    {name:'featured',label:'Destacar na loja',value:product?.featured===true,type:'checkbox'},
    {name:'active',label:'Produto ativo',value:product?.active??true,type:'checkbox'},
  ];
  const form=makeForm({name:product?'Editar produto':'Novo produto',fields,submitLabel:'Salvar produto',persist:true,onBusy:context.busy,
    onSubmit:async(values,node)=>{const saved=await context.admin.mutate('product_save',id,validateProduct(values),product?.updated_at??null);cleanForm(node);await context.go('/admin/produtos',{force:true});context.announce(`Produto “${saved.name}” salvo.`,'success');},
  });
  form.classList.add('admin-product-form');setupSlug(form);
  let categoryPage=1;
  if(categories.hasMore) {
    const more=button('Carregar mais categorias',async()=>{
      more.disabled=true;
      try{const page=await context.admin.query('categories',{page:++categoryPage,limit:100},context.signal);const select=form.elements.namedItem('category_id');for(const c of page.items)if(!Array.from(select.options).some(o=>o.value===c.id))select.append(el('option',{value:c.id},`${c.name}${c.active?'':' (inativa)'}`));more.hidden=!page.hasMore;}
      catch{categoryPage--;context.announce('Não foi possível carregar as categorias. Tente novamente.','error');}finally{more.disabled=false;}
    });form.append(more);
  }
  const actions=[adminLink('Voltar à lista','/admin/produtos')];
  const content=[form];
  if(product){
    content.unshift(el('p',{className:'muted'},`Saldo atual: ${product.stock_quantity}. Entradas e saídas são registradas na seção Estoque.`));
    actions.push(adminLink('Imagens',`/admin/produtos/${id}/imagens`),adminLink('Movimentar estoque',`/admin/estoque/${id}`));
    content.push(el('div',{className:'actions'},[
      actionButton('Arquivar produto',()=>context.admin.mutate('product_save',id,{status:'archived'},product.updated_at),context,{tone:'warning',destination:'/admin/produtos',success:'Produto arquivado.',confirm:{title:`Arquivar “${product.name}”?`,description:'O produto sai do catálogo e mantém todo o histórico. Você poderá reabri-lo como rascunho.',confirmLabel:'Arquivar produto',intent:'warning'}}),
      actionButton('Excluir produto',()=>context.admin.mutate('product_remove',id,{},product.updated_at),context,{tone:'danger',destination:'/admin/produtos',success:'Produto excluído.',confirm:{title:`Excluir “${product.name}”?`,description:'A exclusão é definitiva e só é permitida sem imagens ou histórico de estoque/pedidos. Para preservar um produto, use Arquivar.',confirmLabel:'Excluir produto',danger:true}}),
    ]));
  }
  return panel(product?'Editar produto':'Novo produto','Cadastre as informações do produto. Registre entradas e saídas na seção Estoque.',content,actions);
}

export async function categoriesPage(context,options) {
  const data=await context.admin.query('categories',options,context.signal);
  return listContent({title:'Categorias',data,context,path:'/admin/categorias',options,
    filters:filterBar({search:options.search,placeholder:'Nome da categoria',onCommit:values=>context.go(adminURL('/admin/categorias',{...values,page:1}))}),
    columns:[{label:'Categoria',render:c=>link(c.name,`#/admin/categorias/${c.id}`)},{label:'Posição',render:c=>String(c.sort_order)},
      {label:'Produtos',render:c=>String(c.product_count)},{label:'Status',render:c=>c.active?'Ativa':'Inativa'},
      {label:'Ações',render:c=>el('div',{className:'row-actions'},[adminLink('Editar',`/admin/categorias/${c.id}`),adminLink('Imagem',`/admin/categorias/${c.id}/imagem`),
        actionButton(c.active?'Desativar':'Ativar',()=>context.admin.mutate('category_save',c.id,{name:c.name,slug:c.slug,description:c.description,sort_order:c.sort_order,active:!c.active},c.updated_at),context,{name:c.name,success:'Categoria atualizada.'})])}],
    actions:[adminLink('Nova categoria','/admin/categorias/novo')],
  });
}
export async function categoryForm(context,id) {
  const category=id?await context.admin.query('category',{id},context.signal):null;if(id&&!category)return notFound('Categoria indisponível','/admin/categorias');
  const form=makeForm({name:category?'Editar categoria':'Nova categoria',submitLabel:'Salvar categoria',persist:true,onBusy:context.busy,fields:[
    {name:'name',label:'Nome da categoria',value:category?.name||'',required:true,maxLength:120},
    {name:'slug',label:'Identificador na loja',value:category?.slug||'',required:true,maxLength:160},
    {name:'description',label:'Descrição',value:category?.description||'',type:'textarea',maxLength:3000},
    {name:'sort_order',label:'Posição na lista',value:category?.sort_order??0,required:true,inputmode:'numeric'},
    {name:'active',label:'Categoria ativa',value:category?.active??true,type:'checkbox'},
  ],onSubmit:async(values,node)=>{await context.admin.mutate('category_save',id,validateCategory(values),category?.updated_at??null);cleanForm(node);await context.go('/admin/categorias',{force:true});context.announce('Categoria salva.','success');}});
  setupSlug(form);const actions=[adminLink('Voltar à lista','/admin/categorias')];
  if(category)actions.push(adminLink('Gerenciar imagem',`/admin/categorias/${id}/imagem`));
  return panel(category?'Editar categoria':'Nova categoria','Ao desativar, os produtos desta categoria deixam de aparecer no catálogo público.',[
    form,category?actionButton('Excluir categoria',()=>context.admin.mutate('category_remove',id,{},category.updated_at),context,{tone:'danger',destination:'/admin/categorias',success:'Categoria excluída.',confirm:{title:`Excluir “${category.name}”?`,description:'A exclusão é definitiva e exige uma categoria sem produtos e sem imagem vinculada.',confirmLabel:'Excluir categoria',danger:true}}):null,
  ],actions);
}
