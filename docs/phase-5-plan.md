# Fase 5 — andamento

A fase 5 inclui o pagamento via Mercado Pago solicitado pelo usuário, instalação como PWA e, por último, o trabalho de UI/UX e identidade visual.

## Implementado

- O Checkout Pro cria a preferência a partir dos itens, valores e frete registrados no banco. A tentativa é única por pedido; após perda da resposta, o serviço busca uma preferência existente e só a vincula quando os dados do pedido, conta, valores e URLs correspondem. Ele não cria outra automaticamente. A função exige usuário autenticado e verifica a titularidade.
- O receptor de webhook valida a assinatura, consulta o pagamento diretamente no Mercado Pago e confere pedido, vendedor, valor, moeda e ambiente. O banco registra pagamentos com processamento idempotente e ignora eventos antigos. Recusas permitem nova tentativa no mesmo checkout; estornos parciais, contestações e múltiplos pagamentos exigem conferência administrativa. O pedido só é marcado como pago mediante confirmação do provedor.
- A migration `20261106064442_pupi_payment_reconciliation.sql` foi aplicada ao Supabase. As funções `pupi-mercadopago-checkout` e `pupi-mercadopago-webhook` foram implantadas. A primeira exige JWT; a segunda valida a assinatura do provedor.
- O detalhe do pedido oferece acesso ao pagamento quando estiver configurado. O PWA tem manifesto, ícones e service worker que guarda somente o shell público; chamadas de APIs e dados de conta não são adicionados ao cache offline.
- Os testes locais usam dados fictícios. Foi verificado o funcionamento offline do shell em navegador e a ausência de rotas privadas no cache. A API real do Mercado Pago ainda não foi testada.

## Configuração para depois

No Supabase, configurar os seguintes segredos para o ambiente de teste do Mercado Pago, sem adicioná-los ao código ou enviá-los no chat:

- `MERCADO_PAGO_ACCESS_TOKEN`: token da conta de vendedor de teste.
- `MERCADO_PAGO_WEBHOOK_SECRET`: assinatura secreta configurada no Mercado Pago.
- `MERCADO_PAGO_COLLECTOR_ID`: identificador numérico da conta de vendedor correspondente ao token.
- `MERCADO_PAGO_ENV`: `sandbox` para testes ou `production` para produção.
- `PUPI_STORE_ORIGIN`: origem HTTPS da loja na Vercel, sem caminho final ou barra adicional.
- `MERCADO_PAGO_CHECKOUT_ENABLED`: manter ausente ou `false` até concluir a configuração; `true` permite criar preferências no ambiente configurado.

Configurar o evento de pagamentos no webhook `https://loifqxmmnmhpwnwcvrak.supabase.co/functions/v1/pupi-mercadopago-webhook`. Homologar com contas de teste distintas, inclusive pagamento pendente, aprovado, recusado, duplicado e estorno, antes de usar produção. Consulte a [documentação oficial do Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/overview) e de [notificações](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications).

## Pendências e limites

- A integração não foi homologada com o Mercado Pago real e não deve ser considerada pronta para produção antes desses testes.
- Uma resposta perdida é recuperada automaticamente quando o provedor retorna exatamente uma preferência compatível. Se a busca for vazia, ambígua ou inconsistente, a tentativa permanece bloqueada para evitar cobrança duplicada e exige reconciliação técnica. Ainda não há cancelamento seguro no painel enquanto existir uma tentativa aberta; estoque e pedido permanecem preservados.
- Um alerta no pedido administrativo indica múltiplos pagamentos, contestações ou estornos parciais; a resolução financeira e o estorno continuam a cargo do Mercado Pago e de conferência manual.
- É necessário homologar a instalação PWA nos navegadores e dispositivos alvo. O cache contém apenas os arquivos públicos da aplicação; operações que precisam da rede permanecem indisponíveis offline.
- A etapa visual usa as cores do PDF, navegação inferior no celular, ícones Lucide e transições GSAP com suporte a movimento reduzido. A vitrine e os componentes compartilhados foram atualizados; a homologação com os dados reais da loja permanece necessária.
- A Fase 4 ainda requer homologação do registro de remessa e implementação da consulta de rastreamento; o usuário já confirmou a cotação e criação de pedido com pagamento pendente.

## Etapa visual

A vitrine apresenta categorias cadastradas, filtros acessíveis, produtos reais e estados vazios; nenhuma categoria ou produto de demonstração é criado. A navegação mobile mantém acesso a conta, pedidos, carrinho e opções adicionais, preservando as regras de sessão e alterações não salvas. As cores normativas estão em `DESIGN.md`; os tokens CSS são gerados. A biblioteca GSAP anima entradas sem movimento quando o sistema solicita redução de movimento.
