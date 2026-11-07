import {test,expect} from '@playwright/test';
import {installApi,validPassword} from './api.js';

const P1='20000000-0000-4000-8000-000000000001',P2='20000000-0000-4000-8000-000000000002';
const O1='50000000-0000-4000-8000-000000000001',O2='50000000-0000-4000-8000-000000000002';
const CAT='10000000-0000-4000-8000-000000000001';
const product={id:P1,category_id:CAT,slug:'bola',name:'Bola',title:'',description:'Bola para brincar.',short_description:'',price_cents:2000,sale_price_cents:null,stock_quantity:5};
const photo=id=>`${id}/60000000-0000-4000-8000-000000000001.png`;

async function setup(page){
  const api=await installApi(page,{signedIn:true});
  api.orders.push(...[O1,O2].map((id,index)=>({id,order_number:index+1,status:'confirmed',payment_status:'paid',subtotal_cents:2000,shipping_cents:0,total_cents:2000,created_at:'2026-11-05T12:00:00Z',
    address_snapshot:{recipient:'Pessoa',street:'Rua',number:'1',neighborhood:'Centro',city:'São Paulo',state:'SP',postal_code:'01001000'},
    items:[{id:`item-${index}`,product_id:index?P2:P1,product_name:index?'Ração':'Bola',product_sku:`SKU-${index}`,quantity:1,unit_price_cents:2000,line_total_cents:2000}]})));
  const encoded=await page.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=128;const paint=canvas.getContext('2d');paint.fillStyle='#DDD2FF';paint.fillRect(0,0,128,128);paint.fillStyle='#6D42B5';paint.beginPath();paint.arc(64,64,35,0,Math.PI*2);paint.fill();return canvas.toDataURL('image/png').split(',')[1];});
  await page.route('https://pupi-test.supabase.co/rest/v1/**',async route=>{
    const request=route.request(),url=new URL(request.url());const object=request.headers().accept?.includes('vnd.pgrst.object');
    let value;
    if(url.pathname.endsWith('/products'))value=object?product:[product];
    else if(url.pathname.endsWith('/categories'))value=object?{id:CAT,name:'Brinquedos'}:[{id:CAT,name:'Brinquedos'}];
    else if(url.pathname.endsWith('/product_images')){
      const filter=url.searchParams.get('product_id')||'';
      value=[P1,P2].filter(id=>filter.includes(id)).map(id=>({id:`image-${id}`,product_id:id,storage_path:photo(id),alt_text:id===P1?'Bola':'Ração',is_primary:true,sort_order:0}));
    }else return route.fallback();
    return route.fulfill({json:value});
  });
  await page.route('https://pupi-test.supabase.co/storage/v1/object/sign/product-images/**',async route=>{
    if(route.request().method()==='POST')return route.fulfill({json:{signedURL:new URL(route.request().url()).pathname.replace('/storage/v1','')+'?token=e2e'}});
    return route.fulfill({contentType:'image/png',body:Buffer.from(encoded,'base64')});
  });
  return api;
}

test('pedidos usam a foto do produto correto, também nos detalhes, com fallback sem bloquear o histórico',async({page})=>{
  await setup(page);await page.setViewportSize({width:390,height:844});await page.goto('/#/pedidos');
  const cards=page.locator('.order-list-card');await expect(cards).toHaveCount(2);
  await expect(cards.nth(0).getByRole('img',{name:'Bola',exact:true})).toHaveAttribute('src',new RegExp(P1));
  await expect(cards.nth(1).getByRole('img',{name:'Ração',exact:true})).toHaveAttribute('src',new RegExp(P2));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'work/order-product-photos-mobile.png'});
  await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'work/order-product-photos-desktop.png'});
  await cards.nth(1).getByRole('link',{name:'Ver detalhes',exact:true}).click();
  await expect(page.locator('.order-line-item').getByRole('img',{name:'Ração',exact:true})).toHaveAttribute('src',new RegExp(P2));
  await page.getByRole('link',{name:'Voltar aos pedidos',exact:true}).click();
  const first=cards.nth(0).locator('.order-product-photo img');await expect(first).toBeVisible();
  await first.evaluate(img=>img.dispatchEvent(new Event('error')));
  await expect(cards.nth(0).getByRole('img',{name:'Imagem indisponível: Bola',exact:true})).toBeVisible();
  await expect(cards.nth(0).getByRole('link',{name:'Ver detalhes',exact:true})).toBeVisible();
});

test('detalhe do produto remove disponível e espaço vazio, mantendo validação e indisponibilidade',async({page})=>{
  await setup(page);await page.setViewportSize({width:390,height:844});await page.goto('/#/loja/bola');
  const form=page.getByRole('form',{name:'Quantidade no carrinho'});await expect(form).toBeVisible();
  await expect(page.getByText('Disponível',{exact:true})).toHaveCount(0);
  await expect(form.locator('.form-status')).toBeHidden();
  const area=await page.locator('.store-product-purchase').boundingBox(),save=await form.getByRole('button',{name:'Salvar no carrinho'}).boundingBox();
  expect(area.y+area.height-save.y-save.height).toBeLessThan(20);
  expect(Math.abs(area.x+area.width/2-save.x-save.width/2)).toBeLessThan(1);
  await form.getByLabel(/^Quantidade/).fill('0');await form.getByRole('button',{name:'Salvar no carrinho'}).click();
  await expect(form.locator('.form-status')).toBeVisible();await expect(form.locator('.form-status')).toContainText('Informe uma quantidade');
  product.stock_quantity=0;await page.reload();await expect(page.getByText('Indisponível',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Salvar no carrinho'})).toHaveCount(0);product.stock_quantity=5;
});

test('olho de senha funciona no login, cadastro e confirmação com teclado e movimento reduzido',async({page})=>{
  await installApi(page);await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  for(const route of ['entrar','cadastro']){
    await page.goto('/#/'+route);
    const password=page.getByLabel(/^Senha/),toggle=page.getByRole('button',{name:'Mostrar senha',exact:true});
    await password.fill(validPassword);await password.evaluate(input=>input.setSelectionRange(2,7));
    const icon=await toggle.locator('svg').innerHTML();
    await expect(toggle).toHaveAttribute('aria-pressed','false');await expect(toggle).toHaveText('');
    await toggle.focus();await page.keyboard.press('Enter');
    await expect(password).toHaveAttribute('type','text');await expect(password).toHaveValue(validPassword);
    const visible=page.getByRole('button',{name:'Ocultar senha',exact:true});await expect(visible).toHaveAttribute('aria-pressed','true');
    expect(await visible.locator('svg').innerHTML()).not.toBe(icon);expect(await visible.locator('svg').evaluate(el=>getComputedStyle(el).transform)).toBe('none');
    expect(await password.evaluate(input=>[input.selectionStart,input.selectionEnd])).toEqual([2,7]);
    await visible.click();await expect(password).toHaveAttribute('type','password');
    const box=await toggle.boundingBox();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
    if(route==='cadastro'){
      await page.getByRole('button',{name:'Mostrar confirmação de senha',exact:true}).click();
      await expect(page.getByLabel(/^Confirme a senha/)).toHaveAttribute('type','text');
      await expect(password).toHaveAttribute('type','password');
    }
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:`work/password-eye-${route}-mobile.png`});
  }
});
