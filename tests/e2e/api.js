const A = '00000000-0000-4000-8000-000000000001';
const created = '2026-11-05T12:00:00.000Z';
export const validPassword = 'SenhaDeTeste123';
export const user = { id: A, email: 'pessoa@example.com', aud: 'authenticated', role: 'authenticated',
  created_at: created, user_metadata: { full_name: 'Pessoa Teste', role: 'admin' }, app_metadata: { provider: 'email' } };
const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
export const session = () => ({ access_token: `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: A, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.test-signature`,
  refresh_token: 'e2e-refresh-only', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: 'bearer', user });

export async function installApi(page, { signedIn = false, role = 'customer', notice = true } = {}) {
  const data = {
    profile: { id: A, full_name: 'Pessoa Teste', phone: null, terms_accepted_at: notice ? created : null,
      terms_version: notice ? 'testing-v1' : null, created_at: created, updated_at: created },
    shipping: {}, addresses: [], orders: [], signedIn, role, signIns: 0, signUps: [], recoveries: 0,
    failSave: false, failDelete: false, expired: false, saveDelay: 0,
  };
  if (signedIn) {
    await page.addInitScript(({ value }) => { localStorage.setItem('sb-pupi-test-auth-token', JSON.stringify(value)); }, { value: session() });
  }
  await page.route('https://pupi-test.supabase.co/**', async route => {
    const request = route.request(); const url = new URL(request.url());
    const method = request.method(); const body = request.postDataJSON();
    const respond = (value, status = 200) => route.fulfill({ status, contentType: 'application/json',
      headers: { 'x-supabase-api-version': '2024-01-01' }, body: JSON.stringify(value) });
    const object = request.headers().accept?.includes('vnd.pgrst.object');
    if (url.pathname === '/auth/v1/token') {
      data.signIns++;
      if (body.password === validPassword || ['refresh_token', 'pkce'].includes(url.searchParams.get('grant_type'))) {
        data.signedIn = true; return respond(session());
      }
      return respond({ code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
    }
    if (url.pathname === '/auth/v1/signup') { data.signUps.push(body); return respond({ ...user, identities: [{ id: 'email-id' }] }); }
    if (url.pathname === '/auth/v1/recover') { data.recoveries++; return respond({}); }
    if (url.pathname === '/auth/v1/settings') return respond({ external: { google: false }, disable_signup: false });
    if (url.pathname === '/auth/v1/logout') { data.signedIn = false; return route.fulfill({ status: 204 }); }
    if (url.pathname === '/auth/v1/user') {
      if (data.expired) return respond({ code: 'bad_jwt', msg: 'JWT expired' }, 401);
      if (method === 'PUT') return respond(user);
      return respond(user);
    }
    if (url.pathname === '/rest/v1/profiles') {
      if (method === 'PATCH') {
        if (data.saveDelay) await new Promise(resolve => setTimeout(resolve, data.saveDelay));
        if (data.failSave) return respond({ code: 'PGRST000', message: 'raw internal database detail' }, 503);
        Object.assign(data.profile, body, { updated_at: new Date().toISOString() });
        return respond([data.profile]);
      }
      return respond(object ? data.profile : [data.profile]);
    }
    if (url.pathname === '/rest/v1/user_roles') return respond(object ? { role: data.role } : [{ role: data.role }]);
    if (url.pathname === '/rest/v1/home_banners') return respond([]);
    if (url.pathname === '/rest/v1/rpc/admin_access_status') return respond(data.role === 'admin');
    if (url.pathname === '/functions/v1/pupi-mercadopago-checkout') return respond({code:'CONFIG_MISSING',error:'Pagamento ainda não está configurado.'},503);
    if (url.pathname === '/rest/v1/rpc/admin_payment_review') return respond(false);
    if (url.pathname === '/rest/v1/rpc/admin_shipping_registration_status') return respond(data.shipping.registration||null);
    if (url.pathname === '/functions/v1/pupi-shipping-register') {
      data.shipping.body=body;data.shipping.registration={status:'registered',external_id:'87654321-1234-1234-1234-123456789012'};
      return respond({code:'REGISTERED',external_id:data.shipping.registration.external_id});
    }
    if (url.pathname === '/rest/v1/rpc/admin_invoice_get') {
      if(data.role!=='admin')return respond({code:'42501',message:'denied'},403);
      return respond(data.invoice||null);
    }
    if (url.pathname === '/rest/v1/rpc/admin_invoice_save') {
      if(data.role!=='admin')return respond({code:'42501',message:'denied'},403);
      data.invoice={order_id:body.p_order_id,access_key:body.p_access_key,updated_at:new Date().toISOString()};
      return respond(data.invoice);
    }
    if (url.pathname === '/rest/v1/rpc/admin_query') {
      if(data.role!=='admin')return respond({code:'42501',message:'denied'},403);
      if(data.adminQuery){const result=await data.adminQuery(body);return respond(result.data,result.status||200);}
      return respond({products:0,categories:0,customers:1,orders:data.orders.length,pending_orders:0,completed_orders:0,paid_orders:0,paid_total_cents:0,low_stock_count:0,low_stock:[],recent_orders:[]});
    }
    if (url.pathname === '/rest/v1/rpc/admin_mutate') {
      if(data.role!=='admin')return respond({code:'42501',message:'denied'},403);
      if(data.adminMutate){const result=await data.adminMutate(body);return respond(result.data,result.status||200);}
      return respond({code:'P0001',message:'unsupported test mutation'},400);
    }
    if (url.pathname === '/rest/v1/rpc/accept_test_notice') {
      data.profile.terms_accepted_at = created; data.profile.terms_version = 'testing-v1'; return respond(null);
    }
    if (url.pathname === '/rest/v1/rpc/save_address') {
      const existing = data.addresses.find(address => address.id === body.p_id);
      if (existing && body.p_expected_updated_at !== existing.updated_at) return respond({ code: '40001', message: 'changed' }, 409);
      if (body.p_data.is_default) data.addresses.forEach(address => { address.is_default = false; });
      const saved = { id: existing?.id || '30000000-0000-4000-8000-000000000003', country: 'BR', ...body.p_data, updated_at: new Date().toISOString() };
      if (existing) Object.assign(existing, saved); else data.addresses.push(saved);
      return respond(saved);
    }
    if (url.pathname === '/rest/v1/addresses') {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      if (method === 'DELETE') {
        if (data.failDelete) return respond({ code: 'PGRST000', message: 'delete failed' }, 503);
        data.addresses = data.addresses.filter(address => address.id !== id); return respond([{ id }]);
      }
      const list = id ? data.addresses.filter(address => address.id === id) : data.addresses;
      return respond(object ? list[0] || null : list);
    }
    if (url.pathname === '/rest/v1/orders') {
      const id = url.searchParams.get('id')?.replace('eq.', '');
      const list = id ? data.orders.filter(order => order.id === id) : data.orders;
      return respond(object ? list[0] || null : list);
    }
    if (url.pathname === '/rest/v1/order_items') return respond(data.orders[0]?.items || []);
    if (url.pathname === '/rest/v1/shipments') return respond([]);
    if (url.pathname === '/rest/v1/shipment_events') return respond([]);
    return respond({ message: `Unhandled test request ${method} ${url.pathname}` }, 500);
  });
  return data;
}
