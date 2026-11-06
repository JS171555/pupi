import {createElement,Check,TriangleAlert,Info,X} from 'lucide';
import {el,button} from './dom.js';
import {toAppError} from '../utils/errors.js';
import {enter,leave,stopMotion} from './motion.js';
import {startLoading} from './loading.js';

let current=null,pending=null,modalCount=0;
const glyph=definition=>createElement(definition,{'aria-hidden':'true','stroke-width':1.8});
function clearFeedback() {
  if(!current)return;
  current.dispose();stopMotion(current.card);current.card.remove();current=null;
}
export function notify(message='',tone='info') {
  const root=document.querySelector('#feedback');
  if(!root)return;
  if(!message){pending=null;clearFeedback();root.replaceChildren();return;}
  if(modalCount){pending={message,tone};return;}
  if(current?.message===message&&current.tone===tone&&performance.now()-current.shown<2000)return;
  clearFeedback();
  // O cartão não participa do layout nem herda transformações das telas.
  if(root.parentElement!==document.body)document.body.append(root);
  root.className=`feedback feedback-${tone}`;root.setAttribute('role',tone==='error'?'alert':'status');root.setAttribute('aria-live',tone==='error'?'assertive':'polite');
  const previousFocus=document.activeElement;
  const title=tone==='success'?'Tudo certo!':tone==='error'?'Não foi possível concluir':'Um aviso para você';
  const closeButton=button(glyph(X),()=>dismiss(),'ghost');closeButton.classList.add('feedback-close');closeButton.setAttribute('aria-label','Fechar aviso');
  const card=el('div',{className:'feedback-card'},[closeButton,el('span',{className:'feedback-symbol'},glyph(tone==='success'?Check:tone==='error'?TriangleAlert:Info)),el('h2',{},title),el('p',{},message)]);
  let remaining=message.length>160?7000:4000,timer,deadline=0,hover=false,focus=false,closing=false;
  const pause=()=>{if(timer){clearTimeout(timer);timer=undefined;remaining=Math.max(0,deadline-performance.now());}};
  const resume=()=>{if(tone!=='success'||hover||focus||document.hidden||closing)return;pause();deadline=performance.now()+remaining;timer=setTimeout(dismiss,remaining);};
  const visibility=()=>document.hidden?pause():resume();
  function dismiss(){
    if(closing||current?.card!==card)return;closing=true;pause();
    const hadFocus=card.contains(document.activeElement);
    leave(card,()=>{if(current?.card!==card)return;clearFeedback();if(hadFocus){if(previousFocus?.isConnected)previousFocus.focus();else document.querySelector('#main h1')?.focus();}});
  }
  card.addEventListener('pointerenter',()=>{hover=true;pause();});card.addEventListener('pointerleave',()=>{hover=false;resume();});
  card.addEventListener('focusin',()=>{focus=true;pause();});card.addEventListener('focusout',()=>queueMicrotask(()=>{focus=card.contains(document.activeElement);if(!focus)resume();}));
  const escape=event=>{if(event.key==='Escape'&&!modalCount){event.preventDefault();dismiss();}};
  document.addEventListener('visibilitychange',visibility);document.addEventListener('keydown',escape);
  current={message,tone,card,shown:performance.now(),dispose:()=>{pause();document.removeEventListener('visibilitychange',visibility);document.removeEventListener('keydown',escape);}};
  root.replaceChildren(card);enter(card);resume();
}

export function confirmAction({title,description,confirmLabel='Descartar alterações',danger=false,intent,onConfirm=async()=>{}}) {
  const previousFocus=document.activeElement;clearFeedback();modalCount++;
  return new Promise(resolve=>{
    let busy=false,closing=false;
    const dialog=el('dialog',{className:'dialog','aria-labelledby':'dialog-title','aria-describedby':'dialog-description'});
    const errorBox=el('p',{className:'form-status',role:'alert'});
    const close=result=>{
      if(closing)return;closing=true;
      leave(dialog,()=>{
        dialog.close();dialog.remove();modalCount--;
        if(previousFocus?.isConnected)previousFocus.focus();else document.querySelector('#main h1')?.focus();
        resolve(result);
        if(!modalCount&&pending){const next=pending;pending=null;notify(next.message,next.tone);}
      });
    };
    const cancel=button('Cancelar',()=>{if(!busy)close(false);});
    const confirm=button(confirmLabel,async()=>{
      if(busy||closing)return;
      busy=true;cancel.disabled=true;confirm.disabled=true;dialog.setAttribute('aria-busy','true');errorBox.textContent='';
      const stop=startLoading(errorBox,{button:confirm});
      try{await onConfirm();stop();close(true);}
      catch(error){stop();errorBox.textContent=toAppError(error).message;}
      finally{stop();busy=false;cancel.disabled=false;confirm.disabled=false;dialog.removeAttribute('aria-busy');}
    },danger?'danger':intent||'primary');
    dialog.append(el('span',{className:'feedback-symbol'},glyph(danger?TriangleAlert:Info)),el('h2',{id:'dialog-title'},title),el('p',{id:'dialog-description'},description),errorBox,el('div',{className:'actions'},[cancel,confirm]));
    dialog.addEventListener('cancel',event=>{event.preventDefault();if(!busy)close(false);});
    document.body.append(dialog);dialog.showModal();enter(dialog);cancel.focus();
  });
}
