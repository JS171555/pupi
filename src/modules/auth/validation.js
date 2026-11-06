import { AppError } from '../../utils/errors.js';

export const STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
export class ValidationError extends AppError {
  constructor(fields) { super('INVALID_DATA', 'Confira os campos destacados.'); this.fields = fields; }
}
const text = value => typeof value === 'string' ? value.trim() : '';
const finish = (errors, data) => { if (Object.keys(errors).length) throw new ValidationError(errors); return data; };
export function validatePassword(password, confirmation) {
  const errors = {};
  if (typeof password !== 'string' || password.length < 12 || password.length > 128
      || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    errors.password = 'Use de 12 a 128 caracteres, com maiúscula, minúscula e número.';
  }
  if (password !== confirmation) errors.confirmation = 'As senhas precisam ser iguais.';
  return finish(errors, { password });
}
export function validateLogin(values) {
  const errors = {}; const email = text(values.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) errors.email = 'Informe um e-mail válido.';
  if (typeof values.password !== 'string' || !values.password) errors.password = 'Informe sua senha.';
  return finish(errors, { email, password: values.password });
}
export function validateEmail(values) {
  const { email } = validateLogin({ ...values, password: 'not-submitted' });
  return { email };
}
export function validateProfile(values) {
  const errors = {}; const full_name = text(values.full_name); const phone = text(values.phone);
  if (full_name.length < 2 || full_name.length > 160) errors.full_name = 'Informe um nome de 2 a 160 caracteres.';
  if (phone && !/^\+?[0-9 ()-]{8,25}$/.test(phone)) errors.phone = 'Confira o telefone, incluindo o DDD.';
  return finish(errors, { full_name, phone: phone || null });
}
export function validateRegistration(values) {
  const errors = {}; let login; let profile;
  for (const validate of [() => { login = validateLogin(values); }, () => { profile = validateProfile(values); },
    () => validatePassword(values.password, values.confirmation)]) {
    try { validate(); } catch (e) { if (!(e instanceof ValidationError)) throw e; Object.assign(errors, e.fields); }
  }
  if (values.accepted !== true) errors.accepted = 'Leia e aceite as informações de uso para continuar.';
  return finish(errors, { ...login, full_name: profile?.full_name });
}
export function validateAddress(values) {
  const errors = {}; const data = {};
  const lengths = { label: 60, recipient: 160, street: 200, number: 20, neighborhood: 120, city: 120 };
  for (const [key, max] of Object.entries(lengths)) {
    data[key] = text(values[key]);
    if (!data[key] || data[key].length > max) errors[key] = `Preencha este campo com até ${max} caracteres.`;
  }
  data.complement = text(values.complement) || null;
  if (data.complement?.length > 160) errors.complement = 'Use até 160 caracteres.';
  data.postal_code = text(values.postal_code).replace(/[-\s]/g, '');
  if (!/^\d{8}$/.test(data.postal_code)) errors.postal_code = 'Informe um CEP com 8 dígitos.';
  data.state = text(values.state).toUpperCase();
  if (!STATES.includes(data.state)) errors.state = 'Selecione a UF.';
  data.is_default = values.is_default === true;
  return finish(errors, data);
}
