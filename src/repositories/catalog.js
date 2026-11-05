import { AppError, unwrap } from '../utils/errors.js';

const fields = 'id,category_id,sku,slug,name,title,short_description,description,price_cents,sale_price_cents,stock_quantity,featured';

export function createCatalogRepository(client) {
  return {
    listCategories() {
      return unwrap(client.from('categories').select('id,name,slug,description,sort_order')
        .eq('active', true).order('sort_order').order('id'));
    },
    listProducts({ page = 1, pageSize = 24, categoryId } = {}) {
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
          || !Number.isSafeInteger(page * pageSize)) {
        throw new AppError('INVALID_DATA', 'Paginação inválida.');
      }
      let query = client.from('products').select(fields).eq('status', 'published').eq('active', true);
      if (categoryId) query = query.eq('category_id', categoryId);
      return unwrap(query.order('created_at', { ascending: false }).order('id')
        .range((page - 1) * pageSize, page * pageSize - 1));
    },
    getProductBySlug(slug) {
      if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new AppError('INVALID_DATA', 'Identificador de produto inválido.');
      }
      return unwrap(client.from('products').select(fields).eq('slug', slug)
        .eq('status', 'published').eq('active', true).maybeSingle());
    },
  };
}
