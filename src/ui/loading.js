import {createElement,PawPrint} from 'lucide';
import {el} from './dom.js';
import {pulse} from './motion.js';

const activeButtons=new WeakMap();
function paw(){return createElement(PawPrint,{'aria-hidden':'true','stroke-width':1.8});}
export function buttonLoading(button) {
  if(!button)return ()=>{};
  let state=activeButtons.get(button);
  if(!state){
    const previousBusy=button.getAttribute('aria-busy'),previousWidth=button.style.minWidth;
    state={users:0};activeButtons.set(button,state);
    let indicator,stopPulse;
    const timer=setTimeout(()=>{
      if(!button.isConnected)return;
      button.style.minWidth=`${button.getBoundingClientRect().width}px`;
      button.setAttribute('aria-busy','true');button.classList.add('is-loading');
      indicator=el('span',{className:'button-progress','aria-hidden':'true'},paw());button.append(indicator);stopPulse=pulse(indicator.firstElementChild);
    },200);
    state.dispose=()=>{
      clearTimeout(timer);stopPulse?.();indicator?.remove();button.classList.remove('is-loading');button.style.minWidth=previousWidth;
      if(previousBusy===null)button.removeAttribute('aria-busy');else button.setAttribute('aria-busy',previousBusy);
      activeButtons.delete(button);
    };
  }
  state.users++;let ended=false;
  return ()=>{if(ended)return;ended=true;if(--state.users===0)state.dispose();};
}
export function startLoading(host,{message='Carregando…',button,signal,showIndicator=!button}={}) {
  const oldBusy=host.getAttribute('aria-busy');host.setAttribute('aria-busy','true');
  let indicator,stopPulse;let ended=false;const stopButton=buttonLoading(button);
  const stop=()=>{
    if(ended)return;ended=true;clearTimeout(timer);stopPulse?.();indicator?.remove();stopButton();signal?.removeEventListener('abort',stop);
    if(oldBusy===null)host.removeAttribute('aria-busy');else host.setAttribute('aria-busy',oldBusy);
  };
  const timer=showIndicator?setTimeout(()=>{
    if(ended||!host.isConnected)return;
    indicator=el('span',{className:'loading-indicator',role:'status','aria-label':message},paw());host.append(indicator);stopPulse=pulse(indicator.firstElementChild);
  },200):undefined;
  if(signal?.aborted)stop();else signal?.addEventListener('abort',stop,{once:true});
  return stop;
}
