import {installApi,user} from './api.js';
export const CAT='10000000-0000-4000-8000-000000000001';
export const PRODUCT='20000000-0000-4000-8000-000000000001';
const created='2026-11-05T12:00:00.000Z';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j4XcAAAAASUVORK5CYII=','base64');
export const pngFile={name:'imagem-teste.png',mimeType:'image/png',buffer:png};
export async function installAdminApi(page) {
  const api=await installApi(page,{signedIn:true,role:'admin'});
  const state={categories:[],products:[],images:[],banners:[],movements:[],settings:[],jobs:[],files:new Map(),fileBytes:new Map(),receipts:new Map(),failRemove:false,failNext:0,loseReply:false,requestKeys:[],...api};
  // As leituras de perfil/role continuam pertencendo ao adaptador da Fase 2.
  let counter=10;const id=()=>`90000000-0000-4000-8000-${String(++counter).padStart(12,'0')}`;
  const ok=data=>({data});const error=(message,code='P0001',status=400)=>({data:{message,code},status});
  const stamp=()=>new Date(Date.now()+counter++).toISOString();
  const paged=(items,options)=>{const size=options.limit||20;const start=((options.page||1)-1)*size;return{items:items.slice(start,start+size),total:items.length,hasMore:start+size<items.length,page:options.page||1};};
  const linked=(bucket,path)=>bucket==='banner-images'?state.banners.some(b=>b.mobile_path===path||b.desktop_path===path):bucket==='product-images'?state.images.some(i=>i.storage_path===path):state.categories.some(c=>c.image_path===path);
  const enqueue=(bucket,path)=>{if(path&&!state.jobs.some(j=>j.bucket===bucket&&j.path===path))state.jobs.push({id:id(),bucket,path});};
  const products=()=>state.products.map(p=>({...p,category_name:state.categories.find(c=>c.id===p.category_id)?.name||'Categoria'}));
  api.adminQuery=async({p_resource:resource,p_options:options={}})=>{
    const search=(options.search||'').toLowerCase();
    if(resource==='banners')return ok(paged(state.banners.filter(b=>b.title.toLowerCase().includes(search)).sort((a,b)=>a.sort_order-b.sort_order||a.id.localeCompare(b.id)),options));
    if(resource==='banner')return ok(state.banners.find(b=>b.id===options.id)||null);
    if(resource==='dashboard')return ok({products:state.products.length,categories:state.categories.length,customers:1,orders:api.orders.length,
      pending_orders:api.orders.filter(o=>['confirmed','preparing'].includes(o.status)).length,completed_orders:api.orders.filter(o=>o.status==='delivered').length,
      paid_orders:0,paid_total_cents:0,low_stock_count:state.products.filter(p=>p.stock_quantity<=p.minimum_stock).length,
      low_stock:state.products.filter(p=>p.stock_quantity<=p.minimum_stock).slice(0,8),recent_orders:[]});
    if(resource==='categories')return ok(paged(state.categories.filter(c=>c.name.toLowerCase().includes(search)).map(c=>({...c,product_count:state.products.filter(p=>p.category_id===c.id).length})),options));
    if(resource==='category')return ok(state.categories.find(c=>c.id===options.id)||null);
    if(resource==='products')return ok(paged(products().filter(p=>(p.name+' '+p.sku).toLowerCase().includes(search)&&(!options.status||p.status===options.status)&&(!options.active||p.active===JSON.parse(options.active))&&(!options.low_stock||p.stock_quantity<=p.minimum_stock)),options));
    if(resource==='product')return ok(products().find(p=>p.id===options.id)||null);
    if(resource==='images')return ok(paged(state.images.filter(i=>i.product_id===options.id).sort((a,b)=>a.sort_order-b.sort_order),options));
    if(resource==='stock')return ok({product:state.products.find(p=>p.id===options.id),...paged(state.movements.filter(m=>m.product_id===options.id),options)});
    if(resource==='settings')return ok(state.settings);
    if(resource==='cleanup')return ok(paged(state.jobs,options));
    if(resource==='orphans')return ok(paged([...state.files.values()].filter(file=>file.bucket===options.bucket&&file.path.startsWith(options.id+'/')&&!linked(file.bucket,file.path)),options));
    if(resource==='orders')return ok(paged(api.orders.filter(o=>(!search||String(o.order_number).includes(search.replace('#',''))||o.id.includes(search))&&(!options.status||o.status===options.status)),options));
    if(resource==='order')return ok(api.orders.find(o=>o.id===options.id)||null);
    if(resource==='customers')return ok(paged([{...api.profile,email:user.email,role:'admin',order_count:api.orders.length}].filter(c=>(c.full_name+' '+c.email).toLowerCase().includes(search)),options));
    if(resource==='customer')return ok({customer:{...api.profile,email:user.email,role:'admin'},...paged(api.orders,options)});
    return error('unknown resource');
  };
  api.adminMutate=async request=>{
    const {p_operation:op,p_id:entityId,p_data:data,p_expected:expected,p_request_key:key}=request;state.requestKeys.push(key);
    if(state.receipts.has(key))return ok(state.receipts.get(key));
    if(state.failNext>0){state.failNext--;return error('raw database detail','PGRST000',503);}
    let result;
    if(op==='banner_save'){
      const existing=state.banners.find(b=>b.id===entityId);
      if(existing&&existing.updated_at!==expected)return error('changed','40001',409);
      if(data.active&&(!existing?.mobile_path||!existing?.desktop_path))return error('banner_images_required');
      result={id:existing?.id||id(),mobile_path:null,desktop_path:null,created_at:created,...existing,...data,updated_at:stamp()};
      if(existing)Object.assign(existing,result);else state.banners.push(result);
    }else if(op==='banner_image'){
      const existing=state.banners.find(b=>b.id===entityId);
      if(existing.updated_at!==expected)return error('changed','40001',409);
      const previous=existing[data.variant+'_path'];
      existing[data.variant+'_path']=data.path;existing.updated_at=stamp();if(previous!==data.path)enqueue('banner-images',previous);result=existing;
    }else if(op==='banner_remove'){
      const existing=state.banners.find(b=>b.id===entityId);
      if(existing.updated_at!==expected)return error('changed','40001',409);
      state.banners=state.banners.filter(b=>b.id!==entityId);
      for(const file of state.files.values())if(file.bucket==='banner-images'&&file.path.startsWith(entityId+'/'))enqueue(file.bucket,file.path);
      result={id:entityId};
    }else if(op==='category_save'){
      const existing=state.categories.find(c=>c.id===entityId);
      if(existing&&existing.updated_at!==expected)return error('changed','40001',409);
      result={id:existing?.id||id(),image_path:null,created_at:created,...existing,...data,updated_at:stamp()};
      if(existing)Object.assign(existing,result);else state.categories.push(result);
    }else if(op==='category_remove'){
      if(state.products.some(p=>p.category_id===entityId))return error('category_has_products');
      if(state.categories.find(c=>c.id===entityId)?.image_path)return error('remove_images_first');
      state.categories=state.categories.filter(c=>c.id!==entityId);result={id:entityId};
    }else if(op==='product_save'){
      const existing=state.products.find(p=>p.id===entityId);
      if(existing&&existing.updated_at!==expected)return error('changed','40001',409);
      result={id:existing?.id||id(),stock_quantity:0,created_at:created,...existing,...data,updated_at:stamp()};
      if(result.status==='published'&&!state.categories.find(c=>c.id===result.category_id)?.active)return error('category_not_active');
      if(existing)Object.assign(existing,result);else state.products.push(result);
    }else if(op==='product_remove'){
      if(state.movements.some(m=>m.product_id===entityId))return error('product_has_history');
      if(state.images.some(i=>i.product_id===entityId))return error('remove_images_first');
      state.products=state.products.filter(p=>p.id!==entityId);result={id:entityId};
    }else if(op==='stock_adjust'){
      const product=state.products.find(p=>p.id===entityId);
      if(product.stock_quantity!==data.expected_balance)return error('changed','40001',409);
      if(product.stock_quantity+data.delta<0)return error('negative','23514');
      product.stock_quantity+=data.delta;product.updated_at=stamp();
      state.movements.unshift({id:id(),product_id:entityId,delta:data.delta,balance_after:product.stock_quantity,reason:data.reason,created_at:stamp(),actor_name:'Operador de teste'});
      result={id:entityId,balance:product.stock_quantity};
    }else if(op==='image_link'){
      const image={id:id(),product_id:entityId,storage_path:data.path,alt_text:data.alt_text||'',is_primary:!state.images.some(i=>i.product_id===entityId),sort_order:0};
      state.images.push(image);result=image;
    }else if(op==='image_update'){
      const image=state.images.find(i=>i.id===entityId);
      if(data.is_primary)state.images.filter(i=>i.product_id===image.product_id).forEach(i=>{i.is_primary=false;});
      Object.assign(image,data);result=image;
    }else if(op==='image_remove'){
      const image=state.images.find(i=>i.id===entityId);state.images=state.images.filter(i=>i.id!==entityId);enqueue('product-images',image.storage_path);result={id:entityId};
    }else if(op==='category_image'){
      const category=state.categories.find(c=>c.id===entityId);const previous=category.image_path;category.image_path=data.path||null;category.updated_at=stamp();if(previous!==category.image_path)enqueue('category-images',previous);result=category;
    }else if(op==='cleanup_enqueue'){
      if(linked(data.bucket,data.path))return error('media_still_linked');enqueue(data.bucket,data.path);result={queued:true};
    }else if(op==='cleanup_complete'){
      const job=state.jobs.find(j=>j.id===entityId);if(job&&state.files.has(`${job.bucket}/${job.path}`))return error('media_file_exists');state.jobs=state.jobs.filter(j=>j.id!==entityId);result={id:entityId};
    }else if(op==='settings_save'){
      state.settings=Object.entries(data.values).map(([key,value])=>({key,value,updated_at:stamp()}));result={saved:true};
    }else if(op==='order_update'){
      const order=api.orders.find(o=>o.id===entityId);order.status=data.status;order.updated_at=stamp();
      if(data.carrier){order.shipment={id:id(),carrier:data.carrier,service_name:data.service_name,tracking_code:data.tracking_code,status:data.status==='shipped'?'posted':'pending'};order.events.push({id:id(),status:order.shipment.status,description:'Atualização manual do painel',occurred_at:stamp()});}
      result=order;
    }else return error('unknown operation');
    const snapshot=JSON.parse(JSON.stringify(result));state.receipts.set(key,snapshot);
    if(state.loseReply){state.loseReply=false;return error('response lost','PGRST000',503);}
    return ok(snapshot);
  };
  await page.route('https://pupi-test.supabase.co/storage/v1/**',async route=>{
    const request=route.request();const url=new URL(request.url());const method=request.method();
    const prefix='/storage/v1/object/';const tail=decodeURIComponent(url.pathname.slice(prefix.length));
    const json=(data,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
    if(tail.startsWith('sign/')) {
      if(method==='POST')return json({signedURL:`/object/${tail}?token=e2e`});
      return route.fulfill({status:200,contentType:'image/png',body:state.fileBytes.get(tail.slice(5))||png});
    }
    if(tail.startsWith('list/')){
      const bucket=tail.slice(5);const data=request.postDataJSON();return json([...state.files.values()].filter(f=>f.bucket===bucket&&f.path.startsWith(data.prefix+'/')).map(f=>({name:f.path.split('/').pop(),id:'file-id'})));
    }
    const [bucket,...segments]=tail.split('/');const path=segments.join('/');
    if(method==='POST'){
      state.files.set(`${bucket}/${path}`,{bucket,path});let bytes=request.postDataBuffer();
      if(request.headers()['content-type']?.startsWith('multipart/form-data')){
        const form=await new Request(request.url(),{method:'POST',headers:request.headers(),body:bytes}).formData();
        const file=[...form.values()].find(value=>typeof value.arrayBuffer==='function');
        if(file)bytes=Buffer.from(await file.arrayBuffer());
      }
      state.fileBytes.set(`${bucket}/${path}`,bytes);return json({Key:`${bucket}/${path}`,Id:id()});
    }
    if(method==='DELETE'){
      if(state.failRemove)return json({statusCode:'503',message:'Storage temporarily unavailable',error:'unavailable'},503);
      for(const path of request.postDataJSON().prefixes)state.files.delete(`${bucket}/${path}`);return json([]);
    }
    return json({message:'unhandled storage'},400);
  });
  state.seed=()=>{
    state.categories.push({id:CAT,name:'Alimentação',slug:'alimentacao',description:'',sort_order:0,active:true,image_path:null,created_at:created,updated_at:created});
    state.products.push({id:PRODUCT,category_id:CAT,name:'Ração de teste',title:'',slug:'racao-de-teste',sku:'RAC-TEST',description:'',short_description:'',price_cents:4990,sale_price_cents:null,stock_quantity:10,minimum_stock:2,active:true,featured:false,status:'draft',created_at:created,updated_at:created});
  };
  return state;
}
