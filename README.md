# Pupi — fundação técnica

Base da Fase 1 do e-commerce petshop: JavaScript modular, esquema PostgreSQL, RLS e armazenamento Supabase. A implementação e os testes de banco locais estão disponíveis. **A homologação no Supabase hospedado está pendente da identificação do projeto Pupi.**

Não há loja publicada nem telas das fases seguintes neste pacote.

## Executar os testes

Requisitos: Node.js 24+ e npm.

```sh
npm ci
npm run check
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
- `supabase/migrations/20261105180946_pupi_foundation.sql`: única migration atômica, criada com a CLI.
- `src/`: cliente Supabase, configuração pública, repositório de catálogo, mídia e erros.
- `tests/`: testes de serviços e de integridade/permissões no banco.

O catálogo inicial fica vazio. Dados sintéticos existem somente nos testes. A Fase 2 depende de nova autorização.
