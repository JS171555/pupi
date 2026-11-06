import {inspectProviderPayment,paymentValidationIssue} from './verification.js';
import {paymentResult} from './payment-result.js';
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export function createPaymentProcessor({admin,env,diagnose=()=>{}}) {
  return async({paymentId,payment})=>{
    const collectorId=env('MERCADO_PAGO_COLLECTOR_ID'),mode=env('MERCADO_PAGO_ENV');
    if(!/^\d{1,30}$/.test(collectorId||'')||!['sandbox','production'].includes(mode)||!uuid(payment?.external_reference))return false;
    const {data:context,error}=await admin.rpc('service_payment_context',{p_order_id:payment.external_reference});
    if(error||!context){diagnose('PAYMENT_CONTEXT_RPC',{sql_code:error?.code});return false;}
    const expected={paymentId,orderId:context.order_id,totalCents:context.total_cents,collectorId,liveMode:mode==='production'};
    const issue=paymentValidationIssue(payment,expected);if(issue){diagnose(issue);return false;}
    const result=inspectProviderPayment(payment,expected);
    if(!result.valid || typeof payment.date_last_updated!=='string' || !Number.isFinite(Date.parse(payment.date_last_updated))){diagnose('PAYMENT_TIMESTAMP_INVALID');return false;}
    const applied=await admin.rpc('service_apply_provider_payment',{p_order_id:context.order_id,p_payment_id:paymentId,p_state:result.status,p_updated_at:payment.date_last_updated,p_total_cents:context.total_cents});
    if(applied.error||!['paid','pending','refunded','review','stale','duplicate'].includes(applied.data)){diagnose('PAYMENT_APPLY_RPC',{sql_code:applied.error?.code});return false;}
    if(uuid(payment.metadata?.pupi_submission_id)&&applied.data!=='stale') {
      const state=applied.data==='review'?'review':result.status;
      const saved=await admin.rpc('service_complete_transparent_payment',{p_order_id:context.order_id,p_request_key:payment.metadata.pupi_submission_id,p_payment_id:paymentId,p_state:state,p_updated_at:payment.date_last_updated,p_result:paymentResult(payment,state)});
      if(saved.error||saved.data!==true){diagnose('PAYMENT_LINK_RPC',{sql_code:saved.error?.code});return false;}
    }
    return true;
  };
}
