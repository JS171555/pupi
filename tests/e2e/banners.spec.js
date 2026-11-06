import {test,expect} from '@playwright/test';
import {installAdminApi} from './admin-api.js';
import {installApi} from './api.js';

async function imageFile(page,width,height,name){
  const encoded=await page.evaluate(({width,height})=>{
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const paint=canvas.getContext('2d');paint.fillStyle='#DDD2FF';paint.fillRect(0,0,width,height);
    paint.fillStyle='#302746';paint.font='24px sans-serif';paint.fillText('Banner',20,45);
    return canvas.toDataURL('image/png').split(',')[1];
  },{width,height});
  return {name,mimeType:'image/png',buffer:Buffer.from(encoded,'base64')};
}

async function installStore(page,count=2){
  const api=await installAdminApi(page);api.seed();
  const banners=Array.from({length:count},(_,i)=>({id:`60000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,title:`Destaque ${i+1}`,sort_order:i}));
  for(const banner of banners){banner.mobile_path=`${banner.id}/80000000-0000-4000-8000-000000000001.png`;banner.desktop_path=`${banner.id}/80000000-0000-4000-8000-000000000002.png`;}
  const mobile=await imageFile(page,480,480,'mobile.png'),desktop=await imageFile(page,960,320,'desktop.png');
  for(const banner of banners){api.fileBytes.set(`banner-images/${banner.mobile_path}`,mobile.buffer);api.fileBytes.set(`banner-images/${banner.desktop_path}`,desktop.buffer);}
  await page.route('https://pupi-test.supabase.co/rest/v1/**',async route=>{
    const pathname=new URL(route.request().url()).pathname;
    const data=pathname.endsWith('/home_banners')?banners:pathname.endsWith('/categories')?api.categories:pathname.endsWith('/products')?api.products:pathname.endsWith('/product_images')?[]:undefined;
    if(data===undefined)return route.fallback();
    return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  return api;
}

test('admin cria rascunho, valida proporções, envia versões e publica; exclusão mantém limpeza recuperável',async({page})=>{
  const state=await installAdminApi(page);await page.goto('/#/admin/banners');
  await expect(page.getByText('Nenhum banner cadastrado.',{exact:true})).toBeVisible();
  await page.getByRole('link',{name:'Novo banner',exact:true}).click();
  await page.getByLabel('Descrição do banner').fill('Semana do pet');await page.getByLabel('Posição').fill('2');
  await page.getByRole('button',{name:'Criar banner',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Editar banner',exact:true})).toBeVisible();expect(state.banners).toHaveLength(1);
  await page.getByLabel('Exibir na loja').check();await page.getByRole('button',{name:'Salvar banner',exact:true}).click();
  await expect(page.locator('[data-field="mobile"] .field-error')).toHaveText('Envie esta imagem para publicar o banner.');
  await page.getByLabel('Imagem mobile',{exact:true}).setInputFiles(await imageFile(page,900,300,'horizontal.png'));
  await expect(page.locator('[data-field="mobile"] .field-error')).toContainText('Quadrada');expect(state.files.size).toBe(0);
  await page.getByRole('button',{name:'Remover seleção mobile'}).click();
  await expect(page.getByLabel('Imagem mobile',{exact:true})).toHaveValue('');
  await page.getByLabel('Imagem mobile',{exact:true}).setInputFiles(await imageFile(page,480,480,'mobile.png'));
  await page.getByLabel('Imagem desktop',{exact:true}).setInputFiles(await imageFile(page,960,320,'desktop.png'));
  await expect(page.locator('.banner-preview-mobile img')).toBeVisible();
  state.loseReply=true;
  await page.getByRole('button',{name:'Salvar banner',exact:true}).click();
  await expect(page.getByText('Não foi possível concluir a operação. Tente novamente.',{exact:true})).toBeVisible();
  expect(state.files.size).toBe(1);
  await page.getByRole('button',{name:'Salvar banner',exact:true}).click();
  await expect(page.getByText('Banner salvo.',{exact:true})).toBeVisible();
  expect(state.files.size).toBe(2);expect(state.banners[0].active).toBe(true);
  await page.screenshot({path:'work/pupi-banners-admin-desktop.png',fullPage:true});
  await page.getByRole('button',{name:'Ocultar Semana do pet',exact:true}).click();
  await expect(page.getByText('Banner ocultado.',{exact:true})).toBeVisible();expect(state.banners[0].active).toBe(false);
  await page.getByRole('link',{name:'Editar',exact:true}).click();
  state.failRemove=true;await page.getByRole('button',{name:'Excluir banner',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Excluir banner',exact:true}).click();
  await expect(page.getByRole('button',{name:'Tentar limpeza',exact:true})).toBeVisible();expect(state.banners).toHaveLength(0);expect(state.jobs).toHaveLength(2);
  state.failRemove=false;await page.getByRole('button',{name:'Tentar limpeza',exact:true}).click();
  await expect(page.getByText('Limpeza concluída.',{exact:true})).toBeVisible();expect(state.files.size).toBe(0);expect(state.jobs).toHaveLength(0);
});

test('carrossel alterna sozinho, pausa, navega por teclado e usa imagem desktop',async({page})=>{
  await installStore(page);await page.clock.install();await page.goto('/');
  const carousel=page.getByRole('region',{name:'Destaques da loja'});
  await expect(carousel).toBeVisible();await expect(carousel).toHaveAttribute('data-index','0');
  const image=carousel.locator('.banner-slide').first().locator('img');
  await expect(image).toHaveJSProperty('complete',true);
  expect(await image.evaluate(img=>img.currentSrc)).toContain('000000000002.png');
  await page.clock.fastForward(6100);await expect(carousel).toHaveAttribute('data-index','1');
  await carousel.getByRole('button',{name:'Pausar banners',exact:true}).click();
  await page.mouse.move(0,0);await page.getByRole('heading',{name:'Loja',exact:true}).focus();
  await page.clock.fastForward(13000);await expect(carousel).toHaveAttribute('data-index','1');
  await carousel.getByRole('button',{name:'Banner anterior',exact:true}).focus();await page.keyboard.press('Enter');
  await expect(carousel).toHaveAttribute('data-index','0');
  await expect(carousel.locator('[aria-live]')).toHaveText('Banner 1 de 2: Destaque 1');
  await carousel.getByRole('button',{name:'Reproduzir banners',exact:true}).click();
  await page.mouse.move(0,0);await page.getByRole('heading',{name:'Loja',exact:true}).focus();
  await page.clock.fastForward(6100);await expect(carousel).toHaveAttribute('data-index','1');
  await page.screenshot({path:'work/pupi-banner-desktop.png',fullPage:true});
  await page.getByRole('link',{name:'Meus dados',exact:true}).click();await page.clock.fastForward(20000);
  await expect(carousel).toHaveCount(0);await expect(page.getByRole('heading',{name:'Meus dados',exact:true})).toBeVisible();
});

test('mobile usa imagem quadrada; movimento reduzido desativa reprodução automática',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});
  await installStore(page,8);await page.clock.install();await page.goto('/#/loja');
  const carousel=page.getByRole('region',{name:'Destaques da loja'});await expect(carousel).toBeVisible();
  await expect(carousel.getByRole('button',{name:'Reproduzir banners',exact:true})).toBeVisible();
  await page.clock.fastForward(13000);await expect(carousel).toHaveAttribute('data-index','0');
  const image=carousel.locator('.banner-slide').first().locator('img');await expect(image).toHaveJSProperty('complete',true);
  expect(await image.evaluate(img=>img.currentSrc)).toContain('000000000001.png');
  const frame=await carousel.locator('.banner-carousel-track').boundingBox();expect(Math.abs(frame.width-frame.height)).toBeLessThan(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await carousel.getByRole('button',{name:'Próximo banner',exact:true}).click();await expect(carousel).toHaveAttribute('data-index','1');
  await page.screenshot({path:'work/pupi-banner-mobile.png',fullPage:true});
});

test('um único banner fica estático e falha de imagem preserva o catálogo',async({page})=>{
  await installStore(page,1);await page.goto('/#/loja');const carousel=page.getByRole('region',{name:'Destaques da loja'});
  await expect(carousel).toBeVisible();await expect(carousel.getByRole('button')).toHaveCount(0);
  await page.route('https://pupi-test.supabase.co/storage/v1/object/sign/banner-images/**',route=>route.fulfill({status:503,contentType:'application/json',body:'{}'}));
  await carousel.locator('img').evaluate(img=>img.dispatchEvent(new Event('error')));
  await expect(carousel).toBeHidden();await expect(page.getByRole('heading',{name:'Produtos',exact:true})).toBeVisible();
});

test('banner opcional indisponível não bloqueia a loja e cliente não acessa administração',async({page})=>{
  await installApi(page,{signedIn:true});
  await page.route('https://pupi-test.supabase.co/rest/v1/**',route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/home_banners'))return route.fulfill({status:503,contentType:'application/json',body:'{}'});
    if(path.endsWith('/categories')||path.endsWith('/products'))return route.fulfill({contentType:'application/json',body:'[]'});
    return route.fallback();
  });
  await page.goto('/#/loja');await expect(page.getByRole('heading',{name:'Loja',exact:true})).toBeVisible({timeout:10000});
  await expect(page.getByRole('region',{name:'Destaques da loja'})).toHaveCount(0);
  await page.goto('/#/admin/banners');await expect(page.getByRole('heading',{name:'Acesso restrito',exact:true})).toBeVisible();
});

test('editor mobile preserva seleção e dados ao ficar offline',async({page})=>{
  const state=await installAdminApi(page);await page.setViewportSize({width:320,height:740});
  state.banners.push({id:'60000000-0000-4000-8000-000000000001',title:'Oferta da semana',sort_order:0,active:false,mobile_path:null,desktop_path:null,updated_at:'2026-11-05T12:00:00.000Z'});
  await page.goto(`/#/admin/banners/${state.banners[0].id}`);
  await page.getByLabel('Descrição do banner').fill('Nova oferta da semana');
  await page.getByLabel('Imagem mobile',{exact:true}).setInputFiles(await imageFile(page,480,480,'mobile.png'));
  await expect(page.locator('.banner-preview-mobile img')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.context().setOffline(true);await page.getByRole('button',{name:'Salvar banner',exact:true}).click();
  await expect(page.getByText('Você está sem conexão. Reconecte para salvar ou entrar.',{exact:true})).toBeVisible();
  await expect(page.getByLabel('Descrição do banner')).toHaveValue('Nova oferta da semana');
  await expect(page.getByLabel('Imagem mobile',{exact:true})).not.toHaveValue('');expect(state.files.size).toBe(0);
  await page.context().setOffline(false);
});
