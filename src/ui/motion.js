import {gsap} from 'gsap';

const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function enter(node,{kind='surface'}={}) {
  if(reduced())return;
  const toast=kind==='toast';
  gsap.fromTo(node,{opacity:0,x:toast?12:0,y:toast?-4:8,scale:toast?1:.97},{opacity:1,x:0,y:0,scale:1,duration:toast ? .28 : .22,ease:'power3.out',clearProps:'opacity,transform',overwrite:true});
}
export function leave(node,done,{kind='surface'}={}) {
  gsap.killTweensOf(node);
  if(reduced()){done();return;}
  const toast=kind==='toast';
  gsap.to(node,{opacity:0,x:toast?8:0,y:toast?-2:4,scale:toast?1:.98,duration:.16,ease:'power1.in',onComplete:done,overwrite:true});
}
export function pulse(node) {
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let tween;
  const update=()=>{tween?.kill();gsap.set(node,{clearProps:'opacity,transform'});if(!preference.matches)tween=gsap.to(node,{scale:.82,opacity:.55,duration:.65,repeat:-1,yoyo:true,ease:'sine.inOut'});};
  preference.addEventListener('change',update);update();
  return ()=>{tween?.kill();preference.removeEventListener('change',update);gsap.set(node,{clearProps:'opacity,transform'});};
}
export function stopMotion(node){gsap.killTweensOf(node);}
