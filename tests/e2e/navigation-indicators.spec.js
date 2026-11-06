import {test,expect} from '@playwright/test';
import {installApi} from './api.js';

const cartDot=page=>page.locator('.mobile-tabs [data-nav-indicator="cart"] .nav-notification-dot');
const orderDot=page=>page.locator('.mobile-tabs [data-nav-indicator="orders"] .nav-notification-dot');
const product={id:'20000000-0000-4000-8000-000000000001',category_id:'10000000-0000-4000-8000-000000000001',name:'Bola',slug:'bola',price_cents:2000,sale_price_cents:null,stock_quantity:5,active:true,status:'published',categories:{active:true}};

test('bolinha do carrinho aparece após incluir produto e some ao remover o último item',async({page})=>{
  const api=await installApi(page,{signedIn:true});await page.setViewportSize({width:390,height:844});
  await page.route('https://pupi-test.supabase.co/rest/v1/**',async route=>{
    const request=route.request(),url=new URL(request.url());const object=request.headers().accept?.includes('vnd.pgrst.object');let data;
    if(url.pathname.endsWith('/products'))data=object?product:[product];
    else if(url.pathname.endsWith('/categories'))data=object?{id:product.category_id,name:'Brinquedos'}:[{id:product.category_id,name:'Brinquedos'}];
    else if(url.pathname.endsWith('/product_images'))data=[];
    else if(url.pathname.endsWith('/cart_items')){
      if(request.method()==='POST'){
        api.cartItems.push({id:'40000000-0000-4000-8000-000000000001',product_id:product.id,quantity:request.postDataJSON().quantity,updated_at:'2026-11-05T12:00:00Z',products:product});data=null;
      }else if(request.method()==='DELETE'){data=api.cartItems.map(({id})=>({id}));api.cartItems=[];}
      else data=api.cartItems;
    }else return route.fallback();
    return route.fulfill({json:data});
  });
  await page.goto('/#/loja/bola');await expect(page.getByRole('heading',{name:'Bola',exact:true})).toBeVisible();
  await expect(cartDot(page)).toBeHidden();await page.getByRole('button',{name:'Salvar no carrinho',exact:true}).click();
  await expect(cartDot(page)).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Navegação inferior'}).getByRole('link',{name:'Carrinho',exact:true})).toHaveAttribute('aria-describedby','nav-cart-notice');
  await page.getByRole('navigation',{name:'Navegação inferior'}).getByRole('link',{name:'Carrinho',exact:true}).click();
  await page.getByRole('button',{name:'Remover Bola',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Remover item',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Seu carrinho está vazio',exact:true})).toBeVisible();
  await expect(cartDot(page)).toBeHidden();
});

test('pedidos aguardando pagamento sinalizam desktop e mobile; pagos e cancelados não sinalizam',async({page})=>{
  const api=await installApi(page,{signedIn:true});
  api.orders.push({id:'50000000-0000-4000-8000-000000000001',payment_status:'pending',status:'confirmed'});
  api.cartItems.push({id:'40000000-0000-4000-8000-000000000001',quantity:1});
  await page.goto('/#/conta');
  const desktop=page.locator('.navigation [data-nav-indicator="orders"] .nav-notification-dot');await expect(desktop).toBeVisible();
  await expect(page.getByRole('navigation',{name:'Navegação principal'}).getByRole('link',{name:'Pedidos',exact:true})).toHaveAccessibleDescription('Há pedidos aguardando pagamento.');
  await page.screenshot({path:'work/navigation-dots-desktop.png'});
  await page.setViewportSize({width:390,height:844});await expect(orderDot(page)).toBeVisible();await expect(cartDot(page)).toBeVisible();
  await page.screenshot({path:'work/navigation-dots-mobile.png'});
  api.orders[0].payment_status='paid';
  api.orders.push({id:'50000000-0000-4000-8000-000000000002',payment_status:'pending',status:'cancelled'});
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(orderDot(page)).toBeHidden();await expect(cartDot(page)).toBeVisible();
  await page.setViewportSize({width:1280,height:900});await expect(desktop).toBeHidden();
  await page.getByRole('button',{name:'Sair',exact:true}).first().click();
  await expect(page.getByRole('heading',{name:'Entre na sua conta',exact:true})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await expect(cartDot(page)).toBeHidden();await expect(orderDot(page)).toBeHidden();
});

test('consulta de indicador indisponível não bloqueia conteúdo nem edição',async({page})=>{
  await installApi(page,{signedIn:true});
  await page.route('https://pupi-test.supabase.co/rest/v1/carts*',route=>route.fulfill({status:503,json:{message:'unavailable'}}));
  await page.route('https://pupi-test.supabase.co/rest/v1/orders*',route=>route.fulfill({status:503,json:{message:'unavailable'}}));
  await page.goto('/#/conta');await expect(page.getByRole('heading',{name:'Meus dados',exact:true})).toBeVisible();
  await page.getByLabel('Nome completo').fill('Nome preservado');
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByLabel('Nome completo')).toHaveValue('Nome preservado');
  await expect(page.getByRole('button',{name:'Salvar alterações',exact:true})).toBeEnabled();
});
