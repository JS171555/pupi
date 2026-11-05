# Configuração da Fase 1

## Estado atual

O usuário escolheu outro projeto Supabase e informará o identificador. Nenhum banco hospedado foi alterado. Não há credenciais incluídas, projetos criados, custos autorizados ou integração de frete/pagamento ativada.

## Dependências

Node.js 24+, npm e, para a pilha completa local, Docker com daemon acessível. `npm ci` usa versões exatas e o lockfile. A CLI está fixada em 2.83.0, versão validada para gerar os arquivos deste projeto.

No ambiente desta entrega, a CLI recente tentou criar configuração no diretório pessoal, sem permissão. Foi usada a CLI 2.83.0 baixada da release oficial e conferida pelo SHA-256 publicado. O instalador Node dessa versão não usou o proxy do ambiente; o download foi feito com curl pelo proxy configurado. Esses arquivos de trabalho não fazem parte do pacote. Em uma máquina normal, `npm ci` instala a CLI pelo seu instalador padrão.

## Aplicação no Supabase hospedado

1. Identificar o projeto dedicado ao Pupi e verificar versão PostgreSQL, migrations e tabelas existentes. A migration cria nomes em `public`; não é uma atualização para um banco preexistente com tabelas homônimas.
2. Aplicar `supabase/migrations/20261105180946_pupi_foundation.sql` pelo MCP `apply_migration` ou pela CLI autenticada. A migration é transacional e não deve ser reaplicada manualmente fora do controle de histórico.
3. Para CLI, consultar os comandos antes de usar:

   ```sh
   npx supabase link --help
   npx supabase db push --help
   npx supabase migration list --help
   ```

   Após definir o destino:

   ```sh
   npx supabase link --project-ref IDENTIFICADOR_DO_PUPI
   npx supabase db push --dry-run
   npx supabase db push
   npx supabase migration list --linked
   ```

4. Confirmar `public` entre os schemas expostos na Data API. **Não expor `private`.** Os GRANTs necessários já são explícitos na migration; não conceder `ALL` indiscriminadamente.
5. Obter a URL e a chave pública `sb_publishable_` do projeto. Copiar `.env.example` para `.env` e preencher `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY`. Não enviar chave `service_role`, `sb_secret_`, senha de banco ou segredo de OAuth para o navegador ou para o Git.
6. Executar `npm run verify:remote`.
7. Executar advisors de segurança e desempenho pelo MCP, ou consultar `npx supabase db advisors --help` e executar a análise do destino vinculado. Revisar também o comportamento HTTP de Auth e Storage abaixo.

O arquivo `supabase/config.toml` define a pilha local; ele **não configura automaticamente** as opções do projeto hospedado. No dashboard hospedado, ajustar separadamente confirmação de e-mail, senha forte, tempo de JWT, rotação de refresh token, URLs exatas de retorno e SMTP. Google OAuth e suas credenciais pertencem à Fase 2.

## Supabase local completo

Em uma máquina com Docker acessível:

```sh
npx supabase start
npx supabase db reset --local
npx supabase migration list --local
```

`db reset --local` apaga e reconstrói **somente** o banco local; use apenas em desenvolvimento. A configuração não carrega seeds. Há Auth com confirmação por e-mail e caixa de e-mails local; não há fluxo de cadastro implementado na Fase 1.

O cliente de produção aceita somente chaves modernas `sb_publishable_`. Se sua pilha local apresentar apenas chaves JWT legadas, configure o suporte às chaves modernas antes de testar esse cliente; não coloque uma chave privilegiada no lugar da chave pública.

## Primeiro administrador

Nenhum usuário nasce administrador, mesmo se `raw_user_meta_data.role` disser `admin`. Na Fase 2, após cadastrar e identificar o operador, uma operação confiável no backend/SQL poderá atribuir sua função. Exemplo parametrizado, exclusivo de operador do banco:

```sql
update public.user_roles set role = 'admin' where user_id = :operator_user_id;
```

O app não tem permissão para promover usuários, nem mesmo quando acessado por um administrador. A alteração é auditada. Não atribua automaticamente a função ao primeiro cadastro.

## Storage e ciclo de vida

- Buckets `product-images` e `category-images`, privados, até 5 MiB por arquivo, MIME types JPEG/PNG/WebP.
- Caminhos: `<id-do-produto-ou-categoria>/<uuid-do-arquivo>.<jpg|png|webp>`.
- Administrador envia um arquivo novo, persiste o caminho na entidade e só então o conteúdo pode ficar disponível ao catálogo publicado. Não há overwrite/upsert.
- Para substituir: enviar arquivo novo, atualizar o vínculo no banco, remover arquivo antigo pelo serviço Storage. Compensar uploads órfãos quando a gravação do vínculo falhar. A orquestração e a interface serão implementadas na Fase 3.
- Para excluir definitivamente produto/categoria, remover vínculos e objetos antes da entidade; produtos com histórico de estoque/pedido devem ser arquivados. Não remover arquivos escrevendo diretamente na tabela `storage.objects`.
- URLs assinadas expiram em 300 segundos. Um link já emitido pode continuar válido até expirar após despublicação. Renovar ao expirar e não persistir a URL como identificador do arquivo.
- O limite de MIME/tamanho é imposto pelo servidor Storage a partir da configuração dos buckets. A validação JavaScript serve apenas para feedback antecipado e não substitui essa configuração.

## Homologação hospedada pendente

Depois da identificação do projeto:

1. Aplicar migration e verificar advisors, RLS e ausência de exposição de `private`.
2. Criar dois usuários de teste via Auth real e confirmar geração de profile e função customer.
3. Repetir consultas e tentativas de alteração usando os dois JWTs; verificar isolamento via PostgREST.
4. Validar upload, leitura assinada e remoção via Storage HTTP, incluindo recusa de SVG, arquivo >5 MiB, cliente sem função admin, arquivos órfãos e rascunhos.
5. Testar pedidos concorrentes por conexões independentes, incluindo disputa pelo último item e a mesma chave de idempotência. PGlite usa uma única conexão e não mede essa concorrência.
6. Confirmar que nenhum dado privado entra em cache público. O service worker só será adicionado na Fase 5.

Integrações Melhor Envio e pagamentos dependem das fases futuras e não são simuladas nesta fundação.
