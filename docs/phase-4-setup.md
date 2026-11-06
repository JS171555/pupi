# Checkout Pupi: configuração e testes

A estrutura de banco `20261106031939_pupi_checkout_quotes.sql` foi aplicada ao projeto Pupi e a Edge Function `pupi-checkout` foi implantada com verificação JWT. O código está na branch `codex/pupi-fase-4`. Não execute novamente a migration no projeto já atualizado; a fundação inicial foi aplicada manualmente e seu histórico precisa ser regularizado antes de um futuro `db push`.

A função exige usuário autenticado e aviso de testes aceito. A conta de serviço e o token do Melhor Envio são usados somente na Edge Function. O navegador envia o endereço escolhido e recebe IDs de cotações; não envia preço, valor de frete nem ID de usuário para criar pedidos. O backend obtém dados do carrinho e do endereço do banco, valida a resposta do provedor e registra cotações que expiram em dez minutos. Ao confirmar, o banco confere a cotação e o estado atual do carrinho, do endereço, do CEP de origem, dos preços e do estoque antes de criar o pedido. O pagamento permanece pendente.

## Configurar para testes

1. No painel Pupi, em Administração > Configurações, confira o CEP de origem de oito dígitos. Cada produto enviado precisa ter peso em gramas e largura, altura e comprimento em milímetros preenchidos.
2. No dashboard do Supabase, configure os segredos da Edge Function, sem adicioná-los ao repositório nem ao front-end:
   - `MELHOR_ENVIO_ENV`: `sandbox` para testes; `production` somente quando a conta definitiva estiver pronta.
   - `MELHOR_ENVIO_TOKEN`: token de acesso do ambiente correspondente, obtido na conta Melhor Envio.
   - `MELHOR_ENVIO_USER_AGENT`: nome da aplicação e e-mail de contato técnico, conforme exigência do provedor.
3. `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são variáveis fornecidas pelo ambiente da Edge Function. Não coloque service role no `.env` do navegador.
4. Na branch da fase 4, use Node.js 24+, `npm ci`, copie `.env.example` para `.env` e execute `npm run dev`. Na conta de teste, cadastre endereço e produto(s), coloque-os no carrinho e acesse Revisar pedido. Confira as modalidades, o frete e o total antes de confirmar.
5. Em caso de perda da resposta, retorne a Revisar pedido na mesma aba e use Verificar confirmação. A chave da tentativa fica no armazenamento da sessão para consultar o mesmo resultado sem duplicar o pedido. Também confira Meus pedidos. Estoque e preço são reconferidos na confirmação; se houver alteração, solicite nova cotação.

Os testes de navegador usam respostas fictícias interceptadas. A API real do Melhor Envio e o SDK hospedado ainda precisam ser homologados em sandbox com credenciais válidas. A rede deste ambiente bloqueia acesso HTTP direto ao Supabase; o banco hospedado foi testado por SQL em uma transação revertida.

## Limites atuais

A confirmação cria um pedido com pagamento pendente e uma entrega pendente associada à modalidade cotada; não compra frete nem gera etiqueta. **Registro da remessa no Melhor Envio, rastreamento automático e atualização de eventos ainda não estão implementados.** A área de administração permite registrar dados de entrega manualmente. O gateway financeiro ainda não foi escolhido; não há aprovação ou cobrança simulada. A consulta ao frete requer dimensões de todos os produtos. O histórico de aceite `testing-v1` continua provisório.

Documentação do provedor: [cálculo de fretes](https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos), [inserção de fretes](https://docs.melhorenvio.com.br/reference/inserir-fretes-no-carrinho) e [status de etiqueta](https://docs.melhorenvio.com.br/reference/rastreio-de-envios).
