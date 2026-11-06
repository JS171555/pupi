export class AppError extends Error {
  constructor(code, message, options) {
    super(message, options);
    this.name = 'AppError';
    this.code = code;
  }
}

/** Mensagens técnicas, tokens e detalhes SQL não devem chegar à interface. */
export function toAppError(error) {
  if (error instanceof AppError) return error;
  const code = error?.code;
  const business = {
    banner_images_required: 'Envie as imagens mobile e desktop antes de publicar o banner.',
    banner_limit: 'Você pode publicar até 8 banners. Oculte um deles para publicar outro.',
    request_key_reused: 'Esta tentativa já foi usada com outros dados. Recarregue a tela antes de tentar novamente.',
    category_not_active: 'Para publicar, escolha uma categoria ativa.',
    category_has_products: 'Esta categoria possui produtos. Mova os produtos antes de excluí-la.',
    product_has_history: 'Este produto tem histórico de estoque ou pedidos. Use Arquivar para preservá-lo.',
    remove_images_first: 'Remova as imagens deste item antes de excluí-lo.',
    media_still_linked: 'Este arquivo ainda está em uso. Remova o vínculo antes de excluir o arquivo.',
    media_removal_pending: 'Este arquivo está aguardando remoção. Envie uma nova imagem.',
    media_not_uploaded: 'O arquivo ainda não foi confirmado no armazenamento. Tente enviar novamente.',
    media_file_exists: 'O arquivo ainda existe no armazenamento. Tente a limpeza novamente.',
    paid_order_refund_required: 'Pedidos pagos exigem o fluxo de estorno antes do cancelamento. O pagamento não foi alterado.',
    payment_attempt_pending: 'Existe um pagamento em andamento. Aguarde a confirmação antes de cancelar o pedido.',
    shipment_registration_pending: 'Existe uma remessa em andamento. Confira o Melhor Envio antes de alterar este pedido ou a NF-e.',
    carrier_required: 'Informe a transportadora ou o responsável pela entrega antes de registrar o envio.',
  };
  if (code==='P0001' && business[error?.message]) return new AppError('BUSINESS_RULE',business[error.message]);
  if (error?.status === 401 || ['PGRST301', 'bad_jwt'].includes(code)) {
    return new AppError('SESSION_EXPIRED', 'Sua sessão expirou. Entre novamente.');
  }
  if (code === '42501' || error?.status === 403) {
    return new AppError('FORBIDDEN', 'Você não tem permissão para esta operação.');
  }
  if (code === '23505') return new AppError('CONFLICT', 'Este registro já existe.');
  if (code === '40001') return new AppError('CONFLICT', 'Este registro mudou em outra sessão. Recarregue antes de salvar.');
  if (code === 'P0002') return new AppError('NOT_FOUND', 'Este registro não está disponível para sua conta.');
  if (['23514', '23503', '23502', '22023'].includes(code)) {
    return new AppError('INVALID_DATA', 'Verifique os dados informados.');
  }
  return new AppError('REQUEST_FAILED', 'Não foi possível concluir a operação. Tente novamente.');
}

export async function unwrap(request) {
  try {
    const { data, error } = await request;
    if (error) throw error;
    return data;
  } catch (error) { throw toAppError(error); }
}
