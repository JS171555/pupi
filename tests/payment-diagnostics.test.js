import test from 'node:test';
import assert from 'node:assert/strict';
import {paymentDiagnostic} from '../supabase/functions/_shared/mercado-pago/diagnostics.js';
import {paymentValidationIssue} from '../supabase/functions/_shared/mercado-pago/verification.js';
import {createPaymentProcessor} from '../supabase/functions/_shared/mercado-pago/processor.js';
const order='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const payment={id:123,collector_id:12,external_reference:order,currency_id:'BRL',live_mode:false,transaction_amount:15,transaction_amount_refunded:0,status:'approved',date_last_updated:'2026-01-01T00:00:00Z'};
const expected={paymentId:'123',orderId:order,totalCents:1500,collectorId:'12',liveMode:false};
test('diagnóstico diferencia configuração e valores sem retornar os valores recebidos',()=>{
 assert.equal(paymentValidationIssue({...payment,collector_id:99},expected),'PAYMENT_COLLECTOR_MISMATCH');
 assert.equal(paymentValidationIssue({...payment,live_mode:true},expected),'PAYMENT_MODE_MISMATCH');
 assert.equal(paymentValidationIssue({...payment,transaction_amount:1},expected),'PAYMENT_AMOUNT_MISMATCH');
 assert.equal(paymentValidationIssue({...payment,transaction_amount_refunded:undefined},expected),'PAYMENT_REFUND_INVALID');
});
test('logger aceita apenas estágio e códigos, ignorando credenciais, documentos e respostas',()=>{
 const logs=[],original=console.warn;console.warn=value=>logs.push(value);
 try{paymentDiagnostic('PAYMENT_PROVIDER_HTTP',{http_status:403,sql_code:'42501',token:'secret',email:'buyer@example.test',body:{card_number:'123'}});paymentDiagnostic('valor inválido');}finally{console.warn=original;}
 assert.equal(logs.length,1);assert.deepEqual(JSON.parse(logs[0]),{event:'pupi_payment_check',stage:'PAYMENT_PROVIDER_HTTP',http_status:403,sql_code:'42501'});
});
test('vendedor incompatível gera diagnóstico e nunca aplica pagamento',async()=>{
 const events=[],calls=[];const process=createPaymentProcessor({env:name=>({MERCADO_PAGO_COLLECTOR_ID:'99',MERCADO_PAGO_ENV:'sandbox'})[name],diagnose:stage=>events.push(stage),admin:{rpc:async(name)=>{calls.push(name);return {data:{order_id:order,total_cents:1500}};}}});
 assert.equal(await process({paymentId:'123',payment}),false);assert.deepEqual(events,['PAYMENT_COLLECTOR_MISMATCH']);assert.deepEqual(calls,['service_payment_context']);
});
