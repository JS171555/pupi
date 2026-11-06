import {createElement,PawPrint} from 'lucide';
import {el} from './dom.js';
import {pulse} from './motion.js';

function paw(){return createElement(PawPrint,{'aria-hidden':'true','stroke-width':1.8});}
export function buttonLoading(button) {
  if(!button)return ()=>{};
  const previousBusy=button.getAttribute('aria-busy'),previousWidth=button.style.minWidth;
  let indicator,stopPulse;let ended=false;
  const timer=setTimeout(()=>{
    if(ended||!button.isConnected)return;
    button.style.minWidth=`${button.getBoundingClientRect().width}px`;
    button.setAttribute('aria-busy','true');button.classList.add('is-loading');
    indicator=el('span',{className:'button-progress','aria-hidden':'true'},paw());button.append(indicator);stopPulse=pulse(indicator.firstElementChild);
  },200);
  return ()=>{
    if(ended)return;ended=true;clearTimeout(timer);stopPulse?.();indicator?.remove();button.classList.remove('is-loading');button.style.minWidth=previousWidth;
    if(previousBusy===null)button.removeAttribute('aria-busy');else button.setAttribute('aria-busy',previousBusy);
  };
}
export function startLoading(host,{message='Aguarde…',button,signal}={}) {
  const oldBusy=host.getAttribute('aria-busy');host.setAttribute('aria-busy','true');
  let indicator,stopPulse;let ended=false;const stopButton=buttonLoading(button);
  const stop=()=>{
    if(ended)return;ended=true;clearTimeout(timer);stopPulse?.();indicator?.remove();stopButton();signal?.removeEventListener('abort',stop);
    if(oldBusy===null)host.removeAttribute('aria-busy');else host.setAttribute('aria-busy',oldBusy);
  };
  const timer=setTimeout(()=>{
    if(ended||!host.isConnected)return;
    indicator=el('span',{className:'loading-indicator',role:'status'},[paw(),el('span',{},message)]);host.append(indicator);stopPulse=pulse(indicator.firstElementChild);
  },200);
  if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});
  return stop;
}
