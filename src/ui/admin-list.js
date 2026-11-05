import { el,link,button } from './dom.js';

export function adminURL(path,options={}) {
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(options)) if(value!==undefined && value!==null && value!=='') params.set(key,String(value));
  return `${path}${params.size ? '?'+params : ''}`;
}
export function filterBar({search='',fields=[],onCommit,label='Buscar',placeholder='Nome ou identificador'}) {
  const form=el('form',{novalidate:true,className:'admin-filters','aria-label':'Filtros da lista'});
  const id='admin-search';
  const input=el('input',{id,name:'search',type:'search',value:search,maxlength:120,placeholder,autocomplete:'off'});
  const clear=button('Limpar busca',async()=>{input.value='';clear.disabled=true;await submit();document.querySelector('#'+id)?.focus();},'ghost');
  clear.disabled=!search; clear.setAttribute('aria-label','Limpar busca');
  input.addEventListener('input',()=>{clear.disabled=!input.value;});
  let composing=false; input.addEventListener('compositionstart',()=>{composing=true;});input.addEventListener('compositionend',()=>{composing=false;});
  form.append(el('div',{className:'filter-search'},[el('label',{for:id},label),el('div',{className:'filter-search-row'},[input,clear])]));
  for(const field of fields) {
    const selectId=`admin-filter-${field.name}`;
    form.append(el('div',{},[el('label',{for:selectId},field.label),el('select',{id:selectId,name:field.name},field.options.map(([key,label])=>el('option',{value:key,selected:String(key)===String(field.value??'')},label)))]));
  }
  form.append(el('button',{type:'submit',className:'button button-secondary'},'Aplicar filtros'));
  async function submit() {
    if(composing) return;
    const values=Object.fromEntries(new FormData(form)); values.search=input.value.trim();
    await onCommit(values);
    const current=document.querySelector('#'+id);current?.focus();
  }
  form.addEventListener('submit',event=>{event.preventDefault();submit();});
  return form;
}
export function dataTable(columns,items,caption) {
  const table=el('table',{className:'admin-table'},[
    el('caption',{className:'sr-only'},caption),
    el('thead',{},el('tr',{},columns.map(column=>el('th',{scope:'col'},column.label)))),
    el('tbody',{},items.map(item=>el('tr',{},columns.map(column=>el('td',{},column.render(item)))))),
  ]);
  return el('div',{className:'table-region',tabindex:'0','aria-label':caption},[
    el('p',{className:'table-hint'},'Em telas pequenas, deslize a tabela para ver todas as colunas.'),table,
  ]);
}
export function listPager({page,total,hasMore,path,options={},go}) {
  const previous=button('Anterior',()=>go(adminURL(path,{...options,page:page-1})));previous.disabled=page<=1;
  const next=button('Próxima',()=>go(adminURL(path,{...options,page:page+1})));next.disabled=!hasMore;
  return el('nav',{className:'pagination','aria-label':'Paginação da lista'},[previous,el('span',{},`Página ${page} · ${total} registros`),next]);
}
export const adminLink=(label,path)=>link(label,`#${path}`,{className:'button button-secondary'});
