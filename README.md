# Pupi — conta e administração

Fase 3 do e-commerce petshop. O `index.html` reúne a área de conta e um painel administrativo com resumo, produtos, categorias, imagens, estoque, pedidos, clientes e configurações. Front-end HTML/CSS/JavaScript modular com Vite.

As migrations de conta e administração estão aplicadas no Supabase Pupi. A conta administrativa indicada pelo usuário já tem acesso. A Fase 2 foi testada e aprovada pelo usuário; a Fase 3 tem testes automatizados e verificação SQL hospedada. Uploads reais pelo SDK devem ser homologados no navegador local.

## Abrir o front-end de testes

Use a branch `codex/pupi-fase-3` e Node.js 24+:

```sh
npm ci
cp .env.example .env
npm run dev
```

Abra **http://localhost:3000**. No Windows, copie o arquivo pelo editor ou use `copy .env.example .env`. Não abra o index por file://. A [configuração da Fase 2](docs/phase-2-setup.md) explica redirects, Google Cloud, e-mails e as rotas de teste.

Depois de entrar como administrador, abra **Administração** ou **http://localhost:3000/#/admin**. Veja o [roteiro da Fase 3](docs/phase-3-setup.md). Não há checkout nem integração financeira nesta fase; os registros de entrega são manuais. Nenhum sucesso é simulado na aplicação.

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
- [Relatório da Fase 3](docs/phase-3-report.md) e [roteiro administrativo](docs/phase-3-setup.md).
- `supabase/migrations/`: fundação, contas e administração; migrations atômicas criadas com a CLI.
- `src/`: configuração pública, cliente Supabase, módulos de conta/administração, repositórios e componentes compartilhados.
- `tests/`: testes de serviços e de integridade/permissões no banco.

O catálogo inicial fica vazio. Dados sintéticos existem somente nos testes. A Fase 4 depende de nova autorização.
