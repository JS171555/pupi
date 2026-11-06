export const PHONE_HINT='Use o DDD: (11) 90000-0000 ou (11) 3000-0000.';

export function phoneDigits(value) {
  const digits=String(value??'').replace(/\D/g,'');
  return /^55\d{10,11}$/.test(digits)?digits.slice(2):digits;
}

export function normalizeBrazilianPhone(value) {
  if(typeof value!=='string'||!/^\+?[\d\s()-]+$/.test(value.trim()))return null;
  if(value.trim().startsWith('+')&&!/^55\d{10,11}$/.test(value.replace(/\D/g,'')))return null;
  const digits=phoneDigits(value);
  return /^[1-9]{2}(?:[2-5]\d{7}|9\d{8})$/.test(digits)?digits:null;
}

export function formatBrazilianPhone(value) {
  const digits=phoneDigits(value).slice(0,11);
  if(!digits)return '';
  if(digits.length<=2)return '('+digits;
  const number=digits.slice(2);const split=digits.length>10?5:4;
  return `(${digits.slice(0,2)}) ${number.slice(0,split)}${number.length>split?'-'+number.slice(split):''}`;
}
