// Somente códigos definidos pela aplicação. Nunca incluir respostas, chaves ou dados de comprador.
export function paymentDiagnostic(stage,details={}) {
  if(typeof stage!=='string'||!/^PAYMENT_[A-Z_]+$/.test(stage))return;
  const event={event:'pupi_payment_check',stage};
  if(Number.isInteger(details.http_status)&&details.http_status>=100&&details.http_status<=599)event.http_status=details.http_status;
  if(typeof details.sql_code==='string'&&/^[A-Z0-9]{5}$/.test(details.sql_code))event.sql_code=details.sql_code;
  for(const key of ['candidate_count','match_count'])if(Number.isInteger(details[key])&&details[key]>=0&&details[key]<=50)event[key]=details[key];
  console.warn(JSON.stringify(event));
}
