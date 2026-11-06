# Fase 5 — planejamento

A Fase 5 mantém o objetivo de transformar a experiência do Pupi em uma interface mobile-first, conforme o briefing original. A pedido do usuário, inclui também o seguinte tópico:

## Integração de pagamentos com Mercado Pago

Integrar a API do Mercado Pago ao checkout para receber pagamentos pelos produtos, após a conclusão das dependências da Fase 4.

- Definir as modalidades de pagamento a oferecer e configurar as credenciais e os ambientes de teste e produção.
- Criar e acompanhar pagamentos a partir do pedido e dos valores validados no servidor, com credenciais secretas protegidas no backend.
- Processar notificações do provedor com verificação de autenticidade e operações idempotentes; refletir no pedido apenas estados confirmados pelo provedor.
- Tratar pagamentos pendentes, aprovados, recusados, cancelados e estornados, mantendo o histórico e as regras de estoque consistentes.
- Homologar o fluxo em ambiente de testes, incluindo falhas, retentativas e notificações repetidas, antes de habilitar pagamentos reais.

## Progresso inicial

A verificação local de notificações assinadas do Mercado Pago e a conferência de pagamentos consultados diretamente na API foram preparadas em `supabase/functions/_shared/mercado-pago/verification.js`. A conferência exige correspondência entre identificador do pagamento, pedido, vendedor, ambiente, moeda e valor; estornos parciais, contestações e recusas são encaminhados para revisão. Nenhuma função de pagamento foi implantada e essas verificações ainda não alteram pedidos. Os testes usam dados fictícios.

O usuário informou que a cotação e a confirmação do pedido no Melhor Envio funcionaram e que o pagamento permaneceu pendente. O registro de remessa e o rastreamento continuam com pendências próprias na Fase 4.

A migration `20261106062644_pupi_payment_attempts.sql` foi aplicada ao Supabase. Ela prepara um registro privado e único de tentativa por pedido, captura os valores e itens do banco, verifica a titularidade e impede cancelamento e devolução do estoque enquanto houver uma tentativa em aberto. A função é restrita ao backend e ainda não é chamada pela aplicação: não cria preferência, não cobra e não altera o pagamento. Repetições retornam a mesma tentativa; a recuperação e o encerramento seguros ainda precisam ser implementados antes do uso.

Os testes locais cobriram titularidade, repetição, pedido cancelado e bloqueio de cancelamento; os privilégios foram conferidos no banco hospedado. Nenhuma credencial do Mercado Pago é necessária nesta etapa.

A montagem da preferência do Checkout Pro foi preparada em `supabase/functions/_shared/mercado-pago/preference.js`. Ela recebe somente o snapshot do pedido que deverá ser recuperado pelo backend, confere produtos, quantidade, moeda e soma em centavos, inclui o frete e constrói os endereços de retorno e notificação a partir de origens configuradas no servidor. O construtor é isolado: ainda não chama o Mercado Pago nem está conectado à aplicação. O endpoint de notificação indicado ainda precisa ser criado antes de ativar o pagamento. Os testes usam dados fictícios.

O fluxo básico de recepção de notificações foi preparado em `supabase/functions/_shared/mercado-pago/webhook.js`: verifica a assinatura, consulta o pagamento na API do Mercado Pago e só responde com sucesso após um processador confirmar a gravação durável. Falhas de consulta ou processamento retornam erro para permitir nova notificação. Testes com dados fictícios cobrem assinatura inválida, falhas do provedor e processamento pendente.

Esse código ainda não está implantado nem conectado a um processador real. Antes de ativá-lo, é necessário implementar a conferência do pagamento contra o pedido e o vendedor, a persistência idempotente e a reconciliação transacional. Ele não altera o status dos pedidos.

## Próximas etapas

1. Integrar a montagem da preferência à função autenticada de backend, criar a preferência no Mercado Pago e implementar armazenamento e recuperação segura de tentativas simultâneas ou respostas perdidas. Não ativar cobranças antes do receptor e da reconciliação estarem completos.
2. Conectar o receptor preparado a um processador que verifique o pedido e persista eventos de pagamento de forma idempotente; implantar e homologar somente depois da reconciliação transacional.
3. Completar as regras transacionais para encerrar ou reconciliar tentativas, pagamentos duplicados, estornos e contestações. O bloqueio inicial de cancelamento e devolução de estoque já foi preparado.
4. Adicionar o acesso ao pagamento no pedido e os estados de espera e recuperação.
5. Configurar credenciais e webhook posteriormente, e homologar com contas de teste antes de permitir pagamentos reais.

Pagamentos ainda não estão disponíveis e não são simulados no aplicativo. Documentação oficial: [Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/overview), [criação de preferência](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/create-preference/post) e [notificações](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications).
