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

## Etapa 10

Remoção de item do carrinho com confirmação, autorização existente por titular, tratamento de falha e ajuste automático da página quando necessário. Pode remover produtos indisponíveis.

## Etapa 11

Alteração de quantidade no carrinho verifica estoque atual e versão do item, preservando os dados digitados em erro ou conflito. Estoque não é reservado; a confirmação posterior do pedido precisa validá-lo novamente.

## Etapa 12

Subtotal estimado dos itens disponíveis, incluindo todas as páginas; preços promocionais são considerados. A tela sinaliza quando há itens indisponíveis ou não carregados e não inventa frete. Valores e estoque precisam ser confirmados no servidor ao fechar pedido.

## Etapa 13

Tela autenticada de revisão com seleção local de endereço, lista parcial de itens e subtotal. Ela informa que o frete e a confirmação ainda não estão disponíveis; não cria pedido nem retém pagamento.

## Etapa 14 — checkout e cotação

Migration `20261106031939_pupi_checkout_quotes.sql` aplicada no Pupi e Edge Function `pupi-checkout` implantada com JWT. Cotação usa dados do banco e token mantido no servidor; confirmação confere snapshot, origem, endereço, preços e estoque, cria pedido e envio pendentes de forma idempotente e limpa o carrinho. Teste SQL real passou e foi revertido. Testes locais incluem conversão de unidades, verificação de usuário, cotação, conflito e recuperação de tentativa.

As configurações do Melhor Envio ainda não foram fornecidas; o usuário informou que ainda não definiu se usará NF-e ou declaração de conteúdo. Registro de remessa, rastreamento/eventos automáticos e homologação real continuam pendentes. Leia `docs/phase-4-setup.md`.

## Falta para concluir

1. Configurar credenciais do Melhor Envio no servidor e homologar cotação e confirmação no sandbox com dados reais controlados. Verificar peso e dimensões de produtos e CEP de origem.
2. Implementar registro de remessa, consulta de rastreamento e atualização confiável de eventos do Melhor Envio. O fluxo de inserção de fretes pode exigir dados de remetente/destinatário ainda não coletados; não inventar dados. A entrega manual do painel continua disponível.
3. Homologar o fluxo completo em navegador com dois usuários, concorrência, falhas de rede, estoque e cotações expiradas. O checkout foi exercitado localmente e em SQL hospedado com rollback; a API externa real ainda não foi testada.
4. Definir provedor financeiro na fase apropriada. Os pedidos são criados com pagamento pendente; não há cobrança ou aprovação simulada.
5. Regularizar o histórico da migration inicial aplicada manualmente antes de futuro `supabase db push`.
