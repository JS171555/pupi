import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createTransparentPaymentHandler} from '../_shared/mercado-pago/transparent.js';
import {paymentDiagnostic} from '../_shared/mercado-pago/diagnostics.js';
Deno.serve(createTransparentPaymentHandler({createClient,apiKind:'orders',diagnose:paymentDiagnostic,env:(name:string)=>Deno.env.get(name)}));
