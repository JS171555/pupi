import {createElement,Eye,EyeOff} from 'lucide';
import {button} from './dom.js';
import {enter,stopMotion} from './motion.js';

export function passwordToggle(control,label) {
  const icon=visible=>createElement(visible?EyeOff:Eye,{'aria-hidden':'true','stroke-width':1.8});
  const reveal=button(icon(false),()=>{
    const visible=control.type==='password';
    const start=control.selectionStart,end=control.selectionEnd;
    control.type=visible?'text':'password';
    if(start!==null&&end!==null)control.setSelectionRange(start,end);
    stopMotion(reveal.firstElementChild);
    const next=icon(visible);reveal.replaceChildren(next);
    const action=`${visible?'Ocultar':'Mostrar'} ${label}`;
    reveal.setAttribute('aria-label',action);reveal.title=action;reveal.setAttribute('aria-pressed',String(visible));
    enter(next,{kind:'icon'});
  },'ghost');
  reveal.classList.add('password-toggle');
  reveal.setAttribute('aria-label',`Mostrar ${label}`);reveal.title=`Mostrar ${label}`;
  reveal.setAttribute('aria-pressed','false');reveal.setAttribute('aria-controls',control.id);
  return reveal;
}
