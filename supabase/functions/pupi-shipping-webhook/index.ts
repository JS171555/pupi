import {createClient} from 'npm:@supabase/supabase-js@2.119.0';
import {createShippingWebhookHandler} from './handler.js';

Deno.serve(createShippingWebhookHandler({createClient,env:(name:string)=>Deno.env.get(name)}));
