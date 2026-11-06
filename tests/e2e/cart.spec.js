import {test,expect} from '@playwright/test';
import {installApi} from './api.js';

test('carrinho mostra preços atuais e item indisponível',async({page})=>{
  await installApi(page,{signedIn:true});
  await page.route('https://pupi-test.supabase.co/**',async route=>{
    const request=route.request();const path=new URL(request.url()).pathname;
    if(path==='/rest/v1/carts') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'30000000-0000-4000-8000-000000000001'}])});
    if(path==='/rest/v1/cart_items') return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([
      {id:'1',quantity:2,products:{name:'Bola',slug:'bola',price_cents:3000,sale_price_cents:2500,stock_quantity:1,active:true,status:'published',categories:{active:true}}},
      {id:'2',quantity:1,products:null},
    ])});
    return route.fallback();
  });
  await page.goto('/#/carrinho');
  await expect(page.getByRole('heading',{name:'Carrinho'})).toBeVisible();
  await expect(page.getByText('Preço unitário: R$ 25,00')).toBeVisible();
  await expect(page.getByText('Total do item: R$ 50,00')).toBeVisible();
  await expect(page.getByText('Quantidade indisponível no estoque atual.')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Produto indisponível'})).toBeVisible();
});
