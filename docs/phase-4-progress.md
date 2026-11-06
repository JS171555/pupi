# Fase 4 — progresso e retomada

Atualizado em 06/11/2026. Base: branch `codex/pupi-fase-3` (Fase 3). Antes da implementação, o projeto tinha cadastro/login, endereços, consulta de pedidos, painel administrativo, tabelas de carrinho e uma função interna de criação transacional de pedido. Não tinha vitrine ou checkout acessíveis. `private.create_order` é restrita ao backend e recebe o valor do frete: não exponha essa função diretamente ao navegador.

## Etapa 1

Implementada localmente: rota pública `#/loja`, lista de produtos publicados com paginação e filtro por categoria, detalhes básicos, preços e disponibilidade. Reaproveita repositório, políticas e componentes existentes; sem dados fictícios. A vitrine ainda não oferece compra. Nenhuma migration foi aplicada nesta etapa.

Verificação: `npm run check` (20 serviços e 70 banco), `npm run build` e `npm run design:check` aprovados. A vitrine nova ainda precisa de teste em navegador e de homologação com produtos reais.

## Etapa 2

Busca por nome e ordenação por nome ou recentes, no servidor, preservadas ao paginar e combináveis com categoria. Aplicar filtros retorna à primeira página. O teste de serviço confere a consulta e os limites de ordenação.

## Falta para concluir

1. Acrescentar destaque/promoções e imagens/galeria reais na vitrine; completar detalhes de produto e testar com produtos publicados reais.
2. Carrinho persistente por usuário: adicionar, alterar, remover, validar estoque e calcular subtotal; testar isolamento de contas e concorrência.
3. Frete: integrar Melhor Envio em backend confiável com credenciais protegidas, cotações e seleção válida; definir configuração e tratar indisponibilidade. Nunca confiar em frete enviado pelo navegador.
4. Checkout autenticado: endereço, revisão, estoque e preços recalculados no backend; confirmar pedido idempotente e gravar cotação/entrega com segurança. Não expor service_role nem aceitar total fornecido pelo cliente.
5. Estrutura de pagamento pendente, sem aprovar/simular transações. Conectar registro/rastreamento de remessa e eventos reais quando credenciais estiverem disponíveis.
6. Testar fluxo completo, autorização, estoque concorrente, retentativas, erros de frete, celular, build e regressão das fases anteriores; documentar e publicar no GitHub.

A integração real depende de credenciais e configuração do Melhor Envio; a existência delas ainda não foi verificada. O checkout deve continuar indisponível até existir uma cotação confiável e operação de pedido no backend.
