# Pupi — relatório da Fase 1

Data: 05/11/2026. Versão do código: 0.1.0.

**Estado: implementação local verificada; integração e homologação no Supabase hospedado pendentes. A Fase 1 ainda não está concluída no ambiente definitivo.**

## Implementado

- Arquitetura em JavaScript ES Modules, com configuração, serviços, repositório de catálogo, utilitários e responsabilidades dos próximos módulos documentadas.
- Cliente Supabase reutilizável, configuração pública validada e recusa de chaves secretas no cliente.
- Tratamento de erros sem exibir detalhes SQL ou credenciais.
- Migration atômica com 15 tabelas, UUIDs, timestamps, relacionamentos, índices e restrições.
- RLS em todas as tabelas públicas, GRANTs explícitos e restrição de colunas editáveis.
- Perfis e função customer criados por trigger do Auth; metadados do usuário não atribuem permissões.
- Catálogo público limitado a produtos publicados/ativos de categorias ativas; dados pessoais e operacionais protegidos.
- Estoque com saldo não negativo, ajuste administrativo transacional, movimentos e auditoria.
- Primitiva interna de criação de pedido: preço no banco, locks de produtos, idempotência por cliente, endereço histórico, itens imutáveis, total gerado e validação diferida de subtotal.
- Modelo de entregas/eventos e regras de transição de status de pedidos.
- Buckets privados de produtos e categorias, regras de acesso, limite de tamanho e tipos de arquivo.
- Serviço de mídia com caminhos novos, sem sobrescrita, remoção via Storage e assinatura por cinco minutos.
- Configuração local da pilha Supabase e comando para futura verificação da conexão hospedada.

## Arquivos

O README inicial foi atualizado. Os demais arquivos da entrega são novos:

| Área | Arquivos |
| --- | --- |
| Raiz | `.gitignore`, `.env.example`, `package.json`, `package-lock.json` |
| Configuração e entrada | `src/config/environment.js`, `src/index.js` |
| Serviços e dados | `src/services/supabase.js`, `src/services/media.js`, `src/repositories/catalog.js`, `src/utils/errors.js` |
| Módulos futuros | `src/modules/README.md` |
| Supabase | `supabase/config.toml`, `supabase/.gitignore`, `supabase/migrations/20261105180946_pupi_foundation.sql` |
| Verificação hospedada | `scripts/verify-connection.js` |
| Testes | `tests/services.test.js`, `tests/database/foundation.test.js`, `tests/database/platform.sql`, `tests/database/fixtures.sql` |
| Documentação | `docs/architecture.md`, `docs/setup.md`, `docs/security.md`, `docs/phase-1-report.md`, `docs/test-results.txt` |

## Banco de dados

Tabelas: `profiles`, `user_roles`, `addresses`, `categories`, `products`, `product_images`, `carts`, `cart_items`, `orders`, `order_items`, `shipments`, `shipment_events`, `store_settings`, `stock_movements` e `audit_logs`.

Valores monetários são centavos inteiros. Cada apresentação vendável tem seu próprio SKU; variantes opcionais foram adiadas. O schema `private` contém funções internas e não deve ser exposto na API. A única função pública adicionada é o wrapper de ajuste de estoque, que exige administrador.

**Alterações em banco hospedado: nenhuma.** A migration foi aplicada e executada no PostgreSQL embarcado dos testes. Dados sintéticos estão restritos às fixtures de teste; o catálogo de produção não recebeu seeds.

## Integrações

`@supabase/supabase-js` 2.119.0, CLI Supabase 2.83.0 e PGlite 0.5.15, com versões exatas e lockfile. O código de integração está preparado, mas não foi conectado a um projeto hospedado. Google OAuth, Melhor Envio e gateway de pagamento permanecem nas fases previstas. Nenhum pagamento ou envio foi simulado.

## Verificação realizada

`npm run check`: **43 testes passaram**, sendo 5 de serviços JavaScript e 38 de banco. Saída disponível em `docs/test-results.txt`.

Cobertura funcional: aplicação da migration, RLS nas 15 tabelas, índices de chaves estrangeiras, permissões de funções, catálogo anônimo, isolamento entre dois clientes, rejeição de promoção a administrador, campos protegidos, ajuste de estoque, saldo negativo, rollback completo após falha durante gravações, preços do banco, idempotência, subtotal, histórico imutável, transições de pedido, isolamento de entregas, proteção de imagens e logs.

O motor executado foi **PostgreSQL 18.6 via PGlite 0.5.15**. A configuração da pilha Supabase local usa PostgreSQL 17; a compatibilidade e os serviços reais ainda precisam ser homologados no projeto definitivo. Os contratos de Auth/Storage dos testes não executam GoTrue, PostgREST ou o servidor HTTP de Storage.

`npm audit --omit=dev --audit-level=high`: nenhuma vulnerabilidade reportada nas dependências de produção. `npm ls --depth=0` conferiu as versões instaladas. `git diff --check` não apontou problemas.

`npm run verify:remote` foi executado sem configuração e recusou continuar com mensagem explícita de URL/chave ausentes. Isso verifica o tratamento da configuração faltante; **não confirma uma conexão remota**.

## Problemas encontrados e tratamento

- O repositório original continha apenas README. A estrutura foi criada sem descartar código existente.
- O único Supabase visível inicialmente era de outro sistema. O usuário escolheu outro projeto e informará o identificador; o projeto existente não foi alterado.
- Docker está sem acesso ao socket neste ambiente. Advisors locais também não conseguiram conectar ao banco local. Foi usado PostgreSQL embarcado para verificar SQL e RLS; advisors e homologação de serviços continuam pendentes.
- A CLI recente tentou gravar configuração no diretório pessoal, que é protegido. A CLI 2.83.0 foi obtida da release oficial com checksum verificado para gerar config e migration.
- O índice de changelog do Supabase retornou HTTP 403 neste ambiente. As referências atuais de RLS, permissões e Storage foram consultadas pelo MCP de documentação.
- Os testes detectaram um erro no trigger compartilhado de validação de subtotal ao acessar campos diferentes de orders/order_items. O trigger foi corrigido e a suíte completa passou depois da correção.

## Pendências para encerrar a Fase 1

1. Receber o identificador do projeto Supabase Pupi e verificar o esquema e as migrations existentes.
2. Aplicar a migration no destino correto e configurar URL/chave pública.
3. Validar conexão HTTP real, criação de perfil via Auth e operações de mídia via Storage.
4. Executar advisors de segurança/desempenho e corrigir eventuais achados do projeto.
5. Homologar disputa por estoque e idempotência usando conexões concorrentes independentes.

O procedimento está em `docs/setup.md`. Nenhuma dessas verificações foi declarada realizada.

## Próxima fase

A Fase 2 será autenticação e gerenciamento de usuários, incluindo telas, OAuth Google e recuperação de senha. Ela não foi iniciada e depende de autorização após o fechamento da Fase 1.
