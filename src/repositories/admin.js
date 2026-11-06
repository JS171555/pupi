import { AppError, unwrap } from '../utils/errors.js';
const deadline=signal=>signal ? AbortSignal.any([signal,AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000);

export function createAdminRepository(client) {
  const attempts=new Map();
  return {
    clear() { attempts.clear(); },
    query(resource,options={},signal) {
      return unwrap(client.rpc('admin_query',{p_resource:resource,p_options:options}).abortSignal(deadline(signal)));
    },
    invoice(orderId,signal) {
      return unwrap(client.rpc('admin_invoice_get',{p_order_id:orderId}).abortSignal(deadline(signal)));
    },
    saveInvoice(orderId,key,expected=null) {
      return unwrap(client.rpc('admin_invoice_save',{p_order_id:orderId,p_access_key:key,p_expected:expected}).abortSignal(deadline()));
    },
    paymentReview(orderId,signal) {
      return unwrap(client.rpc('admin_payment_review',{p_order_id:orderId}).abortSignal(deadline(signal)));
    },
    shippingRegistrationStatus(orderId,signal) {
      return unwrap(client.rpc('admin_shipping_registration_status',{p_order:orderId}).abortSignal(deadline(signal)));
    },
    async registerShipment(body) {
      const {data,error}=await client.functions.invoke('pupi-shipping-register',{body});
      if(error) {
        let response;try { response=await error.context?.json(); } catch { /* resposta indisponível */ }
        const allowed=['CONFIG_MISSING','DATA_INVALID','PREREQUISITES','PROVIDER_REJECTED','REGISTRATION_PENDING','REGISTRATION_UNCERTAIN','CONTEXT_CHANGED'];
        if(allowed.includes(response?.code) && typeof response.error==='string')throw new AppError(response.code,response.error);
        throw new AppError('REGISTRATION_UNCERTAIN','Não foi possível confirmar o registro. Confira o carrinho do Melhor Envio antes de tentar novamente.');
      }
      return data;
    },
    async mutate(operation,id,data={},expected=null,requestKey) {
      const fingerprint=JSON.stringify([operation,id??null,data,expected]);
      let key=requestKey || attempts.get(fingerprint);
      if (!key) { key=crypto.randomUUID(); attempts.set(fingerprint,key); }
      const result=await unwrap(client.rpc('admin_mutate',{
        p_operation:operation,p_id:id??null,p_data:data,p_expected:expected,p_request_key:key,
      }).abortSignal(deadline()));
      attempts.delete(fingerprint);
      return result;
    },
  };
}
