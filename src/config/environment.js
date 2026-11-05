import { AppError } from '../utils/errors.js';

/** Recebe somente configuração pública. A camada de build decide sua origem. */
export function readPublicConfig(values = {}) {
  const url = values.SUPABASE_URL?.trim();
  const key = values.SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) {
    throw new AppError('CONFIG_MISSING', 'Configure a URL e a chave pública do Supabase.');
  }
  let parsed;
  try { parsed = new URL(url); } catch {
    throw new AppError('CONFIG_INVALID', 'A URL do Supabase é inválida.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  if ((!local && parsed.protocol !== 'https:') || !['https:', 'http:'].includes(parsed.protocol)
      || parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)) {
    throw new AppError('CONFIG_INVALID', 'Use a origem HTTPS do Supabase, ou HTTP local.');
  }
  // Apenas o formato moderno. Chaves JWT legadas exigem migração explícita.
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    throw new AppError('CONFIG_INVALID', 'Use uma chave sb_publishable_; chaves secretas não são aceitas.');
  }
  return Object.freeze({ supabaseUrl: parsed.origin, supabasePublishableKey: key });
}
