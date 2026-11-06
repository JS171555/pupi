# Fase 4 — progresso e retomada

Atualizado em 06/11/2026. Base: branch `codex/pupi-fase-3` (Fase 3). Antes da implementação, o projeto tinha cadastro/login, endereços, consulta de pedidos, painel administrativo, tabelas de carrinho e uma função interna de criação transacional de pedido. Não tinha vitrine ou checkout acessíveis. `private.create_order` é restrita ao backend e recebe o valor do frete: não exponha essa função diretamente ao navegador.

## Etapa 1

Implementada localmente: rota pública `#/loja`, lista de produtos publicados com paginação e filtro por categoria, detalhes básicos, preços e disponibilidade. Reaproveita repositório, políticas e componentes existentes; sem dados fictícios. A vitrine ainda não oferece compra. Nenhuma migration foi aplicada nesta etapa.

Verificação: `npm run check` (20 serviços e 70 banco), `npm run build` e `npm run design:check` aprovados. A vitrine nova ainda precisa de teste em navegador e de homologação com produtos reais.

## Etapa 2

Busca por nome e ordenação por nome ou recentes, no servidor, preservadas ao paginar e combináveis com categoria. Aplicar filtros retorna à primeira página. O teste de serviço confere a consulta e os limites de ordenação.

## Etapa 3

Imagem principal na vitrine e no detalhe do produto, usando URLs assinadas de curta duração e as políticas existentes. Caso a imagem esteja ausente ou falhe, a tela continua utilizável. A galeria completa e a verificação real de Storage continuam pendentes.

## Etapa 4

Galeria no detalhe do produto, ordenada com a imagem principal primeiro e paginada em até 20 fotos. Falhas de leitura e imagens indisponíveis têm mensagens próprias. A verificação com imagens reais no Storage continua pendente.

## Etapa 5

Filtros de destaque e promoção na vitrine, combináveis com busca/categoria/ordem e preservados na paginação; produtos marcados como destaque são identificados. Testes de serviços e build aprovados. A interface ainda precisa de homologação no navegador com dados reais.

## Etapa 6

Detalhe do produto mostra a categoria ativa e oferece acesso à vitrine filtrada por ela; falha de consulta é informada sem impedir a exibição do produto.

## Etapa 7

Repositório de carrinho permite definir uma quantidade absoluta de produto publicado, com conferência do estoque consultado e tratamento de criação simultânea do carrinho. Repetir o mesmo pedido define o mesmo valor. RLS existente limita o carrinho ao titular. Ainda não há interface de carrinho; o estoque pode mudar após a consulta e deve ser validado novamente no checkout.

## Etapa 8

Detalhe do produto permite definir quantidade no carrinho autenticado, com validação, feedback e pedido de login quando necessário. A quantidade informada substitui a anterior; estoque é conferido novamente ao gravar. A consulta/edição do carrinho ainda falta.

## Etapa 9

Consulta autenticada e paginada do carrinho, com preços atuais e indicação de produtos indisponíveis ou com saldo insuficiente. Produtos ocultos por políticas permanecem identificados como indisponíveis; a tela não calcula total nem reserva estoque. Alterar/remover itens permanece pendente.

## Falta para concluir

1. Testar vitrine e detalhes com produtos publicados reais.
2. Carrinho persistente por usuário: alterar, remover, validar estoque e calcular subtotal; testar isolamento de contas e concorrência.
3. Frete: integrar Melhor Envio em backend confiável com credenciais protegidas, cotações e seleção válida; definir configuração e tratar indisponibilidade. Nunca confiar em frete enviado pelo navegador.
4. Checkout autenticado: endereço, revisão, estoque e preços recalculados no backend; confirmar pedido idempotente e gravar cotação/entrega com segurança. Não expor service_role nem aceitar total fornecido pelo cliente.
5. Estrutura de pagamento pendente, sem aprovar/simular transações. Conectar registro/rastreamento de remessa e eventos reais quando credenciais estiverem disponíveis.
6. Testar fluxo completo, autorização, estoque concorrente, retentativas, erros de frete, celular, build e regressão das fases anteriores; documentar e publicar no GitHub.

A integração real depende de credenciais e configuração do Melhor Envio; a existência delas ainda não foi verificada. O checkout deve continuar indisponível até existir uma cotação confiável e operação de pedido no backend.
