import { AppError, unwrap } from '../utils/errors.js';

const fields = 'id,category_id,sku,slug,name,title,short_description,description,price_cents,sale_price_cents,stock_quantity,featured';

export function createCatalogRepository(client) {
  return {
    listCategories() {
      return unwrap(client.from('categories').select('id,name,slug,description,sort_order')
        .eq('active', true).order('sort_order').order('id'));
    },
    getCategoryById(id) {
      if (typeof id !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
        throw new AppError('INVALID_DATA', 'Categoria inválida.');
      }
      return unwrap(client.from('categories').select('id,name').eq('id', id).eq('active', true).maybeSingle());
    },
    listProducts({ page = 1, pageSize = 24, categoryId, search = '', sort = 'recent', filter = '' } = {}) {
      if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100
          || !Number.isSafeInteger(page * pageSize)) {
        throw new AppError('INVALID_DATA', 'Paginação inválida.');
      }
      if (typeof search !== 'string' || search.length > 120 || !['recent', 'name'].includes(sort) || !['', 'featured', 'sale'].includes(filter)) throw new AppError('INVALID_DATA', 'Busca ou ordenação inválida.');
      let query = client.from('products').select(fields).eq('status', 'published').eq('active', true);
      if (categoryId) query = query.eq('category_id', categoryId);
      if (filter === 'featured') query = query.eq('featured', true);
      if (filter === 'sale') query = query.not('sale_price_cents', 'is', null);
      if (search.trim()) query = query.ilike('name', `%${search.trim().replace(/[\\%_]/g, '\\$&')}%`);
      query = sort === 'name' ? query.order('name') : query.order('created_at', { ascending: false });
      return unwrap(query.order('id')
        .range((page - 1) * pageSize, page * pageSize - 1));
    },
    listPrimaryImages(productIds) {
      if (!Array.isArray(productIds) || productIds.length > 100 || productIds.some(id => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) {
        throw new AppError('INVALID_DATA', 'Produtos inválidos.');
      }
      if (!productIds.length) return Promise.resolve([]);
      return unwrap(client.from('product_images').select('product_id,storage_path,alt_text').in('product_id', productIds).eq('is_primary', true));
    },
    listProductImages(productId, page = 1) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(productId) || !Number.isSafeInteger(page) || page < 1 || page > 100000) {
        throw new AppError('INVALID_DATA', 'Galeria inválida.');
      }
      return unwrap(client.from('product_images').select('id,product_id,storage_path,alt_text,is_primary,sort_order')
        .eq('product_id',productId).order('is_primary',{ascending:false}).order('sort_order').order('id')
        .range((page-1)*20,page*20-1));
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
