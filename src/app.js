import { createElement, PawPrint, UserRound, MapPin, Package, LogOut } from 'lucide';
import { createPupiClient } from './services/supabase.js';
import { readPublicConfig } from './config/environment.js';
import { createAuthService, TEST_NOTICE_VERSION } from './modules/auth/service.js';
import { createAccountRepository } from './repositories/account.js';
import { createCatalogRepository } from './repositories/catalog.js';
import { createMediaService } from './services/media.js';
import { storeCatalog, storeProduct } from './modules/store/catalog.js';
import { authView, noticeView, onboardingView } from './modules/auth/views.js';
import { profileView, addressesView, addressFormView, ordersView, orderView } from './modules/account/views.js';
import { el, link, button, heading, empty } from './ui/dom.js';
import { notify, confirmAction } from './ui/feedback.js';
import { isDirty, discardChanges } from './ui/forms.js';
import { AppError, toAppError } from './utils/errors.js';
import {createAdminRepository} from './repositories/admin.js';
import {createAdminMediaService} from './services/admin-media.js';
import {renderAdmin,resetPrivateAdminUI} from './modules/admin/router.js';
import './styles/app.css';
import './styles/admin.css';

const main = document.querySelector('#main');
const header = document.querySelector('#header');
const status = document.querySelector('#connection-status');
const state = { user: null, profile: null, role: null, busy: false, booting: true, generation: 0, controller: null,
  currentHash: location.hash || '#/entrar', recovery: false, destination: '/conta' };
let client; let auth; let repository;let adminRepository;let adminMedia;let catalogRepository;let catalogMedia;
const icon = definition => createElement(definition, { 'aria-hidden': 'true', 'stroke-width': 1.8 });
const busy = value => { state.busy = value; };
function clearPrivateState() { state.user = null; state.profile = null; state.role = null;adminRepository?.clear();adminMedia?.clear();resetPrivateAdminUI(); }
function clearRecovery() {
  state.recovery = false;
  try { sessionStorage.removeItem('pupi-password-recovery'); } catch { /* Sessão ainda pode ser concluída sem o marcador. */ }
}
function rememberRecovery() {
  state.recovery = true;
  try { sessionStorage.setItem('pupi-password-recovery', 'active'); } catch { /* Nunca guardar tokens próprios. */ }
}
function connectionStatus() {
  status.dataset.offline = String(!navigator.onLine);
  status.textContent = navigator.onLine ? 'Ambiente de testes · alterações confirmadas são salvas na sua conta' :
    'Sem conexão · reconecte para entrar ou salvar alterações';
}
function renderHeader(route = '') {
  const brand = link([icon(PawPrint), 'pupi'], state.user ? '#/conta' : '#/entrar', { className: 'brand', 'aria-label': 'Pupi, minha conta' });
  const navigation = el('nav', { className: 'navigation', 'aria-label': 'Navegação principal' });
  const routes = state.user ? [['Meus dados', '/conta'], ['Endereços', '/enderecos'], ['Pedidos', '/pedidos']] : [['Entrar', '/entrar'], ['Criar conta', '/cadastro']];
  routes.unshift(['Loja', '/loja']);
  if (state.role === 'admin') routes.push(['Administração', '/admin']);
  for (const [label, path] of routes) navigation.append(link(label, `#${path}`, { 'aria-current': route.startsWith(path) ? 'page' : undefined }));
  if (state.user) navigation.append(button([icon(LogOut), 'Sair'], logout, 'ghost'));
  header.replaceChildren(brand, navigation);
}
async function canLeave() {
  if (state.busy) { notify('Aguarde a confirmação da operação antes de sair desta tela.'); return false; }
  if (!isDirty(main)) return true;
  const result = await confirmAction({ title: 'Descartar alterações?', description: 'As alterações deste formulário ainda não foram salvas.' });
  if (result) discardChanges(main);
  return result;
}
async function go(route, { force = false } = {}) {
  if (!route.startsWith('/') || route.startsWith('//')) route = '/conta';
  if (!force && !await canLeave()) return;
  if (force) discardChanges(main);
  const target = `#${route}`;
  if (location.hash !== target) history.pushState(null, '', target);
  await render();
}
async function logout() {
  if (!auth || !await canLeave()) return;
  busy(true);
  try {
    await auth.signOut(); clearRecovery(); clearPrivateState();
    await go('/entrar', { force: true }); notify('Você saiu desta sessão.', 'success');
  } catch (error) { notify(toAppError(error).message, 'error'); }
  finally { busy(false); }
}
async function onLogin() {
  clearRecovery();
  await go(state.destination || '/conta', { force: true });
  state.destination = '/conta';
}
function authContext() {
  return { auth, busy, go, onLogin, announce: notify, recovery: state.recovery, clearRecovery,
    googleButton: () => {
      const google = button('Continuar com Google', async () => {
        if (state.busy) return;
        busy(true); google.disabled = true;
        try { const url = await auth.google(); location.assign(url); }
        catch (error) { notify(toAppError(error).message, 'error'); google.disabled = false; busy(false); }
      });
      google.classList.add('full-width');
      google.prepend(el('span', { 'aria-hidden': 'true' }, 'G'));
      return google;
    },
  };
}
function authLayout(view) {
  const intro = el('aside', { className: 'auth-intro' }, [el('p', { className: 'eyebrow' }, 'Sua conta Pupi'),
    el('h2', {}, 'Tudo sobre a sua conta, em um só lugar.'),
    el('p', { className: 'muted' }, 'Cadastre seus dados e acompanhe o que importa para você e seu pet.'),
    el('ul', { className: 'intro-list' }, [[UserRound, 'Seus dados de contato'], [MapPin, 'Endereços da sua conta'], [Package, 'Histórico e acompanhamento de pedidos']]
      .map(([image, text]) => el('li', {}, [icon(image), text]))),
  ]);
  return el('div', { className: 'auth-layout' }, [intro, view]);
}
function failure(error, retry) {
  const message = toAppError(error).message;
  document.title = 'Não foi possível carregar | Pupi';
  main.replaceChildren(el('section', { className: 'panel' }, [heading('Não foi possível carregar', message),
    button('Tentar novamente', retry, 'primary'), link('Voltar para minha conta', '#/conta')]));
}
function unavailable(title, message, destination = '/conta') {
  return el('section', { className: 'panel' }, [heading(title, message), link('Voltar', `#${destination}`, { className: 'button button-secondary' })]);
}
const routeTitles = { '/entrar': 'Entrar', '/cadastro': 'Criar conta', '/recuperar': 'Recuperar acesso', '/nova-senha': 'Nova senha',
  '/conta': 'Meus dados', '/enderecos': 'Meus endereços', '/pedidos': 'Meus pedidos', '/admin': 'Administração', '/aviso': 'Aviso de testes' };

async function render() {
  const generation = ++state.generation;
  state.controller?.abort(); state.controller = new AbortController();
  const signal = state.controller.signal;
  const address = new URL((location.hash || '#/entrar').slice(1), location.origin);
  const route = address.pathname.replace(/\/$/, '') || '/entrar';
  const pageNumber = Number(address.searchParams.get('pagina') || 1);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  state.currentHash = location.hash || '#/entrar';
  const title = routeTitles[route] || (route.startsWith('/enderecos/') ? 'Endereço' : route.startsWith('/pedidos/') ? 'Detalhes do pedido' : 'Página não encontrada');
  document.title = `${title} | Pupi`; notify(''); renderHeader(route);
  main.replaceChildren(el('p', { className: 'loading', role: 'status' }, 'Carregando…'));
  try {
    if (route === '/loja' || /^\/loja\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route)) {
      document.title = 'Loja | Pupi';
      const view = route === '/loja' ? await storeCatalog(catalogRepository, address.searchParams, go, catalogMedia) : await storeProduct(catalogRepository, route.slice(6), catalogMedia, address.searchParams);
      if (generation === state.generation) main.replaceChildren(view);
      return;
    }
    if (route === '/aviso') { main.replaceChildren(noticeView()); return; }
    const publicRoute = ['/entrar', '/cadastro', '/recuperar', '/nova-senha'].includes(route);
    const user = await auth.user();
    if (generation !== state.generation) return;
    if (!user) {
      clearPrivateState(); clearRecovery(); renderHeader(route);
      if (!publicRoute) { state.destination = route; await go('/entrar', { force: true }); notify('Entre para acessar sua conta.'); return; }
      main.replaceChildren(authLayout(authView(route, authContext())));
      return;
    }
    state.user = user;
    const [profile, role] = await Promise.all([repository.getProfile(user.id, signal), repository.role(user.id, signal)]);
    if (generation !== state.generation) return;
    state.profile = profile; state.role = role; renderHeader(route);
    if (state.recovery && route !== '/nova-senha' && route !== '/recuperar') { await go('/nova-senha', { force: true }); return; }
    if (route === '/nova-senha' || route === '/recuperar') {
      main.replaceChildren(authLayout(authView(route, authContext()))); return;
    }
    if (!profile.terms_accepted_at || profile.terms_version !== TEST_NOTICE_VERSION) {
      document.title = 'Aviso de testes | Pupi';
      main.replaceChildren(onboardingView({ busy, accept: async () => {
        await repository.acceptTestNotice(); await go('/conta', { force: true }); notify('Aviso de testes registrado.', 'success');
      } }));
      return;
    }
    if (publicRoute) { await go('/conta', { force: true }); return; }
    const context = { user, profile, role, repository, busy, announce: notify, go,
      reload: render, refresh: next => { state.profile = next; } };
    let view;
    if (route === '/conta') view = profileView(context);
    else if (route === '/enderecos') {
      const data = await repository.listAddresses(user.id, page, signal);
      if (!data.items.length && page > 1) { await go(`/enderecos?pagina=${page - 1}`, { force: true }); return; }
      view = addressesView({ ...context, ...data, page });
    } else if (route === '/enderecos/novo') view = addressFormView(context);
    else if (route.startsWith('/enderecos/')) {
      const id = route.split('/')[2];
      if (!/^[0-9a-f-]{36}$/i.test(id)) view = unavailable('Endereço indisponível', 'Confira o endereço selecionado.', '/enderecos');
      else {
        const data = await repository.getAddress(user.id, id, signal);
        view = data ? addressFormView({ ...context, address: data }) : unavailable('Endereço indisponível', 'Este endereço não está disponível para sua conta.', '/enderecos');
      }
    } else if (route === '/pedidos') {
      const data = await repository.listOrders(user.id, page, signal);
      if (!data.items.length && page > 1) { await go(`/pedidos?pagina=${page - 1}`, { force: true }); return; }
      view = ordersView({ ...context, ...data, page });
    } else if (route.startsWith('/pedidos/')) {
      const id = route.split('/')[2];
      const data = /^[0-9a-f-]{36}$/i.test(id) ? await repository.getOrder(user.id, id, signal) : null;
      view = data ? orderView(data) : unavailable('Pedido indisponível', 'Este pedido não está disponível para sua conta.', '/pedidos');
    } else if (route === '/admin' || route.startsWith('/admin/')) {
      const allowed = await repository.adminAccess(signal);
      if (!allowed || role !== 'admin') {
        document.title = 'Acesso restrito | Pupi';
        view = unavailable('Acesso restrito', 'Esta área exige permissão de administrador.');
      } else view = await renderAdmin({
        ...context,admin:adminRepository,media:adminMedia,route,params:address.searchParams,signal,
        current:route+address.search,isBusy:()=>state.busy,canLeave,
      });
    } else {
      document.title = 'Página não encontrada | Pupi';
      view = unavailable('Página não encontrada', 'Use a navegação para continuar.');
    }
    if (generation === state.generation) main.replaceChildren(view);
  } catch (error) {
    if (signal.aborted || generation !== state.generation) return;
    if (error.code === 'SESSION_EXPIRED') {
      await auth.clearLocalSession().catch(() => {}); clearPrivateState(); clearRecovery();
      await go('/entrar', { force: true }); notify('Sua sessão expirou. Entre novamente.', 'error');
    } else if(route.startsWith('/admin') && error.code==='FORBIDDEN') {
      document.title='Acesso restrito | Pupi';
      main.replaceChildren(unavailable('Acesso restrito','Sua conta não tem permissão para esta operação administrativa.'));
    } else failure(error, render);
  } finally {
    if (generation === state.generation) main.querySelector('h1')?.focus({ preventScroll: true });
  }
}

document.addEventListener('click', async event => {
  const anchor = event.target.closest('a');
  if (anchor?.getAttribute('href') === '#main') { event.preventDefault(); main.focus(); main.scrollIntoView(); return; }
  if (!anchor || anchor.target || !anchor.getAttribute('href')?.startsWith('#/') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); await go(anchor.getAttribute('href').slice(1));
});
window.addEventListener('hashchange', async () => {
  if (!auth || state.booting) return;
  if (!await canLeave()) { history.replaceState(null, '', state.currentHash); return; }
  await render();
});
window.addEventListener('beforeunload', event => {
  if (isDirty(main) || state.busy) { event.preventDefault(); event.returnValue = ''; }
});
window.addEventListener('online', connectionStatus); window.addEventListener('offline', connectionStatus);
document.addEventListener('pupi:session-expired', async () => {
  await auth.clearLocalSession().catch(() => {}); clearPrivateState(); clearRecovery(); discardChanges(main);
  await go('/entrar', { force: true }); notify('Sua sessão expirou. Entre novamente.', 'error');
});

async function start() {
  renderHeader('/entrar'); connectionStatus();
  try {
    const config = readPublicConfig(__PUPI_CONFIG__);
    client = createPupiClient(__PUPI_CONFIG__, { auth: { detectSessionInUrl: false } });
    auth = createAuthService(client, location.origin, config); repository = createAccountRepository(client);
    catalogRepository=createCatalogRepository(client);catalogMedia=createMediaService(client);adminRepository=createAdminRepository(client);adminMedia=createAdminMediaService(client,adminRepository);
    try { state.recovery = sessionStorage.getItem('pupi-password-recovery') === 'active'; } catch { /* Marcador opcional. */ }
    const callbackUrl = new URL(location.href);
    const hasCallback = callbackUrl.searchParams.has('code') || callbackUrl.searchParams.has('error')
      || callbackUrl.hash.includes('error=') || callbackUrl.hash.includes('access_token=');
    let callbackError;
    if (hasCallback) {
      try {
        if (callbackUrl.hash.includes('access_token=')) throw new AppError('CALLBACK_FAILED', 'Solicite outro link neste navegador para continuar com segurança.');
        const result = await auth.callback(callbackUrl.href);
        if (result.recovery) rememberRecovery();
        history.replaceState(null, '', `${location.pathname}#${result.recovery ? '/nova-senha' : '/conta'}`);
      } catch (error) {
        history.replaceState(null, '', `${location.pathname}#/entrar`);
        callbackError = error;
      }
    }
    state.booting = false;
    auth.subscribe(async event => {
      if (state.booting || state.busy || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      if (event === 'SIGNED_OUT') {
        clearPrivateState(); clearRecovery(); discardChanges(main);
        await go('/entrar', { force: true });
      } else if (event === 'SIGNED_IN') {
        const current = await auth.user().catch(() => null);
        if (current?.id !== state.user?.id) {
          clearPrivateState(); discardChanges(main); await go('/conta', { force: true });
        }
      }
    });
    await render();
    if (callbackError) notify(toAppError(callbackError).message, 'error');
  } catch (error) {
    state.booting = false;
    document.title = 'Configuração necessária | Pupi';
    main.replaceChildren(el('section', { className: 'panel' }, [heading('Configure a conexão para testar', toAppError(error).message),
      el('p', {}, 'Copie .env.example para .env, confira a URL e a chave pública do projeto Pupi e reinicie npm run dev.'),
      button('Tentar novamente', () => location.reload(), 'primary')]));
  }
}
start();
