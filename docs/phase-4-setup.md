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

## Nota fiscal eletrônica

O Pupi usará NF-e emitida por um sistema fiscal externo, conforme escolha do usuário. Depois de emitir a nota no emissor fiscal da loja, um administrador pode informar os 44 dígitos da chave na tela do pedido. O aplicativo confere formato, modelo 55 e dígito verificador; isso não emite a nota nem verifica sua autorização na SEFAZ. A chave fica restrita à administração. O registro automático da remessa com a NF-e ainda precisa ser implementado e homologado.

## Volumes para envio

Cotações novas preservam, no banco privado, as dimensões e pesos dos volumes retornados pelo Melhor Envio. Se o provedor não enviar volumes válidos, eles ficam ausentes e devem ser verificados antes do registro de remessa. Cotações anteriores a essa alteração não possuem volumes retroativos.

## Eventos do Melhor Envio

A Edge Function `pupi-shipping-webhook` recebe eventos assinados e verifica `X-ME-Signature` usando HMAC-SHA256 sobre o corpo recebido. Configure `MELHOR_ENVIO_WEBHOOK_SECRET` nos segredos do Supabase com o segredo do aplicativo Melhor Envio, sem enviá-lo pelo chat. O endpoint é `https://loifqxmmnmhpwnwcvrak.supabase.co/functions/v1/pupi-shipping-webhook`. A validação ocorre pela assinatura do provedor, não por JWT Supabase.

O receptor só reconhece uma etiqueta já vinculada pelo seu ID a uma entrega Pupi. Eventos desconhecidos são rejeitados temporariamente para permitir nova tentativa do provedor. O webhook do Melhor Envio só envia eventos para etiquetas criadas pelo mesmo aplicativo; sua configuração/homologação deve ocorrer depois da implementação do registro e vínculo da etiqueta. Os eventos descrevem o ciclo da etiqueta; o status operacional do pedido e o pagamento não são alterados automaticamente.

## Limites atuais

A confirmação cria um pedido com pagamento pendente e uma entrega pendente associada à modalidade cotada; não compra frete nem gera etiqueta. **Registro/vinculação da remessa e consulta de rastreamento ainda não estão implementados.** O receptor de eventos assinados foi preparado, mas depende dessa vinculação e da configuração/homologação do Melhor Envio. A área de administração permite registrar dados de entrega manualmente. O Mercado Pago está previsto para a Fase 5, mas ainda não foi integrado; não há aprovação ou cobrança simulada. A consulta ao frete requer dimensões de todos os produtos. O histórico de aceite `testing-v1` continua provisório.

Documentação do provedor: [cálculo de fretes](https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos), [inserção de fretes](https://docs.melhorenvio.com.br/reference/inserir-fretes-no-carrinho) e [status de etiqueta](https://docs.melhorenvio.com.br/reference/rastreio-de-envios).
