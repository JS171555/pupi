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
  await expect(page.getByRole('heading',{name:'Carrinho'})).toBeVisible();
  await expect(page.getByText('Preço unitário: R$ 25,00')).toBeVisible();
  await expect(page.getByText('Total do item: R$ 50,00')).toBeVisible();
  await expect(page.getByText('Quantidade indisponível no estoque atual.')).toBeVisible();
  await expect(page.getByText('Subtotal dos itens disponíveis: R$ 50,00')).toBeVisible();
  await expect(page.getByRole('heading',{name:'Produto indisponível'})).toBeVisible();
  const quantity=page.getByRole('form',{name:'Quantidade de Bola'});
  await quantity.getByRole('textbox',{name:'Quantidade'}).fill('3');
  await quantity.getByRole('button',{name:'Atualizar quantidade'}).click();
  await expect(quantity.getByRole('alert')).toContainText('supera o estoque');
  await quantity.getByRole('textbox',{name:'Quantidade'}).fill('1');
  await quantity.getByRole('button',{name:'Atualizar quantidade'}).click();
  await expect(page.getByText('Quantidade atualizada.')).toBeVisible();
  await expect(page.getByText('Total do item: R$ 25,00')).toBeVisible();
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


test('revisão informa indisponibilidade de frete sem criar pedido',async({page})=>{
  await installApi(page,{signedIn:true});
  await page.route('https://pupi-test.supabase.co/**',async route=>{
    const request=route.request();const path=new URL(request.url()).pathname;
    if(path==='/rest/v1/carts')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'30000000-0000-4000-8000-000000000001'}])});
    if(path==='/rest/v1/cart_items')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:'40000000-0000-4000-8000-000000000001',quantity:2,products:{name:'Bola',slug:'bola',price_cents:3000,sale_price_cents:2500,stock_quantity:3,active:true,status:'published',categories:{active:true}}}])});
    return route.fallback();
  });
  await page.goto('/#/carrinho');await page.getByRole('link',{name:'Revisar pedido'}).click();
  await expect(page.getByRole('heading',{name:'Revisar pedido'})).toBeVisible();
  await expect(page.getByText('Subtotal: R$ 50,00')).toBeVisible();
  await expect(page.getByText('Cadastre um endereço para continuar.')).toBeVisible();
  await expect(page.getByText(/cotação de entrega ainda não está disponível/)).toBeVisible();
  await expect(page.getByRole('button',{name:/confirmar pedido/i})).toHaveCount(0);
});
