import {adminShell,notFound} from './common.js';
import {productsPage,productForm,categoriesPage,categoryForm} from './catalog.js';
import {productMedia,categoryMedia} from './media.js';
import {bannersPage,bannerForm} from './banners.js';
import {dashboard,stockPage,stockDetail,adminOrders,adminOrder,customersPage,customerDetail,settingsPage,resetPrivateAdminUI} from './operations.js';
export {resetPrivateAdminUI};

export async function renderAdmin(context) {
  const {route,params}=context;const segments=route.split('/').filter(Boolean);
  const options=Object.fromEntries(params);options.page=Number(options.page)||1;
  if(!Number.isInteger(options.page)||options.page<1)options.page=1;
  let view;
  const id=segments[2];
  const validId=!id||id==='novo'||/^[0-9a-f-]{36}$/i.test(id);
  if(!validId)view=notFound('Registro indisponível','/admin');
  else if(route==='/admin')view=await dashboard(context);
  else if(segments[1]==='produtos') {
    if(!id)view=await productsPage(context,options);
    else if(id==='novo')view=await productForm(context,null);
    else if(segments[3]==='imagens')view=await productMedia(context,id,options);
    else view=await productForm(context,id);
  }else if(segments[1]==='categorias') {
    if(!id)view=await categoriesPage(context,options);
    else if(id==='novo')view=await categoryForm(context,null);
    else if(segments[3]==='imagem')view=await categoryMedia(context,id);
    else view=await categoryForm(context,id);
  }else if(segments[1]==='banners')view=id?await bannerForm(context,id==='novo'?null:id):await bannersPage(context,options);
  else if(segments[1]==='estoque')view=id?await stockDetail(context,id,options):await stockPage(context,options);
  else if(segments[1]==='pedidos')view=id?await adminOrder(context,id):await adminOrders(context,options);
  else if(segments[1]==='clientes')view=id?await customerDetail(context,id,options):await customersPage(context,options);
  else if(route==='/admin/configuracoes')view=await settingsPage(context);
  else view=notFound('Página administrativa não encontrada','/admin');
  const title=view.querySelector('h1')?.textContent||'Administração';if(!context.signal.aborted)document.title=`${title} | Administração Pupi`;
  return adminShell(view,route);
}
