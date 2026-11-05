# Matriz de permissões

As tabelas em `public` têm RLS habilitada e GRANTs explícitos. `service_role` é uma credencial de backend e possui acesso privilegiado; não pode chegar ao cliente.

| Recurso | Anônimo | Cliente | Administrador autenticado | Backend confiável |
| --- | --- | --- | --- | --- |
| Categorias | Ler ativas | Ler ativas | Gerenciar | Gerenciar |
| Produtos e imagens | Ler publicados de categorias ativas | Mesmo acesso público | Gerenciar catálogo, exceto estoque direto | Gerenciar |
| Perfis | Sem acesso | Ler próprio, editar nome/telefone | Consultar todos, editar o próprio | Gerenciar campos protegidos |
| Funções de usuário | Sem acesso | Ler própria | Consultar | Atribuir/remover função |
| Endereços | Sem acesso | Gerenciar próprios | Consultar | Gerenciar |
| Carrinhos e itens | Sem acesso | Gerenciar próprios | Somente próprio carrinho | Gerenciar |
| Pedidos, itens e entregas | Sem acesso | Ler próprios | Consultar | Criar e operar |
| Configurações operacionais | Sem acesso | Sem acesso | Gerenciar chaves permitidas | Gerenciar |
| Movimentos de estoque | Sem acesso | Sem acesso | Ler; criar por adjust_stock | Gravação transacional |
| Auditoria | Sem acesso | Sem acesso | Ler | Gravação por triggers |
| Arquivos Storage | Ler vínculo publicado | Mesmo acesso público | Enviar, ler, remover | Operação por API Storage |

## Funções

- `private.is_admin()`: SECURITY DEFINER para consulta da própria função sem recursão de RLS. Confere `auth.uid()`, com search_path vazio. Executável por authenticated para uso nas políticas; schema não exposto à API.
- `private.adjust_stock(...)`: SECURITY DEFINER, exige administrador autenticado, valida motivo/delta e deixa a restrição de saldo atuar sobre a atualização com lock. Chamada pelo wrapper SECURITY INVOKER `public.adjust_stock(...)`.
- `private.handle_new_user()`, `record_stock()` e `record_audit()`: somente triggers; execução direta revogada. As elevações são necessárias para criar registros protegidos e logs, inclusive quando o evento é originado pelo sistema Auth/backend sem auth.uid().
- `private.create_order(...)`: SECURITY INVOKER, permissão somente para service_role. O backend futuro precisa autenticar o cliente e validar a cotação antes de passar user_id, endereço, itens e frete. A chave de idempotência é por cliente e compara o conteúdo normalizado.
- Triggers de atualização e integridade usam SECURITY INVOKER. Itens e snapshots de pedidos são imutáveis; o subtotal precisa coincidir com itens não vazios.

Não há função SECURITY DEFINER em `public`. Nenhuma autorização usa user_metadata. Os logs registram ator, entidade e ação, sem copiar endereço, tokens ou o conteúdo completo de perfis.

## Limites operacionais

Alterações de estado e pagamento são reservadas ao backend. A interface administrativa e as integrações que as executarão ainda não existem. Cancelamento, reversão idempotente de estoque e webhooks de pagamento serão implementados no fluxo da Fase 4; mudar status isoladamente não é uma implementação de cancelamento comercial.

Não há verificação estrita de `auth.sessions` no banco nesta fase. Como em Supabase, um JWT já emitido pode permanecer válido até expirar. A consulta de função no banco faz a revogação de administrador surtir efeito sem esperar um novo JWT. Para remoção de contas, definir revogação de sessão e retenção/anônimização antes de implementar exclusão de usuário; pedidos históricos impedem exclusão em cascata.

O controle aqui presume schema `private` não exposto, credenciais de backend protegidas e uso do servidor Storage. Validações de HTTP, concorrência entre conexões e advisors do projeto definitivo permanecem na homologação.
