import {el,link,button,heading,empty} from '../../ui/dom.js';
import {toAppError} from '../../utils/errors.js';
import {buttonLoading} from '../../ui/loading.js';
import {confirmAction} from '../../ui/feedback.js';
import {adminURL,filterBar,dataTable,listPager,adminLink} from '../../ui/admin-list.js';
export {el,link,button,heading,empty,adminURL,filterBar,dataTable,listPager,adminLink};

export const sections=[['Resumo','/admin'],['Produtos','/admin/produtos'],['Categorias','/admin/categorias'],['Estoque','/admin/estoque'],['Pedidos','/admin/pedidos'],['Clientes','/admin/clientes'],['Configurações','/admin/configuracoes']];
export function adminShell(view,route) {
  return el('div',{className:'admin-shell'},[
    el('nav',{className:'admin-nav','aria-label':'Seções da administração'},sections.map(([label,path])=>link(label,`#${path}`,{'aria-current':(path==='/admin'?route===path:route.startsWith(path))?'page':undefined}))),view,
  ]);
}
export function panel(title,intro,content,actions=[]) {
  return el('section',{className:'panel'},[el('div',{className:'toolbar'},[heading(title,intro),el('div',{className:'actions'},actions)]),...content]);
}
export function actionButton(label,task,context,options={}) {
  const execute=async()=>{
    if(context.isBusy()) return;
    control.disabled=true;context.busy(true);const stopLoading=buttonLoading(control);
    try {
      await task();
      if(options.reload!==false) await context.go(options.destination||context.current,{force:true});
      if(options.success) context.announce(options.success,'success');
    }finally{stopLoading();control.disabled=false;context.busy(false);}
  };
  const control=button(label,async()=>{
    if(context.isBusy() || !await context.canLeave()) return;
    if(options.confirm) await confirmAction({...options.confirm,onConfirm:execute});
    else try{await execute();}catch(error){context.announce(toAppError(error).message,'error');}
  },options.tone||'secondary');
  if(options.name) control.setAttribute('aria-label',`${label} ${options.name}`);
  return control;
}
export function notFound(title,path) {return panel(title,'O registro não está disponível ou já foi removido.',[],[adminLink('Voltar',path)]);}
export function listContent({title,caption,data,columns,filters,context,path,options={},actions=[]}) {
  const page=Number(options.page)||1;
  return panel(title,`${data.total} registros encontrados.`,[
    filters,
    data.items.length?dataTable(columns,data.items,caption||title):empty('Nenhum registro encontrado','Confira os filtros ou cadastre um novo registro.'),
    listPager({page,total:data.total,hasMore:data.hasMore,path,options,go:context.go}),
  ].filter(Boolean),actions);
}
