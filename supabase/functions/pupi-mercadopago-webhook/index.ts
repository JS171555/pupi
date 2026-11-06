import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createPaymentWebhookHandler} from '../_shared/mercado-pago/webhook.js';
import {createPaymentProcessor} from '../_shared/mercado-pago/processor.js';
const env=(name:string)=>Deno.env.get(name);
Deno.serve(async(request:Request)=>{
  const url=env('SUPABASE_URL'),key=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return new Response(null,{status:503});
  const admin=createClient(url,key,{auth:{persistSession:false}});
  return createPaymentWebhookHandler({env,processPayment:createPaymentProcessor({admin,env})})(request);
});
