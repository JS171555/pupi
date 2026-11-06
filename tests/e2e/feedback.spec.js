import {test,expect} from '@playwright/test';
import {installApi} from './api.js';

async function open(page){await installApi(page,{signedIn:true});await page.goto('/#/conta');await expect(page.getByRole('heading',{name:'Meus dados',exact:true})).toBeVisible();}

test('notificação fica abaixo do menu, pausa com foco e mantém erro até fechar',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await open(page);await page.clock.install();await page.getByLabel('Nome completo').focus();
  const heading=await page.getByRole('heading',{name:'Meus dados',exact:true}).boundingBox();
  await page.evaluate(async()=>{const {notify}=await import('/src/ui/feedback.js');notify('Alterações salvas.','success');});
  const card=page.locator('.feedback-card');await expect(card).toBeVisible();const box=await card.boundingBox(),header=await page.locator('#header').boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(header.y+header.height+8);expect(box.x).toBeGreaterThan(700);expect(box.height).toBeLessThan(110);expect(await page.getByRole('heading',{name:'Meus dados',exact:true}).boundingBox()).toEqual(heading);
  await expect(card.locator('h2')).toHaveCount(0);await page.getByRole('button',{name:'Fechar aviso'}).focus();await page.clock.fastForward(5000);await expect(card).toBeVisible();
  await page.getByLabel('Nome completo').focus();await page.clock.fastForward(4100);await expect(card).toHaveCount(0);
  await page.evaluate(async()=>{const {notify}=await import('/src/ui/feedback.js');notify('Não foi possível salvar. Tente novamente.','error');});
  await page.clock.fastForward(12000);await expect(card).toBeVisible();await expect(page.locator('#feedback')).toHaveAttribute('role','alert');await page.getByRole('button',{name:'Fechar aviso'}).click();await expect(card).toHaveCount(0);await expect(page.getByLabel('Nome completo')).toBeFocused();
});

test('confirmação mantém aviso pendente até concluir e preserva erro no diálogo',async({page})=>{
  await open(page);
  await page.evaluate(async()=>{const {notify,confirmAction}=await import('/src/ui/feedback.js');window.result=confirmAction({title:'Confirmar teste?',description:'Verificar sequência de avisos.',confirmLabel:'Confirmar teste',onConfirm:async()=>{notify('Operação de teste concluída.','success');await new Promise(resolve=>{window.release=resolve;});}});});
  await page.getByRole('button',{name:'Confirmar teste',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await expect(page.locator('.feedback-card')).toHaveCount(0);
  await page.evaluate(()=>window.release());await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.getByText('Operação de teste concluída.')).toBeVisible();
});

test('salvamento mostra loading estável e impede duplicação',async({page})=>{
  const api=await installApi(page,{signedIn:true});api.saveDelay=1400;await page.goto('/#/conta');await page.getByLabel('Nome completo').fill('Pessoa atualizada');
  const submit=page.getByRole('button',{name:'Salvar alterações',exact:true});const before=await submit.boundingBox();await submit.click();
  await expect(submit).toBeDisabled();await expect(submit).toHaveAttribute('aria-busy','true');await expect(submit.locator('.button-progress')).toHaveCount(1);await expect(page.locator('form .loading-indicator')).toHaveCount(0);await expect(page.locator('form .form-status')).toHaveText('');const during=await submit.boundingBox();expect(Math.abs(before.width-during.width)).toBeLessThan(1);expect(Math.abs(before.height-during.height)).toBeLessThan(1);
  await expect(page.getByText('Alterações salvas.',{exact:true})).toBeVisible();await expect(submit).toBeEnabled();await expect(submit).not.toHaveAttribute('aria-busy','true');
});

test('mobile tem fontes locais, ícones maiores e aviso acessível sem movimento',async({page})=>{
  await page.setViewportSize({width:320,height:740});await page.emulateMedia({reducedMotion:'reduce'});await open(page);await page.evaluate(()=>document.fonts.ready);
  expect(await page.locator('body').evaluate(node=>getComputedStyle(node).fontFamily)).toContain('DM Sans');
  const icons=page.locator('.mobile-tabs a svg');expect(await icons.first().evaluate(node=>getComputedStyle(node).width)).toBe('28px');
  await page.evaluate(async()=>{const {notify}=await import('/src/ui/feedback.js');notify('Aviso para conferir no celular.');});
  const card=page.locator('.feedback-card');await expect(card).toBeVisible();expect(await card.evaluate(node=>getComputedStyle(node).transform)).toBe('none');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'work/feedback-mobile.png',fullPage:false});
});

test('loading rápido ou cancelado não deixa indicadores atrasados',async({page})=>{
  await open(page);
  await page.evaluate(async()=>{
    const {startLoading}=await import('/src/ui/loading.js');
    const first=document.createElement('div');first.id='fast-loader';document.body.append(first);startLoading(first)();
    const second=document.createElement('div');second.id='aborted-loader';document.body.append(second);const controller=new AbortController();startLoading(second,{signal:controller.signal});controller.abort();
  });
  await page.waitForTimeout(350);await expect(page.locator('#fast-loader .loading-indicator,#aborted-loader .loading-indicator')).toHaveCount(0);await expect(page.locator('#aborted-loader')).not.toHaveAttribute('aria-busy','true');
});

test('cartão com texto longo cabe em quatro tamanhos de tela e com texto ampliado',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await open(page);
  for(const width of [320,390,768,1440]) {
    await page.setViewportSize({width,height:800});
    await page.evaluate(async()=>{const {notify}=await import('/src/ui/feedback.js');notify('Confira os dados e tente novamente. '.repeat(30),'error');});
    const card=page.locator('.feedback-card');await expect(card).toBeVisible();const box=await card.boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y).toBeGreaterThanOrEqual(0);expect(box.width).toBeLessThanOrEqual(width-32);expect(box.height).toBeLessThanOrEqual(760);
  }
  await page.setViewportSize({width:320,height:800});await page.addStyleTag({content:'html {font-size:200%;}'});expect(await page.locator('.feedback-message').evaluate(node=>node.scrollHeight>node.clientHeight)).toBe(true);await expect(page.getByRole('button',{name:'Fechar aviso'})).toBeInViewport();
});

test('loading compartilhado mantém uma pata no botão e não cria indicador abaixo',async({page})=>{
 await open(page);await page.evaluate(async()=>{
  const {startLoading,buttonLoading}=await import('/src/ui/loading.js');const control=document.querySelector('button[type="submit"]'),host=document.querySelector('form .form-status');window.endFirst=startLoading(host,{button:control});window.endSecond=buttonLoading(control);
 });
 const submit=page.getByRole('button',{name:'Salvar alterações',exact:true});await expect(submit.locator('.button-progress')).toHaveCount(1);await expect(page.locator('form .loading-indicator')).toHaveCount(0);await expect(page.locator('form .form-status')).toHaveText('');await page.evaluate(()=>window.endFirst());await expect(submit.locator('.button-progress')).toHaveCount(1);await page.evaluate(()=>window.endSecond());await expect(submit.locator('.button-progress')).toHaveCount(0);await expect(submit).not.toHaveAttribute('aria-busy','true');
});
