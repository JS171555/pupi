import { AppError, unwrap } from '../utils/errors.js';
import { validateProfile, validateAddress } from '../modules/auth/validation.js';

export const PAGE_SIZE = 10;
const profileFields = 'id,full_name,phone,terms_accepted_at,terms_version,created_at,updated_at';
const addressFields = 'id,label,recipient,postal_code,street,number,complement,neighborhood,city,state,country,is_default,updated_at';
const orderFields = 'id,order_number,status,payment_status,subtotal_cents,shipping_cents,total_cents,currency,address_snapshot,created_at';
function pageRange(page) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000) throw new AppError('INVALID_DATA', 'Página inválida.');
  return [(page - 1) * PAGE_SIZE, page * PAGE_SIZE]; // Um registro extra detecta a próxima página.
}
const paginate = data => ({ items: data.slice(0, PAGE_SIZE), hasMore: data.length > PAGE_SIZE });
const timeout = signal => signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000);

export function createAccountRepository(client) {
  return {
    async getProfile(userId, signal) {
      const data = await unwrap(client.from('profiles').select(profileFields).eq('id', userId).single().abortSignal(timeout(signal)));
      return data;
    },
    async role(userId, signal) {
      const data = await unwrap(client.from('user_roles').select('role').eq('user_id', userId).single().abortSignal(timeout(signal)));
      return data.role;
    },
    async saveProfile(userId, values, expectedUpdatedAt) {
      const data = await unwrap(client.from('profiles').update(validateProfile(values)).eq('id', userId)
        .eq('updated_at', expectedUpdatedAt).select(profileFields).abortSignal(timeout()));
      if (!data.length) throw new AppError('CONFLICT', 'Seu perfil mudou em outra sessão. Recarregue antes de salvar.');
      return data[0];
    },
    acceptTestNotice() { return unwrap(client.rpc('accept_test_notice').abortSignal(timeout())); },
    adminAccess(signal) { return unwrap(client.rpc('admin_access_status').abortSignal(timeout(signal))); },
    async listAddresses(userId, page = 1, signal) {
      const [from, to] = pageRange(page);
      const data = await unwrap(client.from('addresses').select(addressFields).eq('user_id', userId)
        .order('is_default', { ascending: false }).order('created_at').order('id').range(from, to).abortSignal(timeout(signal)));
      return paginate(data);
    },
    getAddress(userId, id, signal) {
      return unwrap(client.from('addresses').select(addressFields).eq('user_id', userId).eq('id', id)
        .maybeSingle().abortSignal(timeout(signal)));
    },
    async saveAddress(values, existing) {
      const data = await unwrap(client.rpc('save_address', {
        p_id: existing?.id ?? null, p_data: validateAddress(values), p_expected_updated_at: existing?.updated_at ?? null,
      }).abortSignal(timeout()));
      const saved = Array.isArray(data) ? data[0] : data;
      if (!saved?.id) throw new AppError('REQUEST_FAILED', 'O endereço não foi confirmado pelo servidor. Confira sua lista antes de tentar novamente.');
      return saved;
    },
    async deleteAddress(userId, address) {
      const data = await unwrap(client.from('addresses').delete().eq('id', address.id).eq('user_id', userId)
        .eq('updated_at', address.updated_at).select('id').abortSignal(timeout()));
      if (!data.length) throw new AppError('CONFLICT', 'Este endereço mudou ou já foi excluído. Recarregue a lista.');
    },
    async listOrders(userId, page = 1, signal) {
      const [from, to] = pageRange(page);
      const data = await unwrap(client.from('orders').select(orderFields).eq('user_id', userId)
        .order('created_at', { ascending: false }).order('id').range(from, to).abortSignal(timeout(signal)));
      return paginate(data);
    },
    async getOrder(userId, id, signal) {
      const order = await unwrap(client.from('orders').select(orderFields).eq('id', id).eq('user_id', userId)
        .maybeSingle().abortSignal(timeout(signal)));
      if (!order) return null;
      const [items, shipment] = await Promise.all([
        unwrap(client.from('order_items').select('id,product_name,product_sku,quantity,unit_price_cents,line_total_cents')
          .eq('order_id', id).order('created_at').order('id').limit(100).abortSignal(timeout(signal))),
        unwrap(client.from('shipments').select('id,carrier,service_name,tracking_code,status')
          .eq('order_id', id).maybeSingle().abortSignal(timeout(signal))),
      ]);
      const events = shipment ? await unwrap(client.from('shipment_events').select('id,status,description,occurred_at')
        .eq('shipment_id', shipment.id).order('occurred_at', { ascending: false }).limit(100).abortSignal(timeout(signal))) : [];
      return { ...order, items, shipment, events };
    },
  };
}
