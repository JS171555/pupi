import {formatBrazilianPhone,normalizeBrazilianPhone,phoneDigits} from '../utils/phone.js';

export function attachPhoneMask(control) {
  control.maxLength=15;control.inputMode='tel';control.placeholder='(11) 90000-0000';
  // Preserve legacy invalid values for explicit correction instead of truncating on load.
  if(!control.value||normalizeBrazilianPhone(control.value))control.value=formatBrazilianPhone(control.value);
  const position=(value,count)=>{
    if(!count)return value.startsWith('(')?1:0;
    let seen=0;
    for(let i=0;i<value.length;i++)if(/\d/.test(value[i])&&++seen===count)return i+1;
    return value.length;
  };
  const update=(raw,digitsBefore)=>{
    const stripped=raw.replace(/\D/g,'');
    const removed=stripped.length-phoneDigits(raw).length;
    const formatted=formatBrazilianPhone(raw);
    control.value=formatted;
    const cursor=position(formatted,Math.max(0,digitsBefore-removed));
    control.setSelectionRange(cursor,cursor);
  };
  control.addEventListener('input',event=>{
    if(event.isComposing)return;
    const raw=control.value;const before=raw.slice(0,control.selectionStart??raw.length).replace(/\D/g,'').length;
    update(raw,before);
  });
  control.addEventListener('compositionend',()=>{
    const raw=control.value;update(raw,raw.slice(0,control.selectionStart??raw.length).replace(/\D/g,'').length);
  });
  control.addEventListener('paste',event=>{
    if(!event.clipboardData)return;
    event.preventDefault();
    const start=control.selectionStart??control.value.length,end=control.selectionEnd??start;
    const inserted=event.clipboardData.getData('text');
    const prefix=control.value.slice(0,start)+inserted;
    update(prefix+control.value.slice(end),prefix.replace(/\D/g,'').length);
    control.dispatchEvent(new Event('input',{bubbles:true}));
  });
  control.addEventListener('beforeinput',event=>{
    if(!event.cancelable||!['deleteContentBackward','deleteContentForward'].includes(event.inputType))return;
    const start=control.selectionStart,end=control.selectionEnd;
    if(start===null||start!==end)return;
    const backwards=event.inputType==='deleteContentBackward';
    const raw=control.value;let index=backwards?start-1:start;
    if(index<0||index>=raw.length||/\d/.test(raw[index]))return;
    while(index>=0&&index<raw.length&&!/\d/.test(raw[index]))index+=backwards?-1:1;
    if(index<0||index>=raw.length)return;
    event.preventDefault();
    const before=raw.slice(0,index).replace(/\D/g,'').length;
    update(raw.slice(0,index)+raw.slice(index+1),before);
    control.dispatchEvent(new Event('input',{bubbles:true}));
  });
}
