-- Dados sintéticos exclusivos dos testes; não fazem parte das migrations/seeds.
insert into auth.users(id,raw_user_meta_data) values
 ('00000000-0000-4000-8000-000000000001','{"full_name":"Cliente A","role":"admin"}'),
 ('00000000-0000-4000-8000-000000000002','{"full_name":"Cliente B"}'),
 ('00000000-0000-4000-8000-000000000003','{"full_name":"Operador"}');
update public.user_roles set role='admin' where user_id='00000000-0000-4000-8000-000000000003';
insert into public.categories(id,name,slug,active) values
 ('10000000-0000-4000-8000-000000000001','Categoria ativa','ativa',true),
 ('10000000-0000-4000-8000-000000000002','Categoria inativa','inativa',false);
insert into public.products(id,category_id,sku,slug,name,price_cents,sale_price_cents,stock_quantity,status) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','SKU-A','produto-a','Produto A',2000,1500,10,'published'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','SKU-B','produto-b','Produto B',3000,null,2,'published'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','SKU-D','rascunho','Rascunho',1000,null,0,'draft'),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','SKU-I','inativo','Categoria inativa',1000,null,1,'published');
insert into public.addresses(id,user_id,recipient,postal_code,street,number,neighborhood,city,state) values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','Pessoa A','01001000','Rua de teste','1','Centro','São Paulo','SP'),
 ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','Pessoa B','20040020','Rua de teste','2','Centro','Rio de Janeiro','RJ');
insert into public.carts(id,user_id) values
 ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
 ('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
insert into public.cart_items(cart_id,product_id,quantity) values
 ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',1),
 ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002',1);
insert into public.product_images(product_id,storage_path) values
 ('20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000001.jpg'),
 ('20000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003/90000000-0000-4000-8000-000000000001.jpg');
insert into storage.objects(bucket_id,name) select 'product-images',storage_path from public.product_images;
insert into storage.objects(bucket_id,name) values
 ('product-images','20000000-0000-4000-8000-000000000001/90000000-0000-4000-8000-000000000002.jpg');
