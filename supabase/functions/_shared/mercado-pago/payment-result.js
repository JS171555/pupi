// Nunca retornar dados de cartão, documentos, e-mail ou a resposta integral do provedor.
export function paymentResult(payment,status) {
  const result={payment_id:String(payment.id),status};
  const data=payment.point_of_interaction?.transaction_data;
  if(payment.payment_method_id==='pix'&&status==='pending') {
    if(typeof data?.qr_code==='string'&&data.qr_code.length<=4096)result.qr_code=data.qr_code;
    if(typeof data?.qr_code_base64==='string'&&data.qr_code_base64.startsWith('iVBOR')&&data.qr_code_base64.length<=300000&&/^[A-Za-z0-9+/=]+$/.test(data.qr_code_base64))result.qr_code_base64=data.qr_code_base64;
    if(typeof payment.date_of_expiration==='string'&&Number.isFinite(Date.parse(payment.date_of_expiration)))result.expires_at=payment.date_of_expiration;
  }
  return result;
}
