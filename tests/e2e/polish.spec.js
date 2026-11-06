import {test,expect} from '@playwright/test';
import {installApi} from './api.js';

const oldCopy=/ambiente de testes?|aviso de testes?|para testar|próximas fases|testing-v1/i;
test('conta, cadastro e informações de uso têm conteúdo de produto sem banners de desenvolvimento',async({page})=>{
 await installApi(page);
 for(const route of ['entrar','cadastro','recuperar','aviso']){
  await page.goto(`/#/${route}`);await expect(page.locator('#main h1')).toBeVisible();await expect(page.locator('#connection-status')).toBeHidden();await expect(page.locator('body')).not.toContainText(oldCopy);
 }
 await expect(page.getByText(/não substitui esses documentos/)).toBeVisible();
});

test('navegação mobile continua acessível com rolagem, Escape e notificações no canto',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await installApi(page,{signedIn:true});await page.goto('/#/enderecos/novo');await expect(page.getByLabel('CEP')).toBeVisible();
 await page.evaluate(()=>scrollTo(0,400));await expect.poll(async()=>Math.round((await page.locator('#header').boundingBox()).y)).toBe(0);
 await page.getByLabel('Mais opções').click();await expect(page.getByRole('navigation',{name:'Links adicionais'})).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.mobile-menu')).not.toHaveAttribute('open','');await expect(page.getByLabel('Mais opções')).toBeFocused();
 await page.evaluate(async()=>{const {notify}=await import('/src/ui/feedback.js');notify('Endereço salvo.','success');});const box=await page.locator('.feedback-card').boundingBox(),header=await page.locator('#header').boundingBox();expect(box.y).toBeGreaterThanOrEqual(header.height+8);expect(box.x).toBeGreaterThanOrEqual(16);expect(box.x+box.width).toBeLessThanOrEqual(390);expect(box.height).toBeLessThan(120);await expect(page.locator('.feedback-card h2')).toHaveCount(0);
 await page.screenshot({path:'work/polish-mobile-notification.png',fullPage:false});
 await page.getByLabel('Mais opções').click();await expect.poll(async()=>{const card=await page.locator('.feedback-card').boundingBox(),menu=await page.locator('.mobile-menu-panel').boundingBox();return card.y-menu.y-menu.height;}).toBeGreaterThanOrEqual(8);await page.keyboard.press('Escape');await expect(page.locator('.feedback-card')).toBeVisible();await page.getByRole('button',{name:'Fechar aviso'}).click();
 await page.getByRole('link',{name:'Pedidos',exact:true}).click();await expect(page.getByRole('heading',{name:'Meus pedidos',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Explorar a loja',exact:true})).toBeVisible();expect(await page.evaluate(()=>scrollY)).toBe(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('body')).not.toContainText(oldCopy);
});

test('filtros sem resultado oferecem recuperação e catálogo vazio tem orientação própria',async({page})=>{
 await page.setViewportSize({width:390,height:844});await installApi(page);await page.route('**/rest/v1/categories*',route=>route.fulfill({json:[]}));await page.route('**/rest/v1/products*',route=>route.fulfill({json:[]}));await page.route('**/rest/v1/product_images*',route=>route.fulfill({json:[]}));
 await page.goto('/#/loja?busca=ausente');await expect(page.getByRole('heading',{name:'Nenhum produto encontrado'})).toBeVisible();await expect(page.getByRole('link',{name:'Limpar filtros'})).toBeVisible();await page.getByRole('link',{name:'Ver todos os produtos'}).click();await expect(page.getByRole('heading',{name:'Novidades a caminho'})).toBeVisible();expect(page.url()).toContain('/#/loja');await expect(page.getByRole('link',{name:'Limpar filtros'})).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('notificações não se acumulam, não roubam foco e acompanham a altura do menu em zoom',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await installApi(page,{signedIn:true});await page.goto('/#/conta');await page.getByLabel('Nome completo').focus();
 await page.evaluate(async()=>{const {notify}=await import('/src/ui/feedback.js');notify('Alterações salvas.','success');notify('Alterações salvas.','success');notify('Sua conta está atualizada.');});await expect(page.locator('.feedback-card')).toHaveCount(1);await expect(page.getByLabel('Nome completo')).toBeFocused();
 await page.setViewportSize({width:768,height:800});await page.addStyleTag({content:'html {font-size:150%;}'});await expect.poll(async()=>{const card=await page.locator('.feedback-card').boundingBox(),header=await page.locator('#header').boundingBox();return card.y-header.height;}).toBeGreaterThanOrEqual(8);await page.keyboard.press('Escape');await expect(page.locator('.feedback-card')).toHaveCount(0);
});

test('formulários mantêm reflow em quatro larguras e seleção de UF pelo teclado',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await installApi(page,{signedIn:true});
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:700});await page.goto('/#/enderecos/novo');await expect(page.getByLabel('Destinatário')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 const state=page.getByRole('combobox', {name:'UF',exact:true});await state.focus();await state.press('Alt+ArrowDown');await page.screenshot({path:'work/polish-native-select.png',fullPage:false});await state.press('End');await state.press('Enter');await expect(state).toHaveValue('TO');
});
