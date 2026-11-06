import {gsap} from 'gsap';
import {createElement,ChevronLeft,ChevronRight,Pause,Play} from 'lucide';
import {el,button} from './dom.js';

const icon=definition=>createElement(definition,{'aria-hidden':'true',width:20,height:20});
const INTERVAL=6000;

export function bannerCarousel(items,{signal,refresh}={}) {
  if(!items.length||signal?.aborted)return null;
  const lifecycle=new AbortController();
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const root=el('section',{className:'banner-carousel','aria-label':'Destaques da loja','aria-roledescription':'carrossel'});
  const track=el('div',{className:'banner-carousel-track'});
  const status=el('span',{className:'sr-only','aria-live':'polite','aria-atomic':'true'});
  let current=0,timer,paused=reduced.matches,hover=false,focused=false,visible=true;
  const failed=new Set();const renewed=new Set();
  const pictures=items.map((item,index)=>{
    const source=el('source',{media:'(max-width: 47.999rem)',srcset:item.mobileUrl});
    const image=el('img',{src:item.desktopUrl,alt:item.title,loading:index?'lazy':'eager',decoding:'async',fetchpriority:index?'low':'high'});
    const slide=el('div',{className:'banner-slide',hidden:index!==0,'aria-roledescription':'slide','aria-label':`${index+1} de ${items.length}`},el('picture',{},[source,image]));
    image.addEventListener('error',async()=>{
      if(lifecycle.signal.aborted)return;
      if(refresh&&!renewed.has(index)){
        renewed.add(index);
        try {
          const urls=await refresh(item);
          if(lifecycle.signal.aborted)return;
          source.srcset=urls.mobileUrl;image.src=urls.desktopUrl;return;
        }catch{ /* Skip an unavailable asset, preserving the catalog. */ }
      }
      failed.add(index);dots[index].disabled=true;
      if(failed.size===items.length){root.hidden=true;clearTimeout(timer);return;}
      if(current===index)show(nextAvailable(1));
    },{signal:lifecycle.signal});
    return slide;
  });
  track.append(...pictures);
  const schedule=()=>{
    clearTimeout(timer);
    if(lifecycle.signal.aborted||items.length-failed.size<2||paused||hover||focused||document.hidden||!visible||root.hidden)return;
    timer=setTimeout(()=>{
      if(!root.isConnected){lifecycle.abort();return;}
      show(nextAvailable(1));
    },INTERVAL);
  };
  const nextAvailable=direction=>{
    let next=current;
    for(let step=0;step<items.length;step++){
      next=(next+direction+items.length)%items.length;
      if(!failed.has(next))return next;
    }
    return current;
  };
  const show=(index,manual=false)=>{
    if(lifecycle.signal.aborted||failed.has(index))return;
    gsap.killTweensOf(pictures);
    pictures.forEach((slide,i)=>{slide.hidden=i!==index;slide.style.removeProperty('opacity');});
    current=index;root.dataset.index=String(index);
    dots.forEach((dot,i)=>{dot.setAttribute('aria-pressed',String(i===index));});
    if(!reduced.matches)gsap.fromTo(pictures[index],{opacity:0},{opacity:1,duration:0.35,clearProps:'opacity'});
    if(manual)status.textContent=`Banner ${index+1} de ${items.length}: ${items[index].title}`;
    schedule();
  };
  const control=(definition,label,action)=>{
    const node=button(icon(definition),action,'ghost');node.classList.add('banner-control');
    node.setAttribute('aria-label',label);node.title=label;return node;
  };
  const previous=control(ChevronLeft,'Banner anterior',()=>show(nextAvailable(-1),true));
  const next=control(ChevronRight,'Próximo banner',()=>show(nextAvailable(1),true));
  const dots=items.map((item,index)=>{
    const dot=button(el('span',{'aria-hidden':'true'}),()=>show(index,true),'ghost');
    dot.classList.add('banner-dot');dot.setAttribute('aria-label',`Mostrar banner ${index+1}: ${item.title}`);
    dot.setAttribute('aria-pressed',String(index===0));return dot;
  });
  const toggle=control(Play,'Reproduzir banners',()=>{paused=!paused;updateToggle();schedule();});
  function updateToggle(){
    const label=paused?'Reproduzir banners':'Pausar banners';
    toggle.replaceChildren(icon(paused?Play:Pause));toggle.setAttribute('aria-label',label);toggle.title=label;
  }
  updateToggle();
  root.dataset.index='0';
  root.append(track,items.length>1?el('div',{className:'banner-carousel-controls'},[
    previous,el('div',{className:'banner-dots','aria-label':'Escolher banner'},dots),next,toggle,
  ]):null,status);
  const options={signal:lifecycle.signal};
  root.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'){hover=true;schedule();}},options);
  root.addEventListener('pointerleave',()=>{hover=false;schedule();},options);
  root.addEventListener('focusin',()=>{focused=true;schedule();},options);
  root.addEventListener('focusout',event=>{if(!root.contains(event.relatedTarget)){focused=false;schedule();}},options);
  document.addEventListener('visibilitychange',schedule,options);
  reduced.addEventListener('change',()=>{if(reduced.matches)paused=true;updateToggle();schedule();},options);
  const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule();});observer.observe(root);
  lifecycle.signal.addEventListener('abort',()=>{
    clearTimeout(timer);observer.disconnect();gsap.killTweensOf(pictures);
  },{once:true});
  signal?.addEventListener('abort',()=>lifecycle.abort(),{once:true});
  schedule();
  return root;
}
