# Contrato de experiência — Pupi Fase 2

## Contexto e fontes

Clientes brasileiros, pt-BR, celular e desktop. Datas de conta em America/Sao_Paulo. Fontes: briefing do Pupi, `docs/architecture.md`, `docs/security.md` e APIs Supabase Auth. A autorização do usuário permite aviso de testes enquanto não há termos oficiais. Acessibilidade: WCAG 2.2 AA. A fase não contém compras nem gestão administrativa de catálogo.

## Contrato visual

`DESIGN.md` gera `src/styles/tokens.css` por `scripts/design-tokens.js`. Componentes compartilham `src/styles/app.css`. Tema claro; cores de sistema em alto contraste. `npm run design:check` verifica os tokens.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | src/ui/forms.js | UX-CONTRACT.md | create / edit / auth | tests/e2e/account.spec.js |
| Select/Listbox | src/ui/forms.js | DESIGN.md | native | tests/e2e/account.spec.js |
| Scrollbar | src/styles/app.css | DESIGN.md | global | tests/e2e/account.spec.js |
| Toast | src/ui/feedback.js | UX-CONTRACT.md | success / error / info | tests/e2e/account.spec.js |
| CRUD | src/repositories/account.js | docs/security.md | return / stay | tests/e2e/account.spec.js |

## Fluxos

| Operação | Ocupado | Sucesso | Falha e foco |
|---|---|---|---|
| Cadastro | Bloquear reenvio | Conta se houver sessão; caso contrário, instrução de confirmação de e-mail | Preservar nome/e-mail; erro de campo ou mensagem genérica sem enumerar contas |
| Login | Bloquear reenvio | Destino protegido validado ou Minha conta | Preservar e-mail, limpar senha quando rejeitada |
| Google | Abrir provedor apenas por clique | Callback PKCE, validar usuário, completar aviso se necessário | Mensagem e login por senha disponíveis |
| Recuperação | Bloquear reenvio | Mensagem neutra sobre envio do link | Preservar e-mail; permitir tentar novamente |
| Nova senha | Validar sessão de recuperação | Encerrar sessão e solicitar novo login | Explicar link inválido/expirado e permitir pedir outro |
| Perfil | Confirmação no backend | Permanecer no perfil, anunciar Salvo | Preservar campos; conflito pede recarregamento explícito |
| Endereço | Confirmação no backend | Retornar à lista na página válida | Preservar formulário e explicar erro |
| Excluir endereço | Dialog aguarda backend | Fechar e atualizar lista | Erro permanece no dialog; Cancelar disponível |
| Logout | Bloquear duplicata | Limpar dados privados da memória e voltar ao login | Não afirmar saída se o servidor recusou |

## Navegação e permissões

Rotas por hash, títulos por página e botão Voltar preservado. Conta, endereços e pedidos exigem usuário validado com getUser. Acesso administrativo consulta função no banco e uma RPC; cliente recebe página 403 ao acessar diretamente. Nenhuma decisão usa user_metadata. RLS e GRANTs continuam sendo a autorização real do backend.

Páginas de auth são públicas. `/nova-senha` exige callback PKCE de recuperação ou marcador temporário dessa sessão validada; query string sozinha não autoriza troca. Callbacks são limpos da URL depois de processados. Retorno interno é limitado às rotas conhecidas; não usar next externo.

Pedidos: páginas de 10, ordenação estável por data/id; detalhes incluem itens e eventos reais. Endereços: páginas de 10, edição retorna à lista; exclusão ajusta página vazia. Nenhum endereço ou busca sensível fica na URL. Sem resultado é diferente de erro e de falta de permissão.

## Formulários e dados

Validação no submit e no campo já inválido durante edição; novalidate, aria-invalid/aria-describedby, resumo e foco no primeiro erro. Autocomplete e colagem de senhas permitidos. Senhas nunca são gravadas pela aplicação ou incluídas em logs. O SDK Supabase persiste a sessão e o verificador PKCE conforme seu contrato para SPA; não há armazenamento adicional de perfis ou senhas nem cache público de respostas privadas.

Perfil e endereço detectam edição não salva. Navegação interna usa dialog compartilhado; saída da página usa beforeunload somente quando necessário. Estado ocupado bloqueia envio e navegação que abandonaria uma gravação. Dados digitados não sensíveis permanecem após erro. Não manter senha após sucesso, logout ou mudança de fluxo.

UF usa select nativo, sem prometer geometria própria. Nenhum date picker. Campos de data exibidos são somente leitura. Telefone é opcional; CEP brasileiro e UF são validados no cliente e no PostgreSQL.

## Async, sessão e feedback

Gravações pessimistas, sem sucesso antecipado. Leituras de rota usam AbortController e geração de rota para rejeitar resposta antiga. Consultas têm timeout; sem conexão não há fila de gravação ou promessa de sucesso. Sessão expirada limpa estado privado e oferece login. Mudanças de sessão em outra aba atualizam a navegação.

Um sistema de feedback persistente com live region; mensagens críticas não desaparecem automaticamente. Carregamento tem texto em região estável, sem skeleton. Dialog nativo showModal, foco no Cancelar, Escape quando ocioso, foco restaurado ao fechar, sem chamadas a alert/confirm/prompt.

Atualizações de perfil e endereço comparam updated_at para evitar sobrescrita silenciosa. Definir endereço padrão é transacional e bloqueia por usuário. Tentativa de salvar conflito mantém os dados e permite voltar/recarregar. Cadastro e e-mails não são repetidos automaticamente.

## Verificação

`npm run check`, `npm run build`, `npm run design:check`, `npm run test:e2e` e auditor estático da skill. Testes E2E usam respostas de teste explicitamente interceptadas; não são prova de autenticação hospedada. Navegador: desktop e 390px, teclado, select aberto, mensagens, offline, sessão expirada, erro e fluxo de CRUD. Login/cadastro/Google/e-mail reais dependem da configuração externa documentada.
