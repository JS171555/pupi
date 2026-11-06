// Somente categorias fixas. Nunca devolver ou registrar o corpo de erro do provedor.
export function providerFailureStage(status,body) {
  if(status===401||status===403)return 'PAYMENT_AUTHORIZATION_REJECTED';
  const codes=Array.isArray(body?.cause)?body.cause.slice(0,20).map(item=>String(item?.code)):[];
  if(codes.includes('2034'))return 'PAYMENT_TEST_USERS_INCOMPATIBLE';
  if(codes.includes('2001'))return 'PAYMENT_IDEMPOTENCY_CONFLICT';
  if(codes.some(code=>['3001','3003','3006','3008'].includes(code)))return 'PAYMENT_CARD_TOKEN_REJECTED';
  return 'PAYMENT_PROVIDER_HTTP';
}
