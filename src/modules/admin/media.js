import {makeForm,cleanForm} from '../../ui/forms.js';
import {AppError,toAppError} from '../../utils/errors.js';
import {el,link,button,panel,adminLink,actionButton,notFound,listPager} from './common.js';

async function preview(context,bucket,path,alt) {
  try {
    const data=await context.media.signedUrl(bucket,path);
    return el('img',{src:data.signedUrl,alt,width:180,height:180,loading:'lazy',className:'media-preview'});
  }catch{return el('p',{className:'media-placeholder'},'Prévia indisponível. Recarregue a página para tentar novamente.');}
}
function uploadForm(context,bucket,entity) {
  const completed=new Set();const statusList=el('ul',{className:'upload-results','aria-live':'polite'});
  const form=makeForm({name:'Enviar imagens',submitLabel:bucket==='product-images'?'Enviar imagens':'Enviar imagem',persist:true,onBusy:context.busy,
    fields:[{name:'files',label:bucket==='product-images'?'Arquivos de imagem':'Arquivo de imagem',type:'file',accept:'image/jpeg,image/png,image/webp',multiple:bucket==='product-images',required:true,hint:'JPEG, PNG ou WebP, até 5 MiB por arquivo. A imagem só fica disponível após o vínculo ser confirmado.'}],
    onSubmit:async(values,node)=>{
      if(!values.files?.length)throw new AppError('INVALID_DATA','Escolha pelo menos uma imagem.');
      statusList.replaceChildren();let failures=0;let sent=0;
      for(const file of values.files){
        const key=JSON.stringify([file.name,file.size,file.lastModified]);
        const row=el('li',{},`${file.name} · aguardando`);statusList.append(row);
        if(completed.has(key)){row.textContent=`${file.name} · já enviado`;sent++;continue;}
        row.textContent=`${file.name} · enviando e confirmando`;
        try{await context.media.upload(bucket,entity.id,file,entity.updated_at);completed.add(key);sent++;row.textContent=`${file.name} · vínculo confirmado`;}
        catch(error){failures++;row.textContent=`${file.name} · ${toAppError(error).message}`;
          row.append(button('Remover da fila',()=>{
            const input=node.elements.namedItem('files');const transfer=new DataTransfer();
            for(const current of input.files)if(current!==file)transfer.items.add(current);
            input.files=transfer.files;row.remove();
          },'ghost'));
        }
      }
      if(failures)throw new AppError('UPLOAD_PARTIAL',`${sent} arquivo(s) confirmado(s); ${failures} com falha. Remova os inválidos ou repita para confirmar apenas os pendentes.`);
      cleanForm(node);const cleanup=await context.media.flush().catch(()=>({pending:1}));
      await context.go(context.current,{force:true});context.announce(cleanup.pending?'Imagens vinculadas. Há arquivos aguardando limpeza; use Tentar limpeza.':'Imagens enviadas e vinculadas.','success');
    },
  });
  return el('section',{className:'media-upload'},[el('h2',{},'Enviar arquivos'),form,statusList]);
}
export function cleanupPanel(context,orphans,pending,bucket,id) {
  const section=el('section',{className:'media-cleanup'},[
    el('h2',{},'Limpeza de arquivos'),el('p',{className:'muted'},`${pending.total} arquivo(s) na fila de remoção. Os vínculos já removidos não recebem novas URLs do catálogo.`),
    actionButton('Tentar limpeza',async()=>{const result=await context.media.flush();if(result.pending)throw new AppError('REQUEST_FAILED',`${result.removed} arquivo(s) removido(s); ${result.pending} ainda pendente(s). A fila foi preservada.`);},context,{success:'Limpeza concluída.'}),
  ]);
  if(orphans.items.length){
    section.append(el('h3',{},'Arquivos sem vínculo nesta pasta'),el('p',{className:'muted'},'Uploads interrompidos podem aparecer aqui. Cada remoção confere no banco se o arquivo continua sem vínculo.'));
    section.append(el('ul',{className:'record-list'},orphans.items.map(file=>el('li',{className:'record-card'},[
      el('p',{},file.path.split('/').pop()),actionButton('Remover arquivo sem vínculo',async()=>{await context.admin.mutate('cleanup_enqueue',null,{bucket:file.bucket,path:file.path});const result=await context.media.flush();if(result.pending)context.announce('Remoção registrada; há arquivos pendentes na fila.');},context,
        {success:'Remoção do arquivo processada.',confirm:{title:'Remover arquivo sem vínculo?',description:'O arquivo será excluído do armazenamento. A operação só prossegue se ele não estiver em uso.',confirmLabel:'Remover arquivo',danger:true}}),
    ]))));
    if(orphans.hasMore)section.append(el('p',{className:'muted'},'Mostrando os primeiros 20 arquivos. Depois da limpeza, recarregue para consultar os próximos.'));
  }
  return section;
}

export async function productMedia(context,id,options={}) {
  const [product,gallery,orphans,pending]=await Promise.all([
    context.admin.query('product',{id},context.signal),context.admin.query('images',{id,page:options.page||1},context.signal),
    context.admin.query('orphans',{id,bucket:'product-images'},context.signal),context.admin.query('cleanup',{},context.signal),
  ]);
  if(!product)return notFound('Produto indisponível','/admin/produtos');
  if(options.image){
    const image=gallery.items.find(item=>item.id===options.image);
    if(!image)return notFound('Imagem indisponível',`/admin/produtos/${id}/imagens`);
    const form=makeForm({name:'Dados da imagem',submitLabel:'Salvar dados da imagem',persist:true,onBusy:context.busy,fields:[
      {name:'alt_text',label:'Texto alternativo',value:image.alt_text,maxLength:300,hint:'Descreva a imagem para quem não pode vê-la.'},
      {name:'sort_order',label:'Posição na galeria',value:image.sort_order,inputmode:'numeric',required:true},
    ],onSubmit:async(values,node)=>{
      if(!/^\d+$/.test(values.sort_order)||Number(values.sort_order)>2147483647)throw new AppError('INVALID_DATA','A posição precisa ser um número inteiro a partir de zero.');
      await context.admin.mutate('image_update',image.id,{alt_text:values.alt_text.trim(),sort_order:Number(values.sort_order)});cleanForm(node);
      await context.go(`/admin/produtos/${id}/imagens?page=${options.page||1}`,{force:true});context.announce('Dados da imagem salvos.','success');
    }});
    return panel('Editar dados da imagem',product.name,[await preview(context,'product-images',image.storage_path,image.alt_text||product.name),form,adminLink('Cancelar',`/admin/produtos/${id}/imagens?page=${options.page||1}`)]);
  }
  const cards=await Promise.all(gallery.items.map(async image=>el('li',{className:'record-card media-card'},[
    await preview(context,'product-images',image.storage_path,image.alt_text||product.name),
    el('p',{},image.alt_text||'Sem texto alternativo'),el('small',{className:'muted'},`Posição ${image.sort_order}${image.is_primary?' · Principal':''}`),
    el('div',{className:'row-actions'},[
      adminLink('Editar dados',`/admin/produtos/${id}/imagens?page=${options.page||1}&image=${image.id}`),
      !image.is_primary?actionButton('Definir como principal',()=>context.admin.mutate('image_update',image.id,{is_primary:true}),context,{success:'Imagem principal atualizada.'}):el('span',{className:'badge'},'Imagem principal'),
      actionButton('Remover imagem',async()=>{await context.admin.mutate('image_remove',image.id);await context.media.flush().catch(()=>{});},context,{tone:'danger',success:'Imagem desvinculada. Confira a fila de limpeza abaixo.',confirm:{title:'Remover imagem do produto?',description:'O vínculo será removido e o arquivo será enviado à fila de exclusão do armazenamento.',confirmLabel:'Remover imagem',danger:true}}),
    ]),
  ])));
  return panel('Imagens do produto',product.name,[
    uploadForm(context,'product-images',product),gallery.items.length?el('ul',{className:'media-grid'},cards):el('p',{},'Nenhuma imagem cadastrada.'),
    listPager({page:options.page||1,total:gallery.total,hasMore:gallery.hasMore,path:`/admin/produtos/${id}/imagens`,go:context.go}),
    cleanupPanel(context,orphans,pending,'product-images',id),
  ],[adminLink('Voltar ao produto',`/admin/produtos/${id}`)]);
}
export async function categoryMedia(context,id) {
  const [category,orphans,pending]=await Promise.all([context.admin.query('category',{id},context.signal),
    context.admin.query('orphans',{id,bucket:'category-images'},context.signal),context.admin.query('cleanup',{},context.signal)]);
  if(!category)return notFound('Categoria indisponível','/admin/categorias');
  const content=[];
  if(category.image_path)content.push(await preview(context,'category-images',category.image_path,category.name),
    actionButton('Remover imagem da categoria',async()=>{await context.admin.mutate('category_image',id,{path:null},category.updated_at);await context.media.flush().catch(()=>{});},context,
      {tone:'danger',success:'Imagem desvinculada. Confira a fila de limpeza.',confirm:{title:'Remover imagem da categoria?',description:'A categoria permanece cadastrada. O arquivo será enviado à fila de exclusão.',confirmLabel:'Remover imagem',danger:true}}));
  content.push(uploadForm(context,'category-images',category),cleanupPanel(context,orphans,pending,'category-images',id));
  return panel('Imagem da categoria',category.name,content,[adminLink('Voltar à categoria',`/admin/categorias/${id}`)]);
}
