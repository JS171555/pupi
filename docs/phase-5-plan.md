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

## Próximas etapas

1. Implementar a criação segura da preferência do Checkout Pro com valores calculados no servidor, vínculo ao pedido e tratamento seguro de tentativas simultâneas ou de resposta perdida.
2. Implementar o receptor de notificações e a consulta autenticada do pagamento ao Mercado Pago, usando as verificações preparadas; persistir eventos idempotentes, sem confiar no retorno do navegador.
3. Definir e implementar as regras transacionais para impedir que um pedido seja cancelado ou o estoque seja devolvido enquanto houver pagamento em processamento, além de reconciliar pagamentos duplicados, estornos e contestações.
4. Adicionar o acesso ao pagamento no pedido e os estados de espera e recuperação.
5. Configurar credenciais e webhook posteriormente, e homologar com contas de teste antes de permitir pagamentos reais.

Pagamentos ainda não estão disponíveis e não são simulados no aplicativo. Documentação oficial: [Checkout Pro](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/overview), [criação de preferência](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-pro-preferences/create-preference/post) e [notificações](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications).
