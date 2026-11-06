# Pagamentos: teste controlado em produção

## Preenchimento do e-mail

O checkout passa o e-mail da conta autenticada ao Payment Brick em `initialization.payer.email`. Esse é o mesmo e-mail exibido no perfil; a origem é o usuário validado pelo Auth, sem nova consulta ou armazenamento no navegador. Pix e cartão iniciam com esse dado, conforme a [documentação oficial de inicialização](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/advanced-features/initialize-data-on-the-bricks). Sem e-mail disponível, o campo continua sob controle do SDK. O callback preserva o e-mail fornecido pelo formulário, inclusive se o cliente o corrigir. Valores, confirmação financeira, idempotência e tentativas pendentes permanecem sob validação do servidor.

## Progresso — 06/11/2026

- [x] Cartão aprovado no sandbox (pedido #4), confirmado no banco e pelo usuário.
- [x] Pix aprovado no sandbox (pedido #7), confirmado no banco e pelo usuário.
- [x] API Orders preservada; cartão e Pix continuam dentro do Pupi.
- [x] Registro financeiro, vínculo da tentativa e ambiente gravados na mesma transação. Falha no vínculo desfaz a confirmação; evento antigo não regride estado.
- [x] Pedidos de sandbox identificados no cliente e no administrativo, fora dos totais financeiros pagos do painel. Estados financeiros históricos preservados.
- [x] 3DS solicitado conforme risco nas novas tentativas de cartão. Desafio incorporado em iframe de domínio Mercado Pago validado. URL com guest_token transitória, sem persistência ou logs. O evento COMPLETE apenas dispara consulta autenticada ao servidor.
- [x] Reenvios anteriores preservam o payload original (versão 1) e a mesma chave idempotente. Novas tentativas usam versão 2.
- [x] Consulta automática somente de pagamentos pendentes conhecidos, a cada 8 segundos por até 2 minutos; pausa com aba oculta/offline e encerra ao sair. Verificação manual permanece disponível.
- [x] Pix vencido oculta QR/cópia e mantém consulta; a expiração visual não altera o estado financeiro nem cria outra cobrança. Prazo deriva da criação e duração devolvidas pelo provedor (padrão documentado de 24h quando ausente).
- [x] Falhas de sessão/configuração têm orientação própria. Tentativas incertas ficam preservadas; recusas definitivas permitem nova tentativa e cancelamento administrativo.
- [x] Conferência tem prioridade na apresentação e nos totais, inclusive após notificações repetidas.

## Configuração manual antes de uma cobrança real

O ambiente continua em sandbox. Esta revisão não trocou segredos nem criou cobrança real.

1. Confira os pedidos pendentes e conclua a conciliação no ambiente atual antes de trocar a conta. Não tente transformar pedido de sandbox em compra real: use pedido novo.
2. No Supabase Pupi → Edge Functions → Secrets, pause novas operações com `MERCADO_PAGO_CHECKOUT_ENABLED=false` durante a troca. A consulta do checkout também fica indisponível durante a pausa.
3. Na aplicação correta do Mercado Pago, mantenha **Checkout Transparente via API Orders**, ative Produção e copie o par **Public Key + Access Token de produção da conta real recebedora**. Não use credenciais de contas de teste.
4. Atualize somente no Supabase:

| Segredo | Valor esperado |
| --- | --- |
| `MERCADO_PAGO_ENV` | `production` |
| `MERCADO_PAGO_PUBLIC_KEY` | Public Key de produção da aplicação |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access Token de produção da mesma conta/aplicação |
| `MERCADO_PAGO_COLLECTOR_ID` | User ID da conta real recebedora, correspondente ao Access Token |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Assinatura secreta do webhook de produção da aplicação |
| `MERCADO_PAGO_CHECKOUT_ENABLED` | `true` somente ao terminar a conferência |

5. Em Webhooks da aplicação Mercado Pago, configure a URL de produção `https://loifqxmmnmhpwnwcvrak.supabase.co/functions/v1/pupi-mercadopago-webhook`, evento **Order (Mercado Pago)**. Confira que a assinatura secreta corresponde ao ambiente configurado. O endpoint usa HMAC; não precisa de JWT Supabase. A resposta de uma simulação do painel não comprova sozinha a confirmação financeira de uma compra.
6. Confira a chave Pix e habilitação de recebimento da conta real. Não coloque Access Token, assinatura do webhook ou chave service_role na Vercel, no frontend ou no chat. O frontend recebe a Public Key pelo checkout autenticado; não requer novo segredo Mercado Pago na Vercel.
7. Aguarde a conclusão do deploy da main na Vercel, abra o app atualizado e habilite o checkout para um teste controlado. Em produção use comprador e meio de pagamento reais; cartões fictícios são exclusivos do sandbox.

## Roteiro de homologação restante

- [ ] Antes da troca, exercitar 3DS real do sandbox com cartão de teste e nomes `APRO-CHOK` (desafio aprovado) e `OTHE-CHNO` (não autenticado), conforme documentação atual. O teste automatizado do iframe usa respostas controladas.
- [ ] Criar um pedido novo e realizar uma compra real de pequeno valor com cartão; quando solicitado, concluir autenticação do banco sem sair do Pupi.
- [ ] Criar outro pedido e pagar o Pix real; conferir valor, recebedor, confirmação no Mercado Pago, pedido e painel. Não repetir o pagamento após falha de conexão: usar Verificar pagamento.
- [ ] Verificar entrega assinada do webhook e atualização do pedido mesmo com o comprador fora da tela. Conferir que eventos repetidos não duplicam a confirmação.
- [ ] Validar recusa e recuperação após interrupção; somente tentar outro meio quando a tentativa anterior estiver definitivamente encerrada.
- [ ] Homologar estorno total e conferência de estorno parcial/contestação, com operação no painel do provedor e atualização via webhook/consulta. O Pupi não inicia reembolso neste fluxo.
- [ ] Conferir mobile, comprovante do provedor e total financeiro sem pedidos de teste antes de ampliar o acesso.

O aviso de testes do cadastro continua autorizado como provisório. Termos e Política definitivos da loja permanecem uma configuração anterior pendente para lançamento público. Esta entrega prepara a homologação técnica de pagamentos, sem substituir esses documentos.

## Interrupção e retomada

Para interromper novas operações, ajuste `MERCADO_PAGO_CHECKOUT_ENABLED=false`. O webhook continua recebendo confirmações assinadas enquanto as credenciais correspondentes estiverem configuradas. Não retorne a conta ao sandbox enquanto houver pagamentos reais aguardando conciliação. Preserve a configuração e use o painel do Mercado Pago para conferir operações; não marque pedidos como pagos manualmente.

## Validação automatizada

Resultados finais desta revisão serão registrados abaixo após publicação. Os testes locais usam respostas controladas e não comprovam homologação bancária, entrega real de webhook ou recebimento em produção.

## Referências oficiais

- [Ativar produção](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/go-to-production)
- [Credenciais](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/credentials)
- [Pix via Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/pix)
- [3DS e cenários de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-management/integrate-3ds)

## Resultado da entrega

- 97 testes de aplicação e 102 testes de banco passaram.
- Suíte completa de navegador: 52 de 53 passaram inicialmente; o teste existente de duração de aviso passou na repetição isolada. Os 12 testes de pagamento passaram na suíte completa. O teste 3DS foi repetido em 390px, com recuperação após recarga, validação da mensagem e ausência de rolagem horizontal.
- Build e tokens conferidos; auditoria estática de UI sem violações. A revisão visual mobile usou um desafio fictício; a interface bancária real ainda precisa de homologação.
- Migração `20261106182017_pupi_payment_production_review.sql` aplicada no Supabase. Pedidos pagos #4, #6 e #7 preservados como sandbox; #5 continua pendente. Permissão de registro financeiro restrita a service_role.
- Edge Functions ativas: checkout v37 (JWT obrigatório) e webhook v31 (HMAC). Configuração existente de sandbox preservada.
- Pendências: troca manual dos segredos e execução do roteiro de homologação acima. Nenhum recebimento em produção foi certificado nesta entrega.
