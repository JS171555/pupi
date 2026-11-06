import {test,expect} from '@playwright/test';
import {installApi} from './api.js';

test('carrinho mostra preços atuais e item indisponível',async({page})=>{
  await installApi(page,{signedIn:true});
  let items=[
    {id:'40000000-0000-4000-8000-000000000001',product_id:'20000000-0000-4000-8000-000000000001',updated_at:'2026-11-05T12:00:00Z',quantity:2,products:{name:'Bola',slug:'bola',price_cents:3000,sale_price_cents:2500,stock_quantity:1,active:true,status:'published',categories:{active:true}}},
    {id:'40000000-0000-4000-8000-000000000002',quantity:1,products:null},
  ];
  let failDelete=false;
  await page.route('https://pupi-test.supabase.co/**',async route=>{
    const request=route.request();const path=new URL(request.url()).pathname;
    if(path==='/rest/v1/products') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'20000000-0000-4000-8000-000000000001',stock_quantity:1,categories:{active:true}}])});
    if(path==='/rest/v1/carts') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'30000000-0000-4000-8000-000000000001'}])});
    if(path==='/rest/v1/cart_items') {
      if(request.method()==='PATCH') {
        const url=new URL(request.url());
        const item=items.find(row=>`eq.${row.id}`===url.searchParams.get('id') && `eq.${row.updated_at}`===url.searchParams.get('updated_at'));
        if(!item)return route.fulfill({status:200,contentType:'application/json',body:'null'});
        item.quantity=request.postDataJSON().quantity;item.updated_at='2026-11-05T12:01:00Z';
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({id:item.id})});
      }
      if(request.method()==='DELETE') {
        if(failDelete)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
        const id=new URL(request.url()).searchParams.get('id').slice(3);
        items=items.filter(item=>item.id!==id);
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id}])});
      }
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(items)});
    }
    return route.fallback();
  });
  await page.goto('/#/carrinho');
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await expect(page.getByRole('heading',{name:'Meu carrinho'})).toBeVisible();
  await expect(page.locator('.cart-item-unit')).toContainText('R$ 25,00');
  await expect(page.locator('.cart-item-total strong')).toHaveText('R$ 50,00');
  await expect(page.getByText('Estoque atual: 1 unidade. Reduza a quantidade para continuar.')).toBeVisible();
  await expect(page.getByText('Subtotal parcial')).toBeVisible();
  await expect(page.locator('.cart-summary-line strong')).toHaveText('R$ 50,00');
  await expect(page.getByRole('button',{name:'Aumentar quantidade de Bola'})).toBeDisabled();
  await page.getByRole('button',{name:'Diminuir quantidade de Bola'}).click();
  await expect(page.locator('.cart-item-total strong')).toHaveText('R$ 25,00');
  await expect(page.getByText('Quantidade atualizada.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Produto indisponível'})).toBeVisible();
  const quantity=page.getByRole('form',{name:'Quantidade de Bola'});
  await quantity.getByRole('textbox',{name:'Quantidade'}).fill('3');
  await quantity.getByRole('button',{name:'Atualizar quantidade'}).click();
  await expect(quantity.getByRole('alert')).toContainText('supera o estoque');
  await quantity.getByRole('textbox',{name:'Quantidade'}).fill('1');
  await quantity.getByRole('button',{name:'Atualizar quantidade'}).click();
  await expect(page.getByText('Quantidade atualizada.')).toBeVisible();
  await expect(page.locator('.cart-item-total strong')).toHaveText('R$ 25,00');
  await page.getByRole('button',{name:'Remover produto indisponível'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Cancelar'}).click();
  await expect(page.getByRole('heading',{name:'Produto indisponível'})).toBeVisible();
  failDelete=true;
  await page.getByRole('button',{name:'Remover produto indisponível'}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Remover item'}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Não foi possível concluir');
  failDelete=false;
  await page.getByRole('dialog').getByRole('button',{name:'Remover item'}).click();
  await expect(page.getByText('Item removido do carrinho.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Produto indisponível'})).toHaveCount(0);
  expect(items).toHaveLength(1);
});


test('carrinho vazio orienta a voltar à loja e cabe em viewport mobile',async({page})=>{
  await installApi(page,{signedIn:true});
  await page.route('https://pupi-test.supabase.co/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path==='/rest/v1/carts')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'30000000-0000-4000-8000-000000000001'}])});
    if(path==='/rest/v1/cart_items')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
    return route.fallback();
  });
  await page.setViewportSize({width:360,height:780});
  await page.goto('/#/carrinho');
  await expect(page.getByRole('heading',{name:'Seu carrinho está vazio'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Explorar produtos'})).toHaveAttribute('href','#/loja');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('revisão informa indisponibilidade de frete sem criar pedido',async({page})=>{
  await installApi(page,{signedIn:true});
  await page.route('https://pupi-test.supabase.co/**',async route=>{
    const request=route.request();const path=new URL(request.url()).pathname;
    if(path==='/rest/v1/carts')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'30000000-0000-4000-8000-000000000001'}])});
    if(path==='/rest/v1/cart_items')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'40000000-0000-4000-8000-000000000001',quantity:2,products:{name:'Bola',slug:'bola',price_cents:3000,sale_price_cents:2500,stock_quantity:3,active:true,status:'published',categories:{active:true}}}])});
    return route.fallback();
  });
  await page.goto('/#/carrinho');await page.getByRole('link',{name:'Continuar para entrega'}).click();
  await expect(page.getByRole('heading',{name:'Revisar pedido'})).toBeVisible();
  await expect(page.getByText('Subtotal: R$ 50,00')).toBeVisible();
  await expect(page.getByText('Cadastre um endereço para continuar.')).toBeVisible();
  await expect(page.getByRole('button',{name:/confirmar pedido/i})).toHaveCount(0);
});


test('cliente consulta entregas e confirma pedido com cotação escolhida',async({page})=>{
  const state=await installApi(page,{signedIn:true});
  const addressId='30000000-0000-4000-8000-000000000001',orderId='50000000-0000-4000-8000-000000000001',quoteId='60000000-0000-4000-8000-000000000001';
  state.addresses.push({id:addressId,label:'Casa',recipient:'Pessoa Teste',postal_code:'01001000',street:'Rua A',number:'1',neighborhood:'Centro',city:'São Paulo',state:'SP',is_default:true});
  state.addresses.push({id:'30000000-0000-4000-8000-000000000003',label:'Trabalho',recipient:'Pessoa Teste',postal_code:'20040020',street:'Rua B',number:'2',neighborhood:'Centro',city:'Rio',state:'RJ',is_default:false});
  state.orders.push({id:orderId,order_number:1,status:'confirmed',payment_status:'pending',subtotal_cents:5000,shipping_cents:1000,total_cents:6000,currency:'BRL',created_at:'2026-11-05T12:00:00Z',address_snapshot:{recipient:'Pessoa Teste',street:'Rua A',number:'1',neighborhood:'Centro',city:'São Paulo',state:'SP',postal_code:'01001000'}});
  const actions=[];
  await page.route('https://pupi-test.supabase.co/**',async route=>{
    const request=route.request();const path=new URL(request.url()).pathname;
    if(path==='/rest/v1/carts')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'30000000-0000-4000-8000-000000000002'}])});
    if(path==='/rest/v1/cart_items')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'40000000-0000-4000-8000-000000000001',quantity:2,products:{name:'Bola',slug:'bola',price_cents:2500,sale_price_cents:null,stock_quantity:3,active:true,status:'published',categories:{active:true}}}])});
    if(path==='/functions/v1/pupi-checkout'){
      const body=request.postDataJSON();actions.push(body);
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body.action==='quote'?{quotes:[{id:quoteId,carrier:'Correios',service_name:'PAC',price_cents:1000,subtotal_cents:5000,days:5}]}:{order_id:orderId})});
    }
    return route.fallback();
  });
  await page.goto('/#/checkout');
  await page.getByRole('combobox',{name:'Endereço de entrega'}).selectOption(addressId);
  await page.getByRole('button',{name:'Consultar entregas'}).click();
  await expect(page.getByText('Subtotal confirmado na cotação: R$ 50,00')).toBeVisible();
  await page.getByRole('combobox',{name:'Endereço de entrega'}).selectOption('30000000-0000-4000-8000-000000000003');
  await expect(page.getByRole('button',{name:'Confirmar pedido'})).toHaveCount(0);
  await page.getByRole('combobox',{name:'Endereço de entrega'}).selectOption(addressId);
  await page.getByRole('button',{name:'Consultar entregas'}).click();
  await expect(page.getByRole('option',{name:/Total R\$\s60,00/})).toHaveCount(1);
  await page.getByRole('combobox',{name:'Entrega',exact:true}).selectOption(quoteId);
  await expect(page.getByText('Frete: R$ 10,00 · Total: R$ 60,00')).toBeVisible();
  await page.setViewportSize({width:390,height:844});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:'work/pupi-checkout-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Confirmar pedido'}).click();
  await expect(page).toHaveURL(new RegExp(`/pedidos/${orderId}`));
  expect(actions[0]).toEqual({action:'quote',address_id:addressId});
  expect(actions[2].action).toBe('confirm');expect(actions[2].quote_id).toBe(quoteId);expect(actions[2].request_key).toMatch(/^[0-9a-f-]{36}$/);
});
