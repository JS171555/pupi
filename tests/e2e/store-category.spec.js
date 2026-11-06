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
  await page.goto('/#/loja/bola');
  await expect(page.getByRole('heading',{name:'Bola',exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Brinquedos'}).click();
  await expect(page.getByRole('heading',{name:'Loja'})).toBeVisible();
  await expect(page.getByLabel('Categoria')).toHaveValue(category.id);
  expect(page.url()).toContain(`categoria=${category.id}`);
});
