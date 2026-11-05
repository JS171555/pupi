import { createPupiClient } from '../src/services/supabase.js';

try {
  const client = createPupiClient({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  }, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  for (const table of ['categories', 'products']) {
    const { error } = await client.from(table).select('id').limit(1).abortSignal(AbortSignal.timeout(10000));
    if (error) throw new Error(`Falha ao consultar ${table}. Verifique a migration e a exposição da Data API.`);
  }
  const { error } = await client.from('profiles').select('id').limit(1).abortSignal(AbortSignal.timeout(10000));
  if (!error || !['42501', 'PGRST301', 'PGRST302'].includes(error.code)) {
    throw new Error('A leitura anônima de perfis não foi recusada como esperado. Revise as permissões.');
  }
  console.log('Conexão verificada: catálogo acessível; perfis privados bloqueados para anônimo.');
} catch (error) {
  // Não imprimir respostas brutas, variáveis de ambiente ou chaves.
  console.error(error.name === 'AppError' ? error.message :
    (error.message?.startsWith('Falha ao') || error.message?.startsWith('A leitura') ? error.message : 'Falha na conexão com Supabase.'));
  process.exitCode = 1;
}
