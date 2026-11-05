# Pupi — executar e configurar a Fase 2

## Testar o front-end

Requisitos: Node.js 24+ e npm. Use a branch `codex/pupi-fase-2`.

```sh
npm ci
cp .env.example .env
npm run dev
```

No Windows, copie `.env.example` para `.env` pelo editor ou use `copy .env.example .env`. Abra **http://localhost:3000**. O `index.html` usa módulos e depende do servidor; abrir o arquivo por `file://` não executa a aplicação corretamente.

A configuração pública existente do projeto Pupi foi preservada. URL: `https://loifqxmmnmhpwnwcvrak.supabase.co`. O arquivo `.env` é ignorado pelo Git. O Vite expõe apenas URL e chave publishable; não exporta outras variáveis do ambiente. Chaves `service_role` e `sb_secret_` não são aceitas pelo cliente.

Para testar o build:

```sh
npm run build
npm run preview
```

## Banco hospedado

O projeto `pupi` já tinha as 15 tabelas da fundação, criadas sem registro de migration. A migration **20261105191408_pupi_auth_accounts.sql** foi aplicada pelo MCP nesta entrega e registrada no histórico. Ela acrescenta a versão do aviso ao perfil e as RPCs `accept_test_notice`, `save_address` e `admin_access_status`.

Não reaplique a migration de fundação sobre essas tabelas. Para adotar a CLI nesse projeto hospedado, primeiro compare a fundação existente com a migration inicial e regularize seu histórico com `supabase migration repair` (consulte `--help`). O registro da Fase 2 já existe; não altere seu estado para tentar reaplicá-la. A pilha local nova aplica as duas migrations em ordem normalmente.

Manter somente `public` exposto à Data API, sem expor `private`. Perfis, endereços, pedidos e permissões são autorizados por RLS e GRANTs, além das verificações de sessão no front-end.

## Supabase Auth no dashboard

Este código não altera automaticamente a configuração hospedada de Auth. Confira:

1. Provedor Email habilitado e cadastro permitido.
2. Confirmação de e-mail habilitada, rotação de refresh token e troca segura de senha.
3. Senha mínima de **12 caracteres**, com maiúscula, minúscula e número, para alinhar a validação do serviço à interface e ao `supabase/config.toml` local.
4. SMTP e remetente para testes de confirmação/recuperação. O provedor padrão tem limites e restrições; receber uma resposta de API não comprova entrega na caixa postal.
5. Site URL: `http://localhost:3000` durante testes locais.
6. Em Redirect URLs, permitir explicitamente as URLs usadas:

   ```text
   http://localhost:3000/?auth_callback=signup
   http://localhost:3000/?auth_callback=oauth
   http://localhost:3000/?auth_callback=recovery
   http://127.0.0.1:3000/?auth_callback=signup
   http://127.0.0.1:3000/?auth_callback=oauth
   http://127.0.0.1:3000/?auth_callback=recovery
   ```

Se usar outro domínio/porta, adicionar suas URLs exatas e iniciar o fluxo novamente a partir dessa origem. Em produção, usar HTTPS e evitar curingas amplos.

## Google OAuth

No Google Cloud, configurar a tela de consentimento e criar um cliente OAuth do tipo Web. Adicionar como URI de redirecionamento autorizada:

```text
https://loifqxmmnmhpwnwcvrak.supabase.co/auth/v1/callback
```

No Supabase Authentication → Providers → Google, habilitar o provedor e cadastrar Client ID e Client Secret. **O Client Secret fica somente no dashboard/backend.** Enquanto o aplicativo Google estiver em modo de testes, adicionar as contas de teste autorizadas no Google Cloud.

O botão Google consulta a disponibilidade do provedor antes de sair do aplicativo, inicia PKCE por ação explícita e retorna à origem do front-end. Se o provedor estiver desativado, a interface mantém login por e-mail e senha e informa a pendência. Não há vinculação insegura automática de contas.

## Recuperação de senha

Solicite o link na rota `#/recuperar` e abra-o no mesmo navegador. O SDK persiste o verificador PKCE; o callback troca o código por sessão e verifica o tipo de fluxo. Parâmetro `auth_callback=recovery` sozinho não abre uma sessão de recuperação.

Depois da troca, o código sai da URL e um marcador temporário de recuperação fica em sessionStorage para permitir recarregar a tela. Ele não contém token nem substitui a validação da sessão. A alteração usa `updateUser`; após sucesso, a sessão desta aplicação é encerrada e é solicitado novo login. Não afirmamos revogar imediatamente JWTs antigos de outras sessões.

## Perfil, endereços e permissões

Perfil edita somente nome/telefone. A edição compara updated_at para detectar alterações concorrentes. Endereços são criados/editados por RPC transacional: o titular vem de auth.uid(), campos estranhos são recusados, a troca de padrão usa lock por titular e uma versão antiga é rejeitada. Exclusão requer confirmação e preserva snapshots de pedidos anteriores.

O cliente comum não promove contas. O gate administrativo consulta a função real em user_roles e a RPC protegida. Ainda não existe painel de catálogo: a rota mostra somente a confirmação de acesso prevista para esta fase. Pedidos e detalhes leem registros reais do usuário; o aplicativo não semeia produtos ou compras de demonstração.

## Aviso de testes

O usuário autorizou o aviso `testing-v1` enquanto não há links oficiais. Cadastro exige aceite explícito; contas que chegam pelo Google completam o aceite depois do login. Timestamp é do banco, e a versão não concede privilégios. Antes de produção, substituir esse aviso pelos documentos oficiais e atualizar a política de versão/aceite no código e no banco.

## Testes automatizados

```sh
npm run check
npm run build
npm run design:check
npm run test:e2e
```

Os testes do navegador interceptam chamadas para um projeto fictício, com dados limitados às fixtures. Eles **não simulam sucesso no aplicativo entregue** e não enviam e-mails reais. O runner usa Chromium de sistema quando disponível; em outras máquinas, instalar o navegador com `npx playwright install chromium`. Para escolher outro binário, definir CHROMIUM_PATH.

O ambiente desta implementação bloqueia HTTP direto ao Supabase pelo proxy (403). Assim, a verificação real de cadastro por Auth, recebimento de e-mails, reset e consentimento Google deve ser feita no navegador local, após a configuração acima. O MCP conseguiu aplicar e verificar o banco real; isso não substitui a homologação dos serviços HTTP.
