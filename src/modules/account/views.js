import { el, link, button, heading, empty, date, money } from '../../ui/dom.js';
import { makeForm, cleanForm } from '../../ui/forms.js';
import { STATES } from '../auth/validation.js';
import { confirmAction } from '../../ui/feedback.js';

const statusLabels = {
  confirmed: 'Pedido confirmado', preparing: 'Preparando pedido', shipped: 'Enviado', in_transit: 'Em trânsito',
  out_for_delivery: 'Saiu para entrega', delivered: 'Entregue', cancelled: 'Cancelado', delivery_failed: 'Falha na entrega',
  pending: 'Pendente', paid: 'Pago', failed: 'Falhou', refunded: 'Reembolsado', posted: 'Postado',
};
export const statusLabel = status => statusLabels[status] || 'Status não informado';

export function profileView({ user, profile, role, repository, busy, announce, refresh }) {
  const form = makeForm({ name: 'Meus dados', submitLabel: 'Salvar alterações', onBusy: busy, persist: true,
    fields: [
      { name: 'full_name', label: 'Nome completo', value: profile.full_name, autocomplete: 'name', required: true, maxLength: 160 },
      { name: 'phone', label: 'Telefone', value: profile.phone || '', type: 'tel', autocomplete: 'tel', maxLength: 25, hint: 'Opcional. Inclua o DDD.' },
    ],
    onSubmit: async (values, formNode) => {
      profile = await repository.saveProfile(user.id, values, profile.updated_at);
      cleanForm(formNode); announce('Alterações salvas.', 'success'); refresh(profile);
    },
  });
  const main = el('section', { className: 'panel' }, [heading('Meus dados', 'Mantenha suas informações de contato atualizadas.'),
    el('p', {}, ['E-mail da conta: ', el('strong', {}, user.email)]), form]);
  const aside = el('aside', { className: 'panel' }, [el('h2', {}, 'Sua conta'),
    el('p', {}, ['Acesso: ', el('span', { className: 'badge' }, role === 'admin' ? 'Administrador' : 'Cliente')]),
    el('p', { className: 'muted' }, `Conta criada em ${date(profile.created_at)}.`),
    el('p', { className: 'muted' }, 'Você pode conferir seus dados e sair desta sessão a qualquer momento.'),
    link('Gerenciar endereços', '#/enderecos'), el('br'), link('Consultar pedidos', '#/pedidos'),
  ]);
  return el('div', { className: 'account-grid' }, [main, aside]);
}

export function pagination(page, hasMore, route, go) {
  const previous = button('Anterior', () => go(`${route}?pagina=${page - 1}`)); previous.disabled = page <= 1;
  const next = button('Próxima', () => go(`${route}?pagina=${page + 1}`)); next.disabled = !hasMore;
  return el('nav', { className: 'pagination', 'aria-label': 'Paginação' }, [previous, el('span', {}, `Página ${page}`), next]);
}
export function addressesView({ items, hasMore, page, go, repository, user, announce, reload, busy }) {
  const list = el('ul', { className: 'record-list' });
  for (const address of items) {
    const remove = button('Excluir endereço', () => confirmAction({
      title: `Excluir endereço “${address.label}”?`, description: 'O endereço será removido da sua conta. O endereço registrado em pedidos anteriores será preservado.',
      confirmLabel: 'Excluir endereço', danger: true,
      onConfirm: async () => {
        busy(true);
        try { await repository.deleteAddress(user.id, address); announce('Endereço excluído.', 'success'); await reload(); }
        finally { busy(false); }
      },
    }), 'ghost');
    list.append(el('li', { className: 'record-card' }, [
      el('h2', {}, [address.label, address.is_default ? el('span', { className: 'badge' }, 'Padrão') : null]),
      el('p', {}, address.recipient), el('p', {}, `${address.street}, ${address.number}${address.complement ? ` · ${address.complement}` : ''}`),
      el('p', { className: 'muted' }, `${address.neighborhood} · ${address.city}/${address.state} · CEP ${address.postal_code}`),
      el('div', { className: 'actions' }, [link('Editar endereço', `#/enderecos/${address.id}`, { className: 'button button-secondary' }), remove]),
    ]));
  }
  return el('section', { className: 'panel' }, [
    el('div', { className: 'toolbar' }, [heading('Meus endereços', 'Cadastre e edite os endereços da sua conta.'),
      link('Adicionar endereço', '#/enderecos/novo', { className: 'button button-primary' })]),
    items.length ? list : empty('Nenhum endereço cadastrado', 'Adicione um endereço para usar em compras futuras.'),
    pagination(page, hasMore, '/enderecos', go),
  ]);
}

export function addressFormView({ address, repository, go, busy, announce }) {
  const value = key => address?.[key] || '';
  const fields = [
    { name: 'label', label: 'Nome do endereço', value: value('label') || 'Casa', required: true, maxLength: 60, autocomplete: 'off' },
    { name: 'recipient', label: 'Destinatário', value: value('recipient'), required: true, maxLength: 160, autocomplete: 'shipping name' },
    { name: 'postal_code', label: 'CEP', value: value('postal_code'), required: true, inputmode: 'numeric', maxLength: 9, autocomplete: 'shipping postal-code', hint: 'Ao informar o CEP, consultamos o ViaCEP para preencher o endereço.' },
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
  return el('section', { className: 'panel' }, [heading(address ? 'Editar endereço' : 'Adicionar endereço', 'Os dados são salvos apenas na sua conta.'),
    form, link('Cancelar e voltar', '#/enderecos')]);
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
  const list = el('ul', { className: 'record-list' }, items.map(order => el('li', { className: 'record-card' }, [
    el('h2', {}, `Pedido #${order.order_number}`), el('span', { className: 'badge' }, statusLabel(order.status)),order.payment_environment==='sandbox'?el('span',{className:'badge'},'Pedido de teste'):null,
    el('p', { className: 'muted' }, date(order.created_at)), el('p', {}, ['Total: ', el('strong', {}, money(order.total_cents))]),
    link('Ver detalhes', `#/pedidos/${order.id}`, { className: 'button button-secondary' }),
  ])));
  return el('section', { className: 'panel' }, [heading('Meus pedidos', 'Consulte compras e acompanhe as entregas da sua conta.'),
    items.length ? list : empty('Você ainda não tem pedidos', 'Quando houver uma compra registrada, ela aparecerá aqui. A loja será implementada nas próximas fases.'),
    pagination(page, hasMore, '/pedidos', go),
  ]);
}

export function orderView(order,options={}) {
  const address = order.address_snapshot;
  const items = el('ul', { className: 'record-list' }, order.items.map(item => el('li', { className: 'record-card' }, [
    el('h3', {}, item.product_name), el('p', { className: 'muted' }, `SKU ${item.product_sku} · ${item.quantity} × ${money(item.unit_price_cents)}`),
    el('p', {}, money(item.line_total_cents)),
  ])));
  const timeline = el('ol', {}, order.events.map(event => el('li', {}, [el('strong', {}, statusLabel(event.status)),
    el('p', {}, event.description), el('small', { className: 'muted' }, date(event.occurred_at))])));
  return el('section', { className: 'panel' }, [link('Voltar aos pedidos', options.backHref||'#/pedidos'),
    heading(`Pedido #${order.order_number}`, `Registrado em ${date(order.created_at)}`),
    el('p', {}, ['Pedido: ', statusLabel(order.status), ' · Pagamento: ', order.payment_review_required?'Em conferência':statusLabel(order.payment_status)]),
    order.payment_environment==='sandbox'?el('p',{className:'muted',role:'note'},'Pedido de teste: a aprovação foi simulada no ambiente de testes.'):null,
    order.payment_review_required?el('p',{role:'alert'},'Este pagamento precisa de conferência pela loja. Aguarde a atualização do pedido.'):null,items,
    el('dl', { className: 'details-list' }, [el('dt', {}, 'Subtotal'), el('dd', {}, money(order.subtotal_cents)),
      el('dt', {}, 'Frete'), el('dd', {}, money(order.shipping_cents)), el('dt', {}, 'Total'), el('dd', {}, el('strong', {}, money(order.total_cents)))]),
    el('h2', {}, 'Endereço da compra'), el('p', {}, address.recipient),
    el('p', {}, `${address.street}, ${address.number}${address.complement ? ` · ${address.complement}` : ''}`),
    el('p', {}, `${address.neighborhood} · ${address.city}/${address.state} · CEP ${address.postal_code}`),
    el('h2', {}, 'Acompanhamento'), order.shipment ? el('div', {}, [
      el('p', {}, ['Entrega: ', statusLabel(order.shipment.status)]),
      el('p', {}, ['Transportadora: ', order.shipment.carrier || 'Ainda não informada']),
      el('p', {}, ['Rastreamento: ', order.shipment.tracking_code || 'Ainda não informado']),
      order.events.length ? timeline : el('p', { className: 'muted' }, 'Nenhuma atualização de transporte registrada.'),
    ]) : el('p', { className: 'muted' }, 'A entrega ainda não foi registrada. Não há eventos de rastreamento para exibir.'),
  ]);
}
