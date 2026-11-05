# Pupi — relatório da Fase 3

Data: 05/11/2026. Versão: 0.3.0.

Painel administrativo implementado, migration aplicada no Supabase Pupi e 114 testes automatizados aprovados. A Fase 2 foi testada e aprovada pelo usuário antes desta fase. A conta administrativa indicada foi localizada após a correção do e-mail e recebeu o acesso explicitamente autorizado. Nenhuma outra conta foi promovida.

## Funcionalidades entregues

- Resumo com contagens reais de catálogo, contas, pedidos, pendentes/concluídos, baixo estoque e valores pagos. O total pago inclui frete e exclui pedidos cancelados; pendências não viram vendas pagas.
- Produtos: criar/consultar/editar/excluir quando permitido, pesquisa por nome/SKU, filtros de publicação/ativo, ordenação, publicação/despublicação, ativação/desativação e arquivamento. Nome, título, descrições, categoria, preços em centavos, SKU, mínimo, destaque e dimensões. Custo interno opcional permanece fora desta entrega. O saldo nasce zero e é operado separadamente.
- Categorias: CRUD, descrição, imagem, ordem e ativação. Exclusão exige ausência de produtos e remoção da imagem.
- Storage: galeria, principal, texto alternativo, ordem, imagem de categoria, upload por arquivo com sucesso parcial e retentativa. Exclusão desvincula e enfileira limpeza pela API Storage; falhas preservam fila. Arquivos sem vínculo podem ser recuperados na pasta da entidade.
- Estoque: consulta, entrada, saída, saldo final, mínimo, baixo estoque e histórico com motivo/ator. Rejeição de saldo negativo e versão de saldo antiga. Recibo evita duplicação após resposta perdida.
- Pedidos: lista, busca por número/UUID, filtro, cliente/itens/endereço/valores históricos e entrega. Transições operacionais validadas; registro de transportadora/modalidade/rastreio manual. Cancelamento anterior ao envio repõe estoque uma vez, salvo pagamento aprovado, que exige futuro fluxo de estorno. Retorno após envio não é presumido.
- Clientes: consulta de dados e histórico, busca pessoal mantida somente em memória e limpa no logout. Sem edição de outra conta nem concessão de função pelo painel.
- Configurações: nome, contato, CEP de origem e mínimo sugerido para novos produtos, com versão e whitelist. Nenhuma credencial nesta tela.
- Sete seções em pt-BR, listas paginadas, filtros preservados, validação, proteção contra perda de edições, erros persistentes, confirmação acessível e suporte a 390px/teclado.

Os produtos publicados passam a ser visíveis pelo repositório público de catálogo e pelas políticas da fundação. A interface de compra/catálogo da loja, checkout, pagamentos, Melhor Envio e etiquetas pertencem à Fase 4. Nenhum pedido ou produto de demonstração foi deixado no aplicativo.

## Banco hospedado

Projeto: `pupi` (`loifqxmmnmhpwnwcvrak`). Migration registrada: `20261105202828_pupi_admin.sql`.

A migration é aditiva: tabelas privadas de recibos e fila com RLS e sem grants de tabela ao cliente, coluna de controle de reposição do pedido e funções privadas com wrappers públicos SECURITY INVOKER. Leituras e gravações exigem admin verificado em cada chamada. Locks serializam retentativas, movimentos e alterações de mídia. Atualizações de catálogo/pedidos/configurações comparam versão; estoque compara saldo.

A verificação no PostgreSQL hospedado testou criação de categoria/produto, saldo inicial zero, entrada idempotente, histórico único, saldo final zero, rejeição de versão antiga, consultas administrativas e recusa sem papel admin. Tudo em transação revertida. Consulta posterior confirmou zero produtos/categorias/pedidos e recibos de teste, com uma conta admin. Nenhum objeto Storage hospedado foi escrito/apagado por SQL.

Advisors consultados após a migration:

- Dois INFO de [RLS sem policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) nas tabelas privadas: negação deliberada para clientes; acesso somente pelas funções autorizadas. Não são tabelas expostas à API.
- Aviso preexistente de [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Continua pendente no Auth.
- Performance: três avisos de [policies permissivas múltiplas](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies) nas leituras públicas/admin do catálogo da fundação e INFO de [índices ainda sem uso](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index). Não removemos índices de integridade em um catálogo vazio. A fase não altera essas políticas.

## Verificação

114 testes aprovados: 20 de validação/serviços, 70 de PostgreSQL embarcado e 24 de Chromium, preservando os fluxos da Fase 2. Os novos fluxos cobrem CRUD/publicação/arquivo, preço inválido, estoque e resposta perdida, upload inválido/sucesso parcial, fila após falha Storage, categoria/imagem, exclusão com histórico, pedido/entrega manual, clientes, configurações e paginação em 390px.

Build de produção e tokens aprovados. Auditor estático premium strict: zero achados. Lint oficial DESIGN.md: zero erros e oito avisos de paleta sem referência nos metadados de componentes; tokens preservados da identidade. Busca de innerHTML e alert/confirm/prompt no produto: nenhuma ocorrência. npm audit em dependências de produção: zero vulnerabilidades. Inspeção visual de produtos em desktop e 390px, com tabela contida e foco visível.

Evidências em `docs/test-results-phase-3.txt`. `UX-CONTRACT.md` também documenta busca/tabela/paginação/upload; o auditor estático atual reconhece somente as capacidades base do seu schema. Essas capacidades adicionais foram verificadas no navegador e por revisão do contrato.

## Limites de homologação

O proxy deste ambiente recusa HTTP direto ao domínio Supabase com 403; MCP de banco funciona. Testes Chromium usam API fictícia interceptada e não comprovam upload/download/remoção reais no serviço hospedado. Esses passos devem ser conferidos no navegador local pelo roteiro `docs/phase-3-setup.md`. Concorrência simultânea entre conexões hospedadas não foi submetida a teste de carga.

A fila de mídia é persistente, mas precisa de navegador admin para processar; não há worker automático. O mínimo global é sugestão para novos produtos. O aviso de cadastro continua sendo o aviso de testes autorizado, sem documentos jurídicos oficiais. A migration inicial foi aplicada manualmente antes destas fases e seu histórico deve ser regularizado antes de futuro db push.

A Fase 4 não foi iniciada.
