import { AppError, unwrap } from '../utils/errors.js';

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
const buckets = new Set(['product-images', 'category-images']);

export function validateImage(file) {
  if (!file || !extensions[file.type] || !Number.isSafeInteger(file.size) || file.size < 1 || file.size > MAX_IMAGE_BYTES) {
    throw new AppError('INVALID_DATA', 'Envie uma imagem JPEG, PNG ou WebP de até 5 MiB.');
  }
  return extensions[file.type];
}

function validatePath(bucket, path) {
  if (!buckets.has(bucket) || typeof path !== 'string'
      || !/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp)$/.test(path)) {
    throw new AppError('INVALID_DATA', 'Caminho de imagem inválido.');
  }
}

export function createMediaService(client) {
  return {
    async upload(bucket, entityId, file) {
      const extension = validateImage(file);
      const path = `${entityId}/${crypto.randomUUID()}.${extension}`;
      validatePath(bucket, path);
      await unwrap(client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false, cacheControl: '0' }));
      // Persistir este caminho em product_images ou categories antes da leitura pública.
      return path;
    },
    signedUrl(bucket, path) {
      validatePath(bucket, path);
      return unwrap(client.storage.from(bucket).createSignedUrl(path, 300));
    },
    remove(bucket, path) {
      validatePath(bucket, path);
      return unwrap(client.storage.from(bucket).remove([path]));
    },
  };
}
