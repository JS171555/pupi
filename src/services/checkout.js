import {AppError} from '../utils/errors.js';

export function createCheckoutService(client,userId) {
  const storageKey=`pupi-checkout-pending:${userId}`;
  function pending() {
    try {return JSON.parse(sessionStorage.getItem(storageKey) || 'null');} catch {return null;}
  }
  async function invoke(body) {
    const {data,error}=await client.functions.invoke('pupi-checkout',{body});
    if (error) {
      let detail;
      try {detail=await error.context?.json();} catch { /* A mensagem padrão não expõe detalhes técnicos. */ }
      if(detail?.code==='QUOTE_STALE')throw new AppError('QUOTE_STALE','A cotação expirou ou o carrinho mudou. Solicite outra cotação.');
      throw new AppError('REQUEST_FAILED',body.action==='confirm'?'Confirmação não verificada. Tente novamente para consultar a mesma solicitação.':'Não foi possível cotar a entrega. Verifique o endereço e tente novamente.');
    }
    return data;
  }
  return {
    pending,
    async quotes(addressId) {
      if(pending())throw new AppError('CONFLICT','Há uma confirmação pendente. Verifique o resultado antes de solicitar outra cotação.');
      return (await invoke({action:'quote',address_id:addressId}))?.quotes || [];
    },
    async confirm(quoteId) {
      let task=pending();
      if(task && task.quoteId!==quoteId)throw new AppError('CONFLICT','Verifique a confirmação pendente antes de escolher outra entrega.');
      if(!task) {
        task={quoteId,requestKey:crypto.randomUUID()};
        try {sessionStorage.setItem(storageKey,JSON.stringify(task));}
        catch {throw new AppError('REQUEST_FAILED','Não foi possível guardar a tentativa com segurança neste navegador.');}
      }
      try {
        const data=await invoke({action:'confirm',quote_id:task.quoteId,request_key:task.requestKey});
        if(!data?.order_id)throw new AppError('REQUEST_FAILED','Confirmação não verificada. Tente novamente.');
        sessionStorage.removeItem(storageKey);return data.order_id;
      } catch(error) {
        if(error.code==='QUOTE_STALE')sessionStorage.removeItem(storageKey);
        throw error;
      }
    },
  };
}
