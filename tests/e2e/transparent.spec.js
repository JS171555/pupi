import {test,expect} from '@playwright/test';
import {installApi,user} from './api.js';
const id='50000000-0000-4000-8000-000000000001';
async function setup(page,{pix=false,legacy=false,delay=0,releaseTest=false,ordersConfigMissing=false}={}) {
 const api=await installApi(page,{signedIn:true});
 api.orders.push({id,order_number:9,user_id:user.id,status:'confirmed',payment_status:'pending',subtotal_cents:3000,shipping_cents:500,total_cents:3500,created_at:'2026-11-05T12:00:00Z',address_snapshot:{recipient:'Pessoa Teste',street:'Rua teste',number:'1',neighborhood:'Centro',city:'São Paulo',state:'SP',postal_code:'01001000'},items:[],shipment:null});
 await page.addInitScript(({pix})=>{
  window.brickUnmounts=0;window.brickSettings=[];
  window.MercadoPago=class {
    bricks(){return {create:async(type,id,settings)=>{
      window.brickSettings.push({type,initialization:settings.initialization,paymentMethods:settings.customization.paymentMethods});
      const node=document.getElementById(id),button=document.createElement('button');button.textContent=pix?'Gerar Pix de teste':'Pagar cartão de teste';button.type='button';
      button.addEventListener('click',()=>settings.callbacks.onSubmit({selectedPaymentMethod:pix?'bank_transfer':'credit_card',formData:{payment_method_id:pix?'pix':'master',token:'a'.repeat(32),installments:1,payer:{email:'buyer@example.test',identification:{type:'CPF',number:'12345678909'}}}}));node.append(button);settings.callbacks.onReady();
      return {unmount:async()=>{window.brickUnmounts++;node.replaceChildren();}};
    }}};
  };
 },{pix});
 const requests=[];let submission=releaseTest?{state:'failed',result:{status:'failed',reason:'test_attempt_released'}}:null;
 await page.route('**/functions/v1/pupi-mercadopago-checkout',async route=>{
   const body=route.request().postDataJSON();requests.push(body);
   if(ordersConfigMissing)return route.fulfill({status:503,json:{code:'CONFIG_ORDERS_CREDENTIALS'}});
   if(legacy)return route.fulfill({status:409,json:{code:'LEGACY_PAYMENT'}});
   if(body.action==='pay'){if(delay)await new Promise(resolve=>setTimeout(resolve,delay));submission={state:pix?'pending':'paid',result:{payment_id:'123',status:pix?'pending':'paid',...(pix?{qr_code:'pix-copia-e-cola-teste'}:{})}};if(!pix)api.orders[0].payment_status='paid';}
   if(body.action==='refresh'){api.orders[0].payment_status='paid';submission={state:'paid',result:{payment_id:'123',status:'paid'}};}
   return route.fulfill({status:200,json:{code:'READY',public_key:'TEST-12345678-1234-1234-1234-123456789012',total_cents:3500,payment_status:api.orders[0].payment_status,submission}});
 });
 await page.goto(`/#/pedidos/${id}`);return {api,requests};
}
test('cartão paga na própria tela sem redirecionar e bloqueia envio repetido',async({page})=>{
 const {requests}=await setup(page,{delay:500});await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();
 const pay=page.getByRole('button',{name:'Pagar cartão de teste'});await expect(pay).toBeVisible();await pay.dblclick();
 await expect(page.getByText('Pagamento aprovado.',{exact:true})).toBeVisible();expect(page.url()).toContain(`/#/pedidos/${id}`);expect(requests.filter(body=>body.action==='pay')).toHaveLength(1);
 expect(requests.find(body=>body.action==='pay').form_data.card_number).toBeUndefined();expect(requests.find(body=>body.action==='pay').form_data.payment_type_id).toBe('credit_card');
 const settings=await page.evaluate(()=>window.brickSettings[0]);expect(settings.type).toBe('payment');expect(settings.initialization.preferenceId).toBeUndefined();expect(settings.paymentMethods.mercadoPago).toBeUndefined();
});
test('Pix exibe código dentro do Pupi, recupera na recarga e verifica confirmação',async({page})=>{
 await setup(page,{pix:true});await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();await page.getByRole('button',{name:'Gerar Pix de teste'}).click();
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
 await expect(page.getByText('Tentativa de teste encerrada após conferência. Você pode preencher os dados novamente.')).toBeVisible();
 expect(requests.some(body=>body.action==='pay')).toBe(false);
 await page.getByRole('button',{name:'Tentar novamente',exact:true}).press('Enter');
 await expect(page.getByRole('button',{name:'Pagar cartão de teste'})).toBeVisible();
 await page.getByRole('button',{name:'Pagar cartão de teste'}).click();await expect(page.getByText('Pagamento aprovado.',{exact:true})).toBeVisible();
 expect(page.url()).toContain(`/#/pedidos/${id}`);expect(requests.filter(body=>body.action==='pay')).toHaveLength(1);
});

test('credenciais Orders incompatíveis mostram orientação antes de abrir campos do cartão',async({page})=>{
 const {requests}=await setup(page,{ordersConfigMissing:true});await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();
 await expect(page.getByText('Para testes na API Orders, a loja precisa usar a Public Key e o Access Token da conta vendedora de teste.')).toBeVisible();
 expect(await page.evaluate(()=>window.brickSettings.length)).toBe(0);expect(requests.some(body=>body.action==='pay')).toBe(false);
});
