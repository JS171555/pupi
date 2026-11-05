import { el, button } from './dom.js';
import { ValidationError } from '../modules/auth/validation.js';
import { toAppError } from '../utils/errors.js';

let sequence = 0;
export function field({ name, label, type = 'text', value = '', required = false, hint = '', options, autocomplete, maxLength, inputmode, rows=5, accept, multiple=false }) {
  const id = `field-${++sequence}-${name}`;
  const attributes = { id, name, required, autocomplete, maxlength: maxLength, inputmode,
    'aria-describedby': `${id}-help ${id}-error` };
  let control;
  if (type==='textarea') {
    control=el('textarea',{...attributes,rows},value);
  } else if (options) {
    control = el('select', attributes, options.map(([key, text]) => el('option', { value: key, selected: key === value }, text)));
  } else control = el('input', { ...attributes, type, value: type === 'checkbox' ? 'accepted' : value, checked: type === 'checkbox' && value === true, accept, multiple });
  const labelNode = el('label', { for: id }, [label, required ? el('span', { 'aria-hidden': 'true' }, ' *') : null]);
  const inputRow = el('div', { className: type === 'password' ? 'password-row' : 'control-row' }, control);
  if (type === 'password') {
    const secretLabel = name === 'confirmation' ? 'confirmação de senha' : label.toLowerCase();
    const reveal = button('Mostrar', () => {
      const show = control.type === 'password'; control.type = show ? 'text' : 'password';
      reveal.textContent = show ? 'Ocultar' : 'Mostrar';
      reveal.setAttribute('aria-label', `${show ? 'Ocultar' : 'Mostrar'} ${secretLabel}`);
      reveal.setAttribute('aria-pressed', String(show));
    }, 'ghost');
    reveal.setAttribute('aria-label', `Mostrar ${secretLabel}`); reveal.setAttribute('aria-pressed', 'false');
    inputRow.append(reveal);
  }
  const wrapper = el('div', { className: type === 'checkbox' ? 'field checkbox-field' : 'field','data-field':name },
    type === 'checkbox' ? [el('div', { className: 'checkbox-row' }, [control, labelNode])] : [labelNode, inputRow]);
  wrapper.append(el('small', { id: `${id}-help`, className: 'field-help' }, hint),
    el('span', { id: `${id}-error`, className: 'field-error' }));
  return wrapper;
}
export function formValues(form) {
  const data = {};
  for (const control of form.elements) {
    if (!control.name) continue;
    data[control.name] = control.type==='file' ? Array.from(control.files || []) : control.type === 'checkbox' ? control.checked : control.value;
  }
  return data;
}
export function cleanForm(form) { form.dataset.dirty = 'false'; }
export const isDirty = root => Boolean(root.querySelector('form[data-persist="true"][data-dirty="true"]'));
export function discardChanges(root) { root.querySelectorAll('form').forEach(cleanForm); }

export function makeForm({ name, fields, submitLabel, onSubmit, onBusy = () => {}, persist = false }) {
  const form = el('form', { novalidate: true, 'aria-label': name, 'data-persist': String(persist), 'data-dirty': 'false' });
  const group = el('fieldset', { className: 'form-fields' }, fields.map(field));
  const submit = el('button', { className: 'button button-primary', type: 'submit' }, submitLabel);
  const status = el('p', { className: 'form-status', role: 'alert', tabindex: '-1' });
  const statusId = `form-status-${++sequence}`;
  status.id = statusId; form.setAttribute('aria-describedby', statusId);
  group.append(submit); form.append(group, status);
  let busy = false;
  const clearErrors = () => {
    form.querySelectorAll('[aria-invalid]').forEach(control => control.removeAttribute('aria-invalid'));
    form.querySelectorAll('.field-error').forEach(node => { node.textContent = ''; });
    status.textContent = '';
  };
  form.addEventListener('input', event => {
    if (persist) form.dataset.dirty = 'true';
    const target = event.target;
    if (target.hasAttribute('aria-invalid')) {
      target.removeAttribute('aria-invalid');
      form.querySelector(`#${target.id}-error`).textContent = '';
    }
  });
  form.addEventListener('submit', async event => {
    event.preventDefault(); if (busy) return;
    if (!navigator.onLine) { status.textContent = 'Você está sem conexão. Reconecte para salvar ou entrar.'; status.focus(); return; }
    clearErrors();
    const values = formValues(form);
    busy = true; group.disabled = true; form.setAttribute('aria-busy', 'true'); onBusy(true);
    status.textContent = 'Aguarde…';
    try { await onSubmit(values, form); if (form.isConnected) status.textContent = ''; }
    catch (error) {
      if (!form.isConnected) return;
      status.textContent = toAppError(error).message;
      if (error instanceof ValidationError) {
        let first;
        for (const [key, message] of Object.entries(error.fields)) {
          const control = form.elements.namedItem(key);
          if (!control) continue;
          control.setAttribute('aria-invalid', 'true');
          form.querySelector(`#${control.id}-error`).textContent = message;
          first ??= control;
        }
        // Fieldset precisa estar ativo antes de mover o foco para um campo.
        group.disabled = false; first?.focus();
      } else {
        if (error.code === 'SESSION_EXPIRED') document.dispatchEvent(new Event('pupi:session-expired'));
        if (error.code === 'INVALID_CREDENTIALS') form.querySelectorAll('input[type="password"]').forEach(control => { control.value = ''; });
        status.focus();
      }
    } finally { busy = false; group.disabled = false; form.removeAttribute('aria-busy'); onBusy(false); }
  });
  return form;
}
