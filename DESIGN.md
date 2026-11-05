---
version: alpha
name: Pupi
description: Área de conta de um petshop, com formulários simples para testes funcionais.
colors:
  primary: "#6D42B5"
  brand: "#A78BFA"
  lavender: "#DDD2FF"
  soft: "#EDE5FF"
  background: "#FAF8FF"
  surface: "#FFFFFF"
  text: "#302746"
  muted: "#665D76"
  border: "#D7D0E3"
  danger: "#AA263D"
  success: "#246448"
  warning: "#805218"
typography:
  display:
    fontFamily: "Trebuchet MS, system-ui, sans-serif"
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
rounded:
  DEFAULT: "0.75rem"
  card: "1.25rem"
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

Público: clientes de petshop no Brasil. O trabalho principal nesta fase é criar e acessar uma conta e conferir dados e pedidos. Interface pt-BR, uso prioritário em celular, registro de produto. O briefing e `docs/security.md` definem as restrições; não há tela irmã anterior.

A referência é uma ficha de atendimento acolhedora: nome da pessoa, dados legíveis, seções curtas. A assinatura é a palavra `pupi` acompanhada de uma patinha discreta. A Fase 2 não antecipa a loja, animações ou o acabamento da Fase 5. Evitar anúncios, estatísticas ilustrativas e aparência de dashboard de vendas.

Fonte normativa dos tokens: frontmatter deste arquivo. `scripts/design-tokens.js` gera `src/styles/tokens.css`; componentes consomem apenas essas variáveis. `npm run design:check` detecta divergência. Não editar o arquivo CSS gerado à mão. Tema claro; modo de alto contraste usa cores de sistema.

## Colors

A paleta preserva o roxo e a lavanda fornecidos pelo projeto. `primary` é a variante escura para ações e texto com contraste. `brand`, `lavender` e `soft` são superfícies e detalhes. Erros, sucesso e avisos têm texto e ícones além de cor. Valores exatos são gerados como `--color-<nome>`.

## Typography

`display` aparece na marca e títulos; `body` em controles e conteúdo. Fontes locais, sem carregamento externo. Corpo de 1rem, entrelinha 1.6; títulos de 1.5 a 2rem. Datas em pt-BR com fuso America/Sao_Paulo e moeda BRL. Valores extensos quebram linha.

## Layout

Conteúdo de até `page-max`, margens de 1rem em celular e 2rem em desktop. Formulários estreitos, fluxo natural do documento e navegação que quebra linha. Breakpoint de 48rem para duas colunas. Nenhum ancestral impõe altura fixa aos formulários. Erros e estados de carregamento têm região reservada; botões preservam largura quando ocupados.

## Elevation & Depth

Cartões têm borda discreta, sem sombras decorativas. Dialog modal é a única camada elevada. Sem animações de entrada, parallax ou transições de página nesta fase.

## Shapes

Controles usam `rounded.DEFAULT`; painéis usam `rounded.card`. Ícones Lucide de 20px, traço 1.8. Ações importantes têm rótulos textuais. Nenhuma mudança de marca ou edição da imagem original é feita nesta fase.

## Components

`src/ui/forms.js` centraliza campos, erros, foco e estado ocupado. `src/ui/feedback.js` centraliza mensagens persistentes e dialog de confirmação. Botões: sólido primário, contorno neutro e perigo para exclusão definitiva de endereço. Estados hover, focus-visible, active, disabled e busy são compartilhados.

Seleção de UF usa select nativo: popup e interação pertencem ao sistema operacional. Não há date picker nem seleção de tabela. Listas de endereços e pedidos têm paginação explícita. Scrollbars globais usam os tokens de borda/superfície/texto, com fallback WebKit e cores de sistema em forced-colors.

Senhas são mascaradas com botão Mostrar/Ocultar e autocomplete apropriado. Formulários usam novalidate, mensagens associadas aos campos, foco no primeiro erro e prevenção de envio duplicado. Nenhum dado de cliente é renderizado como HTML.

Conteúdo descreve operações reais. Não há dados de demonstração no aplicativo. O aviso de testes foi autorizado pelo usuário em 05/11/2026 e não se apresenta como documento jurídico de produção.

## Do's and Don'ts

- Usar nomes de ações consistentes: Entrar, Criar conta, Salvar alterações, Salvar endereço e Excluir endereço.
- Manter foco e dados não sensíveis após erro; limpar senhas ao concluir ou sair do fluxo.
- Não simular sessão, pedido ou permissão administrativa no produto.
- Não usar lavanda clara como texto sobre branco, alertas nativos ou estilos locais duplicados.
