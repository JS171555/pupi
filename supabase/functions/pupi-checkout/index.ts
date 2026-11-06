import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createCheckoutHandler} from './handler.js';

Deno.serve(createCheckoutHandler({createClient,env:(name:string)=>Deno.env.get(name)}));
