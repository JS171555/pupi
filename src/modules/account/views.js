import { el, link, button, heading, empty, date, money } from '../../ui/dom.js';
import { makeForm, cleanForm } from '../../ui/forms.js';
import { STATES } from '../auth/validation.js';
import { confirmAction } from '../../ui/feedback.js';
import { createElement, UserRound, Mail, CalendarDays, MapPin, ShoppingBag, ArrowUpRight, Package, ArrowLeft, ArrowRight, CreditCard, Truck, Plus, Pencil, Trash2 } from 'lucide';

const statusLabels = {
  confirmed: 'Pedido confirmado', preparing: 'Preparando pedido', shipped: 'Enviado', in_transit: 'Em trânsito',
  out_for_delivery: 'Saiu para entrega', delivered: 'Entregue', cancelled: 'Cancelado', delivery_failed: 'Falha na entrega',
  pending: 'Pendente', paid: 'Pago', failed: 'Falhou', refunded: 'Reembolsado', posted: 'Postado',
};
export const statusLabel = status => statusLabels[status] || 'Status não informado';

export function profileView({ user, profile, role, repository, busy, announce, refresh }) {
  const profileIcon = definition => createElement(definition, { 'aria-hidden': 'true', 'stroke-width': 1.8 });
  const initials = (profile.full_name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('pt-BR') || 'P';
  const form = makeForm({ name: 'Meus dados', submitLabel: 'Salvar alterações', onBusy: busy, persist: true,
    fields: [
      { name: 'full_name', label: 'Nome completo', value: profile.full_name, autocomplete: 'name', required: true, maxLength: 160 },
      { name: 'phone', label: 'Telefone', value: profile.phone || '', type: 'tel', autocomplete: 'tel-national', mask:'phone', hint: 'Opcional. Use o DDD: (11) 90000-0000.' },
    ],
    onSubmit: async (values, formNode) => {
      profile = await repository.saveProfile(user.id, values, profile.updated_at);
      cleanForm(formNode); announce('Alterações salvas.', 'success'); refresh(profile);
    },
  });
  form.classList.add('profile-form');
  const main = el('section', { className: 'panel profile-main' }, [
    heading('Meus dados'),
    form,
  ]);
  const aside = el('aside', { className: 'panel profile-sidebar' }, [
    el('div', { className: 'profile-identity' }, [
      el('span', { className: 'profile-avatar', 'aria-hidden': 'true' }, initials),
      el('div', {}, [el('p', { className: 'profile-eyebrow' }, 'SUA CONTA'),el('h2', {}, profile.full_name || 'Olá!')]),
    ]),
    el('div', { className: 'profile-account-details' }, [
      el('div', { className: 'profile-detail' }, [profileIcon(Mail),el('div', {}, [el('span', {}, 'E-mail da conta'),el('strong', {}, user.email)])]),
      el('div', { className: 'profile-detail' }, [profileIcon(CalendarDays),el('div', {}, [el('span', {}, 'Membro desde'),el('strong', {}, date(profile.created_at))])]),
      el('div', { className: 'profile-access' }, [el('span', {}, 'Tipo de acesso'),el('span', { className: 'badge' }, role === 'admin' ? 'Administrador' : 'Cliente')]),
    ]),
    el('div', { className: 'profile-shortcuts' }, [
      el('h3', {}, 'Atalhos da conta'),
      link([profileIcon(MapPin),el('span', {}, 'Gerenciar endereços'),profileIcon(ArrowUpRight)], '#/enderecos', { className: 'profile-shortcut' }),
      link([profileIcon(ShoppingBag),el('span', {}, 'Consultar pedidos'),profileIcon(ArrowUpRight)], '#/pedidos', { className: 'profile-shortcut' }),
    ]),
  ]);
  return el('div', { className: 'account-grid profile-layout' }, [main, aside]);
}

export function pagination(page, hasMore, route, go) {
  const previous = button('Anterior', () => go(`${route}?pagina=${page - 1}`)); previous.disabled = page <= 1;
  const next = button('Próxima', () => go(`${route}?pagina=${page + 1}`)); next.disabled = !hasMore;
  return el('nav', { className: 'pagination', 'aria-label': 'Paginação' }, [previous, el('span', {}, `Página ${page}`), next]);
}
export function addressesView({ items, hasMore, page, go, repository, user, announce, reload, busy }) {
  const icon = definition => createElement(definition, { 'aria-hidden': 'true', 'stroke-width': 1.8 });
  const list = el('ul', { className: 'record-list address-list' });
  for (const address of items) {
    const remove = button([icon(Trash2), 'Excluir endereço'], () => confirmAction({
      title: `Excluir endereço “${address.label}”?`, description: 'O endereço será removido da sua conta. O endereço registrado em pedidos anteriores será preservado.',
      confirmLabel: 'Excluir endereço', danger: true,
      onConfirm: async () => {
        busy(true);
        try { await repository.deleteAddress(user.id, address); announce('Endereço excluído.', 'success'); await reload(); }
        finally { busy(false); }
      },
    }), 'ghost');
    remove.classList.add('address-delete-action');
    list.append(el('li', { className: 'record-card address-card' }, [
      el('div', { className: 'address-card-heading' }, [
        el('span', { className: 'address-card-icon', 'aria-hidden': 'true' }, icon(MapPin)),
        el('div', { className: 'address-card-title' }, [
          el('h2', {}, [address.label, address.is_default ? el('span', { className: 'badge address-default-badge' }, 'Padrão') : null]),
          el('p', { className: 'address-card-recipient' }, address.recipient),
        ]),
      ]),
      el('div', { className: 'address-card-location' }, [
        el('p', {}, [icon(MapPin),el('span', {}, `${address.street}, ${address.number}${address.complement ? ` · ${address.complement}` : ''}`)]),
        el('p', { className: 'muted' }, `${address.neighborhood} · ${address.city}/${address.state} · CEP ${address.postal_code}`),
      ]),
      el('div', { className: 'address-card-actions' }, [
        link([icon(Pencil), 'Editar endereço'], `#/enderecos/${address.id}`, { className: 'button button-secondary address-edit-action' }),
        remove,
      ]),
    ]));
  }
  return el('section', { className: 'panel addresses-page' }, [
    el('div', { className: 'toolbar address-toolbar' }, [heading('Meus endereços'),
      link([icon(Plus), 'Adicionar endereço'], '#/enderecos/novo', { className: 'button button-primary address-add-button' })]),
    items.length ? list : empty('Nenhum endereço cadastrado', 'Adicione um endereço para usar em compras futuras.'),
    pagination(page, hasMore, '/enderecos', go),
  ]);
}

export function addressFormView({ address, repository, go, busy, announce }) {
  const icon = definition => createElement(definition, { 'aria-hidden': 'true', 'stroke-width': 1.8 });
  const value = key => address?.[key] || '';
  const fields = [
    { name: 'label', label: 'Nome do endereço', value: value('label') || 'Casa', required: true, maxLength: 60, autocomplete: 'off' },
    { name: 'recipient', label: 'Destinatário', value: value('recipient'), required: true, maxLength: 160, autocomplete: 'shipping name' },
    { name: 'postal_code', label: 'CEP', value: value('postal_code'), required: true, inputmode: 'numeric', maxLength: 9, autocomplete: 'shipping postal-code', hint: 'Preenchimento automático pelo CEP.' },
    { name: 'street', label: 'Rua ou avenida', value: value('street'), required: true, maxLength: 200, autocomplete: 'shipping address-line1' },
    { name: 'number', label: 'Número', value: value('number'), required: true, maxLength: 20 },
    { name: 'complement', label: 'Complemento', value: value('complement'), maxLength: 160, autocomplete: 'shipping address-line2' },
    { name: 'neighborhood', label: 'Bairro', value: value('neighborhood'), required: true, maxLength: 120 },
    { name: 'city', label: 'Cidade', value: value('city'), required: true, maxLength: 120, autocomplete: 'shipping address-level2' },
    { name: 'state', label: 'UF', value: value('state'), required: true, autocomplete: 'shipping address-level1', options: [['', 'Selecione'], ...STATES.map(state => [state, state])] },
    { name: 'is_default', label: 'Usar como endereço padrão', value: address?.is_default === true, type: 'checkbox' },
  ];
  const form = makeForm({ name: address ? 'Editar endereço' : 'Adicionar endereço', fields, submitLabel: 'Salvar endereço', onBusy: busy, persist: true,
    onSubmit: async (values, formNode) => {
      await repository.saveAddress(values, address); cleanForm(formNode);
      await go('/enderecos', { force: true }); announce('Endereço salvo.', 'success');
    },
  });
  setupPostalLookup(form);
  form.classList.add('address-form');
  form.querySelector('.form-fields')?.classList.add('address-form-fields');
  return el('div', { className: 'address-form-layout' }, [
    el('section', { className: 'panel address-form-main' }, [
      heading(address ? 'Editar endereço' : 'Adicionar endereço'),
      form,
      link('Cancelar e voltar', '#/enderecos', { className: 'address-cancel-link' }),
    ]),

  ]);
}

// Uma resposta antiga nunca pode substituir dados digitados durante a consulta.
function setupPostalLookup(form) {
  const cep=form.elements.namedItem('postal_code');
  const status=el('small',{className:'field-help',role:'status','aria-live':'polite'});
  cep.closest('[data-field="postal_code"]').append(status);
  const mapping={street:'logradouro',neighborhood:'bairro',city:'localidade',state:'uf'};
  const automatic={};let timer,controller,lastSuccess='';
  const digits=()=>cep.value.replace(/\D/g,'');
  async function lookup() {
    const current=digits();if(current.length!==8 || current===lastSuccess)return;
    controller?.abort();const request=new AbortController();controller=request;
    const before=Object.fromEntries(Object.keys(mapping).map(name=>[name,form.elements.namedItem(name).value]));
    status.textContent='Consultando CEP…';
    try {
      const response=await fetch(`https://viacep.com.br/ws/${current}/json/`,{signal:AbortSignal.any([request.signal,AbortSignal.timeout(8000)])});
      if(!response.ok)throw new Error('unavailable');
      const data=await response.json();
      if(request.signal.aborted || digits()!==current || !form.isConnected)return;
      if(data.erro) {status.textContent='CEP não encontrado. Confira o número ou preencha o endereço manualmente.';return;}
      let filled=0;
      for(const [name,key] of Object.entries(mapping)) {
        const control=form.elements.namedItem(name),next=data[key];
        if(typeof next!=='string'||!next.trim()||control.value!==before[name]||(control.value && control.value!==automatic[name]))continue;
        if(name==='state' && !Array.from(control.options).some(option=>option.value===next))continue;
        control.value=next;automatic[name]=next;control.dispatchEvent(new Event('input',{bubbles:true}));filled++;
      }
      lastSuccess=current;
      status.textContent=filled?'Endereço consultado. Confira e complete os dados.':'Confira os dados do endereço ou preencha-os manualmente.';
    } catch {
      if(!request.signal.aborted && digits()===current && form.isConnected)status.textContent='Não foi possível consultar o CEP. Preencha o endereço manualmente.';
    }
  }
  cep.addEventListener('input',()=>{
    clearTimeout(timer);controller?.abort();status.textContent='';
    if(digits().length===8)timer=setTimeout(lookup,400);
    else lastSuccess='';
  });
  cep.addEventListener('blur',()=>{clearTimeout(timer);if(digits().length===8)lookup();});
}

export function ordersView({ items, hasMore, page, go }) {
  const icon = definition => createElement(definition, { 'aria-hidden': 'true', 'stroke-width': 1.8 });
  const list = el('ul', { className: 'orders-list' }, items.map(order => el('li', { className: 'order-list-card' }, [
    el('div', { className: 'order-card-main' }, [
      el('div', { className: 'order-card-title' }, [el('div', {}, [el('span', { className: 'order-card-eyebrow' }, 'PEDIDO'),el('h2', {}, `#${order.order_number}`)]),el('span', { className: 'order-status-pill' }, statusLabel(order.status))]),
      el('p', { className: 'order-card-date' }, [icon(CalendarDays),`Registrado em ${date(order.created_at)}`]),
    ]),
    el('div', { className: 'order-card-footer' }, [
      el('div', { className: 'order-card-total' }, [el('span', {}, 'Total do pedido'),el('strong', {}, money(order.total_cents))]),
      link(['Ver detalhes',icon(ArrowRight)], `#/pedidos/${order.id}`, { className: 'button button-secondary order-details-link' }),
    ]),
  ])));
  return el('section', { className: 'orders-page' }, [heading('Meus pedidos'),
    items.length ? list : empty('Você ainda não tem pedidos', '',link('Explorar a loja','#/loja',{className:'button button-primary'})),
    pagination(page, hasMore, '/pedidos', go),
  ]);
}

export function orderView(order,options={}) {
  const icon = definition => createElement(definition, { 'aria-hidden': 'true', 'stroke-width': 1.8 });
  const address = order.address_snapshot;
  const items = el('ul', { className: 'order-detail-items' }, order.items.map(item => el('li', { className: 'order-line-item' }, [
    el('span', { className: 'order-product-icon', 'aria-hidden': 'true' }, icon(Package)),
    el('div', { className: 'order-line-description' }, [el('h3', {}, item.product_name),el('p', { className: 'muted' }, `SKU ${item.product_sku} · ${item.quantity} × ${money(item.unit_price_cents)}`)]),
    el('strong', { className: 'order-line-total' }, money(item.line_total_cents)),
  ])));
  const timeline = el('ol', { className: 'order-timeline' }, order.events.map(event => el('li', { className: 'order-timeline-entry' }, [el('span', { className: 'order-timeline-marker', 'aria-hidden': 'true' }),el('div', {}, [el('strong', {}, statusLabel(event.status)),
    el('p', {}, event.description),el('small', { className: 'muted' }, date(event.occurred_at))])])));
  const orderStatus = order.payment_review_required?'Em conferência':statusLabel(order.payment_status);
  const shippingDetails = order.shipment ? el('div', { className: 'order-shipment-details' }, [
    el('p', {}, ['Entrega ',el('strong', {}, statusLabel(order.shipment.status))]),
    el('p', {}, ['Transportadora ',el('strong', {}, order.shipment.carrier || 'Ainda não informada')]),
    el('p', {}, ['Rastreamento ',el('strong', {}, order.shipment.tracking_code || 'Ainda não informado')]),
    order.events.length ? timeline : el('p', { className: 'muted' }, 'Nenhuma atualização de transporte registrada.'),
  ]) : el('p', { className: 'muted' }, 'Entrega ainda não registrada.');
  const addressCard = el('section', { className: 'order-info-card order-address-card' }, [
    el('div', { className: 'order-info-heading' }, [icon(MapPin),el('h2', {}, 'Endereço da compra')]),
    el('div', { className: 'order-address-content' }, [el('strong', {}, address.recipient),el('p', {}, `${address.street}, ${address.number}${address.complement ? ` · ${address.complement}` : ''}`),el('p', { className: 'muted' }, `${address.neighborhood} · ${address.city}/${address.state} · CEP ${address.postal_code}`)]),
  ]);
  const trackingCard = el('section', { className: 'order-info-card order-tracking-card' }, [
    el('div', { className: 'order-info-heading' }, [icon(Truck),el('h2', {}, 'Acompanhamento')]),shippingDetails,
  ]);
  const summary = el('aside', { className: 'order-summary-card' }, [
    el('p', { className: 'order-summary-eyebrow' }, 'RESUMO DO PEDIDO'),
    el('dl', { className: 'details-list order-totals' }, [el('dt', {}, 'Subtotal'), el('dd', {}, money(order.subtotal_cents)),
      el('dt', {}, 'Frete'), el('dd', {}, money(order.shipping_cents)), el('dt', { className: 'order-grand-total-label' }, 'Total'), el('dd', { className: 'order-grand-total' }, el('strong', {}, money(order.total_cents)))]),
  ]);
  return el('section', { className: 'order-detail-page' }, [
    link([icon(ArrowLeft),'Voltar aos pedidos'], options.backHref||'#/pedidos', { className: 'order-back-link' }),
    el('header', { className: 'order-detail-header' }, [
      heading(`Pedido #${order.order_number}`, `Registrado em ${date(order.created_at)}`),
      el('div', { className: 'order-detail-statuses' }, [
        el('div', { className: 'order-status-value' }, [el('span', {}, 'Pedido'),el('strong', {}, statusLabel(order.status))]),
        el('div', { className: 'order-status-value' }, [icon(CreditCard),el('div', {}, [el('span', {}, 'Pagamento'),el('strong', {}, orderStatus)])]),
      ]),
    ]),
    order.payment_environment==='sandbox'?el('p',{className:'order-payment-note',role:'note'},'Este pedido não gerou uma cobrança real.'):null,
    order.payment_review_required?el('p',{className:'order-review-alert',role:'alert'},'Este pagamento precisa de conferência pela loja. Aguarde a atualização do pedido.'):null,
    el('div', { className: 'order-detail-grid' }, [
      el('div', { className: 'order-detail-main' }, [
        el('section', { className: 'order-info-card order-products-card' }, [el('div', { className: 'order-info-heading' }, [icon(Package),el('h2', {}, 'Produtos do pedido')]),items]),
        trackingCard,
      ]),
      el('div', { className: 'order-detail-aside' }, [summary,addressCard]),
    ]),
  ]);
}
