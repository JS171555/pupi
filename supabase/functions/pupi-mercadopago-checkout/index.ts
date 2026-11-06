import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createTransparentPaymentHandler} from '../_shared/mercado-pago/transparent.js';
Deno.serve(createTransparentPaymentHandler({createClient,env:(name:string)=>Deno.env.get(name)}));
