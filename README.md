# Pupi — conta e autenticação

Fase 2 do e-commerce petshop, preservando a fundação da Fase 1. O `index.html` permite testar cadastro, login por senha, login Google, recuperação de senha, perfil, endereços e consulta de pedidos. O front-end usa HTML/CSS/JavaScript modular e Vite.

O projeto Supabase `pupi` está identificado, e a migration de contas foi aplicada. **A homologação de Google OAuth e entrega real de e-mails continua pendente de configuração e teste no navegador local.**

## Abrir o front-end de testes

Use a branch `codex/pupi-fase-2` e Node.js 24+:

```sh
npm ci
cp .env.example .env
npm run dev
```

Abra **http://localhost:3000**. No Windows, copie o arquivo pelo editor ou use `copy .env.example .env`. Não abra o index por file://. A [configuração da Fase 2](docs/phase-2-setup.md) explica redirects, Google Cloud, e-mails e as rotas de teste.

Não há compra nem painel de gestão de catálogo nesta fase. Cadastro e dados de conta usam o backend conectado; nenhum sucesso é simulado na aplicação.

## Executar os testes

Requisitos: Node.js 24+ e npm.

```sh
npm ci
npm run check
npm run build
npm run design:check
npm run test:e2e
```

Os testes usam PostgreSQL embarcado em PGlite e não exigem Docker nem credenciais. As tabelas mínimas de Auth/Storage em `tests/database/platform.sql` são contratos de teste; nunca aplique esse arquivo no Supabase.

## Conectar ao Supabase

Escolha um projeto dedicado e siga [a configuração](docs/setup.md). Copie `.env.example` para `.env` e preencha somente a URL e a chave `sb_publishable_` desse projeto. Depois da aplicação da migration:

```sh
npm run verify:remote
```

Este comando faz consultas anônimas reais ao catálogo e verifica a recusa de leitura de perfis. Não substitui a homologação completa de Auth e Storage.

## Estrutura e decisões

- [Planejamento e arquitetura](docs/architecture.md)
- [Configuração e implantação do banco](docs/setup.md)
- [Matriz de permissões](docs/security.md)
- [Relatório da Fase 1 e pendências](docs/phase-1-report.md)
- [Relatório da Fase 2](docs/phase-2-report.md)
- [Execução e configuração da Fase 2](docs/phase-2-setup.md)
- `supabase/migrations/20261105180946_pupi_foundation.sql`: única migration atômica, criada com a CLI.
- `src/`: cliente Supabase, configuração pública, repositório de catálogo, mídia e erros.
- `tests/`: testes de serviços e de integridade/permissões no banco.

O catálogo inicial fica vazio. Dados sintéticos existem somente nos testes. A Fase 3 depende de nova autorização.
