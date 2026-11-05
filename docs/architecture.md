# Pupi — planejamento técnico da Fase 1

## Ponto de partida e escopo

O repositório continha somente README.md. A Fase 1 entrega a fundação e não inclui telas de autenticação, administração ou compra. Não há produtos, usuários ou pedidos de demonstração no banco da aplicação.

## Arquivos e camadas

- `src/config/`: validação da configuração pública, sem leitura de credenciais secretas.
- `src/services/`: criação do cliente Supabase, tradução de erros e serviço de mídia.
- `src/repositories/`: consultas com seleção explícita de campos e paginação limitada.
- `src/utils/`: validações reutilizáveis.
- `src/modules/`: limites de responsabilidade para autenticação, administração, loja, carrinho, checkout, pedidos e integrações das próximas fases.
- `supabase/config.toml`: ambiente local gerado pela CLI, com Auth e Storage.
- `supabase/migrations/`: esquema, integridade transacional, RLS e Storage versionados.
- `tests/database/`: execução das migrations em PostgreSQL embarcado (PGlite), com contratos mínimos de Auth e Storage exclusivos de teste.
- `docs/`: decisões, configuração, permissões, execução e pendências.

Dependências de produção: apenas `@supabase/supabase-js`, com versão exata e lockfile. JavaScript ES Modules, sem framework de interface. A interface e o build de páginas serão adicionados nas fases autorizadas.

## Modelo

15 tabelas: profiles, user_roles, addresses, categories, products, product_images, carts, cart_items, orders, order_items, shipments, shipment_events, store_settings, stock_movements e audit_logs.

Cada SKU representa uma apresentação vendável. `product_variants` é opcional na especificação e fica adiada até existir necessidade concreta; não haverá dois mecanismos concorrentes de preço/estoque. Valores monetários usam centavos inteiros; datas usam timestamptz; identificadores usam UUID. Preço de custo é opcional e não será exposto na tabela pública.

## Decisões de integridade

- Restrições no PostgreSQL impedem preços, frete e estoque negativos e quantidades nulas ou inválidas.
- Pedidos mantêm nome, SKU, preço e endereço históricos. O total é calculado pelo banco. Constraints diferidas conferem subtotal e itens no commit.
- A criação interna de pedido é uma transação, com locks de produtos em ordem estável, preço consultado no banco e chave de idempotência por cliente.
- Ajustes de estoque registram movimento e auditoria na mesma transação. Clientes não escrevem preços, estoque, pedidos ou permissões.
- Operações administrativas de catálogo usam RLS. Estoque usa função autorizada; pedidos e integrações permanecem sob controle do backend.
- O papel administrador é consultado em user_roles, nunca em metadados editáveis pelo cliente. Nenhuma conta nasce administradora.

## Fronteiras de acesso

Catálogo publicado de categorias ativas é público. Perfis, endereços, carrinhos, pedidos e entregas são restritos ao titular e aos administradores autorizados. Logs e configurações são administrativos. Campos permitidos de atualização de perfis são limitados também por GRANT de coluna.

Funções privilegiadas ficam no schema não exposto `private`, com search_path vazio e permissões explícitas. Operações internas de pedido são exclusivas do service_role e não são endpoints públicos de checkout.

Os buckets de produtos e categorias são privados. A leitura é autorizada por vínculo com catálogo publicado ou por administrador. URLs assinadas são temporárias; a aplicação deverá renová-las. Upload/remoção são administrativos, limitados a JPEG, PNG e WebP de até 5 MiB. Não se usa cache público para dados privados.

## Verificação e limites

Testar isolamento entre dois clientes, tentativa de promoção a administrador, acesso anônimo ao catálogo, proteção de rascunhos e arquivos, constraints, rollback de estoque, idempotência e preços históricos. PGlite executa PostgreSQL real, mas não substitui o teste HTTP de Supabase Auth, PostgREST e Storage. A homologação hospedada depende da escolha do projeto Supabase do Pupi. Não alterar automaticamente outro projeto da conta.
