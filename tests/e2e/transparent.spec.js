import {test,expect} from '@playwright/test';
import {installApi,user} from './api.js';
const id='50000000-0000-4000-8000-000000000001';
async function setup(page,{pix=false,legacy=false,delay=0,releaseTest=false,ordersConfigMissing=false,testMode=false,challenge=false,expired=false,review=false,autoApprove=true}={}) {
 const challengeUrl='https://www.mercadopago.com.br/auth/card/validation/e2e?guest_token=test-only';
 await page.route('https://www.mercadopago.com.br/auth/card/validation/**',route=>route.fulfill({contentType:'text/html',body:'<button onclick="parent.postMessage({status: &quot;COMPLETE&quot;}, &quot;*&quot;)">Concluir desafio</button>'}));
 const api=await installApi(page,{signedIn:true});
 api.orders.push({id,order_number:9,user_id:user.id,status:'confirmed',payment_status:'pending',subtotal_cents:3000,shipping_cents:500,total_cents:3500,created_at:'2026-11-05T12:00:00Z',address_snapshot:{recipient:'Pessoa Teste',street:'Rua teste',number:'1',neighborhood:'Centro',city:'São Paulo',state:'SP',postal_code:'01001000'},items:[],shipment:null});
 await page.addInitScript(({pix})=>{
  window.brickUnmounts=0;window.brickSettings=[];
  window.MercadoPago=class {
    bricks(){return {create:async(type,id,settings)=>{
      window.brickSettings.push({type,initialization:settings.initialization,paymentMethods:settings.customization.paymentMethods});
      const node=document.getElementById(id),button=document.createElement('button');button.textContent=pix?'Gerar Pix de teste':'Pagar cartão de teste';button.type='button';
      button.addEventListener('click',()=>settings.callbacks.onSubmit({selectedPaymentMethod:pix?'bank_transfer':'credit_card',formData:pix?{payment_method_id:'pix',payer:{email:'buyer@example.test'}}:{payment_method_id:'master',token:'a'.repeat(32),installments:1,payer:{email:'buyer@example.test',identification:{type:'CPF',number:'12345678909'}}}}));node.append(button);settings.callbacks.onReady();
      return {unmount:async()=>{window.brickUnmounts++;node.replaceChildren();}};
    }}};
  };
 },{pix});
 const requests=[];let approved=false;let submission=releaseTest?{state:'failed',result:{status:'failed',reason:'test_attempt_released'}}:null;
 await page.route('**/functions/v1/pupi-mercadopago-checkout',async route=>{
   const body=route.request().postDataJSON();requests.push(body);
   if(ordersConfigMissing)return route.fulfill({status:503,json:{code:'CONFIG_ORDERS_CREDENTIALS'}});
   if(legacy)return route.fulfill({status:409,json:{code:'LEGACY_PAYMENT'}});
   if(body.action==='pay'){if(delay)await new Promise(resolve=>setTimeout(resolve,delay));submission={state:review?'review':pix||challenge?'pending':'paid',result:{payment_id:'123',status:review?'review':pix||challenge?'pending':'paid',...(pix?{qr_code:'pix-copia-e-cola-teste',...(expired?{expires_at:'2020-01-01T00:00:00Z'}:{})}:{}),...(challenge?{requires_action:true}:{})}};if(!pix&&!challenge)api.orders[0].payment_status='paid';}
   if(body.action==='refresh'&&(autoApprove||approved)){api.orders[0].payment_status='paid';submission={state:'paid',result:{payment_id:'123',status:'paid'}};}
   return route.fulfill({status:200,json:{code:'READY',test_mode:testMode,public_key:'TEST-12345678-1234-1234-1234-123456789012',total_cents:3500,payment_status:api.orders[0].payment_status,submission,...(challenge&&submission?.result?.requires_action?{action:{type:'three_ds',url:challengeUrl}}:{})}});
 });
 await page.goto(`/#/pedidos/${id}`);return {api,requests,approve:()=>{approved=true;}};
}
test('cartão paga na própria tela sem redirecionar e bloqueia envio repetido',async({page})=>{
 const {requests}=await setup(page,{delay:500});await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();
 const pay=page.getByRole('button',{name:'Pagar cartão de teste'});await expect(pay).toBeVisible();await pay.dblclick();
 await expect(page.getByText('Pagamento aprovado.',{exact:true})).toBeVisible();expect(page.url()).toContain(`/#/pedidos/${id}`);expect(requests.filter(body=>body.action==='pay')).toHaveLength(1);
 expect(requests.find(body=>body.action==='pay').form_data.card_number).toBeUndefined();expect(requests.find(body=>body.action==='pay').form_data.payment_type_id).toBe('credit_card');
 const settings=await page.evaluate(()=>window.brickSettings[0]);expect(settings.type).toBe('payment');expect(settings.initialization.preferenceId).toBeUndefined();expect(settings.paymentMethods.mercadoPago).toBeUndefined();
});
test('Pix exibe código dentro do Pupi, recupera na recarga e verifica confirmação',async({page})=>{
 const {requests}=await setup(page,{pix:true});await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();await page.getByRole('button',{name:'Gerar Pix de teste'}).click();
 expect(requests.find(body=>body.action==='pay').form_data.payer.identification).toBeUndefined();expect(requests.find(body=>body.action==='pay').form_data.token).toBeUndefined();
 await expect(page.getByLabel('Código Pix copia e cola')).toHaveValue('pix-copia-e-cola-teste');await page.reload();await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();
 await expect(page.getByLabel('Código Pix copia e cola')).toHaveValue('pix-copia-e-cola-teste');await page.getByRole('button',{name:'Verificar pagamento',exact:true}).click();await expect(page.getByText('Pagamento aprovado.',{exact:true})).toBeVisible();
});
test('pedido com checkout externo anterior não abre outro formulário nem redireciona',async({page})=>{
 await setup(page,{legacy:true});await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();await expect(page.getByText(/Este pedido já abriu um pagamento externo/)).toBeVisible();expect(await page.evaluate(()=>window.brickSettings.length)).toBe(0);expect(page.url()).toContain(`/#/pedidos/${id}`);
});
test('sair da tela desmonta o formulário do provedor',async({page})=>{
 await setup(page);await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();await expect(page.getByRole('button',{name:'Pagar cartão de teste'})).toBeVisible();await page.getByRole('link',{name:'Pedidos',exact:true}).click();expect(await page.evaluate(()=>window.brickUnmounts)).toBe(1);
});

test('falha ao carregar SDK mantém o pedido e permite tentar novamente',async({page})=>{
 await setup(page);await page.evaluate(()=>{delete window.MercadoPago;});await page.route('https://sdk.mercadopago.com/**',route=>route.abort());await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();
 await expect(page.getByText('Não foi possível carregar o formulário de pagamento. Tente novamente.')).toBeVisible();await expect(page.getByRole('button',{name:'Tentar carregar novamente'})).toBeVisible();expect(page.url()).toContain(`/#/pedidos/${id}`);
});

test('tentativa de teste conferida reabre formulário no mesmo pedido sem cobrança automática',async({page})=>{
 await page.setViewportSize({width:390,height:844});const {requests}=await setup(page,{releaseTest:true});
 await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();
 await expect(page.getByText('Tentativa encerrada após conferência. Você pode preencher os dados novamente.')).toBeVisible();
 expect(requests.some(body=>body.action==='pay')).toBe(false);
 await page.getByRole('button',{name:'Tentar novamente',exact:true}).press('Enter');
 await expect(page.getByRole('button',{name:'Pagar cartão de teste'})).toBeVisible();
 await page.getByRole('button',{name:'Pagar cartão de teste'}).click();await expect(page.getByText('Pagamento aprovado.',{exact:true})).toBeVisible();
 expect(page.url()).toContain(`/#/pedidos/${id}`);expect(requests.filter(body=>body.action==='pay')).toHaveLength(1);
});

test('credenciais Orders incompatíveis mostram orientação antes de abrir campos do cartão',async({page})=>{
 const {requests}=await setup(page,{ordersConfigMissing:true});await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();
 await expect(page.getByText('O pagamento está indisponível. A loja precisa conferir a conta usada para receber.')).toBeVisible();
 expect(await page.evaluate(()=>window.brickSettings.length)).toBe(0);expect(requests.some(body=>body.action==='pay')).toBe(false);
});

test('Pix no sandbox identifica simulação e confirma sem instruir pagamento pelo banco',async({page})=>{
 await page.setViewportSize({width:390,height:844});const {requests}=await setup(page,{pix:true,testMode:true});
 await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();await page.getByRole('button',{name:'Gerar Pix de teste'}).click();
 await expect(page.getByRole('heading',{name:'Pague com Pix',exact:true})).toBeVisible();await expect(page.getByText(/Este código não gera uma cobrança real/)).toBeVisible();await expect(page.getByLabel('Código Pix copia e cola')).toHaveValue('pix-copia-e-cola-teste');
 await page.reload();await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();await expect(page.getByRole('heading',{name:'Pague com Pix',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Verificar pagamento',exact:true}).click();await expect(page.getByText('Pagamento aprovado.',{exact:true})).toBeVisible();expect(requests.filter(body=>body.action==='pay')).toHaveLength(1);
});

test('Pix acompanha confirmação automaticamente sem reenviar cobrança',async({page})=>{
 await page.clock.install();const {requests}=await setup(page,{pix:true});await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();await page.getByRole('button',{name:'Gerar Pix de teste'}).click();await expect(page.getByLabel('Código Pix copia e cola')).toBeVisible();
 await page.clock.fastForward(8100);await expect(page.getByText('Pagamento aprovado.',{exact:true})).toBeVisible();expect(requests.filter(r=>r.action==='pay')).toHaveLength(1);expect(requests.filter(r=>r.action==='refresh')).toHaveLength(1);
});
test('Pix vencido não permite copiar nem gera cobrança automática e para consultas ao sair',async({page})=>{
 await page.clock.install();const {requests}=await setup(page,{pix:true,expired:true,autoApprove:false});await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();await page.getByRole('button',{name:'Gerar Pix de teste'}).click();await expect(page.getByRole('heading',{name:'Pix vencido'})).toBeVisible();await expect(page.getByRole('button',{name:'Copiar código Pix'})).toHaveCount(0);
 await page.getByRole('button',{name:'Verificar pagamento',exact:true}).click();await expect(page.getByRole('heading',{name:'Pix vencido'})).toBeVisible();await page.getByRole('link',{name:'Pedidos',exact:true}).click();const before=requests.length;await page.clock.fastForward(30000);expect(requests.length).toBe(before);expect(requests.filter(r=>r.action==='pay')).toHaveLength(1);
});
test('3DS permanece dentro do Pupi, recupera desafio e só aprova após consulta ao servidor',async({page})=>{
 await page.setViewportSize({width:390,height:844});const {requests,approve}=await setup(page,{challenge:true,autoApprove:false});await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();await page.getByRole('button',{name:'Pagar cartão de teste'}).click();
 const frame=page.frameLocator('iframe[title="Autenticação do cartão no banco"]');await expect(frame.getByRole('button',{name:'Concluir desafio'})).toBeVisible();
 await expect(page.locator('.payment-panel .form-status')).not.toHaveAttribute('aria-busy','true');
 await page.screenshot({path:'work/payment-3ds-mobile.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const before=requests.length;await page.evaluate(()=>window.postMessage({status:'COMPLETE'},'*'));await page.waitForTimeout(100);expect(requests.length).toBe(before);
 await page.locator('iframe[title="Autenticação do cartão no banco"]').evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));
 await frame.getByRole('button',{name:'Concluir desafio'}).click();await expect.poll(()=>requests.filter(r=>r.action==='refresh').length).toBe(1);await expect(page.getByText('Pagamento aprovado.',{exact:true})).toHaveCount(0);await expect(frame.getByRole('button',{name:'Concluir desafio'})).toBeVisible();
 await page.reload();await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();await expect(frame.getByRole('button',{name:'Concluir desafio'})).toBeVisible();approve();await page.locator('iframe[title="Autenticação do cartão no banco"]').evaluate(node=>node.scrollIntoView({block:'center',behavior:'instant'}));await frame.getByRole('button',{name:'Concluir desafio'}).click();await expect(page.getByText('Pagamento aprovado.',{exact:true})).toBeVisible();expect(requests.filter(r=>r.action==='pay')).toHaveLength(1);expect(page.url()).toContain(`/#/pedidos/${id}`);
});
test('conferência tem prioridade sobre estado público pago e não exibe aprovação',async({page})=>{
 await setup(page,{review:true,autoApprove:false});await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();await page.getByRole('button',{name:'Pagar cartão de teste'}).click();await expect(page.getByRole('heading',{name:'Pagamento em conferência'})).toBeVisible();await expect(page.getByText('Pagamento aprovado.',{exact:true})).toHaveCount(0);
});
