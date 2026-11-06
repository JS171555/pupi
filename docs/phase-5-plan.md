# Fase 5 — andamento

A fase 5 inclui o pagamento via Mercado Pago solicitado pelo usuário, instalação como PWA e, por último, o trabalho de UI/UX e identidade visual.

## Implementado

- O checkout atual é Transparente, com o Payment Brick oficial incorporado à tela do pedido: cartão e Pix são enviados ao backend com o total do banco, sessão verificada e chave de idempotência. A página do Pupi não redireciona para o checkout externo. A resposta perdida pode ser verificada usando a mesma tentativa ou por consulta autenticada ao provedor.
- O receptor de webhook valida a assinatura, consulta o pagamento diretamente no Mercado Pago e confere pedido, vendedor, valor, moeda e ambiente. O banco registra pagamentos com processamento idempotente e ignora eventos antigos. Recusas permitem nova tentativa no mesmo checkout; estornos parciais, contestações e múltiplos pagamentos exigem conferência administrativa. O pedido só é marcado como pago mediante confirmação do provedor.
- A migration `20261106064442_pupi_payment_reconciliation.sql` foi aplicada ao Supabase. As funções `pupi-mercadopago-checkout` e `pupi-mercadopago-webhook` são usadas pelo checkout e pela confirmação do pagamento. A primeira exige JWT; a segunda valida a assinatura do provedor.
- O detalhe do pedido oferece acesso ao pagamento quando estiver configurado. O PWA tem manifesto, ícones e service worker que guarda somente o shell público; chamadas de APIs e dados de conta não são adicionados ao cache offline.
- Os testes locais usam dados fictícios. Foi verificado o funcionamento offline do shell em navegador e a ausência de rotas privadas no cache. A homologação real do Mercado Pago está em andamento; o teste do pedido #4 permanece sem resultado confirmado.

## Configuração para depois

No Supabase, configurar os seguintes segredos para o ambiente de teste do Mercado Pago, sem adicioná-los ao código ou enviá-los no chat:

- `MERCADO_PAGO_ACCESS_TOKEN`: token privado da conta de vendedor de teste.
- `MERCADO_PAGO_PUBLIC_KEY`: Public Key da mesma aplicação Checkout Transparente; é disponibilizada ao SDK no navegador. Nunca usar o Access Token neste campo.
- `MERCADO_PAGO_WEBHOOK_SECRET`: assinatura secreta configurada no Mercado Pago.
- `MERCADO_PAGO_COLLECTOR_ID`: identificador numérico da conta de vendedor correspondente ao token.
- `MERCADO_PAGO_ENV`: `sandbox` para testes ou `production` para produção.
- `PUPI_STORE_ORIGIN`: configuração histórica do Checkout Pro; não é necessária ao formulário incorporado.
- `MERCADO_PAGO_CHECKOUT_ENABLED`: manter ausente ou `false` até concluir a configuração; `true` permite iniciar pagamentos no ambiente configurado.

Configurar o evento de pagamentos no webhook `https://loifqxmmnmhpwnwcvrak.supabase.co/functions/v1/pupi-mercadopago-webhook`. Homologar com contas de teste distintas, inclusive pagamento pendente, aprovado, recusado, duplicado e estorno, antes de usar produção. Consulte a [documentação oficial do Payment Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/default-rendering) e de [notificações](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro-preferences/payment-notifications).

## Pendências e limites

- A integração não foi homologada com o Mercado Pago real e não deve ser considerada pronta para produção antes desses testes.
- Uma resposta perdida mantém a mesma chave de idempotência; a verificação após recarga busca o pagamento vinculado à tentativa. Se o resultado continuar desconhecido ou ambíguo, não é criada outra cobrança. Ainda não há cancelamento seguro no painel enquanto existir uma tentativa aberta; estoque e pedido permanecem preservados.
- Um alerta no pedido administrativo indica múltiplos pagamentos, contestações ou estornos parciais; a resolução financeira e o estorno continuam a cargo do Mercado Pago e de conferência manual.
- É necessário homologar a instalação PWA nos navegadores e dispositivos alvo. O cache contém apenas os arquivos públicos da aplicação; operações que precisam da rede permanecem indisponíveis offline.
- A etapa visual usa as cores do PDF, navegação inferior no celular, ícones Lucide e transições GSAP com suporte a movimento reduzido. A vitrine e os componentes compartilhados foram atualizados; a homologação com os dados reais da loja permanece necessária.
- A Fase 4 ainda requer homologação do registro de remessa e implementação da consulta de rastreamento; o usuário já confirmou a cotação e criação de pedido com pagamento pendente.

## Etapa visual

A vitrine apresenta categorias cadastradas, filtros acessíveis, produtos reais e estados vazios; nenhuma categoria ou produto de demonstração é criado. A navegação mobile mantém acesso a conta, pedidos, carrinho e opções adicionais, preservando as regras de sessão e alterações não salvas. As cores normativas estão em `DESIGN.md`; os tokens CSS são gerados. A biblioteca GSAP anima entradas sem movimento quando o sistema solicita redução de movimento.

## Refinamento de avisos e carregamento

A navegação mobile usa ícones maiores e as fontes locais Nunito Sans e DM Sans. Sucessos são apresentados em cartões centralizados com fechamento automático e pausa durante a leitura; erros e avisos importantes aguardam fechamento. As confirmações continuam modais, com teclado e foco preservados. Carregamentos usam uma patinha após 200ms e mantêm o tamanho dos botões. O cache da PWA inclui as fontes públicas, sem guardar respostas das APIs. Testes cobrem foco, tempo de exibição, avisos durante confirmação, loading, larguras de tela e movimento reduzido.

## Mudança para pagamento dentro do Pupi

As migrations `20261106140721_pupi_transparent_payments.sql` e `20261106141056_pupi_transparent_payment_guard.sql` foram aplicadas ao Supabase, e as funções de checkout e webhook foram atualizadas para o novo fluxo.

O Checkout Pro foi substituído na função pública pelo Checkout Transparente com Payment Brick. Cartão e Pix são as opções incorporadas; a carteira Mercado Pago e métodos de checkout externo não são habilitados. Número do cartão e código de segurança são coletados pelos campos oficiais do provedor: o Pupi recebe o token, que fica somente na memória durante a tentativa. Nenhum token, documento ou e-mail de pagamento é salvo em localStorage/sessionStorage ou em logs. O banco guarda uma impressão digital da requisição, chave de idempotência, identificação e resultado sanitizado do pagamento. O Pix é apresentado como código copia e cola e QR Code, quando o provedor os retorna.

Pedidos com tentativa anterior do Checkout Pro não podem iniciar outra cobrança no formulário incorporado; conferir a tentativa antiga ou usar um novo pedido de teste. Não se deve apagar registros antigos para liberar uma cobrança. A aplicação no Mercado Pago deve estar configurada como Checkout Transparente/Payments API e o webhook deve receber eventos de Pagamentos; o endpoint de webhook Pupi permanece o mesmo. A Public Key correspondente à mesma conta/ambiente precisa ser cadastrada como `MERCADO_PAGO_PUBLIC_KEY`.

A homologação real do SDK, cartões, Pix e eventuais autenticações adicionais do emissor permanece necessária. Os testes automatizados usam um SDK substituto e respostas fictícias; não comprovam um pagamento real nem todas as exigências de cada emissor.


## Diagnóstico do pagamento em verificação — 06/11/2026

- O pedido #4 permanece com tentativa iniciada e sem pagamento vinculado no banco. A consulta real registrou `PAYMENT_SEARCH_EMPTY`; isso não comprova ausência de cobrança no provedor.
- A verificação consulta o detalhe completo de cada candidato quando a busca omite metadados e exige vínculo exato à tentativa antes de aplicar o resultado. Conta vendedora, ambiente, moeda e valor continuam obrigatórios. Antes de enviar ou consultar pagamentos, o backend compara a conta autenticada do Access Token com `MERCADO_PAGO_COLLECTOR_ID`.
- Checkout e webhook registram somente estágios de diagnóstico, código HTTP/SQL e contagens limitadas. Não registram credenciais, respostas completas nem dados do comprador. Divergência de conta retorna um aviso de configuração sem liberar a tentativa anterior.
- Os testes cobrem recuperação por detalhe, vínculo divergente sem alteração financeira, conta incompatível sem cobrança, idempotência e privacidade dos logs. As verificações locais não substituem a homologação real.
- Após nova verificação real, a comparação da conta vendedora passou; a recuperação registrou `PAYMENT_SEARCH_EMPTY` com `candidate_count: 0` e `match_count: 0`. A causa da tentativa original continua desconhecida: ela foi enviada antes de haver diagnóstico detalhado. O HTTP 503 mantém a tentativa incerta; não significa confirmação de recusa nem comprova indisponibilidade do Supabase.
- Próximo passo: conferir a atividade na conta vendedora de teste no Mercado Pago, no horário da tentativa do pedido #4. Não apagar a tentativa, gerar outro pedido ou reenviar cartão enquanto o resultado anterior estiver desconhecido.


## Recuperação manual do teste #4 — 06/11/2026

O usuário confirmou ausência de pagamento na atividade da conta vendedora de teste. Somada às consultas sem candidatos e à ausência de registros financeiros vinculados, essa conferência foi usada para encerrar manualmente apenas a tentativa original do pedido #4. Isso não equivale a uma recusa confirmada pelo Mercado Pago: a resposta original continua desconhecida. Não se trata de uma rotina automática de liberação por busca vazia.

A operação bloqueou a linha do pedido e exigiu pedido confirmado/pendente, a chave e a data exatas da tentativa original, estado iniciado, ausência de payment_id e ausência de qualquer pagamento vinculado. O registro, sua impressão digital e a chave de idempotência foram preservados. O resultado recebeu `reason: test_attempt_released`, data e base da conferência. O pedido permaneceu com pagamento pendente; não houve chamada de criação de pagamento nessa recuperação. A consulta posterior confirmou esses estados.

A interface reconhece o encerramento manual de teste e permite reabrir o formulário no mesmo pedido. A próxima tentativa após esse resultado exige sandbox; no sandbox o backend exige credencial TEST ou conta identificada como test_user, antes de reservar/enviar pagamento. Um Access Token APP_USR não é considerado de produção somente pelo prefixo: contas de teste podem usá-lo. Produção e tentativas incertas comuns não recebem liberação automática.

Falhas de autorização HTTP 401/403 passam a mostrar configuração incompatível, preservando a tentativa. Os diagnósticos classificam erros conhecidos em categorias fixas de autorização, usuários incompatíveis, token de cartão e idempotência; nenhum texto arbitrário do provedor é registrado ou devolvido. Um conflito de idempotência, inclusive HTTP 400, permanece incerto e não libera outra cobrança.

Próximo passo: após a publicação na Vercel, abrir novamente o pedido #4 e enviar uma única tentativa com cartão de teste. Usar APRO para simular aprovação e e-mail diferente do vendedor, conforme a [documentação oficial de testes](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-test/make-test-purchase) e a [tabela oficial de cartões](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/integration-test/test-cards). Conferir o resultado real e os diagnósticos; os testes locais não comprovam homologação financeira. Não pedir credenciais nem dados de cartão pelo chat.
