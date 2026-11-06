/** Confere o formato, modelo 55 e dígito verificador; não consulta a SEFAZ. */
export function isValidNfeKey(key) {
  if (typeof key !== 'string' || !/^[0-9]{44}$/.test(key) || key.slice(20,22)!=='55') return false;
  let total=0,weight=2;
  for(let index=42;index>=0;index--){total+=Number(key[index])*weight;weight=weight===9?2:weight+1;}
  const remainder=total%11;
  return Number(key[43])===(remainder<2?0:11-remainder);
}
