---
version: alpha
name: Pupi
description: Área de conta e administração de um petshop, com testes funcionais.
colors:
  primary: "#A78BFA"
  brand: "#A78BFA"
  pink: "#F4B8D5"
  mint: "#8BCDB0"
  lavender: "#DDD2FF"
  soft: "#EDE5FF"
  lilac: "#EDE5FF"
  background: "#FAF8FF"
  surface: "#FFFFFF"
  white: "#FFFFFF"
  text: "#302746"
  muted: "#665D76"
  border: "#D7D0E3"
  danger: "#AA263D"
  success: "#8BCDB0"
  success-ink: "#302746"
  warning: "#805218"
typography:
  display:
    fontFamily: "Nunito Sans, system-ui, sans-serif"
  body:
    fontFamily: "DM Sans, system-ui, sans-serif"
rounded:
  DEFAULT: "0.75rem"
  card: "1.25rem"
  notice: "1.5rem"
spacing:
  page-max: "68rem"
  section-gap: "1.5rem"
components:
  button:
    height: "2.75rem"
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
  input:
    height: "2.75rem"
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
  dialog:
    width: "30rem"
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
---

# Pupi

## Overview

Público: clientes de petshop no Brasil. Clientes criam e acessam a conta; administradores gerenciam catálogo, estoque e operação dos pedidos. Interface pt-BR, uso prioritário em celular, registro de produto. O briefing e `docs/security.md` definem as restrições; não há tela irmã anterior.

A referência é uma ficha de atendimento acolhedora: nome da pessoa, dados legíveis, seções curtas. A assinatura é a palavra `pupi` acompanhada de uma patinha discreta. A loja tem uma vitrine acolhedora, com lilás, rosa suave e navegação inferior no celular. O checkout mantém os dados e estados reais em primeiro plano. O resumo administrativo usa indicadores reais, com significado explícito para pagamentos. Evitar anúncios e estatísticas ilustrativas.

Fonte normativa dos tokens: frontmatter deste arquivo. `scripts/design-tokens.js` gera `src/styles/tokens.css`; componentes consomem apenas essas variáveis. `npm run design:check` detecta divergência. Não editar o arquivo CSS gerado à mão. Tema claro; modo de alto contraste usa cores de sistema.

## Colors

A paleta oficial usa `primary`/`brand` #A78BFA, `lavender` #DDD2FF, `soft` #EDE5FF, `background` #FAF8FF, `surface` #FFFFFF, `text` #302746, `pink` #F4B8D5 e `mint`/`success` #8BCDB0. Roxo e verde claros são fundos/indicadores, não cores de texto pequeno: texto em botões e estados usa `text` para contraste. Cores complementares de borda, aviso e erro ficam restritas a seus estados semânticos. Valores são gerados como `--color-<nome>`.

## Typography

`display` aparece na marca e títulos; `body` em controles e conteúdo. Nunito Sans em títulos e marca; DM Sans em textos, formulários e valores. Fontes variáveis WOFF2 locais em `public/fonts`, com licenças OFL incluídas, preload e cache público para uso offline. Corpo de 1rem, entrelinha 1.6; títulos de 1.5 a 2rem. Datas em pt-BR com fuso America/Sao_Paulo e moeda BRL. Valores extensos quebram linha.

## Layout

Conteúdo de até `page-max`, margens de 1rem em celular e 2rem em desktop. Formulários estreitos, fluxo natural do documento e navegação que quebra linha. Breakpoint de 48rem para duas colunas. Nenhum ancestral impõe altura fixa aos formulários. Erros e estados de carregamento têm região reservada; botões preservam largura quando ocupados.

## Elevation & Depth

Cartões têm borda discreta, sem sombras decorativas. Diálogos de confirmação e cartões centrais de aviso usam elevação discreta; avisos aguardam o fechamento do diálogo para não encobrir suas ações. Transições GSAP discretas acompanham a troca de telas, com respeito à preferência por movimento reduzido; sem parallax.

## Shapes

Controles usam `rounded.DEFAULT`; painéis usam `rounded.card`. Ícones Lucide de 20px em controles e 28px na navegação mobile, com rótulos de 12px e alvos de 64px. Ações importantes têm rótulos textuais. Nenhuma mudança de marca ou edição da imagem original é feita nesta fase.

## Components

`src/ui/forms.js` centraliza campos, erros, foco e estado ocupado. `src/ui/feedback.js` centraliza cartões de aviso de até 320px e diálogos de confirmação, ambos com cantos de 24px. Sucessos fecham após 4s (7s em textos longos), pausando com ponteiro, foco ou aba oculta. Erros e informações importantes permanecem até fechar. `src/ui/loading.js` centraliza a indicação após 200ms e preserva as dimensões dos botões. Botões: sólido primário, contorno neutro e perigo para exclusões definitivas e cancelamento de pedido; aviso para arquivar produto. Estados hover, focus-visible, active, disabled e busy são compartilhados.

Seleção de UF usa select nativo: popup e interação pertencem ao sistema operacional. Não há date picker nem seleção de linhas em lote. Listas de endereços e pedidos têm paginação explícita. Scrollbars globais usam os tokens de borda/superfície/texto, com fallback WebKit e cores de sistema em forced-colors.

Senhas são mascaradas com botão Mostrar/Ocultar e autocomplete apropriado. Formulários usam novalidate, mensagens associadas aos campos, foco no primeiro erro e prevenção de envio duplicado. Nenhum dado de cliente é renderizado como HTML.

`src/ui/admin-list.js` centraliza busca, filtros, tabelas e paginação. Navegação administrativa em sete seções quebra linha, sem menu oculto. Listas de 20 registros preservam filtros e página; tabelas rolam dentro de uma região com dica, sem alargar a página. Imagens têm espaço reservado de 180px e fallback de prévia. Arquivos usam o seletor nativo; resultados parciais e fila de limpeza têm texto persistente. Textareas não alteram o layout por arraste.

Conteúdo descreve operações reais. Não há dados de demonstração no aplicativo. O aviso de testes foi autorizado pelo usuário em 05/11/2026 e não se apresenta como documento jurídico de produção.

## Do's and Don'ts

- Usar nomes de ações consistentes: Entrar, Criar conta, Salvar alterações, Salvar endereço e Excluir endereço.
- Manter foco e dados não sensíveis após erro; limpar senhas ao concluir ou sair do fluxo.
- Não simular sessão, pedido ou permissão administrativa no produto.
- Não usar lavanda clara como texto sobre branco, alertas nativos ou estilos locais duplicados.

Pagamento mantém os componentes de formulário, carregamento, botões e feedback existentes. O iframe 3DS usa largura do contêiner, altura limitada e os tokens de borda/raio; o quadro não provoca navegação externa. Estados de Pix vencido, sandbox e conferência usam texto explícito na mesma região, com consulta manual preservada. Contrato em UX-CONTRACT.md e roteiro em docs/payment-production.md.
