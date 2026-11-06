# Banners da página inicial

## Operação

1. Acesse **Administração → Banners → Novo banner**.
2. Informe uma descrição acessível do conteúdo e a posição. **Criar banner** salva um rascunho e abre o envio de imagens.
3. Escolha as duas versões. JPEG, PNG ou WebP, até 5 MiB por arquivo:
   - Mobile: quadrada, proporção 1:1. Sugestão: 1080 × 1080 px.
   - Desktop: horizontal, proporção 3:1. Sugestão: 1920 × 640 px.
4. Confira as prévias, marque **Exibir na loja** e clique em **Salvar banner**.

Posições menores vêm primeiro; empates usam o identificador. Até oito banners podem ficar publicados ao mesmo tempo. **Ocultar** preserva o cadastro e as imagens. **Excluir banner** pede confirmação e enfileira todos os arquivos da pasta para remoção. Se a remoção física falhar, **Tentar limpeza** fica disponível na lista, mesmo depois da exclusão do último banner.

A seleção pode ser removida antes de salvar. O envio confere tamanho, tipo, assinatura e proporção; arquivos inválidos não são enviados. Se houver resposta incerta, repita **Salvar banner** com a seleção preservada: o mesmo caminho e recibo são reaproveitados. Envios já confirmados não se repetem. Recarregar perde a seleção local; o rascunho e os vínculos confirmados permanecem. Arquivos sem vínculo podem ser removidos no editor. Edições concorrentes exigem recarregar em vez de sobrescrever dados silenciosamente.

## Exibição

A raiz do aplicativo abre a loja. O carrossel aparece no início de `/#/loja`, antes das categorias. Não aparece em buscas, filtros ou páginas seguintes. Sem banners publicados, o catálogo continua normalmente.

O navegador escolhe a versão mobile abaixo de 48rem; desktop usa a imagem horizontal. O quadro reserva espaço e não corta as imagens. Dois ou mais banners alternam a cada seis segundos; há seletores, anterior/próximo e pausa. O avanço pausa com foco, ponteiro, aba oculta ou carrossel fora da tela. Movimento reduzido começa sem reprodução automática. Ao sair da rota, temporizadores, observadores e animações são encerrados. Um único banner fica estático.

Correção da exibição de um único banner: os controles são omitidos sem inserir `null` como texto na página. A descrição continua sendo o texto alternativo da imagem.

Falha de um banner não bloqueia produtos. Uma imagem indisponível recebe uma tentativa de renovar suas URLs; se continuar indisponível, é ignorada. Se todas falharem, o carrossel é ocultado. URLs assinadas duram cinco minutos; uma URL já emitida pode continuar acessível até vencer depois de ocultar o banner.

## Banco e permissões

A migração `pupi_home_banners` cria `public.home_banners` e o bucket privado `banner-images`. Aplique as migrações pelo fluxo do README antes de publicar o frontend em outro projeto. Não há segredo, Edge Function ou variável de ambiente adicional.

- Público e clientes leem apenas banners ativos com as duas imagens vinculadas.
- Administradores reais podem consultar rascunhos e enviar arquivos. Cadastro, publicação, vínculo e exclusão passam pelas RPCs existentes `admin_query` e `admin_mutate`.
- Gravação direta na tabela pelo navegador é negada, inclusive ao administrador.
- O Storage limita formatos e tamanho. Caminhos pertencem a um banner existente; arquivos são imutáveis, sem sobrescrita.
- Arquivos vinculados não podem ser excluídos. Substituição/exclusão enfileira os anteriores; a API Storage realiza a exclusão física. Arquivo enfileirado não pode ser revinculado.
- Recibos de mutação, versão `updated_at`, autorização, fila persistente e auditoria seguem a infraestrutura administrativa existente. A publicação serializa a verificação de limite.

## Verificação e progresso

Implementados: cadastro, duas versões, prévia, validação, rascunho, publicação, ocultação, ordem, busca/paginação, exclusão confirmada, limpeza recuperável e carrossel responsivo acessível.

Cobertura automatizada: `tests/database/foundation.test.js` verifica RLS, recibos, publicação, concorrência por versão, limite, propriedade dos caminhos e limpeza; `tests/e2e/banners.spec.js` verifica CRUD, resposta perdida, proporções, desktop/mobile, pausa, teclado, movimento reduzido e falhas.

Para conferir com arquivos reais: publique um banner pelo painel e abra a loja em celular e desktop. Não são criados banners de demonstração na produção.

Validação concluída nesta entrega: 98 testes de aplicação, 111 de banco e os 67 cenários da suíte completa de navegador passaram. A conferência adicional do editor mobile e a repetição do CRUD cobrem a seleção offline e a leitura dos arquivos efetivamente enviados. Build de produção, tokens e auditoria estática estrita passaram; lint de DESIGN.md sem erros, com 14 avisos preexistentes de tokens.

Migração aplicada no projeto Supabase Pupi: `20261106221057_pupi_home_banners.sql`. Conferidos no projeto hospedado: RLS, bucket privado com limite de 5 MiB, quatro políticas de Storage, RPC estendida e ausência de permissão de escrita direta. Acesso anônimo não recebeu rascunhos nem arquivos. Nenhum banner foi inserido na produção. Advisors sem novos achados; permanece o aviso anterior de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
