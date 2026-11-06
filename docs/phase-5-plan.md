# Fase 5 — planejamento

A Fase 5 mantém o objetivo de transformar a experiência do Pupi em uma interface mobile-first, conforme o briefing original. A pedido do usuário, inclui também o seguinte tópico:

## Integração de pagamentos com Mercado Pago

Integrar a API do Mercado Pago ao checkout para receber pagamentos pelos produtos, após a conclusão das dependências da Fase 4.

- Definir as modalidades de pagamento a oferecer e configurar as credenciais e os ambientes de teste e produção.
- Criar e acompanhar pagamentos a partir do pedido e dos valores validados no servidor, com credenciais secretas protegidas no backend.
- Processar notificações do provedor com verificação de autenticidade e operações idempotentes; refletir no pedido apenas estados confirmados pelo provedor.
- Tratar pagamentos pendentes, aprovados, recusados, cancelados e estornados, mantendo o histórico e as regras de estoque consistentes.
- Homologar o fluxo em ambiente de testes, incluindo falhas, retentativas e notificações repetidas, antes de habilitar pagamentos reais.

Este tópico é planejamento: a integração ainda não foi implementada e pagamentos não são simulados no aplicativo.
