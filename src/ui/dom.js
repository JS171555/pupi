export function el(tag, attributes = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attributes)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') node.className = value;
    else if (key === 'on') for (const [name, handler] of Object.entries(value)) node.addEventListener(name, handler);
    else if (['value', 'checked', 'disabled', 'selected'].includes(key)) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [children].flat(Infinity)) {
    if (child !== null && child !== undefined && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}
export const link = (label, href, attributes = {}) => el('a', { href, ...attributes }, label);
export const button = (label, onClick, variant = 'secondary') => el('button', {
  type: 'button', className: `button button-${variant}`, on: { click: onClick },
}, label);
export const heading = (title, intro) => el('div', { className: 'page-heading' }, [
  el('h1', { tabindex: '-1' }, title), intro ? el('p', { className: 'muted' }, intro) : null,
]);
export const empty = (title, description, action) => el('div', { className: 'empty-state' }, [
  el('h2', {}, title), description ? el('p', { className: 'muted' }, description) : null, action,
]);
export const money = cents => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export const date = value => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
