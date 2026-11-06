import { test, expect } from '@playwright/test';
import { installApi, validPassword, user } from './api.js';

test('login, perfil persistido e logout, com senha mascarada e sem promover metadata', async ({ page }) => {
  const api = await installApi(page);
  await page.goto('/#/entrar');
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
  await page.getByLabel('E-mail', { exact: false }).fill('pessoa@example.com');
  const password = page.getByLabel(/^Senha/);
  await password.fill(validPassword); await expect(password).toHaveAttribute('type', 'password');
  await page.getByRole('button', { name: 'Mostrar senha', exact: true }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Meus dados', exact: true })).toBeVisible();
  await page.screenshot({ path: 'work/pupi-conta-desktop.png', fullPage: true });
  await expect(page.getByRole('link', { name: 'Administração' })).toHaveCount(0);
  await page.getByLabel('Nome completo').fill('Nome atualizado');
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Alterações salvas.', { exact: true })).toBeVisible();
  expect(api.profile.full_name).toBe('Nome atualizado');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
});

test('perfil mantém formulário e atalhos legíveis em mobile sem rolagem horizontal', async ({ page }) => {
  await installApi(page, { signedIn: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/conta');
  await expect(page.getByRole('heading', { name: 'Meus dados', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gerenciar endereços' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Consultar pedidos' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const mainPanel = await page.locator('.profile-main').boundingBox();
  const accountPanel = await page.locator('.profile-sidebar').boundingBox();
  expect(accountPanel.y).toBeGreaterThan(mainPanel.y);
});

test('cadastro valida confirmação e aceite e aguarda confirmação por e-mail', async ({ page }) => {
  const api = await installApi(page);
  await page.goto('/#/cadastro');
  await page.getByLabel('Nome completo').fill('Pessoa Teste');
  await page.getByLabel('E-mail').fill('pessoa@example.com');
  await page.getByLabel(/^Senha/).fill(validPassword);
  await page.getByLabel('Confirme a senha').fill('SenhaDiferente456');
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByText('As senhas precisam ser iguais.')).toBeVisible();
  await expect(page.getByText('Leia e aceite o aviso de testes para continuar.')).toBeVisible();
  expect(api.signUps).toHaveLength(0);
  await page.getByLabel('Confirme a senha').fill(validPassword);
  await page.getByLabel('Li o aviso').check();
  await page.getByRole('button', { name: 'Criar conta', exact: true }).click();
  await expect(page.getByText(/você receberá um e-mail/)).toBeVisible();
  expect(api.signUps).toHaveLength(1);
  expect(api.signUps[0].data.terms_version).toBe('testing-v1');
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
});

test('credenciais rejeitadas preservam e-mail e não expõem erro técnico', async ({ page }) => {
  await installApi(page); await page.goto('/#/entrar');
  await page.getByLabel('E-mail').fill('pessoa@example.com');
  await page.getByLabel(/^Senha/).fill('SenhaErrada');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText('E-mail ou senha incorretos.')).toBeVisible();
  await expect(page.getByLabel('E-mail')).toHaveValue('pessoa@example.com');
  await expect(page.getByLabel(/^Senha/)).toHaveValue('');
});

test('recuperação informa envio neutro e exige link validado para nova senha', async ({ page }) => {
  const api = await installApi(page); await page.goto('/#/recuperar');
  await page.getByLabel('E-mail').fill('pessoa@example.com');
  await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
  await expect(page.getByText(/Se houver uma conta com esse e-mail/)).toBeVisible();
  expect(api.recoveries).toBe(1);
  await page.goto('/#/nova-senha');
  await expect(page.getByRole('heading', { name: 'Link de recuperação necessário' })).toBeVisible();
});

test('Google não configurado mantém a alternativa de e-mail e senha', async ({ page }) => {
  await installApi(page); await page.goto('/#/entrar');
  await page.getByRole('button', { name: 'Continuar com Google' }).click();
  await expect(page.getByText(/Google ainda não está configurado/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Entrar', exact: true })).toBeEnabled();
});

test('endereço: criar, abrir select nativo, editar e excluir com confirmação', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const api = await installApi(page, { signedIn: true });
  await page.goto('/#/enderecos');
  await expect(page.getByRole('heading', { name: 'Nenhum endereço cadastrado' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('link', { name: 'Adicionar endereço' }).click();
  const formPanel = await page.locator('.address-form-main').boundingBox();
  const guidancePanel = await page.locator('.address-guidance').boundingBox();
  expect(guidancePanel.y).toBeGreaterThan(formPanel.y);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.setViewportSize({ width: 1280, height: 900 });
  const desktopFormPanel = await page.locator('.address-form-main').boundingBox();
  const desktopGuidancePanel = await page.locator('.address-guidance').boundingBox();
  expect(desktopGuidancePanel.x).toBeGreaterThan(desktopFormPanel.x);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Destinatário').fill('Pessoa Teste');
  await page.getByLabel('CEP').fill('01001-000');
  await page.getByLabel('Rua ou avenida').fill('Rua de teste');
  await page.getByLabel('Número', { exact: false }).fill('10');
  await page.getByLabel('Bairro').fill('Centro');
  await page.getByLabel('Cidade').fill('São Paulo');
  await page.getByLabel('UF').click(); await page.keyboard.press('Escape');
  await page.getByLabel('UF').selectOption('SP');
  await page.getByLabel('Usar como endereço padrão').check();
  await page.getByRole('button', { name: 'Salvar endereço' }).click();
  await expect(page.getByText('Endereço salvo.', { exact: true })).toBeVisible();
  expect(api.addresses).toHaveLength(1); expect(api.addresses[0].postal_code).toBe('01001000');
  await page.getByRole('button', { name: 'Fechar aviso' }).click();
  await page.getByRole('link', { name: 'Editar endereço' }).click();
  await page.getByLabel('Nome do endereço').fill('Trabalho');
  await page.getByRole('button', { name: 'Salvar endereço' }).click();
  await expect(page.getByRole('heading', { name: 'Trabalho' })).toBeVisible();
  await page.getByRole('button', { name: 'Fechar aviso' }).click();
  api.failDelete = true;
  await page.getByRole('button', { name: 'Excluir endereço', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir endereço', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('Não foi possível concluir');
  api.failDelete = false;
  await page.getByRole('dialog').getByRole('button', { name: 'Excluir endereço', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Nenhum endereço cadastrado' })).toBeVisible();
  expect(api.addresses).toHaveLength(0);
});

test('falha de gravação preserva dados, impede envio duplicado e oferece recuperação', async ({ page }) => {
  const api = await installApi(page, { signedIn: true });
  await page.goto('/#/conta');
  await page.getByLabel('Nome completo').fill('Dados preservados');
  api.failSave = true; api.saveDelay = 350;
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('button', { name: 'Salvar alterações' })).toBeDisabled();
  await expect(page.getByText('Não foi possível concluir a operação. Tente novamente.')).toBeVisible();
  await expect(page.getByLabel('Nome completo')).toHaveValue('Dados preservados');
  api.failSave = false;
  await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByText('Alterações salvas.', { exact: true })).toBeVisible();
});

test('alterações não salvas usam dialog acessível com Escape e restauração de foco', async ({ page }) => {
  await installApi(page, { signedIn: true }); await page.goto('/#/conta');
  await page.getByLabel('Nome completo').fill('Ainda não salvo');
  const target = page.getByRole('link', { name: 'Endereços', exact: true });
  await target.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(target).toBeFocused();
  await expect(page.getByLabel('Nome completo')).toHaveValue('Ainda não salvo');
  await target.click(); await page.getByRole('button', { name: 'Descartar alterações' }).click();
  await expect(page.getByRole('heading', { name: 'Meus endereços' })).toBeVisible();
});

test('cliente recebe acesso restrito; administrador é validado por RPC', async ({ page }) => {
  const api = await installApi(page, { signedIn: true }); await page.goto('/#/admin');
  await expect(page.getByRole('heading', { name: 'Acesso restrito' })).toBeVisible();
  api.role = 'admin'; await page.getByRole('link', { name: 'Voltar', exact: true }).click();
  await page.getByRole('link', { name: 'Administração' }).click();
  await expect(page.getByRole('heading', { name: 'Resumo da loja' })).toBeVisible();
});

test('OAuth solicita aceite após sessão; pedidos vazios não contêm registros ilustrativos', async ({ page }) => {
  await installApi(page, { signedIn: true, notice: false }); await page.goto('/#/conta');
  await expect(page.getByRole('heading', { name: 'Antes de continuar' })).toBeVisible();
  await page.getByLabel('Li o aviso').check();
  await page.getByRole('button', { name: 'Continuar para minha conta' }).click();
  await page.getByRole('link', { name: 'Pedidos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Você ainda não tem pedidos' })).toBeVisible();
});

test('interface em 390px, teclado, foco, scrollbar e estado offline', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installApi(page); await page.goto('/#/entrar');
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-BR');
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'work/pupi-login-mobile.png', fullPage: true });
  await page.getByLabel('E-mail').focus(); await page.keyboard.press('Tab');
  await expect(page.getByLabel(/^Senha/)).toBeFocused();
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollbarColor)).not.toBe('auto');
  await context.setOffline(true);
  await expect(page.getByText(/Sem conexão · reconecte/)).toBeVisible();
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page.getByText(/Você está sem conexão/)).toBeVisible();
  await context.setOffline(false);
});

test('sessão expirada remove dados privados da tela e solicita novo login', async ({ page }) => {
  const api = await installApi(page, { signedIn: true }); await page.goto('/#/conta');
  await expect(page.getByRole('heading', { name: 'Meus dados', exact: true })).toBeVisible();
  api.expired = true;
  await page.getByRole('link', { name: 'Pedidos', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sair', exact: true })).toHaveCount(0);
});

test('callback PKCE de recuperação permite trocar senha, limpa URL e encerra sessão', async ({ page }) => {
  await installApi(page);
  await page.goto('/#/recuperar');
  await page.getByLabel('E-mail').fill('pessoa@example.com');
  await page.getByRole('button', { name: 'Enviar link de recuperação' }).click();
  await expect(page.getByText(/Se houver uma conta com esse e-mail/)).toBeVisible();
  await page.goto('/?code=valid-recovery-code&auth_callback=recovery');
  await expect(page.getByRole('heading', { name: 'Escolha uma nova senha' })).toBeVisible();
  expect(page.url()).not.toContain('code=');
  await page.getByLabel(/^Senha/).fill('NovaSenhaDeTeste789');
  await page.getByLabel(/^Confirme a senha/).fill('NovaSenhaDeTeste789');
  await page.getByRole('button', { name: 'Salvar nova senha' }).click();
  await expect(page.getByRole('heading', { name: 'Entre na sua conta' })).toBeVisible();
  await expect(page.getByText('Senha alterada. Entre novamente com sua nova senha.')).toBeVisible();
});

test('link de pular conteúdo preserva rota, e nome malicioso não vira HTML', async ({ page }) => {
  const api = await installApi(page, { signedIn: true });
  api.profile.full_name = '<img src=x onerror="window.injected=true">';
  await page.goto('/#/conta');
  await expect(page.getByLabel('Nome completo')).toHaveValue(api.profile.full_name);
  await page.getByRole('link', { name: 'Pular para o conteúdo' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main')).toBeFocused();
  expect(page.url()).toContain('#/conta');
  expect(await page.evaluate(() => window.injected)).toBeUndefined();
  await expect(page.locator('img')).toHaveCount(0);
});

test('pedido exibe itens, total e endereço históricos sem criar entrega inexistente', async ({ page }) => {
  const api = await installApi(page, { signedIn: true });
  api.orders.push({
    id: '50000000-0000-4000-8000-000000000001', order_number: 7, status: 'confirmed', payment_status: 'pending',
    subtotal_cents: 3000, shipping_cents: 500, total_cents: 3500, currency: 'BRL', created_at: '2026-11-05T12:00:00Z',
    address_snapshot: { recipient: 'Pessoa Teste', street: 'Rua histórica', number: '10', complement: 'Sala 2',
      neighborhood: 'Centro', city: 'São Paulo', state: 'SP', postal_code: '01001000', country: 'BR' },
    items: [{ id: 'item-1', product_name: 'Produto registrado na compra', product_sku: 'TEST-1', quantity: 2, unit_price_cents: 1500, line_total_cents: 3000 }],
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#/pedidos');
  await expect(page.getByRole('heading', { name: 'Meus pedidos' })).toBeVisible();
  await expect(page.locator('.order-card-total strong')).toHaveText('R$ 35,00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('link', { name: 'Ver detalhes' }).click();
  await expect(page.getByRole('heading', { name: 'Pedido #7', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Produto registrado na compra' })).toBeVisible();
  await expect(page.getByText(/Rua histórica, 10 · Sala 2/)).toBeVisible();
  await expect(page.getByText(/A entrega ainda não foi registrada/)).toBeVisible();
  await expect(page.locator('main')).toContainText('R$ 35,00');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  const totalsBox = await page.locator('.order-summary-card').boundingBox();
  const productsBox = await page.locator('.order-products-card').boundingBox();
  expect(totalsBox.x).toBeGreaterThan(productsBox.x);
});

test('CEP preenche endereço pelo ViaCEP e preserva campos digitados', async ({ page }) => {
  await installApi(page, { signedIn: true });
  await page.route('https://viacep.com.br/ws/01001000/json/', route => route.fulfill({json:{cep:'01001-000',logradouro:'Praça da Sé',bairro:'Sé',localidade:'São Paulo',uf:'SP'}}));
  await page.goto('/#/enderecos/novo');
  await page.getByLabel('Bairro').fill('Bairro escolhido');
  await page.getByLabel('CEP').fill('01001-000');
  await expect(page.getByLabel('Rua ou avenida')).toHaveValue('Praça da Sé');
  await expect(page.getByLabel('Bairro')).toHaveValue('Bairro escolhido');
  await expect(page.getByLabel('Cidade')).toHaveValue('São Paulo');
  await expect(page.getByLabel('UF')).toHaveValue('SP');
  await expect(page.getByLabel('Número', {exact:false})).toHaveValue('');
  await page.getByLabel('Rua ou avenida').fill('Rua corrigida');
  await expect(page.getByLabel('Rua ou avenida')).toHaveValue('Rua corrigida');
});

test('CEP desconhecido ou consulta indisponível permite preenchimento manual', async ({ page }) => {
  await installApi(page, { signedIn: true });
  await page.route('https://viacep.com.br/ws/**', route => route.request().url().includes('99999999') ? route.fulfill({json:{erro:true}}) : route.abort());
  await page.goto('/#/enderecos/novo');
  await page.getByLabel('CEP').fill('99999999');
  await expect(page.getByText(/CEP não encontrado/)).toBeVisible();
  await page.getByLabel('CEP').fill('01001000');
  await expect(page.getByText(/Não foi possível consultar o CEP/)).toBeVisible();
  await page.getByLabel('Rua ou avenida').fill('Rua manual');
  await expect(page.getByLabel('Rua ou avenida')).toHaveValue('Rua manual');
});

test('resposta atrasada do CEP anterior não altera o endereço atual', async ({ page }) => {
  await installApi(page, { signedIn: true });
  await page.route('https://viacep.com.br/ws/**', async route => {
    if(route.request().url().includes('01001000')) {await new Promise(resolve=>setTimeout(resolve,1000));return route.fulfill({json:{logradouro:'Endereço antigo',localidade:'São Paulo',uf:'SP'}}).catch(()=>{});}
    return route.fulfill({json:{logradouro:'Endereço novo',bairro:'Centro',localidade:'Rio de Janeiro',uf:'RJ'}});
  });
  await page.goto('/#/enderecos/novo');
  await page.getByLabel('CEP').fill('01001000');await expect(page.getByText('Consultando CEP…')).toBeVisible();
  await page.getByLabel('CEP').fill('20040020');
  await expect(page.getByLabel('Rua ou avenida')).toHaveValue('Endereço novo');
  await expect(page.getByLabel('UF')).toHaveValue('RJ');
});


test('pedido pendente informa pagamento indisponível sem configurar credenciais',async({page})=>{
  const api=await installApi(page,{signedIn:true});
  const id='50000000-0000-4000-8000-000000000001';
  api.orders.push({id,order_number:9,user_id:user.id,status:'confirmed',payment_status:'pending',subtotal_cents:3000,shipping_cents:500,total_cents:3500,created_at:'2026-11-05T12:00:00Z',address_snapshot:{recipient:'Pessoa Teste',street:'Rua teste',number:'1',neighborhood:'Centro',city:'São Paulo',state:'SP',postal_code:'01001000'},items:[],shipment:null});
  await page.goto(`/#/pedidos/${id}`);await page.getByRole('button',{name:'Pagar com Mercado Pago'}).click();
  await expect(page.getByText('Pagamento ainda não está disponível.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Pagar com Mercado Pago'})).toBeEnabled();
});
