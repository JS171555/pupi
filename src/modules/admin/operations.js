import {money,date} from '../../ui/dom.js';
import {makeForm,cleanForm} from '../../ui/forms.js';
import {confirmAction} from '../../ui/feedback.js';
import {orderView} from '../account/views.js';
import {AppError} from '../../utils/errors.js';
import {el,link,adminURL,filterBar,adminLink,panel,listContent,listPager,dataTable,notFound} from './common.js';
import {validateStock,validateSettings,orderOptions,ORDER_STATES} from './validation.js';
import {isValidNfeKey} from './invoice.js';

export async function dashboard(context) {
  const data=await context.admin.query('dashboard',{},context.signal);
  const metrics=[['Produtos cadastrados',data.products],['Categorias',data.categories],['Contas cadastradas',data.customers],
    ['Pedidos',data.orders],['A preparar',data.pending_orders],['Entregues',data.completed_orders],
    ['Estoque baixo',data.low_stock_count],['Pedidos pagos',data.paid_orders],['Total pago em pedidos',money(data.paid_total_cents)]];
  return panel('Resumo da loja','Indicadores calculados a partir dos registros do Pupi.',[
    el('dl',{className:'admin-metrics'},metrics.map(([label,value])=>el('div',{},[el('dt',{},label),el('dd',{},String(value))]))),
    el('p',{className:'muted'},'O total pago inclui frete e exclui pedidos cancelados. Pagamentos pendentes não são contabilizados como vendas pagas.'),
    el('h2',{},'Produtos com estoque baixo'),
    data.low_stock.length?dataTable([{label:'Produto',render:p=>link(p.name,`#/admin/estoque/${p.id}`)},{label:'SKU',render:p=>p.sku},{label:'Saldo / mínimo',render:p=>`${p.stock_quantity} / ${p.minimum_stock}`}],data.low_stock,'Produtos com estoque baixo'):el('p',{},'Nenhum produto ativo com estoque baixo.'),
    el('h2',{},'Pedidos recentes'),data.recent_orders.length?dataTable([
      {label:'Pedido',render:o=>link(`#${o.order_number}`,`#/admin/pedidos/${o.id}`)},{label:'Cliente',render:o=>o.customer_name},
      {label:'Status',render:o=>ORDER_STATES[o.status]},{label:'Total',render:o=>money(o.total_cents)},
    ],data.recent_orders,'Pedidos recentes'):el('p',{},'Nenhum pedido registrado.'),
  ],[adminLink('Novo produto','/admin/produtos/novo')]);
}
export async function stockPage(context,options) {
  const data=await context.admin.query('products',options,context.signal);
  return listContent({title:'Estoque',data,context,path:'/admin/estoque',options,
    filters:filterBar({search:options.search,fields:[{name:'low_stock',label:'Exibir',value:options.low_stock,options:[['','Todos os produtos'],['true','Somente estoque baixo']]}],onCommit:values=>context.go(adminURL('/admin/estoque',{...values,page:1}))}),
    columns:[{label:'Produto',render:p=>link(p.name,`#/admin/estoque/${p.id}`)},{label:'SKU',render:p=>p.sku},
      {label:'Saldo',render:p=>String(p.stock_quantity)},{label:'Mínimo',render:p=>String(p.minimum_stock)},
      {label:'Situação',render:p=>p.stock_quantity<=p.minimum_stock?'Estoque baixo':'Dentro do mínimo'},
      {label:'Ações',render:p=>adminLink('Movimentar e ver histórico',`/admin/estoque/${p.id}`)}],
  });
}
export async function stockDetail(context,id,options={}) {
  const data=await context.admin.query('stock',{id,page:options.page||1},context.signal);
  const product=data.product;if(!product)return notFound('Produto indisponível','/admin/estoque');
  const form=makeForm({name:'Movimentar estoque',submitLabel:'Registrar movimentação',persist:true,onBusy:context.busy,fields:[
    {name:'kind',label:'Tipo de movimentação',value:'in',required:true,options:[['in','Entrada'],['out','Saída'],['set','Definir novo saldo']]},
    {name:'quantity',label:'Quantidade / novo saldo',required:true,inputmode:'numeric',hint:'Em Definir novo saldo, informe o saldo final, inclusive zero.'},
    {name:'reason',label:'Motivo da movimentação',type:'textarea',rows:3,required:true,maxLength:300},
  ],onSubmit:async(values,node)=>{
    const request=validateStock({...values,current:product.stock_quantity});await context.admin.mutate('stock_adjust',id,request);
    cleanForm(node);await context.go(`/admin/estoque/${id}`,{force:true});context.announce('Movimentação registrada.','success');
  }});
  const timestamp=value=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(value));
  return panel('Movimentar estoque',`${product.name} · SKU ${product.sku} · Saldo atual: ${product.stock_quantity} · Mínimo: ${product.minimum_stock}`,[
    form,el('h2',{},'Histórico de movimentações'),data.items.length?dataTable([
      {label:'Data',render:m=>timestamp(m.created_at)},{label:'Variação',render:m=>`${m.delta>0?'+':''}${m.delta}`},
      {label:'Saldo após',render:m=>String(m.balance_after)},{label:'Motivo',render:m=>m.reason},{label:'Operador',render:m=>m.actor_name||'Sistema'},
    ],data.items,'Histórico de movimentações'):el('p',{},'Nenhuma movimentação registrada.'),
    listPager({page:options.page||1,total:data.total,hasMore:data.hasMore,path:`/admin/estoque/${id}`,go:context.go}),
  ],[adminLink('Voltar ao estoque','/admin/estoque'),adminLink('Editar produto',`/admin/produtos/${id}`)]);
}
export async function adminOrders(context,options) {
  const data=await context.admin.query('orders',options,context.signal);
  return listContent({title:'Pedidos da loja',data,context,path:'/admin/pedidos',options,
    filters:filterBar({search:options.search,label:'Buscar pedido',placeholder:'Número ou identificador do pedido',fields:[{name:'status',label:'Status',value:options.status,options:[['','Todos'],...Object.entries(ORDER_STATES)]}],onCommit:values=>context.go(adminURL('/admin/pedidos',{...values,page:1}))}),
    columns:[{label:'Pedido',render:o=>link(`#${o.order_number}`,`#/admin/pedidos/${o.id}`)},{label:'Cliente',render:o=>o.customer_name},
      {label:'Data',render:o=>date(o.created_at)},{label:'Status',render:o=>ORDER_STATES[o.status]},
      {label:'Pagamento',render:o=>({pending:'Pendente',paid:'Pago',failed:'Recusado',refunded:'Estornado',cancelled:'Cancelado'}[o.payment_status]||o.payment_status)},
      {label:'Total',render:o=>money(o.total_cents)},{label:'Ações',render:o=>adminLink('Consultar pedido',`/admin/pedidos/${o.id}`)}],
  });
}
export async function adminOrder(context,id) {
  const order=await context.admin.query('order',{id},context.signal);if(!order)return notFound('Pedido indisponível','/admin/pedidos');
  let invoice=await context.admin.invoice(id,context.signal);
  const paymentReview=await context.admin.paymentReview(id,context.signal);
  const view=orderView(order,{backHref:'#/admin/pedidos'});
  if(paymentReview)view.append(el('p',{role:'alert'},'Pagamento requer conferência no Mercado Pago: há uma contestação, estorno parcial ou mais de um pagamento para este pedido.'));
  const customer=order.customer;
  view.append(el('section',{className:'admin-customer-summary'},[el('h2',{},'Cliente'),el('p',{},customer.full_name),
    el('p',{},customer.email||'E-mail não informado'),el('p',{},customer.phone||'Telefone não informado'),adminLink('Histórico do cliente',`/admin/clientes/${customer.id}`)]));
  const form=makeForm({name:'Atualizar pedido e entrega',submitLabel:'Salvar pedido e entrega',persist:true,onBusy:context.busy,fields:[
    {name:'status',label:'Status do pedido',value:order.status,required:true,options:orderOptions(order)},
    {name:'carrier',label:'Transportadora / responsável pela entrega',value:order.shipment?.carrier||'',maxLength:120,hint:'Obrigatório ao registrar envio. Também pode indicar entrega local.'},
    {name:'service_name',label:'Modalidade de entrega',value:order.shipment?.service_name||'',maxLength:120},
    {name:'tracking_code',label:'Código de rastreamento',value:order.shipment?.tracking_code||'',maxLength:120,hint:'Opcional quando a modalidade não fornece rastreamento.'},
  ],onSubmit:async(values,node)=>{
    if(!orderOptions(order).some(([key])=>key===values.status))throw new AppError('INVALID_DATA','Escolha uma transição disponível para este pedido.');
    const execute=async()=>{await context.admin.mutate('order_update',id,{status:values.status,carrier:values.carrier.trim(),service_name:values.service_name.trim(),tracking_code:values.tracking_code.trim()},order.updated_at);cleanForm(node);await context.go(`/admin/pedidos/${id}`,{force:true});context.announce('Pedido e entrega atualizados. O pagamento não foi alterado.','success');};
    if(values.status==='cancelled' && order.status!=='cancelled') {
      await confirmAction({title:`Cancelar pedido #${order.order_number}?`,description:['confirmed','preparing'].includes(order.status)?'O cancelamento é definitivo para este pedido e devolve as quantidades ao estoque uma única vez. Não realiza estorno financeiro.':'O cancelamento é definitivo. Como já houve envio, o estoque não será reposto automaticamente; confira o retorno físico antes de ajustar o saldo.',confirmLabel:'Cancelar pedido',danger:true,onConfirm:execute});
    }else await execute();
  }});
  const invoiceForm=makeForm({name:'Nota fiscal eletrônica',submitLabel:'Salvar chave da NF-e',persist:true,onBusy:context.busy,fields:[
    {name:'access_key',label:'Chave de acesso da NF-e',value:invoice?.access_key||'',required:true,inputmode:'numeric',maxLength:44,hint:'Informe os 44 dígitos da NF-e já emitida.'},
  ],onSubmit:async(values,node)=>{
    const key=values.access_key.trim();
    if(!isValidNfeKey(key))throw new AppError('INVALID_DATA','Informe uma chave de NF-e modelo 55 com 44 dígitos e dígito verificador válido.');
    invoice=await context.admin.saveInvoice(id,key,invoice?.updated_at??null);
    cleanForm(node);context.announce('Chave da NF-e salva.','success');
  }});
  view.append(el('section',{className:'admin-order-actions'},[el('h2',{},'Nota fiscal eletrônica'),
    el('p',{className:'muted'},'Associe a chave de uma NF-e já emitida. A chave é conferida pelo formato; a autorização da nota deve ser verificada no emissor.'),invoiceForm]));
  if(order.shipment?.provider==='melhor_envio') {
    const registration=await context.admin.shippingRegistrationStatus(id,context.signal);
    let registrationContent;
    if(registration?.status==='started') registrationContent=el('p',{role:'status'},'Registro não confirmado. Confira o carrinho do Melhor Envio antes de qualquer nova tentativa.');
    else if(registration?.status==='registered') registrationContent=el('p',{role:'status'},`Remessa adicionada ao carrinho do Melhor Envio: ${registration.external_id}.`);
    else if(registration?.status==='cancelled') registrationContent=el('p',{role:'status'},'Remessa cancelada no Melhor Envio.');
    else registrationContent=makeForm({name:'Registrar remessa',submitLabel:'Preparar registro',persist:false,onBusy:context.busy,fields:[
      {name:'recipient_document',label:'CPF ou CNPJ do destinatário',required:true,inputmode:'numeric',maxLength:14,hint:'Somente números. Usado para registrar esta remessa.'},
      {name:'recipient_phone',label:'Telefone do destinatário',required:true,inputmode:'numeric',maxLength:13,hint:'DDD e número, somente dígitos.'},
      {name:'agency',label:'Código da agência',inputmode:'numeric',maxLength:12,hint:'Opcional, conforme a modalidade escolhida.'},
    ],onSubmit:async(values,node)=>{
      if(!/^(?:\d{11}|\d{14})$/.test(values.recipient_document)||!/^\d{10,13}$/.test(values.recipient_phone)||values.agency&&!/^\d+$/.test(values.agency))throw new AppError('INVALID_DATA','Confira o CPF ou CNPJ, o telefone e o código da agência.');
      await confirmAction({title:'Adicionar remessa ao Melhor Envio?',description:'Os dados do pedido e da NF-e serão enviados ao Melhor Envio. O frete ainda precisará ser comprado e a etiqueta emitida.',confirmLabel:'Adicionar remessa',onConfirm:async()=>{
        await context.admin.registerShipment({order_id:id,recipient_document:values.recipient_document,recipient_phone:values.recipient_phone,agency:values.agency});
        cleanForm(node);await context.go(`/admin/pedidos/${id}`,{force:true});context.announce('Remessa adicionada ao carrinho do Melhor Envio.','success');
      }});
    }});
    view.append(el('section',{className:'admin-order-actions'},[el('h2',{},'Remessa no Melhor Envio'),el('p',{className:'muted'},'Use uma NF-e já emitida. O registro adiciona a remessa ao carrinho; não compra o frete nem emite a etiqueta.'),registrationContent]));
  }
  view.append(el('section',{className:'admin-order-actions'},[el('h2',{},'Atualizar operação e entrega'),
    el('p',{className:'muted'},'Registro manual. Esta ação não compra frete, não emite etiqueta e não aprova ou estorna pagamentos.'),
    order.payment_status==='paid'?el('p',{className:'muted'},'Cancelamento de pedido pago depende do fluxo de estorno e não está disponível nesta tela.'):null,form]));
  return view;
}
let customerSearch='';
export function resetPrivateAdminUI(){customerSearch='';}
export async function customersPage(context,options) {
  const data=await context.admin.query('customers',{...options,search:customerSearch},context.signal);
  return listContent({title:'Clientes e contas',data,context,path:'/admin/clientes',options:{page:options.page||1},
    filters:filterBar({search:customerSearch,label:'Buscar cliente',placeholder:'Nome, e-mail ou telefone',onCommit:values=>{customerSearch=values.search;return context.go('/admin/clientes?page=1');}}),
    columns:[{label:'Nome',render:c=>link(c.full_name||'Nome não informado',`#/admin/clientes/${c.id}`)},{label:'E-mail',render:c=>c.email||'Não informado'},
      {label:'Telefone',render:c=>c.phone||'Não informado'},{label:'Pedidos',render:c=>String(c.order_count)},
      {label:'Acesso',render:c=>c.role==='admin'?'Administrador':'Cliente'},{label:'Ações',render:c=>adminLink('Consultar cliente',`/admin/clientes/${c.id}`)}],
  });
}
export async function customerDetail(context,id,options) {
  const data=await context.admin.query('customer',{id,page:options.page||1},context.signal);const customer=data.customer;
  if(!customer)return notFound('Cliente indisponível','/admin/clientes');
  return panel('Histórico do cliente',customer.full_name||'Nome não informado',[
    el('p',{},customer.email||'E-mail não informado'),el('p',{},customer.phone||'Telefone não informado'),
    el('p',{className:'muted'},`Cadastro em ${date(customer.created_at)}. Os dados de conta são somente para consulta nesta área.`),
    el('h2',{},'Pedidos'),data.items.length?dataTable([
      {label:'Pedido',render:o=>link(`#${o.order_number}`,`#/admin/pedidos/${o.id}`)},{label:'Data',render:o=>date(o.created_at)},
      {label:'Status',render:o=>ORDER_STATES[o.status]},{label:'Total',render:o=>money(o.total_cents)},
    ],data.items,'Pedidos do cliente'):el('p',{},'Este cliente ainda não tem pedidos.'),
    listPager({page:options.page||1,total:data.total,hasMore:data.hasMore,path:`/admin/clientes/${id}`,go:context.go}),
  ],[adminLink('Voltar aos clientes','/admin/clientes')]);
}
export async function settingsPage(context) {
  const data=await context.admin.query('settings',{},context.signal);const value=key=>data.find(item=>item.key===key)?.value;
  const expected=Object.fromEntries(data.map(item=>[item.key,item.updated_at]));
  const form=makeForm({name:'Configurações operacionais',submitLabel:'Salvar configurações',persist:true,onBusy:context.busy,fields:[
    {name:'store_name',label:'Nome da loja',value:value('store_name')||'',required:true,maxLength:160},
    {name:'contact_email',label:'E-mail de contato',value:value('contact_email')||'',required:true,type:'email',maxLength:254},
    {name:'origin_postal_code',label:'CEP de origem dos envios',value:value('origin_postal_code')||'',required:true,inputmode:'numeric',maxLength:9},
    {name:'low_stock_threshold',label:'Estoque mínimo sugerido para novos produtos',value:value('low_stock_threshold')??0,required:true,inputmode:'numeric',hint:'Produtos já cadastrados mantêm seu próprio mínimo.'},
  ],onSubmit:async(values,node)=>{await context.admin.mutate('settings_save',null,{values:validateSettings(values),expected});cleanForm(node);await context.go('/admin/configuracoes',{force:true});context.announce('Configurações salvas.','success');}});
  return panel('Configurações da loja','Dados operacionais. Credenciais de integrações não são armazenadas nesta tela.',[form]);
}
