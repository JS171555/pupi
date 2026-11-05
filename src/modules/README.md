# Limites dos módulos

As funcionalidades serão implementadas sem reiniciar a base:

| Módulo | Responsabilidade | Fase |
| --- | --- | --- |
| auth | Cadastro, sessão, OAuth, recuperação e permissões | 2 |
| account | Perfil e endereços | 2 |
| admin | Produtos, categorias, mídia, estoque e operação | 3 |
| store | Catálogo e detalhes de produtos | 4 |
| cart | Carrinho e quantidades | 4 |
| checkout | Orquestração autenticada e confirmação no backend | 4 |
| orders | Histórico e acompanhamento do titular | 4 |
| integrations | Melhor Envio e futuro gateway, somente backend | 4 |
| app | Navegação, componentes, estilos, PWA e acessibilidade | 5 |

A Fase 1 oferece repositórios e serviços compartilhados; não cria módulos com botões ou formulários sem operação real.
