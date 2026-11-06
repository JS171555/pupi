# Fase 5 — andamento

A fase 5 inclui o pagamento via Mercado Pago solicitado pelo usuário, instalação como PWA e, por último, o trabalho de UI/UX e identidade visual.

## Implementado

- O checkout atual é Transparente via API Orders, com o Payment Brick oficial incorporado à tela do pedido: cartão e Pix são enviados ao backend com o total do banco, sessão verificada e chave de idempotência. A página do Pupi não redireciona para o checkout externo. A resposta perdida pode ser verificada usando a mesma tentativa ou por consulta autenticada ao provedor.
- O receptor de webhook valida a assinatura, consulta o pagamento diretamente no Mercado Pago e confere pedido, vendedor, valor, moeda e ambiente. O banco registra pagamentos com processamento idempotente e ignora eventos antigos. Recusas permitem nova tentativa no mesmo checkout; estornos parciais, contestações e múltiplos pagamentos exigem conferência administrativa. O pedido só é marcado como pago mediante confirmação do provedor.
- A migration `20261106064442_pupi_payment_reconciliation.sql` foi aplicada ao Supabase. As funções `pupi-mercadopago-checkout` e `pupi-mercadopago-webhook` são usadas pelo checkout e pela confirmação do pagamento. A primeira exige JWT; a segunda valida a assinatura do provedor.
- O detalhe do pedido oferece acesso ao pagamento quando estiver configurado. O PWA tem manifesto, ícones e service worker que guarda somente o shell público; chamadas de APIs e dados de conta não são adicionados ao cache offline.
- Os testes locais usam dados fictícios. Foi verificado o funcionamento offline do shell em navegador e a ausência de rotas privadas no cache. O usuário confirmou aprovação no pedido #4 pela API Orders; a consulta ao Supabase confirmou pedido e tentativa pagos em sandbox, com identificador do provedor vinculado.

## Configuração atual — API Orders

No Supabase, configurar os seguintes segredos para o ambiente de teste do Mercado Pago, sem adicioná-los ao código ou enviá-los no chat:

- `MERCADO_PAGO_ACCESS_TOKEN`: Access Token APP_USR do ambiente Teste da aplicação API Orders, vinculado à conta vendedora de teste. Orders não aceita o token TEST do fluxo antigo Payments; o sandbox usa credenciais da conta de teste. Para produção, usar a conta real e seu token de produção.
- `MERCADO_PAGO_PUBLIC_KEY`: Public Key do mesmo ambiente e aplicação API Orders da conta vendedora correspondente ao Access Token; é disponibilizada ao SDK no navegador. Nunca usar o Access Token neste campo.
- `MERCADO_PAGO_WEBHOOK_SECRET`: assinatura secreta configurada no Mercado Pago.
- `MERCADO_PAGO_COLLECTOR_ID`: identificador numérico da conta de vendedor correspondente ao token.
- `MERCADO_PAGO_ENV`: `sandbox` para testes ou `production` para produção.
- `PUPI_STORE_ORIGIN`: configuração histórica do Checkout Pro; não é necessária ao formulário incorporado.
- `MERCADO_PAGO_CHECKOUT_ENABLED`: manter ausente ou `false` até concluir a configuração; `true` permite iniciar pagamentos no ambiente configurado.

Configurar o evento **Order (Mercado Pago)** no webhook `https://loifqxmmnmhpwnwcvrak.supabase.co/functions/v1/pupi-mercadopago-webhook`. Homologar com contas de teste distintas, inclusive pagamento pendente, aprovado, recusado, duplicado e estorno, antes de usar produção. Consulte a [documentação oficial do Payment Brick](https://www.mercadopago.com.br/developers/pt/docs/checkout-bricks/payment-brick/default-rendering) e de [notificações Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications).

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

## Histórico — mudança para pagamento dentro do Pupi via Payments

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


## Diagnóstico confirmado de autorização — 06/11/2026, 15:17 UTC

A nova tentativa do pedido #4 registrou `PAYMENT_AUTHORIZATION_REJECTED`, HTTP 401, na criação em `/v1/payments`. A consulta autenticada `/users/me` e a comparação do vendedor passaram. Portanto, a credencial permitiu consultar a conta, mas não autorizou criar esse pagamento; não há evidência suficiente para distinguir falta de permissão de combinação incorreta de credenciais/aplicação/ambiente. O corpo privado da resposta não foi armazenado.

A tentativa foi criada às 15:17:30.503704 UTC e a rejeição foi registrada às 15:17:30.797 UTC. Após conferir ausência de pagamentos vinculados, somente essa tentativa foi encerrada com `reason: provider_authorization_rejected` e `provider_http_status: 401`. Histórico, impressão digital e chave de idempotência foram mantidos; o pedido continua pendente. A consulta posterior confirmou estado failed e payment_id nulo. Nenhum pagamento foi criado para diagnosticar o problema.

A orientação anterior para usar token da conta de vendedor de teste foi corrigida: para testes via Payments API, a [documentação oficial](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/integration-test/make-test-purchase) pede credenciais de teste do usuário de produção. Próximo passo manual: obter Access Token e Public Key do ambiente Teste da mesma aplicação compatível com Payments API na conta principal; atualizar os respectivos segredos no Supabase, manter MERCADO_PAGO_ENV=sandbox e conferir MERCADO_PAGO_COLLECTOR_ID correspondente à conta do token. Não copiar valores para o repositório/chat. Se persistir 401 com a combinação correta, verificar a habilitação/permissão da API Payments com o Mercado Pago. Retomar somente após ajustar as credenciais, no mesmo pedido #4 com novo cartão de teste tokenizado pelo SDK.


## Divergência do vendedor após troca de credenciais — 06/11/2026, 16:02 UTC

As últimas consultas registraram `PAYMENT_ACCOUNT_COLLECTOR_MISMATCH` (15:56:52, 15:59:10 e 16:02:21 UTC). A API aceitou o Access Token para consultar a conta, mas o ID retornado não corresponde a MERCADO_PAGO_COLLECTOR_ID. O bloqueio ocorre antes de reservar/enviar cobrança. Isso ainda não verifica a permissão de criação do novo token.

A tentativa anterior, criada às 15:30:29.654837 UTC e rejeitada com HTTP 401 às 15:30:29.985 UTC, foi encerrada após bloquear o pedido e conferir data/estado exatos, ausência de payment_id e ausência de pagamentos vinculados. O resultado registra provider_authorization_rejected e HTTP 401; o histórico permanece. A consulta posterior confirmou estado failed e pedido ainda pending. Nenhum código funcional foi alterado nesta investigação.

Próximo passo manual: atualizar somente MERCADO_PAGO_COLLECTOR_ID no Supabase para o User ID numérico do vendedor correspondente ao Access Token atualmente configurado. Consultar o ID na própria conta ou pela API oficial /users/me com a credencial mantida no ambiente do usuário. Não usar identificador da aplicação ou da conta compradora. Manter o par Access Token/Public Key da mesma aplicação e ambiente. Depois, reabrir o pedido #4 e retomar o teste. Não solicitar nem registrar o token pelo chat; o resultado do pagamento ainda exige homologação real.


## Nova conferência após atualização — 06/11/2026, 16:34 UTC

As verificações de 16:32:38 e 16:34:16 passaram pela autenticação da conta e comparação do vendedor e chegaram à busca de pagamentos, que registrou PAYMENT_SEARCH_EMPTY com zero candidatos e zero vínculos. A divergência do COLLECTOR_ID não apareceu nessas consultas. Isso confirma acesso de consulta e correspondência da conta naquele momento, mas não comprova permissão de criação nem homologação do par Public Key/Access Token.

A última criação registrada ocorreu às 16:21:46 e recebeu HTTP 401. Após conferir ausência de pagamentos vinculados, somente essa tentativa (criada às 16:21:46.613251 UTC) foi encerrada com auditoria provider_authorization_rejected/401. O histórico foi mantido e a consulta posterior confirmou estado failed, ausência de payment_id e pedido pending. Nenhuma cobrança foi criada durante a conferência.

Próximo passo: reabrir o pedido #4 e enviar uma única nova tentativa com cartão de teste pelas credenciais atuais. Conferir a resposta de criação e os diagnósticos. Não declarar a integração validada somente por consulta vazia; não liberar tentativas incertas por esse motivo. Código funcional preservado nesta análise.


## Correção da incompatibilidade API Orders — 06/11/2026

O usuário confirmou que a aplicação foi criada como **Checkout Transparente via API Orders**. O Pupi estava enviando a criação para a API Payments (`/v1/payments`). A orientação anterior de alterar repetidamente credenciais da conta principal tratava o contrato errado; a diferença entre as duas APIs foi a incompatibilidade identificada nesta revisão. O último envio ainda retornou 401 às 16:38:38 UTC. Isso não permite afirmar que todos os requisitos do provedor já foram homologados.

O entrypoint do checkout agora usa Orders para novas tentativas. A criação envia `/v1/orders`, tipo online, processamento automático, valores monetários em texto e transação aninhada. A referência externa é a chave única da tentativa; não são enviados notification_url nem metadata do contrato antigo. O tipo de cartão vem do callback oficial do Brick. O backend mantém total do banco, usuário autenticado, titularidade, impressão digital e chave de idempotência.

A migration `20261106165806_pupi_orders_api.sql` foi aplicada e registra o contrato, ambiente e vendedor da tentativa. Ela aceita IDs ORD sem invalidar IDs numéricos históricos, preserva as travas financeiras e mantém RPCs exclusivas do serviço. A leitura canônica da order valida vendedor (user_id), mercado brasileiro/BRL, referência, valor, uma única transação e estados consolidados. Pagamento só passa a pago com order e transação processadas/acreditadas e total bruto pago conferido. Valores líquidos após taxas não são confundidos com o total bruto. Reembolsos parciais e contestações exigem revisão.

Pix usa os campos de QR Code da transação, sem retornar ticket_url. A recuperação após recarga usa busca Orders por data e referência da tentativa, seguida de GET canônico; consulta vazia, ambígua, timeout e idempotência em conflito não liberam nova cobrança. Uma rejeição de autorização/validação conhecida na primeira requisição encerra somente essa tentativa; uma resposta incerta anterior nunca é liberada por erro posterior. Tentativas Payments continuam identificadas e são consultadas pela API original.

O webhook aceita eventos order e payment, verifica HMAC conforme o SDK oficial e consulta o recurso diretamente antes de atualizar o banco. Para Orders, a configuração no painel deve selecionar o evento **Order (Mercado Pago)** e manter a assinatura correspondente em MERCADO_PAGO_WEBHOOK_SECRET. Orders não usa notification_url no corpo da criação. O modo sandbox envia X-Test-Token: true e exige conta identificada como test_user; as credenciais são verificadas ao abrir o checkout, antes dos campos de cartão. Valores de credenciais e dados de comprador continuam fora dos logs.

Fontes: [migração oficial](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/migrate-payments-to-orders), [cartões Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/payment-integration/websites/cards), [busca e credenciais Orders](https://www.mercadopago.com.br/developers/pt/reference/online-payments/checkout-api/search-order/get) e [notificações](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/notifications).

Validação local: 87 testes de aplicação, 97 de banco, 48 de navegador, build, tokens e auditoria estática. Os testes usam respostas fictícias e não confirmam pagamento real. Próximo passo: conferir credenciais Orders/conta vendedora de teste e evento Order, abrir o pedido #4 e homologar uma única tentativa. Não declarar a homologação concluída sem resposta real do provedor.

A última tentativa histórica do pedido #4 (Payments, criada às 16:38:38.587114 UTC e rejeitada com HTTP 401) foi encerrada com auditoria, depois de conferir ausência de pagamento vinculado e bloquear a linha do pedido. O histórico permanece e o pedido continua pending; as próximas tentativas usam Orders. Não foi criada cobrança nessa operação.


## Cartão aprovado em sandbox — 06/11/2026

O usuário confirmou pagamento aprovado e pedido pago após a correção para API Orders. A consulta posterior ao Supabase confirmou, no pedido #4: payment_status=paid, tentativa state=paid, api_kind=orders, provider_mode=sandbox e identificador do provedor vinculado. Nenhum estado financeiro foi alterado manualmente nessa conferência.

O fluxo de aprovação com cartão está validado no ambiente de teste. Essa evidência não comprova isoladamente o recebimento do webhook nem os cenários de Pix, recusa, pendência, contestação e estorno. Próximo passo de homologação: testar esses cenários e as notificações assinadas antes de habilitar produção. As anotações anteriores de pedido pendente são o histórico do diagnóstico, não o estado atual do pedido #4.


## Pix — preparação da homologação em sandbox

A revisão do [teste oficial de Pix na API Orders](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/integration-test/pix) identificou o cenário payer.first_name=APRO: o Mercado Pago cria a order aguardando transferência e depois simula a aprovação automaticamente. Esse campo agora é enviado somente para Pix em sandbox, após validar que a credencial pertence a uma conta de teste. O valor do pedido, e-mail e documento continuam os dados conferidos da tentativa; valores de demonstração da documentação não são usados para substituir o total da compra. Cartão e Pix em produção não recebem o nome APRO por essa regra.

A resposta autenticada informa test_mode e a interface identifica o Pix de teste, explicando a simulação sem pagamento pelo aplicativo bancário. O código copia e cola e o QR Code fornecidos pelo provedor continuam na tela. A consulta seguinte usa o mesmo identificador e só marca o pedido como pago após conferir a resposta canônica do Mercado Pago. Não há botão que force aprovação local nem nova cobrança durante a verificação.

Validação local desta etapa: 89 testes de aplicação, 97 de banco, 49 de navegador, build, tokens e auditoria estática. Cobertura nova: APRO ausente de produção/cartão; Pix pendente para pago sem segundo POST; aviso de sandbox preservado após recarga. A aprovação real do Pix no sandbox ainda depende do teste do usuário; os testes automatizados usam respostas fictícias.

Próximo passo: abrir um pedido pendente na conta correspondente, selecionar Pix e enviar uma única tentativa. Conferir o código retornado ou a aprovação já concluída e usar Verificar pagamento para acompanhar a simulação. O pedido #4, já pago por cartão, não deve receber outra tentativa. Registrar o resultado real desta homologação quando confirmado. Nenhuma credencial nova foi solicitada e nenhum estado financeiro foi alterado manualmente nesta etapa.
