# Polimento de interface — novembro de 2026

## Base preservada

A revisão partiu da main com os 12 commits de refinamento da Manus, até `baf77f2`, incluindo autenticação, catálogo, carrinho, pedidos, endereços e ícones. A alteração posterior do logo do README para 512px também foi preservada. O código financeiro, as Edge Functions, as migrations, as credenciais e o ambiente de pagamento não foram alterados.

## Concluído

- Removidos banner e rodapé de ambiente de testes, instruções de desenvolvimento no HTML e referências a fases futuras na interface.
- Cadastro e onboarding apresentam Informações de uso com fatos da conta e compra. O aceite existente continua obrigatório, sem fingir que há Termos/Política oficiais. O identificador histórico do backend foi mantido para compatibilidade.
- Operações sem cobrança real mantêm apenas a informação financeira contextual no pedido/pagamento. Não são apresentadas como recebimento real e não há mudança automática para produção.
- Notificações compactas no canto superior direito, 12px abaixo do cabeçalho medido. Quando o menu adicional está aberto, a posição respeita seu limite inferior. Sem título redundante ou efeito de modal; entrada GSAP em 280ms e saída em 160ms, sem animação quando solicitado pelo sistema.
- Mantidos deduplicação, pausa em foco/ponteiro/aba oculta, erros persistentes, live regions, fechamento por botão/Escape e espera pelo fim dos diálogos. Texto longo tem rolagem própria e o botão de fechar permanece alcançável.
- Cabeçalho sticky, marca Pupi com o ícone existente, navegação ativa em superfície lilás, menu Mais com Escape/clique externo e retorno de foco. A troca explícita de rota começa no topo; atualização da mesma rota mantém o contexto.
- Token `accent-ink` dá contraste a foco/links/ícones. Fundo lilás e texto escuro foram preservados nas ações, incluindo loading e navegação administrativa.
- Revisão do pedido alinhada ao restante da loja: etapas da compra, cartão de entrega e resumo de produtos/valores. Regras de cotação, confirmação, idempotência e pagamento posterior foram preservadas.
- Busca oferece Limpar filtros e recuperação após resultado vazio. Catálogo sem produtos, busca sem resultado e lista de pedidos vazia têm orientação própria, com ações reais.
- Ajustes de espaçamento, títulos, foco, formulário de acesso mobile, rodapé e visibilidade da rolagem de categorias. Componentes compartilhados continuam sendo os donos dos estados de interface.

## Decisões de design reconciliadas

| Contrato anterior | Evidência/decisão atual | Resolução |
| --- | --- | --- |
| Cartões de aviso centrais de 320px | Usuário pediu notificações simples abaixo do menu, à direita | Atualizados owner, CSS, motion, DESIGN.md, UX-CONTRACT.md e testes. Diálogos continuam centrais. |
| Botão primário com texto branco no frontmatter | A Manus passou a usar fundo lilás claro com texto escuro no runtime | Corrigida referência normativa para texto escuro e loading consistente. |
| Barra de categorias oculta | CSS novo da Manus removia indicadores de rolagem | Removida a ocultação; geometria fina herda cores/contraste globais. |
| Moldura de foco programático no título | Navegação focava h1 como se fosse controle | Mantido foco sem moldura no título; controles continuam com foco visível contrastante. |
| Textos de fases e ambiente em telas de compra | Estado atual já permite catálogo, frete e pagamento | Substituídos por conteúdo de produto, sem alterar autorização ou dados. |

## Verificação

- `npm run check`: 97 testes de aplicação e 102 de banco aprovados.
- `npm run test:e2e`: 60 de 61 cenários aprovados na execução completa. O cenário 3DS oscilou no clique do iframe; o teste foi ajustado para aguardar o estado não ocupado e posicionar o iframe antes do clique real. Passou em cinco repetições consecutivas, preservando a exigência de consulta ao servidor antes de mostrar aprovação. Todos os 61 cenários foram validados, sem ocultar a oscilação inicial.
- `npm run build` e `npm run design:check`: aprovados.
- Auditoria estática de interface em modo estrito: zero erros/violações.
- Lint oficial de DESIGN.md: zero erros; 14 avisos de tokens sem referência no mapa de componentes do frontmatter, que não interpreta os consumidores CSS. Tokens existentes foram preservados e a geração foi conferida pelo comando do projeto.
- Revisão visual: catálogo, produto/pedido, conta, endereço, carrinho, checkout, administração, login, cadastro, recuperação e notificação em 390px e 1440px; reflow também em 320px e 768px. Inclui select nativo aberto e seleção por teclado, textos longos, zoom, movimento reduzido, offline, erros e restauração de foco.
- Os testes de confirmação, estoque, autenticação, edição concorrente, mídia, cartão, Pix, expiração, contestação e recuperação continuam presentes. Capturas de revisão usam fixtures de navegador, sem produtos inseridos no banco ou cobranças reais.

A publicação contém somente interface, documentação e testes. Não exige nova migration, segredo ou deploy de Edge Function.
