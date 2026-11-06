import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createPaymentCheckoutHandler} from '../_shared/mercado-pago/checkout.js';
Deno.serve(createPaymentCheckoutHandler({createClient,env:(name:string)=>Deno.env.get(name)}));
