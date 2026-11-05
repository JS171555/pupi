# Pupi — relatório da Fase 2

Data: 05/11/2026. Versão: 0.2.0.

**Estado: código implementado, migration aplicada no Supabase Pupi e testes automatizados aprovados. A homologação completa de Auth HTTP, Google OAuth e entrega de e-mails permanece pendente.** A Fase 3 não foi iniciada.

## Funcionalidades

- `index.html` funcional, servido por Vite, com interface pt-BR e adaptação para celular/desktop.
- Cadastro com nome, e-mail, senha, confirmação e aceite do aviso de testes autorizado pelo usuário. O aceite recebe timestamp do banco e versão testing-v1.
- Login por e-mail/senha, sessão persistida pelo SDK, validação por getUser e logout desta sessão.
- Google OAuth por PKCE, consulta de disponibilidade do provedor, callback e conclusão do aviso para contas que não tenham aceite.
- Recuperação de senha por e-mail, troca PKCE, tratamento de link inválido/expirado, limpeza do código da URL, atualização de senha e novo login após encerrar a sessão local.
- Perfil: leitura e edição de nome/telefone com verificação de updated_at.
- Endereços: listagem paginada, cadastro, edição, exclusão confirmada, padrão transacional e detecção de versão antiga.
- Pedidos: listagem paginada, detalhes de itens e valores históricos, endereço da compra e eventos reais de entrega quando existirem.
- Gate administrativo com papel lido no banco e RPC protegida. Cliente comum recebe tela de acesso restrito; o painel de gestão fica para a Fase 3.
- Mensagens de campo, senhas com mostrar/ocultar, foco de teclado, confirmação acessível, prevenção de envio duplicado, erro/offline e proteção contra perda de edições.

Não há dados fictícios no aplicativo, conclusão simulada de compra ou pagamento. As fixtures de navegador são exclusivas dos testes e suas chamadas são interceptadas para um projeto fictício.

## Alterações no banco hospedado

Projeto: `pupi` (`loifqxmmnmhpwnwcvrak`). As 15 tabelas da fundação já existiam quando esta fase começou, sem registro da migration inicial no histórico; elas foram preservadas.

Migration registrada: `20261105191408_pupi_auth_accounts.sql`.

- Coluna `profiles.terms_version`.
- Trigger de criação de perfil atualizado para registrar somente o aceite booleano explícito da versão de testes; não usa role em metadados para autorização.
- RPC `accept_test_notice`, limitada ao próprio usuário autenticado.
- RPC `save_address`, com titular vindo de auth.uid(), whitelist de campos, lock por titular para o padrão e controle de versão.
- RPC `admin_access_status`, com consulta da permissão real no banco.
- Revogação de execução pública de `rls_auto_enable`, função de event trigger preexistente da plataforma que aparecia nos advisors. O event trigger continua disponível ao sistema.

Não houve criação de usuário administrador, preenchimento de catálogo ou pedidos. Os usuários e endereços temporários do teste SQL real foram revertidos por ROLLBACK. A consulta posterior confirmou zero usuários, perfis e endereços após o teste.

## Arquivos principais

| Área | Arquivos |
| --- | --- |
| Entrada/build | `index.html`, `vite.config.js`, `package.json`, `package-lock.json` |
| Aplicação | `src/app.js`, `src/index.js` |
| Autenticação | `src/modules/auth/service.js`, `validation.js`, `views.js` |
| Conta | `src/repositories/account.js`, `src/modules/account/views.js` |
| Componentes | `src/ui/dom.js`, `forms.js`, `feedback.js` |
| Estilos | `src/styles/app.css`, `src/styles/tokens.css` |
| Banco | `supabase/migrations/20261105191408_pupi_auth_accounts.sql`, redirects em `supabase/config.toml` |
| Testes | `tests/auth.test.js`, testes de banco ampliados, `tests/e2e/api.js`, `tests/e2e/account.spec.js`, `playwright.config.js` |
| Contratos | `DESIGN.md`, `UX-CONTRACT.md`, `premium-ui.json`, `scripts/design-tokens.js` |
| Documentação | `README.md`, `docs/phase-2-setup.md`, este relatório e evidência de testes |

A configuração pública acrescentada pelo usuário no GitHub foi preservada. O teste de serviços voltou a usar um endereço e chave fictícios: ele tinha sido alterado para a origem real, mas ainda esperava a origem fictícia em suas asserções. Credenciais e tráfego de produção não são necessários para esse teste.

## Verificação

**78 testes automatizados aprovados:**

- `npm run check`: 13 testes de serviços/validação e 50 de PostgreSQL embarcado.
- `npm run test:e2e`: 15 testes no Chromium, incluindo cadastro, login/logout, credenciais inválidas, Google desativado, pedido de recuperação, troca de senha após callback PKCE, perfil, CRUD de endereços, erro/retentativa, perda de edições, autorização, sessão expirada, pedido histórico, teclado, XSS, largura de 390px e offline.
- `npm run build`: build de produção aprovado.
- `npm run design:check`: tokens conferidos contra DESIGN.md.
- Auditor estático premium em modo strict: zero achados.
- Lint oficial de DESIGN.md: zero erros; oito avisos de tokens de paleta sem referência em metadados de componentes. São tokens preservados para a identidade do projeto; não são achados de segurança.
- `npm audit --omit=dev --audit-level=high`: nenhuma vulnerabilidade reportada em produção.
- Busca de alert/confirm/prompt e atribuições innerHTML no produto: nenhuma ocorrência.
- Inspeção visual de screenshots de conta desktop e login em celular.

No Supabase hospedado, um teste SQL em transação verificou criação de perfil/aceite, isolamento de perfis, rejeição de role=admin em metadata, endereço do próprio titular e bloqueio de escrita de função. A transação foi revertida. Advisors de segurança após a migration: **nenhum alerta**.

Os testes de PostgreSQL embarcado usam PGlite; o teste SQL hospedado executou no PostgreSQL 17 do projeto definitivo. Os testes de navegador usam respostas interceptadas; não comprovam envio de e-mail nem consentimento Google reais.

## Pendências externas e limites

O proxy deste ambiente recusou conexão HTTP direta ao domínio Supabase com 403. As ferramentas MCP de banco funcionaram, mas a restrição impediu homologar aqui o serviço Auth por HTTP. Nenhum e-mail real foi enviado para contornar esse bloqueio.

Antes de declarar a Fase 2 concluída no ambiente definitivo:

1. Conferir configuração do provedor Email, política de senha do servidor, confirmação de e-mail, SMTP e redirects no dashboard Supabase.
2. Configurar Google Cloud/Google OAuth no Supabase e testar uma conta autorizada.
3. Testar cadastro real, confirmação de e-mail, login, recuperação, troca de senha e logout no navegador local.
4. Fazer uma verificação HTTP com dois usuários reais para confirmar o comportamento do SDK/serviços com as políticas já testadas por SQL.

Os passos e URLs estão em `docs/phase-2-setup.md`. O aviso testing-v1 é provisório por autorização explícita do usuário e não substitui documentos oficiais antes de produção. O histórico da migration inicial, aplicada manualmente antes desta fase, precisa ser regularizado antes de um futuro db push com a CLI.

## Próxima fase

Fase 3: painel administrativo de produtos, categorias, imagens, estoque, pedidos e clientes. Exige nova autorização. Esta entrega contém somente o gate de acesso administrativo previsto para a Fase 2.
