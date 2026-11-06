import {test,expect} from '@playwright/test';
import {installAdminApi,CAT,PRODUCT,pngFile} from './admin-api.js';
import {user} from './api.js';

test('categoria e produto: criar, editar, publicar, pesquisar e arquivar',async({page})=>{
  const state=await installAdminApi(page);await page.goto('/#/admin');
  await expect(page.getByRole('heading',{name:'Resumo da loja'})).toBeVisible();
  await page.getByRole('link',{name:'Categorias',exact:true}).click();await page.getByRole('link',{name:'Nova categoria',exact:true}).click();
  await page.getByLabel('Nome da categoria').fill('Brinquedos');
  await page.getByRole('button',{name:'Salvar categoria'}).click();await expect(page.getByText('Categoria salva.',{exact:true})).toBeVisible();
  expect(state.categories).toHaveLength(1);expect(state.categories[0].slug).toBe('brinquedos');
  await page.getByRole('link',{name:'Produtos',exact:true}).click();await page.getByRole('link',{name:'Novo produto',exact:true}).click();
  await page.getByLabel('Nome do produto').fill('Bola para cachorro');await page.getByRole('textbox',{name:'SKU',exact:true}).fill('BOLA-1');
  await page.getByRole('combobox',{name:'Categoria',exact:true}).selectOption(state.categories[0].id);
  await page.getByLabel('Preço de venda (R$)').fill('29,90');await page.getByLabel('Preço promocional (R$)').fill('35,00');
  await page.getByRole('button',{name:'Salvar produto'}).click();await expect(page.getByText('A promoção deve ser maior que zero e menor que o preço de venda.')).toBeVisible();
  await page.getByLabel('Preço promocional (R$)').fill('24,90');await page.getByRole('button',{name:'Salvar produto'}).click();
  await expect(page.getByText('Produto “Bola para cachorro” salvo.',{exact:true})).toBeVisible();
  expect(state.products[0].price_cents).toBe(2990);expect(state.products[0].sale_price_cents).toBe(2490);expect(state.products[0].stock_quantity).toBe(0);
  await page.getByRole('button',{name:'Publicar Bola para cachorro',exact:true}).click();await expect(page.getByText('Publicação atualizada.',{exact:true})).toBeVisible();expect(state.products[0].status).toBe('published');
  await page.getByLabel('Buscar',{exact:true}).fill('BOLA-1');await page.getByRole('button',{name:'Aplicar filtros'}).click();
  await expect(page.getByRole('link',{name:'Bola para cachorro',exact:true})).toBeVisible();expect(page.url()).toContain('search=BOLA-1');
  await page.screenshot({path:'work/pupi-admin-desktop.png',fullPage:true});
  await page.getByRole('link',{name:'Editar',exact:true}).click();await page.getByLabel('Descrição completa').fill('Produto cadastrado para testes.');
  await page.getByRole('button',{name:'Salvar produto'}).click();await page.getByRole('link',{name:'Editar',exact:true}).click();
  await expect(page.getByLabel('Descrição completa')).toHaveValue('Produto cadastrado para testes.');
  await page.getByRole('button',{name:'Arquivar produto',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('dialog').getByRole('button',{name:'Arquivar produto'}).click();
  await expect(page.getByText('Produto arquivado.',{exact:true})).toBeVisible();expect(state.products[0].status).toBe('archived');
});

test('estoque mantém chave de retentativa quando a resposta se perde',async({page})=>{
  const state=await installAdminApi(page);state.seed();await page.goto(`/#/admin/estoque/${PRODUCT}`);
  await page.getByLabel('Quantidade / novo saldo').fill('3');await page.getByLabel('Motivo da movimentação').fill('Conferência de recebimento');
  state.loseReply=true;await page.getByRole('button',{name:'Registrar movimentação'}).click();
  await expect(page.getByText('Não foi possível concluir a operação. Tente novamente.')).toBeVisible();
  expect(state.products[0].stock_quantity).toBe(13);expect(state.movements).toHaveLength(1);
  await page.getByRole('button',{name:'Registrar movimentação'}).click();
  await expect(page.getByText('Movimentação registrada.',{exact:true})).toBeVisible();
  expect(state.products[0].stock_quantity).toBe(13);expect(state.movements).toHaveLength(1);expect(state.requestKeys[0]).toBe(state.requestKeys[1]);
  await page.getByLabel('Tipo de movimentação').selectOption('set');await page.getByLabel('Quantidade / novo saldo').fill('0');await page.getByLabel('Motivo da movimentação').fill('Conferência final');
  await page.getByRole('button',{name:'Registrar movimentação'}).click();await expect(page.getByText('Movimentação registrada.',{exact:true})).toBeVisible();expect(state.products[0].stock_quantity).toBe(0);
});

test('upload valida conteúdo, preserva sucesso parcial e remove imagem com fila recuperável',async({page})=>{
  const state=await installAdminApi(page);state.seed();await page.goto(`/#/admin/produtos/${PRODUCT}/imagens`);
  await page.getByLabel('Arquivos de imagem').setInputFiles([pngFile,{name:'imagem-invalida.png',mimeType:'image/png',buffer:Buffer.from('<svg>not-a-png</svg>')}]);
  await page.getByRole('button',{name:'Enviar imagens',exact:true}).click();
  await expect(page.getByText(/1 arquivo\(s\) confirmado\(s\); 1 com falha/)).toBeVisible();expect(state.images).toHaveLength(1);expect(state.files.size).toBe(1);
  await page.getByRole('button',{name:'Remover da fila'}).click();await page.getByRole('button',{name:'Enviar imagens',exact:true}).click();
  await expect(page.getByText('Imagens enviadas e vinculadas.',{exact:true})).toBeVisible();expect(state.images).toHaveLength(1);
  await page.getByRole('link',{name:'Editar dados',exact:true}).click();await page.getByLabel('Texto alternativo').fill('Bola colorida');await page.getByRole('button',{name:'Salvar dados da imagem'}).click();
  await expect(page.getByText('Dados da imagem salvos.',{exact:true})).toBeVisible();await expect(page.getByRole('img',{name:'Bola colorida'})).toBeVisible();
  state.failRemove=true;await page.getByRole('button',{name:'Remover imagem',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Remover imagem',exact:true}).click();
  await expect(page.getByText(/1 arquivo\(s\) na fila de remoção/)).toBeVisible();expect(state.images).toHaveLength(0);expect(state.files.size).toBe(1);
  state.failRemove=false;await page.getByRole('button',{name:'Tentar limpeza',exact:true}).click();await expect(page.getByText('Limpeza concluída.',{exact:true})).toBeVisible();expect(state.jobs).toHaveLength(0);expect(state.files.size).toBe(0);
});

test('imagem da categoria é vinculada e pode ser removida sem excluir a categoria',async({page})=>{
  const state=await installAdminApi(page);state.seed();await page.goto(`/#/admin/categorias/${CAT}/imagem`);
  await page.getByLabel('Arquivo de imagem',{exact:false}).setInputFiles(pngFile);await page.getByRole('button',{name:'Enviar imagem',exact:true}).click();
  await expect(page.getByText('Imagens enviadas e vinculadas.',{exact:true})).toBeVisible();expect(state.categories[0].image_path).toBeTruthy();
  await page.getByRole('button',{name:'Remover imagem da categoria'}).click();await page.getByRole('dialog').getByRole('button',{name:'Remover imagem',exact:true}).click();
  await expect(page.getByText('Imagem desvinculada. Confira a fila de limpeza.',{exact:true})).toBeVisible();expect(state.categories).toHaveLength(1);expect(state.categories[0].image_path).toBeNull();
});

test('exclusão com histórico falha no diálogo e preserva o produto',async({page})=>{
  const state=await installAdminApi(page);state.seed();state.movements.push({product_id:PRODUCT});await page.goto(`/#/admin/produtos/${PRODUCT}`);
  await page.getByRole('button',{name:'Excluir produto',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Excluir produto',exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Este produto tem histórico');expect(state.products).toHaveLength(1);
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('pedido registra preparação e envio manual sem aprovar pagamento',async({page})=>{
  const state=await installAdminApi(page);state.seed();const order={id:'50000000-0000-4000-8000-000000000001',order_number:9,user_id:user.id,status:'confirmed',payment_status:'pending',subtotal_cents:3000,shipping_cents:500,total_cents:3500,created_at:'2026-11-05T12:00:00Z',updated_at:'2026-11-05T12:00:00Z',
    customer:{id:user.id,full_name:'Pessoa Teste',email:user.email,phone:null},customer_name:'Pessoa Teste',items:[],shipment:null,events:[],address_snapshot:{recipient:'Pessoa Teste',street:'Rua teste',number:'1',neighborhood:'Centro',city:'São Paulo',state:'SP',postal_code:'01001000'}};
  state.orders.push(order);await page.goto(`/#/admin/pedidos/${order.id}`);
  await page.getByRole('textbox',{name:'Chave de acesso da NF-e'}).fill('123');
  await page.getByRole('button',{name:'Salvar chave da NF-e'}).click();
  await expect(page.getByRole('alert').filter({hasText:'dígito verificador válido'})).toBeVisible();
  const key='35261112345678000195550010000001231123456788';
  await page.getByRole('textbox',{name:'Chave de acesso da NF-e'}).fill(key);
  await page.getByRole('button',{name:'Salvar chave da NF-e'}).click();
  await expect(page.getByText('Chave da NF-e salva.')).toBeVisible();
  await page.getByLabel('Status do pedido').selectOption('preparing');await page.getByRole('button',{name:'Salvar pedido e entrega'}).click();await expect(page.getByText('Pedido e entrega atualizados. O pagamento não foi alterado.',{exact:true})).toBeVisible();
  await expect(page.getByRole('textbox',{name:'Chave de acesso da NF-e'})).toHaveValue(key);
  await page.getByLabel('Status do pedido').selectOption('shipped');await page.getByLabel('Transportadora / responsável pela entrega').fill('Entrega local');await page.getByLabel('Código de rastreamento').fill('TESTE-123');
  await page.getByRole('button',{name:'Salvar pedido e entrega'}).click();await expect(page.getByText('Pedido e entrega atualizados. O pagamento não foi alterado.',{exact:true})).toBeVisible();
  expect(order.status).toBe('shipped');expect(order.payment_status).toBe('pending');expect(order.shipment.tracking_code).toBe('TESTE-123');
});

test('consulta de clientes preserva a busca pessoal fora da URL e abre histórico',async({page})=>{
  await installAdminApi(page);await page.goto('/#/admin/clientes');await page.getByLabel('Buscar cliente',{exact:true}).fill(user.email);await page.getByRole('button',{name:'Aplicar filtros'}).click();
  await expect(page.getByText(user.email,{exact:true})).toBeVisible();expect(page.url()).not.toContain('example.com');expect(page.url()).not.toContain('pessoa');
  await page.getByRole('link',{name:'Consultar cliente'}).click();await expect(page.getByRole('heading',{name:'Histórico do cliente'})).toBeVisible();
});

test('configurações persistem e oferecem estoque mínimo para novos produtos',async({page})=>{
  const state=await installAdminApi(page);state.seed();await page.goto('/#/admin/configuracoes');
  await page.getByLabel('Nome da loja').fill('Pupi Petshop');await page.getByLabel('E-mail de contato').fill('loja@example.com');await page.getByLabel('CEP de origem dos envios').fill('01001-000');await page.getByLabel('Estoque mínimo sugerido para novos produtos').fill('5');
  await page.getByRole('button',{name:'Salvar configurações'}).click();await expect(page.getByText('Configurações salvas.',{exact:true})).toBeVisible();expect(state.settings).toHaveLength(4);
  await page.getByRole('link',{name:'Produtos',exact:true}).click();await page.getByRole('link',{name:'Novo produto',exact:true}).click();await expect(page.getByRole('textbox',{name:'Estoque mínimo',exact:true})).toHaveValue('5');
});

test('listas paginadas mantêm filtro e a administração funciona em 390px',async({page})=>{
  const state=await installAdminApi(page);state.seed();for(let index=0;index<30;index++)state.products.push({...state.products[0],id:`40000000-0000-4000-8000-${String(index).padStart(12,'0')}`,name:`Ração extra ${index}`,sku:`EXTRA-${index}`});
  await page.setViewportSize({width:390,height:844});await page.goto('/#/admin/produtos');await expect(page.getByRole('table')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Próxima',exact:true}).click();expect(page.url()).toContain('page=2');await expect(page.getByText('Página 2 · 31 registros')).toBeVisible();
  await page.getByLabel('Buscar',{exact:true}).fill('EXTRA-29');await page.getByRole('button',{name:'Aplicar filtros'}).click();await expect(page.getByText('Página 1 · 1 registros')).toBeVisible();
  await page.getByRole('button',{name:'Limpar busca',exact:true}).click();await expect(page.getByText('Página 1 · 31 registros')).toBeVisible();
  await page.screenshot({path:'work/pupi-admin-mobile.png',fullPage:true});
});


test('remessa solicita confirmação e não persiste documento no navegador',async({page})=>{
  const state=await installAdminApi(page);state.seed();
  const order={id:'50000000-0000-4000-8000-000000000001',order_number:9,user_id:user.id,status:'confirmed',payment_status:'pending',subtotal_cents:3000,shipping_cents:500,total_cents:3500,created_at:'2026-11-05T12:00:00Z',updated_at:'2026-11-05T12:00:00Z',customer:{id:user.id,full_name:'Pessoa Teste',email:user.email,phone:null},items:[],shipment:{provider:'melhor_envio',status:'pending',carrier:'Correios',service_name:'PAC'},events:[],address_snapshot:{recipient:'Pessoa Teste',street:'Rua teste',number:'1',neighborhood:'Centro',city:'São Paulo',state:'SP',postal_code:'01001000'}};
  state.orders.push(order);await page.goto(`/#/admin/pedidos/${order.id}`);
  await page.getByLabel('CPF ou CNPJ do destinatário').fill('12345678909');await page.getByLabel('Telefone do destinatário').fill('11999999999');
  await page.getByRole('button',{name:'Preparar registro'}).click();await expect(page.getByRole('dialog')).toBeVisible();expect(state.shipping.body).toBeUndefined();
  await page.getByRole('dialog').getByRole('button',{name:'Adicionar remessa'}).click();
  await expect(page.getByText(/Remessa adicionada ao carrinho do Melhor Envio:/)).toBeVisible();expect(state.shipping.body.recipient_document).toBe('12345678909');
  expect(await page.evaluate(()=>JSON.stringify(localStorage))).not.toContain('12345678909');
});
