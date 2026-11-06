import test from 'node:test';
import assert from 'node:assert/strict';
import { readPublicConfig } from '../src/config/environment.js';
import { createPupiClient } from '../src/services/supabase.js';
import { createCatalogRepository } from '../src/repositories/catalog.js';
import { createMediaService, validateImage, MAX_IMAGE_BYTES } from '../src/services/media.js';
import { AppError, toAppError, unwrap } from '../src/utils/errors.js';

const config = { SUPABASE_URL: 'https://pupi.example.com', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test' };

test('configuração pública exige origem segura e chave publishable', () => {
  assert.equal(readPublicConfig(config).supabaseUrl, 'https://pupi.example.com');
  assert.equal(readPublicConfig({ ...config, SUPABASE_URL: 'http://127.0.0.1:54321' }).supabaseUrl, 'http://127.0.0.1:54321');
  for (const url of ['http://pupi.example.com', 'javascript:alert(1)', 'https://user:password@pupi.example.com', 'https://pupi.example.com/path']) {
    assert.throws(() => readPublicConfig({ ...config, SUPABASE_URL: url }), { code: 'CONFIG_INVALID' });
  }
  assert.throws(() => readPublicConfig({}), { code: 'CONFIG_MISSING' });
  for (const key of ['sb_secret_example', 'service_role', 'eyJhbGciOiJIUzI1NiJ9.secret']) {
    assert.throws(() => readPublicConfig({ ...config, SUPABASE_PUBLISHABLE_KEY: key }), { code: 'CONFIG_INVALID' });
  }
});

test('cliente usa configuração pública e consulta catálogo com campos e paginação delimitados', async () => {
  const requests = [];
  const client = createPupiClient(config, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      requests.push({ url: new URL(url), options });
      return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  const catalog = createCatalogRepository(client);
  assert.deepEqual(await catalog.listProducts({ page: 2, pageSize: 12 }), []);
  assert.equal(requests[0].url.pathname, '/rest/v1/products');
  assert.equal(requests[0].url.searchParams.get('offset'), '12');
  assert.equal(requests[0].url.searchParams.get('limit'), '12');
  assert.equal(requests[0].url.searchParams.get('status'), 'eq.published');
  assert.ok(!requests[0].url.searchParams.get('select').includes('*'));
  await catalog.listProducts({ search: 'ração', sort: 'name' });
  assert.equal(requests[1].url.searchParams.get('name'), 'ilike.%ração%');
  assert.equal(requests[1].url.searchParams.get('order'), 'name.asc,id.asc');
  const productId = '20000000-0000-4000-8000-000000000001';
  assert.deepEqual(await catalog.listPrimaryImages([]), []);
  await catalog.listPrimaryImages([productId]);
  assert.equal(requests[2].url.pathname, '/rest/v1/product_images');
  assert.equal(requests[2].url.searchParams.get('is_primary'), 'eq.true');
  assert.equal(requests[2].url.searchParams.get('product_id'), `in.(${productId})`);
  assert.throws(() => catalog.listPrimaryImages(['invalid']), { code: 'INVALID_DATA' });
  assert.throws(() => catalog.listProducts({ sort: 'unexpected' }), { code: 'INVALID_DATA' });
  assert.throws(() => catalog.listProducts({ pageSize: 1000 }), { code: 'INVALID_DATA' });
  assert.throws(() => catalog.getProductBySlug('../admin'), { code: 'INVALID_DATA' });
});

test('erros técnicos são traduzidos sem expor detalhes SQL ou tokens', async () => {
  for (const [code, expected] of [['42501', 'FORBIDDEN'], ['23505', 'CONFLICT'], ['23514', 'INVALID_DATA'], ['unknown', 'REQUEST_FAILED']]) {
    const error = toAppError({ code, message: 'SQL secret-token' });
    assert.equal(error.code, expected);
    assert.ok(!error.message.includes('secret-token'));
  }
  await assert.rejects(() => unwrap(Promise.reject(new Error('network detail'))), { code: 'REQUEST_FAILED' });
  const own = new AppError('CUSTOM', 'Mensagem segura');
  assert.equal(toAppError(own), own);
});

test('validação de mídia rejeita SVG, arquivo vazio e imagem acima de 5 MiB', () => {
  assert.equal(validateImage({ type: 'image/png', size: MAX_IMAGE_BYTES }), 'png');
  for (const file of [{ type: 'image/svg+xml', size: 100 }, { type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1 }, { type: 'image/webp', size: 0 }]) {
    assert.throws(() => validateImage(file), { code: 'INVALID_DATA' });
  }
});

test('serviço de mídia usa caminhos novos, não sobrescreve e assina por cinco minutos', async () => {
  const calls = [];
  const storage = {
    from: bucket => ({
      upload: async (path, file, options) => { calls.push({ bucket, path, file, options }); return { data: { path }, error: null }; },
      createSignedUrl: async (path, ttl) => { calls.push({ path, ttl }); return { data: { signedUrl: 'signed-test-url' }, error: null }; },
      remove: async paths => { calls.push({ paths }); return { data: [], error: null }; },
    }),
  };
  const media = createMediaService({ storage });
  const id = '20000000-0000-4000-8000-000000000001';
  const path = await media.upload('product-images', id, { type: 'image/webp', size: 100 });
  assert.equal(calls[0].options.upsert, false);
  assert.equal(calls[0].options.cacheControl, '0');
  assert.ok(path.startsWith(id + '/'));
  assert.deepEqual(await media.signedUrl('product-images', path), { signedUrl: 'signed-test-url' });
  assert.equal(calls[1].ttl, 300);
  await media.remove('product-images', path);
  assert.deepEqual(calls[2].paths, [path]);
  assert.throws(() => media.remove('other-bucket', path), { code: 'INVALID_DATA' });
  await assert.rejects(() => media.upload('product-images', '../escape', { type: 'image/webp', size: 100 }), { code: 'INVALID_DATA' });
});
