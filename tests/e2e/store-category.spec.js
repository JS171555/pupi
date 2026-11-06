import {test,expect} from '@playwright/test';

test('detalhe abre a categoria do produto e filtra a vitrine',async({page})=>{
  const category={id:'10000000-0000-4000-8000-000000000001',name:'Brinquedos',slug:'brinquedos',sort_order:0};
  const product={id:'20000000-0000-4000-8000-000000000001',category_id:category.id,slug:'bola',name:'Bola',title:'Bola pet',description:'Para brincar',short_description:'Para brincar',price_cents:2000,sale_price_cents:null,stock_quantity:2,featured:false};
  await page.route('https://pupi-test.supabase.co/**',async route=>{
    const request=route.request();const url=new URL(request.url());const object=request.headers().accept?.includes('vnd.pgrst.object');
    let value;
    if(url.pathname==='/rest/v1/products') value=object?product:[product];
    else if(url.pathname==='/rest/v1/categories') value=object?category:[category];
    else if(url.pathname==='/rest/v1/product_images') value=[];
    else return route.fulfill({status:404,contentType:'application/json',body:'{}'});
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  });
  await page.setViewportSize({width:390,height:844});
  await page.goto('/#/loja');
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card a')).toHaveCount(1);
  await expect(page.getByRole('link',{name:'Abrir detalhes de Bola'})).toBeVisible();
  await expect(page.locator('.product-card .product-availability')).toHaveCount(0);
  await expect(page.locator('.product-card .product-card-cue')).toHaveCount(0);
  await expect(page.getByText('Ver produto',{exact:false})).toHaveCount(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1280,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:390,height:844});
  await page.locator('.product-card').click();
  await expect(page.getByRole('heading',{name:'Bola',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:1280,height:900});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('link',{name:'Brinquedos'}).click();
  await expect(page.getByRole('heading',{name:'Loja'})).toBeVisible();
  await expect(page.getByLabel('Categoria')).toHaveValue(category.id);
  expect(page.url()).toContain(`categoria=${category.id}`);
});

test('cliente salva quantidade escolhida e não grava acima do estoque',async({page})=>{
  const {installApi}=await import('./api.js');await installApi(page,{signedIn:true});
  const category={id:'10000000-0000-4000-8000-000000000001',name:'Brinquedos'};
  const product={id:'20000000-0000-4000-8000-000000000001',category_id:category.id,slug:'bola',name:'Bola',title:'Bola pet',description:'Para brincar',price_cents:2000,sale_price_cents:null,stock_quantity:2};
  let writes=[];
  await page.route('https://pupi-test.supabase.co/**',async route=>{
    const request=route.request();const url=new URL(request.url());const object=request.headers().accept?.includes('vnd.pgrst.object');let value;
    if(url.pathname==='/rest/v1/products')value=object?product:[product];
    else if(url.pathname==='/rest/v1/categories')value=object?category:[category];
    else if(url.pathname==='/rest/v1/product_images')value=[];
    else if(url.pathname==='/rest/v1/carts')value=object?{id:'30000000-0000-4000-8000-000000000001'}:[{id:'30000000-0000-4000-8000-000000000001'}];
    else if(url.pathname==='/rest/v1/cart_items'){writes.push(request.postDataJSON());value=null;}
    else return route.fallback();
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(value)});
  });
  await page.goto('/#/loja/bola');
  await page.getByRole('textbox',{name:'Quantidade'}).fill('3');await page.getByRole('button',{name:'Salvar no carrinho'}).click();
  await expect(page.getByRole('alert').filter({hasText:'supera o estoque'})).toBeVisible();expect(writes).toHaveLength(0);
  await page.getByRole('textbox',{name:'Quantidade'}).fill('2');await page.getByRole('button',{name:'Salvar no carrinho'}).click();
  await expect(page.getByText('Quantidade salva no carrinho.')).toBeVisible();expect(writes).toHaveLength(1);expect(writes[0].quantity).toBe(2);
});

test('vitrine mobile oferece navegação e filtros sem movimento nem rolagem horizontal',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await page.route('https://pupi-test.supabase.co/**',async route=>{
    const url=new URL(route.request().url());
    const data=url.pathname==='/rest/v1/categories'?[{id:'10000000-0000-4000-8000-000000000001',name:'Brinquedos',slug:'brinquedos',sort_order:0}]:[];
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('/#/loja');await expect(page.getByRole('heading',{name:'Loja',exact:true})).toBeVisible();
  const brandIconSize=await page.locator('.brand svg').evaluate(node=>Number.parseFloat(getComputedStyle(node).width));
  const moreIconSize=await page.locator('.mobile-menu summary svg').evaluate(node=>Number.parseFloat(getComputedStyle(node).width));
  const moreLabelSize=await page.locator('.mobile-menu summary span').evaluate(node=>Number.parseFloat(getComputedStyle(node).fontSize));
  expect(brandIconSize).toBeGreaterThanOrEqual(38);expect(moreIconSize).toBeGreaterThanOrEqual(25);expect(moreLabelSize).toBeGreaterThanOrEqual(14);
  const nav=page.getByRole('navigation',{name:'Navegação inferior'});await expect(nav).toBeVisible();
  await expect(nav.getByRole('link',{name:'Loja'})).toHaveAttribute('aria-current','page');
  await page.getByText('Buscar e filtrar produtos').click();await expect(page.getByLabel('Categoria')).toBeVisible();
  await page.getByLabel('Mais opções').click();await expect(page.getByRole('link',{name:'Criar conta'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(await page.locator('#main').evaluate(el=>getComputedStyle(el.firstElementChild).transform)).toBe('none');
});
