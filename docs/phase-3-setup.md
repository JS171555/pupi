# Testar a administração — Fase 3

Use Node.js 24+ e a branch `codex/pupi-fase-3`:

```sh
npm ci
cp .env.example .env
npm run dev
```

Abra http://localhost:3000, entre com a conta administrativa indicada pelo usuário e escolha **Administração**, ou abra http://localhost:3000/#/admin. O `index.html` continua sendo a entrada. Não abrir por file://. A chave é somente publishable; nunca colocar service_role no `.env` do front-end. No Windows, use `copy .env.example .env` ou copie pelo editor.

A migration administrativa foi aplicada no projeto Pupi (`loifqxmmnmhpwnwcvrak`); consulte o relatório da fase para o nome registrado. A conta indicada foi conferida no Auth e recebeu o papel admin. Não há promoção automática, botão de conceder acesso ou conta/senha de demonstração.

## Roteiro funcional

1. Em **Categorias**, cadastre uma categoria ativa. Edite descrição/posição e teste sua imagem.
2. Em **Produtos**, cadastre um rascunho associado à categoria, com SKU único, preço e estoque mínimo. O saldo inicial é zero. Informe promoção menor que o preço normal. Edite descrição e publicação/ativo.
3. Em **Imagens**, envie JPEG, PNG ou WebP até 5 MiB cada, edite o texto alternativo, a ordem e a principal. Teste a remoção. Se a exclusão física falhar, use **Tentar limpeza**. Upload sem vínculo pode ser recuperado na pasta da entidade; não apagar arquivos de outro projeto.
4. Em **Estoque**, registre entrada, saída e novo saldo final com motivo. Confira saldo/histórico e a recusa de saída acima do saldo. Repetir após resposta perdida usa a mesma chave enquanto o formulário permanecer aberto.
5. Em **Resumo**, confira os números reais. Catálogo e pedidos vazios são esperados no início. Produtos com histórico devem ser arquivados; excluir exige ausência de histórico e remoção das imagens.
6. Em **Pedidos**, consulte os registros existentes e atualize somente uma transição disponível. Envio exige responsável/transportadora. Código de rastreamento é opcional para entrega local. A entrega registrada é manual, sem etiqueta nem cobrança de frete. Pagamento permanece somente leitura.
7. Em **Clientes**, pesquise e consulte dados e histórico. A busca pessoal não vai para a URL. Não há edição de outra conta nem promoção de papel nesta tela.
8. Em **Configurações**, salve nome, contato, CEP de origem e mínimo sugerido. O mínimo só afeta novos produtos; cada produto mantém o seu. Credenciais não pertencem a esta tela.
9. Entre como cliente comum e abra `#/admin`: deve receber acesso restrito. Em outra aba, edite um produto; ao salvar a versão anterior, o formulário deve pedir recarregamento e preservar seus dados.

Não existe criação de pedido/compra pelo painel nesta fase. Para homologar operação de pedidos sem registros existentes, aguarde o checkout da Fase 4 ou use um ambiente de teste separado com backend confiável; não inserir pedidos fictícios em produção. Os testes automatizados já cobrem essas transições em transações revertidas.

## Recuperação e limites

Operações são confirmadas pelo backend antes de mostrar sucesso. Mantenha o formulário aberto ao retentar uma falha incerta: o repositório conserva sua chave. Recarregar limpa essa memória; confira os registros antes de repetir uma operação que possa ter sido concluída.

A fila de remoção de mídia persiste no banco e é processada pelo navegador de um administrador. Não é um worker automático: arquivos pendentes exigem abrir Imagens e usar Tentar limpeza. Arquivos que já estavam sem vínculo não são apagados automaticamente. URLs assinadas previamente emitidas podem durar até cinco minutos.

RLS, RPCs e regras de integridade têm testes locais e verificação SQL no PostgreSQL hospedado. Os testes Chromium interceptam chamadas para um Supabase fictício. Este ambiente bloqueia HTTP direto ao domínio Supabase com 403; a homologação real de upload/download/remoção pelo SDK precisa ser feita no navegador local com a conta admin.

O aviso de testes continua provisório, conforme autorização do usuário. OAuth, SMTP e redirects seguem a configuração da Fase 2. O histórico da migration inicial, aplicada manualmente, precisa ser regularizado antes de executar um futuro `supabase db push`.
