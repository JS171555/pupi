# Plano da Fase 3

A Fase 2 foi validada pelo usuário. O painel reutiliza os formulários, mensagens, diálogos, navegação e tokens existentes. O projeto continua HTML/CSS/JavaScript modular, sem framework de interface.

## Implementação

- Migration aditiva: operações administrativas autenticadas no banco, recibos de idempotência e fila de remoção de mídia. Nenhum segredo é exposto ao navegador.
- `src/repositories/admin.js`: leitura paginada, filtros e mutations por RPC com chaves estáveis para retentativas.
- `src/modules/admin/validation.js`: campos de catálogo, centavos, estoque e configurações.
- `src/modules/admin/`: telas de resumo, produtos/categorias e suas mídias, estoque/histórico, pedidos/entregas, clientes e configurações.
- `src/ui/`: extensão dos campos existentes para textarea e arquivos; busca explícita com limpar e listas/tabelas paginadas.
- `src/services/admin-media.js`: upload, confirmação de vínculo, substituição e limpeza de arquivos com recuperação após falha.
- Testes de regras/autorizações PostgreSQL, serviços e fluxos de navegador. Documentação e publicação na branch da Fase 3.

## Decisões operacionais

- Função admin vem de user_roles. O usuário indicou a conta que receberá o primeiro acesso; não existe promoção automática do primeiro cadastro.
- Clientes não podem consultar operações administrativas. O navegador não contém service_role.
- Estoque nasce em zero no cadastro; entradas e saídas sempre registram movimento. Repetir a mesma chave não duplica o ajuste.
- Exclusão de produto/categoria sem histórico depende da remoção de suas mídias e relacionamentos. Produtos com histórico devem ser arquivados; não apagar pedidos, preços históricos nem movimentos.
- Uploads e banco não compartilham transação. Vínculos são confirmados no banco e arquivos removidos por uma fila recuperável via API Storage. Não apagar um upload cuja confirmação ainda seja incerta.
- Status de pedido segue as transições existentes. Cancelamento anterior ao envio devolve estoque uma única vez. Cancelamento após falha de entrega não presume retorno físico. Pedidos pagos não são cancelados pelo painel sem o fluxo de estorno da fase de pagamentos.
- Entrega pode receber registro manual de transportadora e código; isso não compra frete, emite etiqueta nem simula Melhor Envio.
- Configurações são dados operacionais permitidos, sem credenciais. Custo interno do produto é opcional no briefing e permanece fora do catálogo público.
- Buscas por dados pessoais de clientes ficam somente em memória; os demais filtros e páginas são preservados na URL.

## Verificação

Preservar todos os testes da Fase 2. Testar CRUD, mídia e compensação, conflito de versão, publicação e catálogo público, estoque/idempotência, status/cancelamento, proteção administrativa, dados reais no dashboard e listas vazias. Homologação externa será separada das fixtures interceptadas do navegador.
