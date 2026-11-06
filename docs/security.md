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
| Pedidos, itens e entregas | Sem acesso | Ler próprios | Consultar, transições operacionais/entrega manual por RPC | Criar, pagamentos e integrações |
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

A Fase 3 permite transições operacionais validadas por RPC administrativa. Cancelamento anterior ao envio repõe estoque uma vez; pagamento aprovado bloqueia cancelamento sem estorno. A integração financeira com Mercado Pago, incluindo estornos e webhooks, está prevista para a Fase 5. O painel não altera payment_status. Entregas nesta fase são registros manuais.

Não há verificação estrita de `auth.sessions` no banco nesta fase. Como em Supabase, um JWT já emitido pode permanecer válido até expirar. A consulta de função no banco faz a revogação de administrador surtir efeito sem esperar um novo JWT. Para remoção de contas, definir revogação de sessão e retenção/anônimização antes de implementar exclusão de usuário; pedidos históricos impedem exclusão em cascata.

O controle aqui presume schema `private` não exposto, credenciais de backend protegidas e uso do servidor Storage. Testes de autorização rodam no PostgreSQL embarcado e no projeto hospedado; HTTP Storage e concorrência entre conexões reais precisam de homologação adicional.

## Administração e mídia — Fase 3

`private.admin_query` e `private.admin_mutate` são SECURITY DEFINER com search_path vazio e exigem admin em cada chamada. Wrappers públicos são SECURITY INVOKER. Helpers não são executáveis por PUBLIC; as tabelas privadas de recibos/fila têm RLS, sem grants de tabela para authenticated. Nenhum segredo vai ao navegador. Alterações administrativas recebem recibo por ator/operação/payload e chave UUID, com lock transacional para retentativa. Atualizações usam versão ou saldo esperado.

A fila de mídia só aceita caminhos do catálogo sem vínculo, serializa vínculo/remoção pelo caminho e bloqueia novos vínculos enquanto a remoção estiver pendente. Arquivos são excluídos pela API Storage e a fila só é concluída quando o metadado não existir. URLs assinadas já emitidas podem permanecer válidas por até cinco minutos. As permissões administrativas diretas de catálogo da fundação continuam disponíveis ao admin confiável; o painel usa os contratos RPC. Uploads fora do painel precisam seguir a mesma disciplina de vínculos/limpeza.

A primeira conta administrativa foi indicada explicitamente pelo usuário e conferida no Auth. Não existe promoção automática do primeiro usuário, nem autorização baseada em e-mail no código do aplicativo.

## Checkout — Fase 4

A Edge Function `pupi-checkout` valida o usuário com Auth e o aviso de testes antes de operar. Apenas `service_role` executa as funções `service_quote_snapshot`, `service_register_shipping_quote` e `service_confirm_shipping_order`; identificadores do cliente vêm da sessão validada. O token do Melhor Envio fica somente no servidor.

As cotações ficam na tabela privada `shipping_quotes`, com RLS e sem acesso de tabela a anon/authenticated. O snapshot inclui endereço, CEPs, itens, preços e dimensões. A confirmação bloqueia os registros relevantes, confere expiração e snapshot, reutiliza o pedido para a mesma chave e faz baixa de estoque, criação da entrega pendente e limpeza do carrinho na mesma transação. Um UUID de cotação não concede acesso a outra conta.

As respostas externas e o sandbox ainda precisam de homologação com credenciais próprias; a confirmação não compra frete, gera etiqueta ou aprova pagamento. Registro de remessa e rastreamento automático ainda não estão implementados.

A chave de NF-e informada para cada pedido é guardada em `private.order_invoices`, protegida por RLS e acessível ao painel somente por RPC que verifica o papel administrativo. A validação confere modelo e dígito, não equivale a autorização fiscal. A função não emite notas nem consulta a SEFAZ.

Eventos de etiqueta do Melhor Envio são recebidos por `pupi-shipping-webhook` sem JWT Supabase, pois usam autenticação própria do provedor: HMAC-SHA256 sobre o corpo, verificado com o segredo do aplicativo. Corpo é limitado a 64 KiB; somente o backend pode executar a RPC que registra eventos para etiquetas já vinculadas. Retentativas idênticas são deduplicadas. Nenhum evento altera pagamento ou status operacional do pedido. A integração só estará utilizável após configuração do segredo, vínculo da etiqueta e teste no sandbox.
