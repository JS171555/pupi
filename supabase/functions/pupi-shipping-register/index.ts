import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createShippingRegistrationHandler} from './handler.js';

Deno.serve(createShippingRegistrationHandler({createClient,env:(name:string)=>Deno.env.get(name)}));
