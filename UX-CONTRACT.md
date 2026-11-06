# Contrato de experiência — Pupi

## Contexto e fontes

Clientes brasileiros, pt-BR, celular e desktop. Datas de conta em America/Sao_Paulo. Fontes: briefing do Pupi, `docs/architecture.md`, `docs/security.md` e APIs Supabase Auth. As informações de uso descrevem a conta; não afirmam aceite de documentos legais que ainda não foram publicados. Acessibilidade: WCAG 2.2 AA. O produto inclui conta, catálogo, carrinho, checkout, pagamento incorporado e gestão administrativa. As regras financeiras e logísticas seguem os contratos do servidor e os guias atuais de integração.

## Contrato visual

`DESIGN.md` gera `src/styles/tokens.css` por `scripts/design-tokens.js`. Componentes compartilham `src/styles/app.css`. Tema claro; cores de sistema em alto contraste. `npm run design:check` verifica os tokens.

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Form | src/ui/forms.js | UX-CONTRACT.md | create / edit / auth | tests/e2e/account.spec.js |
| Select/Listbox | src/ui/forms.js | DESIGN.md | native | tests/e2e/account.spec.js |
| Scrollbar | src/styles/app.css | DESIGN.md | global | tests/e2e/account.spec.js |
| Toast | src/ui/feedback.js | UX-CONTRACT.md | success / error / info | tests/e2e/account.spec.js |
| CRUD | src/repositories/account.js, src/repositories/admin.js | docs/security.md | return / stay | tests/e2e/account.spec.js, tests/e2e/admin.spec.js |
| Search | src/ui/admin-list.js | UX-CONTRACT.md | explicit submit / clear | tests/e2e/admin.spec.js |
| Table | src/ui/admin-list.js | DESIGN.md | horizontal scroll / no selection | tests/e2e/admin.spec.js |
| Pagination | src/ui/admin-list.js | UX-CONTRACT.md | previous / next | tests/e2e/admin.spec.js |
| File Upload | src/services/admin-media.js, src/modules/admin/media.js, src/services/banner-images.js | docs/banners.md | gallery / category / banner / retry | tests/e2e/admin.spec.js, tests/e2e/banners.spec.js |
| Carousel | src/ui/banner-carousel.js | docs/banners.md | responsive / autoplay / static | tests/e2e/banners.spec.js |
| Navigation Indicator | src/app.js, src/services/navigation-indicators.js | docs/security.md | cart / pending orders | tests/navigation-indicators.test.js, tests/e2e/navigation-indicators.spec.js |

## Fluxos

| Operação | Ocupado | Sucesso | Falha e foco |
|---|---|---|---|
| Cadastro | Bloquear reenvio | Conta se houver sessão; caso contrário, instrução de confirmação de e-mail | Preservar nome/e-mail; erro de campo ou mensagem genérica sem enumerar contas |
| Login | Bloquear reenvio | Destino protegido validado ou Minha conta | Preservar e-mail, limpar senha quando rejeitada |
| Google | Abrir provedor apenas por clique | Callback PKCE, validar usuário, completar informações de uso se necessário | Mensagem e login por senha disponíveis |
| Recuperação | Bloquear reenvio | Mensagem neutra sobre envio do link | Preservar e-mail; permitir tentar novamente |
| Nova senha | Validar sessão de recuperação | Encerrar sessão e solicitar novo login | Explicar link inválido/expirado e permitir pedir outro |
| Perfil | Confirmação no backend | Permanecer no perfil, anunciar Salvo | Preservar campos; conflito pede recarregamento explícito |
| Endereço | Confirmação no backend | Retornar à lista na página válida | Preservar formulário e explicar erro |
| Excluir endereço | Dialog aguarda backend | Fechar e atualizar lista | Erro permanece no dialog; Cancelar disponível |
| Logout | Bloquear duplicata | Limpar dados privados da memória e voltar ao login | Não afirmar saída se o servidor recusou |

## Navegação e permissões

No celular, a navegação inferior apresenta Loja, Carrinho, Pedidos e Conta/Entrar com texto e ícones Lucide. O menu Mais preserva acesso a endereços, administração, cadastro e saída conforme a sessão; desktop mantém a navegação principal visível. Os links usam o mesmo controle de alterações não salvas e permissões das rotas existentes. Na vitrine, os filtros podem ser abertos por teclado e toque; filtros ativos permanecem visíveis. As transições GSAP respeitam `prefers-reduced-motion` e não impedem interação.

Rotas por hash, títulos por página e botão Voltar preservado. Conta, endereços e pedidos exigem usuário validado com getUser. Acesso administrativo consulta função no banco e uma RPC; cliente recebe página 403 ao acessar diretamente. Nenhuma decisão usa user_metadata. RLS e GRANTs continuam sendo a autorização real do backend.

Páginas de auth são públicas. `/nova-senha` exige callback PKCE de recuperação ou marcador temporário dessa sessão validada; query string sozinha não autoriza troca. Callbacks são limpos da URL depois de processados. Retorno interno é limitado às rotas conhecidas; não usar next externo.

Pedidos: páginas de 10, ordenação estável por data/id; detalhes incluem itens e eventos reais. Endereços: páginas de 10, edição retorna à lista; exclusão ajusta página vazia. Nenhum endereço ou busca sensível fica na URL. Sem resultado é diferente de erro e de falta de permissão.

## Formulários e dados

Validação no submit e no campo já inválido durante edição; novalidate, aria-invalid/aria-describedby, resumo e foco no primeiro erro. Autocomplete e colagem de senhas permitidos. Senhas nunca são gravadas pela aplicação ou incluídas em logs. O SDK Supabase persiste a sessão e o verificador PKCE conforme seu contrato para SPA; não há armazenamento adicional de perfis ou senhas nem cache público de respostas privadas.

Perfil e endereço detectam edição não salva. Navegação interna usa dialog compartilhado; saída da página usa beforeunload somente quando necessário. Estado ocupado bloqueia envio e navegação que abandonaria uma gravação. Dados digitados não sensíveis permanecem após erro. Não manter senha após sucesso, logout ou mudança de fluxo.

UF usa select nativo, sem prometer geometria própria. Nenhum date picker. Campos de data exibidos são somente leitura. Telefone é opcional; CEP brasileiro e UF são validados no cliente e no PostgreSQL.

## Async, sessão e feedback

Gravações pessimistas, sem sucesso antecipado. Leituras de rota usam AbortController e geração de rota para rejeitar resposta antiga. Consultas têm timeout; sem conexão não há fila de gravação ou promessa de sucesso. Sessão expirada limpa estado privado e oferece login. Mudanças de sessão em outra aba atualizam a navegação.

Um sistema compartilhado de notificações compactas no canto superior direito, abaixo do cabeçalho, com live region: sucesso fecha em 4s (7s para mensagens longas), com pausa em foco/ponteiro e aba oculta; erros e informações importantes permanecem até fechamento. Notificações não têm borda nem faixa lateral; texto centralizado, ícone e botão de fechar ficam alinhados ao centro vertical, com colunas laterais simétricas. Mantêm contorno de sistema no modo de alto contraste. Não roubam foco e têm botão Fechar aviso e Escape. Mensagens disparadas dentro de uma confirmação aguardam o fechamento do diálogo. Erros de campo continuam associados aos controles. Carregamento compartilhado usa patinha após 200ms, com limpeza ao concluir ou abortar, sem skeleton ou percentual fictício; o botão preserva suas dimensões e bloqueia envio repetido. Dialog nativo showModal, foco no Cancelar, Escape quando ocioso, foco restaurado ao fechar, sem chamadas a alert/confirm/prompt.

Atualizações de perfil e endereço comparam updated_at para evitar sobrescrita silenciosa. Definir endereço padrão é transacional e bloqueia por usuário. Tentativa de salvar conflito mantém os dados e permite voltar/recarregar. Cadastro e e-mails não são repetidos automaticamente.

## Verificação

`npm run check`, `npm run build`, `npm run design:check`, `npm run test:e2e` e auditor estático da skill. Testes E2E usam respostas de teste explicitamente interceptadas; não são prova de autenticação hospedada. Navegador: desktop e 390px, teclado, select aberto, mensagens, offline, sessão expirada, erro e fluxo de CRUD. Login/cadastro/Google/e-mail reais dependem da configuração externa documentada.

## Administração — Fase 3

Oito seções: Resumo, Produtos, Categorias, Banners, Estoque, Pedidos, Clientes e Configurações. Navegação visível e indicação aria-current. Rotas `/admin/**` validam a conta e o papel real no banco; todas as RPCs repetem a autorização. Clientes recebem 403. Não há promoção de conta pelo painel.

Buscas são explícitas, com Aplicar filtros/Enter, proteção de composição IME e Limpar busca com restauração de foco. Busca/filtros reiniciam na página 1. Listas usam 20 registros, contagem, Anterior/Próxima e ordem determinística; URL preserva filtros e página. Busca de cliente é privada em memória e removida no logout. Tabelas são sem seleção, com cabeçalhos semânticos e região de rolagem horizontal no celular. Ordenação de produtos usa select nativo. Página vazia tem orientação própria; erro não vira lista vazia.

Produto/categoria salvam e retornam à lista; estoque, pedido, configurações e mídia permanecem no contexto atualizado. Saldo nasce zero e só muda por movimento com motivo. Operações aguardam confirmação; chave estável permite retentar resposta perdida sem duplicar. Produto/categoria/pedido/configurações usam versão, estoque compara saldo. Conflitos preservam o formulário e pedem recarregar. Arquivar usa aviso; exclusões/cancelamento usam diálogo de perigo. Erro permanece no diálogo com Cancelar disponível. Produto com histórico só pode ser arquivado. Cancelamento de pedido pago não está disponível sem estorno.

Mídia aceita JPEG/PNG/WebP até 5 MiB, confere cabeçalho e usa caminho novo por arquivo. Seletor nativo permite vários arquivos em produto e um por categoria. Lista mostra aguardando, enviando, confirmado e falha por arquivo. Retentar ignora sucessos já confirmados; Remover da fila descarta somente a seleção local daquele arquivo. Recarregar perde a seleção local; arquivos enviados sem vínculo aparecem na pasta para recuperação. Uma resposta incerta é reconferida ou repetida com a mesma chave, sem apagar um arquivo potencialmente vinculado.

Editar imagem mantém a prévia, permite texto alternativo/posição e retorna à galeria. Principal é exclusivo por produto. Remover desvincula transacionalmente e enfileira a exclusão física pela API Storage. Falha nessa segunda etapa deixa fila persistente e ação Tentar limpeza. Arquivo vinculado não pode ser enfileirado; arquivo enfileirado não pode ser revinculado. Não existe exclusão direta de Storage por SQL no projeto hospedado.

Pedidos mostram pagamento somente para consulta; operação de entrega é identificada como manual. Não indica compra de frete/etiqueta. Cancelamento anterior ao envio repõe estoque uma vez; após falha de entrega, retorno físico precisa ser conferido pelo operador. Configurações aceitam apenas dados operacionais permitidos e nunca credenciais.

## Loja e checkout — Fase 4

Carrinho mostra subtotal estimado e sinaliza itens indisponíveis ou não incluídos. A revisão usa endereço da conta e consulta cotações ao backend. Cada opção mostra frete e total também fora do select, para que valores não fiquem truncados no celular. Trocar o endereço remove as cotações anteriores. A confirmação registra pedido com pagamento pendente e exibe o resultado somente após resposta do servidor.

Uma confirmação sem resposta conserva a mesma chave por usuário na sessão do navegador. Reabrir a revisão permite verificar a tentativa sem duplicar o pedido; falha conhecida por cotação expirada libera nova consulta. Não guardar tokens de frete nem dados de endereço no armazenamento da aplicação. A cotação real exige credenciais no servidor e a remessa/rastreamento automáticos ainda não estão implementados.

## NF-e no pedido administrativo

A administração aceita a chave de 44 dígitos de uma NF-e já emitida, sem inserir dados fiscais na URL ou no armazenamento do navegador. A chave é validada no cliente e no banco, com detecção de versão anterior. Erros preservam o valor digitado; sucesso não apaga outros formulários do pedido. A interface deixa claro que não emite a nota e não verifica sua autorização na SEFAZ.

## Refinamento mobile e feedback

Nunito Sans nos títulos e DM Sans no corpo, hospedadas localmente e disponíveis no cache público da PWA. Navegação mobile com ícones de 28px, rótulos de 12px e espaço inferior compatível com a barra e a área segura. Notificações têm até 380px, texto sem título redundante, ícone semântico, rolagem no texto extenso e cantos definidos pelo token `toast`. O deslocamento acompanha a altura real do cabeçalho e do aviso offline sem alterar o layout da página. GSAP anima entradas/saídas com duração curta; movimento reduzido mantém os elementos estáticos.

## Pagamento incorporado

Cartão e Pix são apresentados pelo Payment Brick oficial dentro do pedido, sem navegação para um checkout externo. A instância é desmontada ao sair da rota. Envio em andamento bloqueia cliques repetidos; o resultado é validado pelo backend. Um Pix pendente pode ser recuperado na recarga e verificado na mesma tela. Em caso de falha incerta, o cliente verifica a mesma tentativa em vez de abrir nova cobrança. Pedidos que já usaram o fluxo externo são identificados e não recebem um segundo formulário de pagamento. Atualizações da sessão preservam a rota atual; login explícito continua usando o destino validado.

O formulário recebe o e-mail da conta autenticada em `initialization.payer.email`, conforme o contrato oficial do Payment Brick. Pix e cartão usam esse preenchimento inicial, inclusive ao reabrir uma tentativa permitida. Sem e-mail disponível, permanece o preenchimento pelo SDK. O envio preserva o e-mail retornado pelo formulário oficial; não o sobrescreve depois. Não há armazenamento adicional de e-mail no navegador nem criação automática de cobrança.


O pagamento incorporado usa a API Orders, conforme `docs/phase-5-plan.md`. A configuração é conferida antes de abrir os campos de cartão. O tipo de pagamento vem do callback oficial do Brick; valores e aprovação continuam sendo conferidos pelo servidor. Tentativas incertas continuam preservadas e não geram outra cobrança durante a verificação.


Se a configuração financeira não cria cobrança real, o pagamento informa esse fato no contexto do Pix, sem faixa global ou nome de ambiente. O contrato técnico permanece documentado em `docs/payment-production.md`. O código copia e cola e a ação Verificar pagamento permanecem na própria tela e após recarga. Em produção, a orientação de pagamento pelo QR Code permanece. Nenhum estado pago é criado só pelo navegador.

Acompanhamento de pagamentos: pendências conhecidas são consultadas sem nova cobrança, com pausa offline/aba oculta, limite de dois minutos e cancelamento na saída. Verificar pagamento continua disponível. Pix vencido oculta código/cópia sem inventar um estado financeiro. Autenticação 3DS fica em iframe validado; mensagem COMPLETE apenas consulta o servidor. Pedidos sem cobrança real recebem essa informação nos detalhes; pagamentos em conferência não mostram aprovação. Configuração e sessão têm mensagens próprias. Detalhes e homologação: `docs/payment-production.md`.


## Polimento da interface — novembro de 2026

A decisão atual do usuário substitui os antigos cartões centrais de aviso por notificações compactas no canto superior direito, 12px abaixo do cabeçalho. `src/ui/feedback.js` e `src/styles/feedback.css` continuam os únicos donos desse comportamento. Entrada GSAP com deslocamento de 12px e fade em 280ms; saída em 160ms; movimento reduzido remove transformação/animação. Sucesso dura 4s (7s em texto longo); foco, ponteiro e aba oculta pausam a contagem. Erros e informações importantes permanecem até fechar. Não há título genérico, fila visual acumulada ou roubo de foco. Diálogos continuam centrais e mensagens aguardam seu fechamento.

O cabeçalho sticky mantém o menu acessível durante a rolagem. O menu Mais fecha com Escape, clique externo ou navegação e restaura foco ao fechar por teclado. Troca explícita de rota por link começa no topo; atualização da mesma rota mantém o contexto. O foco de título programático não desenha uma moldura de controle, mas botões, links e campos mantêm foco visível de alto contraste.

Cadastro e onboarding preservam a obrigatoriedade de aceite existente. A interface apresenta Informações de uso, sem inventar documentos legais. RPC e identificador histórico `testing-v1` foram preservados para compatibilidade, não constituem aceite de novos Termos/Política. A remoção de textos de desenvolvimento não muda credenciais, modo financeiro, preços, permissões ou estados do pedido.

Busca de catálogo mantém filtros explícitos e oferece Limpar filtros e recuperação após resultado vazio. Catálogo ainda sem produtos e busca sem resultado têm mensagens diferentes. Revisão do pedido compartilha as superfícies do carrinho: entrega e resumo, totais BRL, confirmação no servidor e pagamento posterior. Selects continuam nativos, com popup do sistema operacional. Não há consulta ou mutação financeira nova nesta revisão visual.


## Conteúdo essencial e loading de ações

A interface mantém títulos, rótulos, preços, dados, status, validações e instruções que mudam uma decisão. Foram retirados hero promocional, sobrelinhas repetidas, descrições genéricas de página, dicas laterais de endereço e frases decorativas. Conteúdo legal, requisitos de senha, limitações financeiras/fiscais e recuperação de erro permanecem disponíveis.

Ações mostram apenas uma patinha dentro do botão, após 200ms, preservando nome acessível, dimensões e prevenção de duplicação. Formulários e diálogos não exibem um segundo indicador embaixo. `buttonLoading` compartilha a mesma instância por botão com limpeza por consumidor. O carregamento da página sem ação usa uma patinha com `aria-label`, centralizada na área visível abaixo do cabeçalho, a 72px no celular e 80px no desktop. Reserva a navegação inferior e a área segura no celular, acompanha rolagem e não intercepta cliques. O loading dos botões mantém 23px; pulsação respeita movimento reduzido. O SDK de pagamento mantém o próprio indicador e o Pupi não o duplica. O botão de carregamento do pagamento permanece até o formulário ficar pronto.

## Banners da loja

Solicitação do proprietário: upload administrativo de versões mobile e desktop, com troca automática na página inicial. Contrato de dados e permissões: `docs/banners.md` e migração `pupi_home_banners`. A raiz abre `/loja`; o catálogo sem filtros na primeira página apresenta os banners publicados. A consulta opcional tem prazo limitado e sua falha não impede compras.

Novo banner salva um rascunho e abre a etapa de imagens. Editar reutiliza o formulário, validações associadas, prévias, aviso de alterações não salvas e loading dentro do botão. A versão mobile é 1:1; desktop é 3:1. Publicar exige ambas. Salvar retorna à lista; Ocultar preserva arquivos; Excluir pede confirmação e retorna à lista, com recuperação da limpeza física quando pendente. Busca e paginação seguem `admin-list.js`.

O carrossel reserva a geometria final, troca a cada seis segundos e oferece controles de 44px, rótulos em pt-BR e atualização acessível apenas em mudanças manuais. Pausa explícita persiste durante a rota; foco, ponteiro, aba oculta e saída do viewport suspendem o avanço. Movimento reduzido começa pausado e evita o fade. Uma imagem fica estática. Eventos, observador e temporizador são encerrados pelo AbortSignal da rota. Falhas de imagem recebem uma renovação de URL e depois são ignoradas; falha total oculta o carrossel.

O carrossel com um único banner omite os controles sem inserir texto substituto, mantendo apenas a imagem e a região acessível.

## Indicadores de carrinho e pagamento

A navegação apresenta uma bolinha vermelha quando a conta tem produtos no carrinho ou pedidos com `payment_status=pending` e `status` diferente de `cancelled`. Consultas usam apenas identificadores, filtro explícito da conta e as políticas existentes descritas em `docs/security.md`, com limite de uma linha e timeout. Não há contadores fictícios, dados privados persistidos no navegador ou mudança das regras de pagamento.

Os indicadores atualizam ao renderizar a navegação, incluir/remover produtos, confirmar pedido e concluir pagamento. Retornar à aba/janela ou reconectar solicita nova leitura, sem polling. A atualização não reconstrói o menu nem rouba foco. A descrição acessível explica o indicador, mantendo Carrinho/Pedidos como nomes dos links. Falha opcional não bloqueia a página e preserva o último estado conhecido da mesma conta; logout ou troca de conta apaga os sinais e descarta respostas anteriores.
