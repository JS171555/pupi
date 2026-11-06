import {gsap} from 'gsap';

const reduced=()=>window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function enter(node) {
  if(reduced())return;
  gsap.fromTo(node,{opacity:0,y:8,scale:.97},{opacity:1,y:0,scale:1,duration:.22,ease:'power2.out',clearProps:'opacity,transform',overwrite:true});
}
export function leave(node,done) {
  gsap.killTweensOf(node);
  if(reduced()){done();return;}
  gsap.to(node,{opacity:0,y:4,scale:.98,duration:.18,ease:'power1.in',onComplete:done,overwrite:true});
}
export function pulse(node) {
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  let tween;
  const update=()=>{tween?.kill();gsap.set(node,{clearProps:'opacity,transform'});if(!preference.matches)tween=gsap.to(node,{scale:.82,opacity:.55,duration:.65,repeat:-1,yoyo:true,ease:'sine.inOut'});};
  preference.addEventListener('change',update);update();
  return ()=>{tween?.kill();preference.removeEventListener('change',update);gsap.set(node,{clearProps:'opacity,transform'});};
}
export function stopMotion(node){gsap.killTweensOf(node);}
