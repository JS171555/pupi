# Contrato de experiência — Pupi Fases 2 e 3

## Contexto e fontes

Clientes brasileiros, pt-BR, celular e desktop. Datas de conta em America/Sao_Paulo. Fontes: briefing do Pupi, `docs/architecture.md`, `docs/security.md` e APIs Supabase Auth. A autorização do usuário permite aviso de testes enquanto não há termos oficiais. Acessibilidade: WCAG 2.2 AA. A fase inclui gestão administrativa. Compras e integrações de pagamento/frete ficam para a Fase 4.

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
| File Upload | src/services/admin-media.js, src/modules/admin/media.js | docs/phase-3-setup.md | gallery / category / retry | tests/e2e/admin.spec.js |

## Fluxos

| Operação | Ocupado | Sucesso | Falha e foco |
|---|---|---|---|
| Cadastro | Bloquear reenvio | Conta se houver sessão; caso contrário, instrução de confirmação de e-mail | Preservar nome/e-mail; erro de campo ou mensagem genérica sem enumerar contas |
| Login | Bloquear reenvio | Destino protegido validado ou Minha conta | Preservar e-mail, limpar senha quando rejeitada |
| Google | Abrir provedor apenas por clique | Callback PKCE, validar usuário, completar aviso se necessário | Mensagem e login por senha disponíveis |
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

Um sistema compartilhado de cartões centrais com live region: sucesso fecha em 4s (7s para mensagens longas), com pausa em foco/ponteiro e aba oculta; erros e informações importantes permanecem até fechamento. Notificações não roubam foco e têm botão Fechar aviso e Escape. Mensagens disparadas dentro de uma confirmação aguardam o fechamento do diálogo. Erros de campo continuam associados aos controles. Carregamento compartilhado usa patinha e texto após 200ms, com limpeza ao concluir ou abortar, sem skeleton ou percentual fictício; o botão preserva suas dimensões e bloqueia envio repetido. Dialog nativo showModal, foco no Cancelar, Escape quando ocioso, foco restaurado ao fechar, sem chamadas a alert/confirm/prompt.

Atualizações de perfil e endereço comparam updated_at para evitar sobrescrita silenciosa. Definir endereço padrão é transacional e bloqueia por usuário. Tentativa de salvar conflito mantém os dados e permite voltar/recarregar. Cadastro e e-mails não são repetidos automaticamente.

## Verificação

`npm run check`, `npm run build`, `npm run design:check`, `npm run test:e2e` e auditor estático da skill. Testes E2E usam respostas de teste explicitamente interceptadas; não são prova de autenticação hospedada. Navegador: desktop e 390px, teclado, select aberto, mensagens, offline, sessão expirada, erro e fluxo de CRUD. Login/cadastro/Google/e-mail reais dependem da configuração externa documentada.

## Administração — Fase 3

Sete seções: Resumo, Produtos, Categorias, Estoque, Pedidos, Clientes e Configurações. Navegação visível e indicação aria-current. Rotas `/admin/**` validam a conta e o papel real no banco; todas as RPCs repetem a autorização. Clientes recebem 403. Não há promoção de conta pelo painel.

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

Nunito Sans nos títulos e DM Sans no corpo, hospedadas localmente e disponíveis no cache público da PWA. Navegação mobile com ícones de 28px, rótulos de 12px e espaço inferior compatível com a barra e a área segura. Cartões centrais têm largura limitada, rolagem interna para conteúdo extenso e cantos definidos pelo token `notice`. GSAP anima entradas/saídas com duração curta; movimento reduzido mantém os elementos estáticos.

## Pagamento incorporado

Cartão e Pix são apresentados pelo Payment Brick oficial dentro do pedido, sem navegação para um checkout externo. A instância é desmontada ao sair da rota. Envio em andamento bloqueia cliques repetidos; o resultado é validado pelo backend. Um Pix pendente pode ser recuperado na recarga e verificado na mesma tela. Em caso de falha incerta, o cliente verifica a mesma tentativa em vez de abrir nova cobrança. Pedidos que já usaram o fluxo externo são identificados e não recebem um segundo formulário de pagamento. Atualizações da sessão preservam a rota atual; login explícito continua usando o destino validado.
