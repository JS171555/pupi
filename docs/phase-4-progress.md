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

As configurações do Melhor Envio ainda não foram fornecidas; o usuário escolheu utilizar nota fiscal eletrônica (NF-e). Registro de remessa, rastreamento/eventos automáticos e homologação real continuam pendentes. Leia `docs/phase-4-setup.md`.

## Etapa 15 — NF-e

O usuário escolheu NF-e emitida em sistema fiscal externo, com a chave registrada no Pupi. A migration `20261106032930_pupi_order_invoices.sql` foi aplicada ao Supabase Pupi. Na administração de cada pedido, é possível registrar a chave de uma nota já emitida; a chave modelo 55 e o dígito verificador são conferidos, com acesso apenas a administradores e controle de versão. Isso não emite NF-e nem consulta sua autorização na SEFAZ.

## Etapa 16 — volumes cotados

A migration `20261106035539_pupi_shipping_packages.sql` foi aplicada e a Edge Function de checkout atualizada. As cotações novas conservam os volumes válidos retornados pelo Melhor Envio, em centímetros e quilogramas, vinculados à cotação escolhida. Se o provedor não os retornar ou os dados forem inválidos, não são inventados volumes. Cotações anteriores não recebem esses dados retroativamente. O teste no PostgreSQL hospedado passou e foi revertido.

O usuário informou que os testes na Vercel funcionaram; isso não confirma integração real com o Melhor Envio, que ainda requer configuração e homologação.

## Etapa 17 — eventos de entrega

Migration `20261106040149_pupi_shipping_webhook.sql` aplicada e Edge Function `pupi-shipping-webhook` implantada. Ela exige assinatura HMAC-SHA256 do aplicativo Melhor Envio, processa somente etiquetas já vinculadas a entregas Pupi, deduplica retentativas e evita regressão de status. Registra os eventos da etiqueta e não muda o status operacional do pedido nem o pagamento automaticamente. Se não existir data específica do evento, registra a data de recebimento da notificação. Testes com assinatura real gerada localmente e SQL hospedado com rollback passaram.

O token, o segredo do webhook e a conta Melhor Envio ainda não foram configurados. Registro/vinculação de etiqueta e consulta real no sandbox continuam pendentes; portanto o webhook ainda não pode ser homologado ponta a ponta.

## Etapa 18 — registro de remessa

A migration `20261106043650_pupi_shipping_registration.sql` foi aplicada e a Edge Function `pupi-shipping-register` implantada com autenticação. A administração prepara o envio usando o pedido, volumes cotados e chave de NF-e externa; solicita CPF/CNPJ e telefone do destinatário sem armazená-los no navegador. O registro adiciona a remessa ao carrinho do Melhor Envio, sem comprar frete nem emitir etiqueta. Há bloqueio de retentativa após resposta incerta para evitar duplicações; deve-se conferir o carrinho e reconciliar manualmente antes de recomeçar. A recuperação automatizada dessas tentativas ainda precisa ser implementada.

Testes locais cobrem preparo dos dados, acesso, rejeição, falha de rede, duplicação, validações no banco e confirmação no navegador com dados fictícios. No Supabase hospedado a migration e a função estão ativas e os privilégios foram conferidos. A API real não foi testada: as credenciais e dados fiscais foram deixados para configuração posterior, conforme solicitado.

## Falta para concluir

1. Configurar credenciais, remetente e webhook conforme `docs/phase-4-setup.md`; homologar todo o fluxo no sandbox com dados reais controlados.
2. Implementar consulta de rastreamento e recuperação segura de registro com resultado incerto. A compra de frete e emissão de etiqueta permanecem no Melhor Envio. Para Correios, Loggi e J&T com múltiplos volumes, ainda falta separar os itens por etiqueta; Azul exige dados adicionais do XML da NF-e.
3. Homologar a operação completa em navegador com dois usuários, concorrência, falhas de rede, estoque e cotações expiradas; conferir políticas de cancelamento e estorno.
4. Integrar Mercado Pago na Fase 5, conforme `docs/phase-5-plan.md`. Pedidos permanecem com pagamento pendente.
5. Regularizar o histórico da migration inicial aplicada manualmente antes de futuro `supabase db push`.

## Teste informado pelo usuário

O usuário configurou `MELHOR_ENVIO_ENV`, `MELHOR_ENVIO_TOKEN` e `MELHOR_ENVIO_USER_AGENT` e informou que conseguiu consultar frete e confirmar um pedido até o status de pagamento pendente. Isso confirma o fluxo relatado de cotação e pedido; não confirma registro de remessa, webhook ou rastreamento, que continuam pendentes de configuração e homologação.
