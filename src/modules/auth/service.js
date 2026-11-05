import { AppError } from '../../utils/errors.js';
import { validateRegistration, validateLogin, validateEmail, validatePassword } from './validation.js';

export const TEST_NOTICE_VERSION = 'testing-v1';
export function authError(error) {
  if (error instanceof AppError) return error;
  // Compatibilidade com respostas legadas sem o código de erro no corpo/header.
  if (error?.message === 'Invalid login credentials') return new AppError('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.');
  if (error?.name === 'AuthPKCECodeVerifierMissingError') {
    return new AppError('RECOVERY_INVALID', 'Abra o link no mesmo navegador em que iniciou a solicitação, ou peça um novo link.');
  }
  if (['bad_jwt', 'session_not_found', 'refresh_token_not_found', 'refresh_token_already_used'].includes(error?.code)) {
    return new AppError('SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
  }
  const messages = {
    invalid_credentials: ['INVALID_CREDENTIALS', 'E-mail ou senha incorretos.'],
    email_not_confirmed: ['EMAIL_UNCONFIRMED', 'Confirme seu e-mail antes de entrar.'],
    over_email_send_rate_limit: ['RATE_LIMIT', 'Aguarde alguns minutos antes de pedir outro e-mail.'],
    over_request_rate_limit: ['RATE_LIMIT', 'Muitas tentativas. Aguarde alguns minutos.'],
    weak_password: ['WEAK_PASSWORD', 'A senha não atende às regras do serviço. Use uma senha mais forte.'],
    same_password: ['WEAK_PASSWORD', 'Escolha uma senha diferente da anterior.'],
    otp_expired: ['RECOVERY_INVALID', 'Este link expirou. Solicite um novo link.'],
    flow_state_not_found: ['RECOVERY_INVALID', 'Abra o link no mesmo navegador em que iniciou a solicitação.'],
    bad_code_verifier: ['RECOVERY_INVALID', 'Este link não corresponde a este navegador. Solicite outro link aqui.'],
    provider_disabled: ['PROVIDER_DISABLED', 'O login com Google ainda não está configurado. Use e-mail e senha.'],
    validation_failed: ['AUTH_REJECTED', 'Confira os dados e a configuração do serviço de autenticação.'],
  };
  const result = messages[error?.code];
  if (result) return new AppError(...result);
  if (error?.status === 401) return new AppError('SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
  if (error?.status === 429) return new AppError('RATE_LIMIT', 'Muitas tentativas. Aguarde alguns minutos.');
  if (error?.name === 'AuthRetryableFetchError' || error instanceof TypeError) {
    return new AppError('NETWORK', 'Não foi possível conectar. Confira sua conexão e tente novamente.');
  }
  return new AppError('AUTH_REJECTED', 'Não foi possível concluir. Confira sua conexão e tente novamente.');
}

export function createAuthService(client, origin, config = {}) {
  const callback = type => `${origin}/?auth_callback=${type}`;
  const check = async request => {
    try { const result = await request; if (result.error) throw result.error; return result.data; }
    catch (error) { throw authError(error); }
  };
  return {
    async user() {
      const { data, error } = await client.auth.getUser();
      if (error?.name === 'AuthSessionMissingError') return null;
      if (error) throw authError(error);
      return data.user;
    },
    signUp(values) {
      const { email, password, full_name } = validateRegistration(values);
      return check(client.auth.signUp({ email, password, options: {
        emailRedirectTo: callback('signup'),
        data: { full_name, terms_accepted: true, terms_version: TEST_NOTICE_VERSION },
      } }));
    },
    signIn(values) { return check(client.auth.signInWithPassword(validateLogin(values))); },
    async google() {
      if (config.supabaseUrl && config.supabasePublishableKey) {
        let settings;
        try {
          const response = await fetch(`${config.supabaseUrl}/auth/v1/settings`, {
            headers: { apikey: config.supabasePublishableKey }, signal: AbortSignal.timeout(15000),
          });
          if (!response.ok) throw new Error('settings unavailable');
          settings = await response.json();
        } catch { throw new AppError('NETWORK', 'Não foi possível consultar o login com Google. Tente novamente.'); }
        if (!settings.external?.google) throw new AppError('PROVIDER_DISABLED', 'O login com Google ainda não está configurado. Use e-mail e senha.');
      }
      const data = await check(client.auth.signInWithOAuth({ provider: 'google', options: {
        redirectTo: callback('oauth'), skipBrowserRedirect: true,
      } }));
      if (!data.url) throw new AppError('PROVIDER_DISABLED', 'Não foi possível abrir o login com Google.');
      return data.url;
    },
    async recover(values) {
      const { email } = validateEmail(values);
      await check(client.auth.resetPasswordForEmail(email, { redirectTo: callback('recovery') }));
    },
    async resetPassword(values) {
      const { password } = validatePassword(values.password, values.confirmation);
      if (!await this.user()) throw new AppError('RECOVERY_INVALID', 'Solicite um novo link de recuperação.');
      return check(client.auth.updateUser({ password }));
    },
    async signOut() { await check(client.auth.signOut({ scope: 'local' })); },
    async clearLocalSession() { await check(client.auth.signOut({ scope: 'local' })); },
    async callback(url) {
      const parsed = new URL(url);
      const hash = new URLSearchParams(parsed.hash.slice(1));
      if (parsed.searchParams.has('error') || hash.has('error')) {
        throw new AppError('CALLBACK_FAILED', 'O acesso não foi concluído ou o link expirou. Tente entrar novamente.');
      }
      const code = parsed.searchParams.get('code');
      if (!code) return { handled: false, recovery: false };
      const data = await check(client.auth.exchangeCodeForSession(code));
      return { handled: true, recovery: data.redirectType === 'recovery' };
    },
    subscribe(callbackFn) {
      // Não executar novas chamadas Supabase dentro do lock do callback de Auth.
      const timers = new Set();
      const { data } = client.auth.onAuthStateChange((event, session) => {
        const timer = setTimeout(() => { timers.delete(timer); callbackFn(event, Boolean(session)); }, 0);
        timers.add(timer);
      });
      return () => { timers.forEach(clearTimeout); data.subscription.unsubscribe(); };
    },
  };
}
