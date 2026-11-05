import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuthService, authError } from '../src/modules/auth/service.js';
import { validateRegistration, validateAddress, validatePassword, ValidationError } from '../src/modules/auth/validation.js';

const registration = { full_name: ' Pessoa Teste ', email: ' PESSOA@example.com ', password: 'SenhaDeTeste123', confirmation: 'SenhaDeTeste123', accepted: true };
test('cadastro valida senha, confirmação e aceite e normaliza nome/e-mail', () => {
  assert.deepEqual(validateRegistration(registration), { full_name: 'Pessoa Teste', email: 'pessoa@example.com', password: 'SenhaDeTeste123' });
  assert.throws(() => validateRegistration({ ...registration, accepted: false }), e => e instanceof ValidationError && Boolean(e.fields.accepted));
  assert.throws(() => validatePassword('SenhaDeTeste123', 'OutraSenha456'), e => Boolean(e.fields.confirmation));
  assert.throws(() => validatePassword('curta', 'curta'), e => Boolean(e.fields.password));
});
test('cadastro não envia senha confirmada, função ou timestamp de aceite como autorização', async () => {
  let request;
  const auth = createAuthService({ auth: { signUp: async body => { request = body; return { data: { user: { id: 'test' }, session: null }, error: null }; } } }, 'https://app.example.com');
  await auth.signUp({ ...registration, role: 'admin' });
  assert.equal(request.options.emailRedirectTo, 'https://app.example.com/?auth_callback=signup');
  assert.deepEqual(request.options.data, { full_name: 'Pessoa Teste', terms_accepted: true, terms_version: 'testing-v1' });
  assert.equal(request.confirmation, undefined);
});
test('callback de recuperação exige troca PKCE; parâmetro de rota sozinho não basta', async () => {
  const auth = createAuthService({ auth: { exchangeCodeForSession: async code => {
    assert.equal(code, 'verified-code'); return { data: { redirectType: 'recovery' }, error: null };
  } } }, 'https://app.example.com');
  assert.deepEqual(await auth.callback('https://app.example.com/?auth_callback=recovery'), { handled: false, recovery: false });
  assert.deepEqual(await auth.callback('https://app.example.com/?code=verified-code'), { handled: true, recovery: true });
  await assert.rejects(() => auth.callback('https://app.example.com/?error=denied&error_description=secret'), { code: 'CALLBACK_FAILED' });
});
test('troca de senha valida usuário antes de enviar a alteração', async () => {
  const auth = createAuthService({ auth: { getUser: async () => ({ data: { user: null }, error: { name: 'AuthSessionMissingError' } }),
    updateUser: () => assert.fail('Não deve alterar sem sessão') } }, 'https://app.example.com');
  await assert.rejects(() => auth.resetPassword({ password: 'SenhaDeTeste123', confirmation: 'SenhaDeTeste123' }), { code: 'RECOVERY_INVALID' });
});
test('Google só é iniciado por chamada explícita e retorna para a origem do app', async () => {
  let request;
  const auth = createAuthService({ auth: { signInWithOAuth: async body => { request = body; return { data: { url: 'https://auth.example.com/authorize' }, error: null }; } } }, 'https://app.example.com');
  assert.equal(await auth.google(), 'https://auth.example.com/authorize');
  assert.equal(request.options.skipBrowserRedirect, true);
  assert.equal(request.options.redirectTo, 'https://app.example.com/?auth_callback=oauth');
});
test('recuperação usa callback na origem controlada pelo app', async () => {
  let options;
  const auth = createAuthService({ auth: { resetPasswordForEmail: async (email, values) => {
    assert.equal(email, 'pessoa@example.com'); options = values; return { data: {}, error: null };
  } } }, 'https://app.example.com');
  await auth.recover({ email: ' Pessoa@example.com ' });
  assert.equal(options.redirectTo, 'https://app.example.com/?auth_callback=recovery');
});
test('mensagens de Auth não expõem detalhes e distinguem credenciais, expiração e limite', () => {
  assert.equal(authError({ message: 'Invalid login credentials', status: 400 }).code, 'INVALID_CREDENTIALS');
  assert.equal(authError({ name: 'AuthPKCECodeVerifierMissingError' }).code, 'RECOVERY_INVALID');
  for (const [code, expected] of [['invalid_credentials', 'INVALID_CREDENTIALS'], ['bad_jwt', 'SESSION_EXPIRED'],
    ['over_email_send_rate_limit', 'RATE_LIMIT'], ['unknown', 'AUTH_REJECTED']]) {
    const error = authError({ code, message: 'raw-server-token' });
    assert.equal(error.code, expected); assert.ok(!error.message.includes('raw-server-token'));
  }
});
test('endereço valida CEP e UF e descarta campos fora do formulário', () => {
  const data = { label: 'Casa', recipient: 'Pessoa', postal_code: '01001-000', street: 'Rua', number: '1', neighborhood: 'Centro', city: 'São Paulo', state: 'sp', is_default: true, user_id: 'other' };
  const validated = validateAddress(data);
  assert.equal(validated.postal_code, '01001000'); assert.equal(validated.state, 'SP'); assert.equal(validated.user_id, undefined);
  assert.throws(() => validateAddress({ ...data, state: 'XX' }), e => Boolean(e.fields.state));
});
