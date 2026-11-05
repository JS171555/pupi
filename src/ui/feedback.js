import { el, button } from './dom.js';
import { toAppError } from '../utils/errors.js';

export function notify(message = '', tone = 'info') {
  const root = document.querySelector('#feedback');
  root.className = `feedback feedback-${tone}`;
  root.replaceChildren(message ? el('p', {}, message) : document.createTextNode(''));
  root.setAttribute('role', tone === 'error' ? 'alert' : 'status');
}

export function confirmAction({ title, description, confirmLabel = 'Descartar alterações', danger = false, intent, onConfirm = async () => {} }) {
  const previousFocus = document.activeElement;
  return new Promise(resolve => {
    let busy = false;
    const dialog = el('dialog', { className: 'dialog', 'aria-labelledby': 'dialog-title', 'aria-describedby': 'dialog-description' });
    const errorBox = el('p', { className: 'form-status', role: 'alert' });
    const close = result => {
      dialog.close(); dialog.remove();
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector('#main h1')?.focus();
      resolve(result);
    };
    const cancel = button('Cancelar', () => { if (!busy) close(false); });
    const confirm = button(confirmLabel, async () => {
      if (busy) return;
      busy = true; cancel.disabled = true; confirm.disabled = true;
      dialog.setAttribute('aria-busy', 'true'); errorBox.textContent = 'Aguarde…';
      try { await onConfirm(); close(true); }
      catch (error) { errorBox.textContent = toAppError(error).message; }
      finally { busy = false; cancel.disabled = false; confirm.disabled = false; dialog.removeAttribute('aria-busy'); }
    }, danger ? 'danger' : intent || 'primary');
    dialog.append(el('h2', { id: 'dialog-title' }, title), el('p', { id: 'dialog-description' }, description),
      errorBox, el('div', { className: 'actions' }, [cancel, confirm]));
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (!busy) close(false); });
    document.body.append(dialog); dialog.showModal(); cancel.focus();
  });
}
