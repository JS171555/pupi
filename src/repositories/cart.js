import {AppError, unwrap} from '../utils/errors.js';

const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

/** Define a quantidade absoluta: repetir uma solicitação não soma novamente. */
export function createCartRepository(client) {
  return {
    async listItems(userId, page = 1, signal) {
      if (!uuid(userId) || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
        throw new AppError('INVALID_DATA', 'Página do carrinho inválida.');
      }
      let cartQuery = client.from('carts').select('id').eq('user_id',userId).maybeSingle();
      if (signal) cartQuery = cartQuery.abortSignal(signal);
      const cart = await unwrap(cartQuery);
      if (!cart) return {items:[],hasMore:false};
      let itemsQuery = client.from('cart_items')
        .select('id,product_id,quantity,products(id,name,slug,price_cents,sale_price_cents,stock_quantity,active,status,categories(active))')
        .eq('cart_id',cart.id).order('id').range((page-1)*20,page*20);
      if (signal) itemsQuery = itemsQuery.abortSignal(signal);
      const items = await unwrap(itemsQuery);
      return {items:items.slice(0,20),hasMore:items.length>20};
    },
    async setQuantity(userId, productId, quantity) {
      if (!uuid(userId) || !uuid(productId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 999) {
        throw new AppError('INVALID_DATA', 'Informe uma quantidade entre 1 e 999.');
      }
      const product = await unwrap(client.from('products').select('id,stock_quantity')
        .eq('id', productId).eq('active', true).eq('status', 'published').maybeSingle());
      if (!product) throw new AppError('NOT_FOUND', 'Este produto não está disponível.');
      if (quantity > product.stock_quantity) throw new AppError('INVALID_DATA', 'A quantidade solicitada supera o estoque disponível.');
      let cart = await unwrap(client.from('carts').select('id').eq('user_id', userId).maybeSingle());
      if (!cart) {
        try {
          cart = await unwrap(client.from('carts').insert({user_id:userId}).select('id').single());
        } catch (error) {
          // Outra aba pode ter criado o carrinho entre a consulta e a inserção.
          if (error.code !== 'CONFLICT') throw error;
          cart = await unwrap(client.from('carts').select('id').eq('user_id', userId).single());
        }
      }
      try {
        await unwrap(client.from('cart_items').insert({cart_id:cart.id,product_id:productId,quantity}));
      } catch (error) {
        if (error.code !== 'CONFLICT') throw error;
        await unwrap(client.from('cart_items').update({quantity}).eq('cart_id',cart.id).eq('product_id',productId));
      }
      return {quantity};
    },
  };
}
