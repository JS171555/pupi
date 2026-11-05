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
