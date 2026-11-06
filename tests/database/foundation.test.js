import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const A = '00000000-0000-4000-8000-000000000001';
const B = '00000000-0000-4000-8000-000000000002';
const ADMIN = '00000000-0000-4000-8000-000000000003';
const PA = '20000000-0000-4000-8000-000000000001';
const PB = '20000000-0000-4000-8000-000000000002';
const DRAFT = '20000000-0000-4000-8000-000000000003';
const AA = '30000000-0000-4000-8000-000000000001';
const AB = '30000000-0000-4000-8000-000000000002';
const KEY = '50000000-0000-4000-8000-000000000001';
const rows = async (sql, params) => (await db.query(sql, params)).rows;
const count = async table => Number((await rows(`select count(*) as n from ${table}`))[0].n);
const rejectsCode = (fn, code) => assert.rejects(fn, error => error.code === code);

before(async () => {
  await db.exec(await readFile(new URL('./platform.sql', import.meta.url), 'utf8'));
  const dir = new URL('../../supabase/migrations/', import.meta.url);
  for (const file of (await readdir(dir)).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(new URL(file, dir), 'utf8'));
  }
  await db.exec(await readFile(new URL('./fixtures.sql', import.meta.url), 'utf8'));
});
after(() => db.close());

/** Cada caso reverte seus dados; SET CONSTRAINTS verifica as regras de commit. */
async function as(role, uid, callback) {
  await db.exec('begin');
  try {
    await setRole(role, uid);
    const result = await callback();
    await db.exec('set constraints all immediate');
    return result;
  } finally { await db.exec('rollback'); }
}
async function setRole(role, uid) {
  assert.ok(['postgres', 'anon', 'authenticated', 'service_role'].includes(role));
  await db.exec(`set local role ${role}`);
  await db.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(uid ? { sub: uid } : {})]);
}
async function createOrder({ user = A, address = AA, items = [{ product_id: PA, quantity: 2 }], shipping = 500, key = KEY } = {}) {
  return (await rows('select private.create_order($1,$2,$3::jsonb,$4,$5) as id',
    [user, address, JSON.stringify(items), shipping, key]))[0].id;
}

test('as 15 tabelas da aplicação têm RLS habilitada', async () => {
  const tables = await rows("select tablename,rowsecurity from pg_tables where schemaname='public'");
  assert.equal(tables.length, 15);
  assert.ok(tables.every(t => t.rowsecurity));
});

test('funções SECURITY DEFINER não ficam no schema público nem executáveis por PUBLIC', async () => {
  const functions = await rows(`select n.nspname,p.proname,p.proconfig,
    exists(select 1 from aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where a.grantee=0 and a.privilege_type='EXECUTE') as public_execute
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prosecdef and n.nspname in ('public','private')`);
  assert.ok(functions.length > 0);
  assert.ok(functions.every(f => f.nspname === 'private' && !f.public_execute));
  assert.ok(functions.every(f => f.proconfig.some(c => c.startsWith('search_path='))));
});

test('todas as chaves estrangeiras públicas possuem índice com prefixo compatível', async () => {
  const missing = await rows(`select c.conname from pg_constraint c
    join pg_namespace n on n.oid=c.connamespace
    where c.contype='f' and n.nspname='public' and not exists(
      select 1 from pg_index i where i.indrelid=c.conrelid and i.indisvalid
      and (i.indkey::smallint[])[0:cardinality(c.conkey)-1] = c.conkey
    )`);
  assert.deepEqual(missing, []);
});

test('anônimo vê somente produtos publicados em categorias ativas', () => as('anon', null, async () => {
  assert.deepEqual((await rows('select sku from public.products order by sku')).map(r => r.sku), ['SKU-A', 'SKU-B']);
  assert.equal(await count('public.categories'), 1);
  assert.equal(await count('public.product_images'), 1);
}));

test('anônimo não lê perfis privados', () => rejectsCode(() => as('anon', null,
  () => rows('select * from public.profiles')), '42501'));

test('clientes veem somente o próprio perfil, endereço, carrinho e função', () => as('authenticated', A, async () => {
  assert.deepEqual((await rows('select id from public.profiles')).map(r => r.id), [A]);
  assert.equal(await count('public.addresses'), 1);
  assert.equal(await count('public.carts'), 1);
  assert.equal(await count('public.cart_items'), 1);
  assert.deepEqual(await rows('select role from public.user_roles'), [{ role: 'customer' }]);
}));

test('metadata role=admin não promove conta recém-criada', async () => {
  assert.equal((await rows('select role from public.user_roles where user_id=$1', [A]))[0].role, 'customer');
});

test('cliente não altera a própria função', () => rejectsCode(() => as('authenticated', A,
  () => rows("update public.user_roles set role='admin' where user_id=$1", [A])), '42501'));

test('cliente não cria uma função administrativa', () => rejectsCode(() => as('authenticated', A,
  () => rows("insert into public.user_roles(user_id,role) values($1,'admin')", [A])), '42501'));

test('cliente edita nome e telefone, mas não identificadores protegidos', async () => {
  await as('authenticated', A, async () => {
    await rows("update public.profiles set full_name='Novo nome',phone='+55 11 99999-9999' where id=$1", [A]);
    assert.equal((await rows('select full_name from public.profiles'))[0].full_name, 'Novo nome');
    const result = await rows("update public.profiles set full_name='Intrusão' where id=$1 returning id", [B]);
    assert.equal(result.length, 0);
  });
  await rejectsCode(() => as('authenticated', A,
    () => rows('update public.profiles set id=$1 where id=$2', [B, A])), '42501');
});

test('cliente não cria endereço para outro cliente', () => rejectsCode(() => as('authenticated', A,
  () => rows(`insert into public.addresses(user_id,recipient,postal_code,street,number,neighborhood,city,state)
    values($1,'Pessoa','01001000','Rua','1','Centro','São Paulo','SP')`, [B])), '42501'));

test('cliente não move endereço para outro titular', () => rejectsCode(() => as('authenticated', A,
  () => rows('update public.addresses set user_id=$1 where id=$2', [B, AA])), '42501'));

test('administrador consulta clientes e rascunhos sem poder conceder funções no app', async () => {
  await as('authenticated', ADMIN, async () => {
    assert.equal(await count('public.profiles'), 3);
    assert.equal(await count('public.products'), 4);
  });
  await rejectsCode(() => as('authenticated', ADMIN,
    () => rows("update public.user_roles set role='admin' where user_id=$1", [A])), '42501');
});

test('cliente não altera preço de produto', () => as('authenticated', A, async () => {
  const result = await rows('update public.products set price_cents=1 where id=$1 returning id', [PA]);
  assert.equal(result.length, 0);
  assert.equal((await rows('select price_cents from public.products where id=$1', [PA]))[0].price_cents, 2000);
}));

test('administrador não altera estoque diretamente pela tabela', () => rejectsCode(() => as('authenticated', ADMIN,
  () => rows('update public.products set stock_quantity=999 where id=$1', [PA])), '42501'));

test('função de estoque recusa cliente', () => rejectsCode(() => as('authenticated', A,
  () => rows('select public.adjust_stock($1,2,$2)', [PA, 'Entrada'])), '42501'));

test('ajuste administrativo registra saldo, motivo e ator na mesma transação', () => as('authenticated', ADMIN, async () => {
  const previous = await count('public.stock_movements');
  assert.equal((await rows('select public.adjust_stock($1,-3,$2) as balance', [PA, 'Ajuste conferido']))[0].balance, 7);
  assert.equal(await count('public.stock_movements'), previous + 1);
  const movement = (await rows("select delta,balance_after,reason,actor_id from public.stock_movements where reason='Ajuste conferido'"))[0];
  assert.deepEqual(movement, { delta: -3, balance_after: 7, reason: 'Ajuste conferido', actor_id: ADMIN });
}));

test('ajuste que produziria estoque negativo falha e não deixa movimento', async () => {
  const before = await count('public.stock_movements');
  await rejectsCode(() => as('authenticated', ADMIN,
    () => rows('select public.adjust_stock($1,-11,$2)', [PA, 'Inválido'])), '23514');
  assert.equal((await rows('select stock_quantity from public.products where id=$1', [PA]))[0].stock_quantity, 10);
  assert.equal(await count('public.stock_movements'), before);
});

test('preços e promoções inválidos são rejeitados pelo banco', async () => {
  for (const sql of ["update public.products set price_cents=-1 where id=$1",
    'update public.products set sale_price_cents=2500 where id=$1']) {
    await rejectsCode(() => as('service_role', null, () => rows(sql, [PA])), '23514');
  }
});

test('SKU duplicado e categoria inexistente são rejeitados', async () => {
  await rejectsCode(() => as('service_role', null,
    () => rows("update public.products set sku='SKU-A' where id=$1", [PB])), '23505');
  await rejectsCode(() => as('service_role', null,
    () => rows("update public.products set category_id='11111111-1111-4111-8111-111111111111' where id=$1", [PB])), '23503');
});

test('carrinho rejeita quantidade zero e inserção em carrinho de outro cliente', async () => {
  await rejectsCode(() => as('authenticated', A,
    () => rows('update public.cart_items set quantity=0')), '23514');
  await rejectsCode(() => as('authenticated', A,
    () => rows("insert into public.cart_items(cart_id,product_id,quantity) values('40000000-0000-4000-8000-000000000002',$1,1)", [PA])), '42501');
});

test('pedido usa preços do banco, reserva estoque e mantém pagamento pendente', () => as('service_role', null, async () => {
  const id = await createOrder({ items: [{ product_id: PA, quantity: 2, unit_price_cents: 1 }] });
  const order = (await rows('select subtotal_cents,shipping_cents,total_cents,payment_status from public.orders where id=$1', [id]))[0];
  assert.deepEqual(order, { subtotal_cents: 3000, shipping_cents: 500, total_cents: 3500, payment_status: 'pending' });
  assert.equal((await rows('select stock_quantity from public.products where id=$1', [PA]))[0].stock_quantity, 8);
  assert.equal((await rows('select unit_price_cents from public.order_items where order_id=$1', [id]))[0].unit_price_cents, 1500);
}));

test('repetir uma chave de idempotência não duplica pedido nem saída de estoque', () => as('service_role', null, async () => {
  const id = await createOrder();
  assert.equal(await createOrder(), id);
  assert.equal(await count('public.orders'), 1);
  assert.equal((await rows('select stock_quantity from public.products where id=$1', [PA]))[0].stock_quantity, 8);
}));

test('reutilizar chave com conteúdo diferente é rejeitado', () => rejectsCode(() => as('service_role', null, async () => {
  await createOrder();
  await createOrder({ shipping: 501 });
}), '22023'));

test('pedido rejeita endereço de outro cliente, item repetido, rascunho e falta de estoque', async () => {
  for (const [request, code] of [
    [{ address: AB }, '22023'],
    [{ items: [{ product_id: PA, quantity: 1 }, { product_id: PA, quantity: 2 }] }, '22023'],
    [{ items: [{ product_id: DRAFT, quantity: 1 }] }, '23514'],
    [{ items: [{ product_id: PB, quantity: 3 }] }, '23514'],
    [{ items: [] }, '22023'],
    [{ items: [{ product_id: PA, quantity: 0 }] }, '22023'],
  ]) await rejectsCode(() => as('service_role', null, () => createOrder(request)), code);
});

test('falha após início das gravações reverte pedido, itens e estoque', async () => {
  const movements = await count('public.stock_movements');
  await rejectsCode(() => as('postgres', null, async () => {
    await db.exec(`create function private.test_fail_stock() returns trigger language plpgsql as $$
      begin if new.id='${PB}' then raise exception 'injected failure'; end if; return new; end $$;
      create trigger test_fail_stock before update on public.products for each row execute function private.test_fail_stock();`);
    await setRole('service_role', null);
    await createOrder({ items: [{ product_id: PA, quantity: 2 }, { product_id: PB, quantity: 1 }] });
  }), 'P0001');
  assert.equal(await count('public.orders'), 0);
  assert.equal(await count('public.order_items'), 0);
  assert.equal(await count('public.stock_movements'), movements);
  assert.equal((await rows('select stock_quantity from public.products where id=$1', [PA]))[0].stock_quantity, 10);
});

test('subtotal inconsistente e pedido vazio falham na validação diferida', () => rejectsCode(() => as('service_role', null, async () => {
  await rows(`insert into public.orders(user_id,idempotency_key,request_fingerprint,subtotal_cents,shipping_cents,address_snapshot)
    values($1,$2,'teste',1,0,'{"recipient":"A","postal_code":"01001000","street":"Rua","number":"1","neighborhood":"Centro","city":"Cidade","state":"SP","country":"BR"}')`, [A, KEY]);
}), '23514'));

test('histórico de produto e endereço não muda com alterações posteriores', () => as('service_role', null, async () => {
  const id = await createOrder();
  await rows("update public.products set name='Nome novo',price_cents=4000,sale_price_cents=null where id=$1", [PA]);
  await rows("update public.addresses set street='Nova rua' where id=$1", [AA]);
  const item = (await rows('select product_name,unit_price_cents from public.order_items where order_id=$1', [id]))[0];
  assert.deepEqual(item, { product_name: 'Produto A', unit_price_cents: 1500 });
  assert.equal((await rows("select address_snapshot->>'street' as street from public.orders where id=$1", [id]))[0].street, 'Rua de teste');
}));

test('itens históricos e totais do pedido são imutáveis', async () => {
  for (const sql of ['update public.order_items set unit_price_cents=1 where order_id=$1',
    'update public.orders set subtotal_cents=1 where id=$1']) {
    await rejectsCode(() => as('service_role', null, async () => {
      const id = await createOrder();
      await rows(sql, [id]);
    }), '23514');
  }
});

test('pedido não pode saltar de confirmado para entregue', () => rejectsCode(() => as('service_role', null, async () => {
  const id = await createOrder();
  await rows("update public.orders set status='delivered' where id=$1", [id]);
}), '23514'));

test('cliente B não consulta pedido, itens ou entrega de A', () => as('service_role', null, async () => {
  const id = await createOrder();
  const shipment = (await rows('insert into public.shipments(order_id) values($1) returning id', [id]))[0].id;
  await rows("insert into public.shipment_events(shipment_id,provider_event_id,status,description,occurred_at) values($1,'e1','pending','Teste',now())", [shipment]);
  await setRole('authenticated', B);
  assert.equal((await rows('select id from public.orders')).length, 0);
  assert.equal(await count('public.order_items'), 0);
  assert.equal(await count('public.shipments'), 0);
  assert.equal(await count('public.shipment_events'), 0);
  await setRole('authenticated', A);
  assert.equal((await rows('select id from public.orders')).length, 1);
  assert.equal(await count('public.shipment_events'), 1);
}));

test('checkout interno não é executável por cliente e não tem wrapper público', async () => {
  await rejectsCode(() => as('authenticated', A, () => createOrder()), '42501');
  assert.equal((await rows("select count(*) as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_order'"))[0].n, 0);
});

test('buckets privados configuram limite de 5 MiB e MIME types permitidos', async () => {
  const buckets = await rows('select public,file_size_limit,allowed_mime_types from storage.buckets');
  assert.equal(buckets.length, 2);
  assert.ok(buckets.every(b => !b.public && b.file_size_limit === 5242880));
  assert.ok(buckets.every(b => b.allowed_mime_types.join(',') === 'image/jpeg,image/png,image/webp'));
});

test('anônimo vê apenas arquivo vinculado a produto publicado', () => as('anon', null, async () => {
  assert.equal(await count('storage.objects'), 1);
}));

test('cliente não envia nem remove imagens do catálogo', async () => {
  await rejectsCode(() => as('authenticated', A,
    () => rows("insert into storage.objects(bucket_id,name) values('product-images',$1)",
      [`${PA}/90000000-0000-4000-8000-000000000003.jpg`])), '42501');
  await as('authenticated', A, async () => {
    const deleted = await rows('delete from storage.objects returning id');
    assert.deepEqual(deleted, []);
  });
});

test('administrador pode enviar e remover imagem no caminho de um produto existente', () => as('authenticated', ADMIN, async () => {
  const path = `${PA}/90000000-0000-4000-8000-000000000003.webp`;
  await rows("insert into storage.objects(bucket_id,name) values('product-images',$1)", [path]);
  assert.equal((await rows('delete from storage.objects where name=$1 returning id', [path])).length, 1);
}));

test('upload fora do caminho permitido é bloqueado mesmo para administrador', () => rejectsCode(() => as('authenticated', ADMIN,
  () => rows("insert into storage.objects(bucket_id,name) values('product-images','arquivo.svg')")), '42501'));

test('logs e configurações não vazam para clientes; logs não são editáveis', async () => {
  await as('authenticated', A, async () => {
    assert.equal(await count('public.audit_logs'), 0);
    assert.equal(await count('public.stock_movements'), 0);
    assert.equal(await count('public.store_settings'), 0);
  });
  await rejectsCode(() => as('authenticated', ADMIN,
    () => rows('delete from public.audit_logs')), '42501');
});

const addressPayload = { label: 'Trabalho', recipient: 'Pessoa A', postal_code: '01001000', street: 'Rua teste',
  number: '10', complement: null, neighborhood: 'Centro', city: 'São Paulo', state: 'SP', is_default: true };
const saveAddress = async (id, data, expected = null) => (await rows('select * from public.save_address($1,$2::jsonb,$3)',
  [id, JSON.stringify(data), expected]))[0];

test('cadastro registra aceite do aviso com timestamp do banco e ignora role em metadata', () => as('postgres', null, async () => {
  const id = '00000000-0000-4000-8000-000000000004';
  await rows(`insert into auth.users(id,raw_user_meta_data) values($1,
    '{"full_name":"Pessoa teste","terms_accepted":true,"terms_version":"testing-v1","role":"admin","terms_accepted_at":"1900-01-01"}')`, [id]);
  const profile = (await rows('select terms_accepted_at,terms_version from public.profiles where id=$1', [id]))[0];
  assert.equal(profile.terms_version, 'testing-v1');
  assert.ok(new Date(profile.terms_accepted_at).getFullYear() > 2020);
  assert.equal((await rows('select role from public.user_roles where user_id=$1', [id]))[0].role, 'customer');
}));

test('OAuth não ganha aceite automático; aceite autenticado é idempotente e do próprio titular', () => as('authenticated', A, async () => {
  assert.equal((await rows('select terms_accepted_at from public.profiles where id=$1', [A]))[0].terms_accepted_at, null);
  await rows('select public.accept_test_notice()');
  const accepted = (await rows('select terms_accepted_at from public.profiles where id=$1', [A]))[0].terms_accepted_at;
  await rows('select public.accept_test_notice()');
  assert.deepEqual((await rows('select terms_accepted_at from public.profiles where id=$1', [A]))[0].terms_accepted_at, accepted);
  await setRole('authenticated', B);
  assert.equal((await rows('select terms_accepted_at from public.profiles where id=$1', [B]))[0].terms_accepted_at, null);
}));

test('cliente não escreve timestamps ou versão de aceite diretamente', () => rejectsCode(() => as('authenticated', A,
  () => rows("update public.profiles set terms_accepted_at=now(),terms_version='x' where id=$1", [A])), '42501'));

test('RPC cria endereço com titular derivado da sessão, nunca do payload', () => as('authenticated', A, async () => {
  const address = await saveAddress(null, addressPayload);
  assert.equal(address.user_id, A); assert.equal(address.is_default, true);
  assert.equal(address.country, 'BR');
}));

test('RPC recusa injeção de titular ou identificadores em endereço', () => rejectsCode(() => as('authenticated', A,
  () => saveAddress(null, { ...addressPayload, user_id: B })), '22023'));

test('RPC impede edição de endereço de outro cliente', () => rejectsCode(() => as('authenticated', A,
  () => saveAddress(AB, addressPayload, new Date().toISOString())), 'P0002'));

test('troca de endereço padrão é atômica e mantém somente um padrão', () => as('authenticated', A, async () => {
  await rows('update public.addresses set is_default=true where id=$1', [AA]);
  const created = await saveAddress(null, addressPayload);
  const defaults = await rows('select id from public.addresses where is_default');
  assert.deepEqual(defaults.map(r => r.id), [created.id]);
}));

test('falha na criação de novo padrão reverte o endereço padrão anterior', async () => {
  await rejectsCode(() => as('authenticated', A, async () => {
    await rows('update public.addresses set is_default=true where id=$1', [AA]);
    await saveAddress(null, { ...addressPayload, state: 'XX' });
  }), '23514');
  assert.equal((await rows('select is_default from public.addresses where id=$1', [AA]))[0].is_default, false);
});

test('RPC rejeita edição com versão antiga sem sobrescrever o endereço', () => rejectsCode(() => as('authenticated', A,
  () => saveAddress(AA, addressPayload, '2000-01-01T00:00:00Z')), '40001'));

test('RPC atualiza endereço com versão correta e mantém identidade', () => as('authenticated', A, async () => {
  const existing = (await rows('select updated_at from public.addresses where id=$1', [AA]))[0];
  const result = await saveAddress(AA, addressPayload, existing.updated_at);
  assert.equal(result.id, AA); assert.equal(result.label, 'Trabalho');
}));

test('gate administrativo consulta o papel real no banco', async () => {
  for (const [id, expected] of [[A, false], [ADMIN, true]]) await as('authenticated', id, async () => {
    assert.equal((await rows('select public.admin_access_status() as allowed'))[0].allowed, expected);
  });
});

test('anônimo não executa RPCs de conta nem o gate administrativo', async () => {
  for (const sql of ['select public.accept_test_notice()', 'select public.admin_access_status()',
    "select public.save_address(null,'{}'::jsonb,null)"]) {
    await rejectsCode(() => as('anon', null, () => rows(sql)), '42501');
  }
});

const adminQuery=async(resource,options={})=>(await rows('select public.admin_query($1,$2::jsonb) as result',[resource,JSON.stringify(options)]))[0].result;
const adminMutate=async(operation,id,data={},expected=null,key='70000000-0000-4000-8000-000000000001')=>(await rows(
  'select public.admin_mutate($1,$2,$3::jsonb,$4,$5) as result',[operation,id,JSON.stringify(data),expected,key]))[0].result;
const adminProduct={category_id:'10000000-0000-4000-8000-000000000001',sku:'ADMIN-NEW',slug:'admin-new',name:'Produto administrativo',price_cents:4990,minimum_stock:2,status:'draft',active:true};
const adminCategory={name:'Nova categoria',slug:'nova-categoria',description:'Descrição',sort_order:0,active:true};

test('todas as consultas e gravações administrativas recusam cliente',async()=>{
  await rejectsCode(()=>as('authenticated',A,()=>adminQuery('dashboard')),'42501');
  await rejectsCode(()=>as('authenticated',A,()=>adminMutate('product_save',null,adminProduct)),'42501');
  await rejectsCode(()=>as('anon',null,()=>adminQuery('dashboard')),'42501');
});
test('recibos e fila de mídia permanecem privados',async()=>{
  for(const table of ['private.admin_requests','private.media_cleanup_queue']) await rejectsCode(()=>as('authenticated',ADMIN,()=>rows(`select * from ${table}`)),'42501');
});
test('dashboard e paginação administrativa usam registros do banco',()=>as('authenticated',ADMIN,async()=>{
  const summary=await adminQuery('dashboard');assert.equal(summary.products,4);assert.equal(summary.categories,2);assert.equal(summary.customers,3);assert.equal(summary.paid_total_cents,0);
  const page=await adminQuery('products',{page:1,limit:2});assert.equal(page.items.length,2);assert.equal(page.total,4);assert.equal(page.hasMore,true);
  const filtered=await adminQuery('products',{search:'SKU-A'});assert.equal(filtered.items.length,1);assert.equal(filtered.items[0].id,PA);
}));
test('produto: criar, editar, publicar e excluir sem histórico',()=>as('authenticated',ADMIN,async()=>{
  const created=await adminMutate('product_save',null,adminProduct);assert.equal(created.stock_quantity,0);
  const repeated=await adminMutate('product_save',null,adminProduct);assert.equal(repeated.id,created.id);
  const published=await adminMutate('product_save',created.id,{status:'published'},created.updated_at,'70000000-0000-4000-8000-000000000002');
  assert.equal(published.status,'published');
  await setRole('anon',null);assert.equal((await rows('select id from public.products where id=$1',[created.id])).length,1);
  await setRole('authenticated',ADMIN);
  await adminMutate('product_remove',created.id,{},published.updated_at,'70000000-0000-4000-8000-000000000003');
  assert.equal((await rows('select id from public.products where id=$1',[created.id])).length,0);
}));
test('RPC de produto não aceita estoque, preço inválido nem versão antiga',async()=>{
  await rejectsCode(()=>as('authenticated',ADMIN,()=>adminMutate('product_save',null,{...adminProduct,stock_quantity:99})),'22023');
  await rejectsCode(()=>as('authenticated',ADMIN,()=>adminMutate('product_save',null,{...adminProduct,price_cents:-1})),'23514');
  await rejectsCode(()=>as('authenticated',ADMIN,()=>adminMutate('product_save',PA,{name:'Modificado'},'2000-01-01')),'40001');
});
test('categoria inativa não permite publicar novo produto',()=>rejectsCode(()=>as('authenticated',ADMIN,()=>adminMutate('product_save',null,{...adminProduct,category_id:'10000000-0000-4000-8000-000000000002',status:'published'})),'P0001'));
test('produto com histórico não pode ser excluído, mas pode ser arquivado',async()=>{
  await rejectsCode(()=>as('authenticated',ADMIN,async()=>{const product=await adminQuery('product',{id:PA});await adminMutate('product_remove',PA,{},product.updated_at); }),'P0001');
  await as('authenticated',ADMIN,async()=>{const product=await adminQuery('product',{id:PA});const archived=await adminMutate('product_save',PA,{status:'archived'},product.updated_at);assert.equal(archived.status,'archived');});
});
test('categoria: CRUD e restrição quando possui produtos',async()=>{
  await as('authenticated',ADMIN,async()=>{const created=await adminMutate('category_save',null,adminCategory);const updated=await adminMutate('category_save',created.id,{...adminCategory,name:'Alterada',active:false},created.updated_at,'70000000-0000-4000-8000-000000000002');assert.equal(updated.active,false);await adminMutate('category_remove',created.id,{},updated.updated_at,'70000000-0000-4000-8000-000000000003');});
  await rejectsCode(()=>as('authenticated',ADMIN,async()=>{const category=await adminQuery('category',{id:adminProduct.category_id});await adminMutate('category_remove',category.id,{},category.updated_at); }),'P0001');
});
test('estoque administrativo é idempotente e detecta alteração do saldo',async()=>{
  await as('authenticated',ADMIN,async()=>{const request={delta:3,reason:'Entrada conferida',expected_balance:10};const first=await adminMutate('stock_adjust',PA,request);const again=await adminMutate('stock_adjust',PA,request);assert.equal(first.balance,13);assert.deepEqual(again,first);assert.equal((await rows('select stock_quantity from public.products where id=$1',[PA]))[0].stock_quantity,13);assert.equal((await adminQuery('stock',{id:PA})).items.filter(i=>i.reason==='Entrada conferida').length,1);});
  await rejectsCode(()=>as('authenticated',ADMIN,()=>adminMutate('stock_adjust',PA,{delta:1,reason:'Conflito',expected_balance:9})),'40001');
});
test('mesma chave não pode representar outro ajuste',()=>rejectsCode(()=>as('authenticated',ADMIN,async()=>{await adminMutate('stock_adjust',PA,{delta:1,reason:'Primeiro',expected_balance:10});await adminMutate('stock_adjust',PA,{delta:2,reason:'Segundo',expected_balance:10});}),'P0001'));
test('cancelamento anterior ao envio repõe estoque uma vez e não altera pagamentos',()=>as('service_role',null,async()=>{
  const id=await createOrder();await setRole('authenticated',ADMIN);const order=await adminQuery('order',{id});
  const result=await adminMutate('order_update',id,{status:'cancelled'},order.updated_at);assert.equal(result.status,'cancelled');assert.equal(result.payment_status,'pending');assert.ok(result.stock_released_at);
  await adminMutate('order_update',id,{status:'cancelled'},order.updated_at);
  assert.equal((await rows('select stock_quantity from public.products where id=$1',[PA]))[0].stock_quantity,10);
}));
test('pedido pago exige fluxo de estorno antes de cancelar',()=>rejectsCode(()=>as('service_role',null,async()=>{
  const id=await createOrder();await rows("update public.orders set payment_status='paid' where id=$1",[id]);await setRole('authenticated',ADMIN);const order=await adminQuery('order',{id});await adminMutate('order_update',id,{status:'cancelled'},order.updated_at);
}),'P0001'));
test('status administrativo mantém regras de transição e cria histórico manual de entrega',async()=>{
  await rejectsCode(()=>as('service_role',null,async()=>{const id=await createOrder();await setRole('authenticated',ADMIN);const order=await adminQuery('order',{id});await adminMutate('order_update',id,{status:'delivered'},order.updated_at); }),'23514');
  await as('service_role',null,async()=>{const id=await createOrder();await setRole('authenticated',ADMIN);let order=await adminQuery('order',{id});order=await adminMutate('order_update',id,{status:'preparing'},order.updated_at);order=await adminMutate('order_update',id,{status:'shipped',carrier:'Entrega local',tracking_code:'COD-TESTE',service_name:'Local',note:'Saída registrada pelo operador'},order.updated_at,'70000000-0000-4000-8000-000000000002');assert.equal(order.shipment.provider,'manual');assert.equal(order.shipment.status,'posted');assert.equal((await adminQuery('order',{id})).events.length,1);});
});
test('mídia exige upload e exclusão desvincula antes de remover arquivo',()=>as('authenticated',ADMIN,async()=>{
  const path=`${PA}/90000000-0000-4000-8000-000000000002.jpg`;
  const image=await adminMutate('image_link',PA,{path,alt_text:'Imagem confirmada'});
  await adminMutate('image_update',image.id,{is_primary:true},null,'70000000-0000-4000-8000-000000000002');
  await adminMutate('image_remove',image.id,{},null,'70000000-0000-4000-8000-000000000003');
  const queue=await adminQuery('cleanup');assert.equal(queue.total,1);
  await rows('delete from storage.objects where bucket_id=$1 and name=$2',['product-images',path]);
  await adminMutate('cleanup_complete',queue.items[0].id,{},null,'70000000-0000-4000-8000-000000000004');assert.equal((await adminQuery('cleanup')).total,0);
}));
test('arquivo vinculado não pode entrar na limpeza e mídia inexistente não vira imagem',async()=>{
  await rejectsCode(()=>as('authenticated',ADMIN,()=>adminMutate('cleanup_enqueue',null,{bucket:'product-images',path:`${PA}/90000000-0000-4000-8000-000000000001.jpg`})),'P0001');
  await rejectsCode(()=>as('authenticated',ADMIN,()=>adminMutate('image_link',PA,{path:`${PA}/90000000-0000-4000-8000-000000000099.jpg`})),'P0001');
});
test('pasta sem vínculo é consultável e arquivo enfileirado não pode ser revinculado',async()=>{
  const path=`${PA}/90000000-0000-4000-8000-000000000002.jpg`;
  await as('authenticated',ADMIN,async()=>{
    const files=await adminQuery('orphans',{id:PA,bucket:'product-images'});
    assert.ok(files.items.some(file=>file.path===path));
    assert.ok(!files.items.some(file=>file.path.endsWith('000000000001.jpg')));
  });
  await rejectsCode(()=>as('authenticated',ADMIN,async()=>{
    await adminMutate('cleanup_enqueue',null,{bucket:'product-images',path});
    await adminMutate('image_link',PA,{path},null,'70000000-0000-4000-8000-000000000002');
  }),'P0001');
});
test('imagem de categoria usa Storage e sua troca enfileira o arquivo anterior',()=>as('authenticated',ADMIN,async()=>{
  const id=adminProduct.category_id;let category=await adminQuery('category',{id});const first=`${id}/90000000-0000-4000-8000-000000000001.png`;
  await rows("insert into storage.objects(bucket_id,name) values('category-images',$1)",[first]);category=await adminMutate('category_image',id,{path:first},category.updated_at);
  await adminMutate('category_image',id,{path:null},category.updated_at,'70000000-0000-4000-8000-000000000002');assert.equal((await adminQuery('cleanup')).items[0].path,first);
}));
test('configurações têm validação, persistência e controle de versão',()=>as('authenticated',ADMIN,async()=>{
  const values={store_name:'Pupi',contact_email:'loja@example.com',origin_postal_code:'01001000',low_stock_threshold:5};await adminMutate('settings_save',null,{values,expected:{}});
  const settings=await adminQuery('settings');assert.equal(settings.length,4);assert.equal(settings.find(s=>s.key==='low_stock_threshold').value,5);
}));
test('configurações rejeitam segredo, versão antiga e tipo inválido',async()=>{
  const valid={store_name:'Pupi',contact_email:'loja@example.com',origin_postal_code:'01001000',low_stock_threshold:5};
  for(const values of [{...valid,secret_key:'forbidden'},{...valid,low_stock_threshold:-1},{...valid,contact_email:'invalido'}])
    await rejectsCode(()=>as('authenticated',ADMIN,()=>adminMutate('settings_save',null,{values,expected:{}})),'22023');
  await rejectsCode(()=>as('authenticated',ADMIN,async()=>{
    await adminMutate('settings_save',null,{values:valid,expected:{}});
    await adminMutate('settings_save',null,{values:{...valid,store_name:'Modificado'},expected:{store_name:'2000-01-01T00:00:00Z'}},null,'70000000-0000-4000-8000-000000000002');
  }),'40001');
});
test('consulta administrativa de clientes inclui somente dados necessários e histórico',()=>as('authenticated',ADMIN,async()=>{
  const list=await adminQuery('customers');assert.equal(list.total,3);assert.equal(list.items.length,3);
  const detail=await adminQuery('customer',{id:A});assert.equal(detail.customer.id,A);assert.equal(detail.total,0);assert.equal(detail.customer.encrypted_password,undefined);
}));

async function preparedQuote() {
  await rows("insert into public.store_settings(key,value) values('origin_postal_code','\"01001000\"'::jsonb)");
  await rows('update public.products set weight_grams=500,width_mm=100,height_mm=100,length_mm=100 where id=$1',[PA]);
  const snapshot=(await rows('select public.service_quote_snapshot($1,$2) as data',[A,AA]))[0].data;
  const quote=(await rows("select public.service_register_shipping_quote($1,$2,$3::jsonb,500,'Correios','PAC','1',now()+interval '10 minutes') as id",[A,AA,JSON.stringify(snapshot)]))[0].id;
  return {quote,snapshot};
}
test('cotação e confirmação são exclusivas de backend confiável',async()=>{
  await rejectsCode(()=>as('authenticated',A,()=>rows('select public.service_quote_snapshot($1,$2)',[A,AA])),'42501');
  await rejectsCode(()=>as('anon',null,()=>rows('select public.service_confirm_shipping_order($1,$2,$3)',[A,KEY,KEY])),'42501');
  await rejectsCode(()=>as('authenticated',ADMIN,()=>rows('select * from private.shipping_quotes')),'42501');
});
test('checkout confiável usa cotação, cria pedido e entrega uma vez e limpa carrinho',()=>as('service_role',null,async()=>{
  const {quote}=await preparedQuote();
  const order=(await rows('select public.service_confirm_shipping_order($1,$2,$3) as id',[A,quote,KEY]))[0].id;
  const again=(await rows('select public.service_confirm_shipping_order($1,$2,$3) as id',[A,quote,KEY]))[0].id;
  assert.equal(order,again);
  const saved=(await rows('select subtotal_cents,shipping_cents,payment_status from public.orders where id=$1',[order]))[0];
  assert.equal(Number(saved.subtotal_cents),1500);assert.equal(saved.shipping_cents,500);assert.equal(saved.payment_status,'pending');
  assert.equal((await rows('select stock_quantity from public.products where id=$1',[PA]))[0].stock_quantity,9);
  assert.equal((await rows('select count(*)::integer as n from public.cart_items where cart_id=$1',['40000000-0000-4000-8000-000000000001']))[0].n,0);
  const shipment=(await rows('select provider,status,carrier from public.shipments where order_id=$1',[order]))[0];
  assert.deepEqual(shipment,{provider:'melhor_envio',status:'pending',carrier:'Correios'});
}));
test('cotação pertence ao titular e exige carrinho e endereço inalterados',async()=>{
  await rejectsCode(()=>as('service_role',null,async()=>{const {quote}=await preparedQuote();await rows('select public.service_confirm_shipping_order($1,$2,$3)',[B,quote,KEY]);}),'42501');
  await rejectsCode(()=>as('service_role',null,async()=>{const {quote}=await preparedQuote();await rows('update public.cart_items set quantity=2 where cart_id=$1',['40000000-0000-4000-8000-000000000001']);await rows('select public.service_confirm_shipping_order($1,$2,$3)',[A,quote,KEY]);}),'40001');
  await rejectsCode(()=>as('service_role',null,async()=>{const {quote}=await preparedQuote();await rows("update public.store_settings set value='\"20040020\"'::jsonb where key='origin_postal_code'");await rows('select public.service_confirm_shipping_order($1,$2,$3)',[A,quote,KEY]);}),'40001');
  await rejectsCode(()=>as('service_role',null,async()=>{const {quote}=await preparedQuote();await rows('update private.shipping_quotes set expires_at=now()-interval \'1 second\' where id=$1',[quote]);await rows('select public.service_confirm_shipping_order($1,$2,$3)',[A,quote,KEY]);}),'40001');
});

const invoiceKey='35261112345678000195550010000001231123456788';
test('chave NF-e exige administrador e permanece em tabela privada',async()=>{
  await rejectsCode(()=>as('authenticated',A,()=>rows('select public.admin_invoice_get($1)',[KEY])),'42501');
  await rejectsCode(()=>as('anon',null,()=>rows('select public.admin_invoice_save($1,$2,null)',[KEY,invoiceKey])),'42501');
  await rejectsCode(()=>as('authenticated',ADMIN,()=>rows('select * from private.order_invoices')),'42501');
});
test('administrador associa chave NF-e válida ao pedido de forma idempotente',()=>as('service_role',null,async()=>{
  const id=await createOrder();await setRole('authenticated',ADMIN);
  const first=(await rows('select public.admin_invoice_save($1,$2,null) as data',[id,invoiceKey]))[0].data;
  const again=(await rows('select public.admin_invoice_save($1,$2,null) as data',[id,invoiceKey]))[0].data;
  assert.deepEqual(first,again);assert.equal((await rows('select public.admin_invoice_get($1) as data',[id]))[0].data.access_key,invoiceKey);
}));
test('chave com dígito inválido ou modelo incompatível é recusada',async()=>{
  for(const invalid of [invoiceKey.slice(0,43)+'0',invoiceKey.slice(0,20)+'65'+invoiceKey.slice(22)])
    await rejectsCode(()=>as('authenticated',ADMIN,()=>rows('select public.admin_invoice_save($1,$2,null)',[KEY,invalid])),'22023');
});
test('edição de chave NF-e detecta versão anterior',()=>rejectsCode(()=>as('service_role',null,async()=>{
  const id=await createOrder();await setRole('authenticated',ADMIN);
  await rows('select public.admin_invoice_save($1,$2,null)',[id,invoiceKey]);
  await rows("select public.admin_invoice_save($1,$2,'2000-01-01')",[id,'35261112345678000195550010000001241123456785']);
}),'40001'));
