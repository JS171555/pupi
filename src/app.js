import { createElement, PawPrint, UserRound, MapPin, Package, LogOut, Store, ShoppingBag, Menu } from 'lucide';
import { gsap } from 'gsap';
import { createPupiClient } from './services/supabase.js';
import { readPublicConfig } from './config/environment.js';
import { createAuthService, TEST_NOTICE_VERSION } from './modules/auth/service.js';
import { createAccountRepository } from './repositories/account.js';
import { createCheckoutService } from './services/checkout.js';
import { createCartRepository } from './repositories/cart.js';
import { createCatalogRepository } from './repositories/catalog.js';
import { createMediaService } from './services/media.js';
import { storeCatalog, storeProduct } from './modules/store/catalog.js';
import { cartView } from './modules/store/cart.js';
import { checkoutReview } from './modules/store/checkout.js';
import { authView, noticeView, onboardingView } from './modules/auth/views.js';
import {embeddedPaymentPanel} from './modules/account/payment.js';
import { profileView, addressesView, addressFormView, ordersView, orderView } from './modules/account/views.js';
import { el, link, button, heading, empty } from './ui/dom.js';
import { notify, confirmAction } from './ui/feedback.js';
import {startLoading,buttonLoading} from './ui/loading.js';
import { isDirty, discardChanges } from './ui/forms.js';
import { AppError, toAppError } from './utils/errors.js';
import {createAdminRepository} from './repositories/admin.js';
import {createAdminMediaService} from './services/admin-media.js';
import {renderAdmin,resetPrivateAdminUI} from './modules/admin/router.js';
import './styles/app.css';
import './styles/admin.css';
import './styles/experience.css';
import './styles/feedback.css';
import './styles/banners.css';

const main = document.querySelector('#main');
const header = document.querySelector('#header');
const status = document.querySelector('#connection-status');
// Um único valor acompanha altura real do menu, zoom e banner de conexão.
const syncHeaderGeometry=()=>{
  const height=header.getBoundingClientRect().height;
  const notice=status.hidden?0:status.getBoundingClientRect().height;
  const menuBottom=header.querySelector('.mobile-menu[open] .mobile-menu-panel')?.getBoundingClientRect().bottom||0;
  document.documentElement.style.setProperty('--app-header-height',`${height}px`);
  document.documentElement.style.setProperty('--feedback-top',`${Math.max(height+notice,menuBottom)+12}px`);
};
const shellObserver=new ResizeObserver(syncHeaderGeometry);shellObserver.observe(header);shellObserver.observe(status);
const state = { user: null, profile: null, role: null, busy: false, booting: true, generation: 0, controller: null,
  currentHash: location.hash || '#/loja', recovery: false, destination: '/conta' };
let client; let auth; let repository;let adminRepository;let adminMedia;let catalogRepository;let catalogMedia;let cartRepository;
const icon = definition => createElement(definition, { 'aria-hidden': 'true', 'stroke-width': 1.8 });
let stopBusyButton=()=>{};
const busy = value => { state.busy=value;if(value){stopBusyButton();const active=document.activeElement;stopBusyButton=active?.matches('button')&&!active.closest('form,dialog')?buttonLoading(active):()=>{};}else{stopBusyButton();stopBusyButton=()=>{};} };
// Transições curtas não atrasam leitura, interação ou navegação sem movimento.
const motionPreference=window.matchMedia('(prefers-reduced-motion: reduce)');
const viewObserver=new MutationObserver(()=>{
  const view=main.firstElementChild;
  if(!view||view.classList.contains('loading')||motionPreference.matches)return;
  gsap.fromTo(view,{opacity:0,y:8},{opacity:1,y:0,duration:.28,ease:'power2.out',clearProps:'opacity,transform',overwrite:true});
  const cards=[...view.querySelectorAll('.product-card')].slice(0,8);
  if(cards.length)gsap.fromTo(cards,{opacity:0,y:8},{opacity:1,y:0,duration:.28,stagger:.035,ease:'power2.out',clearProps:'opacity,transform',overwrite:true});
});
viewObserver.observe(main,{childList:true});
motionPreference.addEventListener('change',event=>{if(event.matches&&main.firstElementChild){const nodes=[main.firstElementChild,...main.querySelectorAll('.product-card')];gsap.killTweensOf(nodes);gsap.set(nodes,{clearProps:'opacity,transform'});}});
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
  status.hidden = navigator.onLine;
  status.textContent = navigator.onLine ? '' : 'Você está sem conexão. Reconecte para continuar.';
  syncHeaderGeometry();
}
function renderHeader(route = '') {
  const brand = link([el('img',{src:'/icons/pupi-192.png',alt:'',width:42,height:42,className:'brand-icon'}),el('span',{},'pupi')], '#/loja', { className: 'brand', 'aria-label': 'Pupi, ir à loja' });
  const navigation = el('nav', { className: 'navigation', 'aria-label': 'Navegação principal' });
  const routes = state.user ? [['Meus dados', '/conta'], ['Endereços', '/enderecos'], ['Pedidos', '/pedidos']] : [['Entrar', '/entrar'], ['Criar conta', '/cadastro']];
  routes.unshift(['Loja', '/loja']);
  if (state.user) routes.push(['Carrinho', '/carrinho']);
  if (state.role === 'admin') routes.push(['Administração', '/admin']);
  for (const [label, path] of routes) navigation.append(link(label, `#${path}`, { 'aria-current': route.startsWith(path) ? 'page' : undefined }));
  if (state.user) navigation.append(button([icon(LogOut), 'Sair'], logout, 'ghost'));
  const mobileMenu = el('details', {className:'mobile-menu'}, [
    el('summary', {'aria-label':'Mais opções','aria-expanded':'false','aria-controls':'mobile-navigation'}, [icon(Menu),el('span',{},'Mais')]),
    el('nav', {id:'mobile-navigation',className:'mobile-menu-panel','aria-label':'Links adicionais'}, [
      ...routes.filter(([,path])=>!['/loja','/carrinho','/pedidos','/conta'].includes(path)).map(([label,path])=>link(label,`#${path}`,{'aria-current':route.startsWith(path)?'page':undefined})),
      state.user ? button([icon(LogOut),'Sair'],logout,'ghost') : null,
    ]),
  ]);
  const tabs=[['Loja','/loja',Store],['Carrinho','/carrinho',ShoppingBag],['Pedidos','/pedidos',Package],[state.user?'Conta':'Entrar',state.user?'/conta':'/entrar',UserRound]];
  const bottom=el('nav',{className:'mobile-tabs','aria-label':'Navegação inferior'},tabs.map(([label,path,image])=>
    link([icon(image),el('span',{},label)],`#${path}`,{'aria-current':route.startsWith(path)?'page':undefined})));
  header.replaceChildren(brand, navigation, mobileMenu, bottom);
  mobileMenu.addEventListener('toggle',()=>{mobileMenu.querySelector('summary').setAttribute('aria-expanded',String(mobileMenu.open));syncHeaderGeometry();});
  syncHeaderGeometry();
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
  const changed=location.hash!==target;
  if (changed) history.pushState(null, '', target);
  await render();
  if(changed)window.scrollTo({top:0,behavior:'instant'});
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
      google.prepend(el('img', { className: 'auth-google-mark', src: '/icons/google-logo.png', alt: '', width: 24, height: 24, 'aria-hidden': 'true' }));
      return google;
    },
  };
}
function authLayout(view) {
  return el('div', { className: 'auth-layout' }, view);
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
  '/checkout': 'Revisar pedido', '/carrinho': 'Carrinho', '/conta': 'Meus dados', '/enderecos': 'Meus endereços', '/pedidos': 'Meus pedidos', '/admin': 'Administração', '/aviso': 'Informações de uso' };

async function render() {
  const generation = ++state.generation;
  state.controller?.abort(); state.controller = new AbortController();
  const signal = state.controller.signal;
  const address = new URL((location.hash || '#/loja').slice(1), location.origin);
  const route = address.pathname.replace(/\/$/, '') || '/loja';
  const pageNumber = Number(address.searchParams.get('pagina') || 1);
  const page = Number.isInteger(pageNumber) && pageNumber > 0 ? pageNumber : 1;
  state.currentHash = location.hash || '#/loja';
  const title = routeTitles[route] || (route.startsWith('/enderecos/') ? 'Endereço' : route.startsWith('/pedidos/') ? 'Detalhes do pedido' : 'Página não encontrada');
  document.title = `${title} | Pupi`; notify(''); renderHeader(route);
  const loading=el('div',{className:'loading','aria-label':'Carregando página'});
  main.replaceChildren(loading);
  const stopLoading=startLoading(loading,{message:'Carregando…',signal});
  try {
    if (route === '/loja' || /^\/loja\/[a-z0-9]+(?:-[a-z0-9]+)*$/.test(route)) {
      document.title = 'Loja | Pupi';
      if(!state.user) auth.user().then(async user=>{
        if(!user || generation!==state.generation)return;
        state.user=user;renderHeader(route);
        const role=await repository.role(user.id).catch(()=>null);
        if(role && generation===state.generation && state.user?.id===user.id){state.role=role;renderHeader(route);}
      }).catch(()=>{});
      const addToCart = async (product, quantity) => {
        const user = await auth.user();
        if (!user) {
          state.destination = route;
          await go('/entrar', {force:true});
          notify('Entre na sua conta e selecione a quantidade novamente.');
          return;
        }
        const profile = await repository.getProfile(user.id);
        if (!profile.terms_accepted_at || profile.terms_version !== TEST_NOTICE_VERSION) {
          await go('/conta', {force:true});
          return;
        }
        await cartRepository.setQuantity(user.id, product.id, quantity);
        notify('Quantidade salva no carrinho.', 'success');
      };
      const view = route === '/loja' ? await storeCatalog(catalogRepository, address.searchParams, go, catalogMedia,{signal}) : await storeProduct(catalogRepository, route.slice(6), catalogMedia, address.searchParams, {addToCart, busy});
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
      document.title = 'Informações de uso | Pupi';
      main.replaceChildren(onboardingView({ busy, accept: async () => {
        await repository.acceptTestNotice(); await go('/conta', { force: true }); notify('Sua conta está pronta.', 'success');
      } }));
      return;
    }
    if (publicRoute) { await go('/conta', { force: true }); return; }
    const context = { user, profile, role, repository, busy, announce: notify, go,
      reload: render, refresh: next => { state.profile = next; } };
    let view;
    if (route === '/checkout') {
      const [cart, addresses] = await Promise.all([cartRepository.listItems(user.id, 1, signal), repository.listAddresses(user.id, page, signal)]);
      view = checkoutReview({cart, addresses, page, go, busy, announce:notify, checkout:createCheckoutService(client,user.id)});
    } else if (route === '/carrinho') {
      const data = await cartRepository.listItems(user.id, page, signal);
      if (!data.items.length && page > 1) { await go(`/carrinho?pagina=${page - 1}`, {force:true}); return; }
      view = await cartView({...data, page, go, user, busy, announce: notify, repository: cartRepository, catalogRepository, media: catalogMedia});
    } else if (route === '/conta') view = profileView(context);
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
      if(data && data.payment_status==='pending' && ['confirmed','preparing'].includes(data.status)) {
        view.append(embeddedPaymentPanel({order:data,repository,signal,busy,onPaid:async()=>{await go(`/pedidos/${data.id}`,{force:true});notify('Pagamento aprovado.','success');}}));
      }
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
    stopLoading();
    if (generation === state.generation) main.querySelector('h1')?.focus({ preventScroll: true });
  }
}

document.addEventListener('click', async event => {
  const menu=header.querySelector('.mobile-menu[open]');
  if(menu&&!menu.contains(event.target))menu.open=false;
  const anchor = event.target.closest('a');
  if (anchor?.getAttribute('href') === '#main') { event.preventDefault(); main.focus(); main.scrollIntoView(); return; }
  if (!anchor || anchor.target || !anchor.getAttribute('href')?.startsWith('#/') || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); await go(anchor.getAttribute('href').slice(1));
});
document.addEventListener('keydown',event=>{
  const menu=header.querySelector('.mobile-menu[open]');
  if(event.key==='Escape'&&menu){event.preventDefault();menu.open=false;menu.querySelector('summary').focus();}
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
    catalogRepository=createCatalogRepository(client);cartRepository=createCartRepository(client);catalogMedia=createMediaService(client);adminRepository=createAdminRepository(client);adminMedia=createAdminMediaService(client,adminRepository);
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
          clearPrivateState(); discardChanges(main);
          if (location.hash === '#/loja' || location.hash.startsWith('#/loja/') || location.hash.startsWith('#/loja?')) {
            state.user = current; renderHeader('/loja');
          } else await render();
        }
      }
    });
    await render();
    if (callbackError) notify(toAppError(callbackError).message, 'error');
  } catch (error) {
    state.booting = false;
    document.title = 'Configuração necessária | Pupi';
    main.replaceChildren(el('section', { className: 'panel' }, [heading('Não foi possível conectar à loja', 'Tente novamente em instantes.'),
      el('p', {}, 'Se o problema continuar, entre em contato com a loja.'),
      button('Tentar novamente', () => location.reload(), 'primary')]));
  }
}
start();

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
}
