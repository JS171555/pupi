import {makeForm,cleanForm} from '../../ui/forms.js';
import {ValidationError} from '../auth/validation.js';
import {bannerFormats,validateBannerImage} from '../../services/banner-images.js';
import {toAppError} from '../../utils/errors.js';
import {el,button,panel,adminLink,actionButton,notFound,listPager,filterBar,adminURL} from './common.js';
import {cleanupPanel} from './media.js';

async function bannerPreview(context,banner,variant) {
  const path=banner[variant+'_path'];
  const frame=el('div',{className:`banner-preview banner-preview-${variant}`});
  if(!path){frame.append(el('span',{},'Sem imagem'));return frame;}
  try {
    const {signedUrl}=await context.media.signedUrl('banner-images',path);
    const image=el('img',{src:signedUrl,alt:banner.title,loading:'lazy'});
    image.addEventListener('error',()=>frame.replaceChildren(el('span',{},'Prévia indisponível')),{once:true});
    frame.append(image);
  }catch{frame.append(el('span',{},'Prévia indisponível'));}
  return frame;
}

export async function bannersPage(context,options={}) {
  const [result,pending]=await Promise.all([context.admin.query('banners',options,context.signal),context.admin.query('cleanup',{},context.signal)]);
  if(!result.items.length&&result.total&&options.page>1){await context.go(adminURL('/admin/banners',{...options,page:Math.ceil(result.total/20)}),{force:true});return el('div');}
  const cards=await Promise.all(result.items.map(async banner=>el('li',{className:'record-card banner-card'},[
    await bannerPreview(context,banner,'desktop'),
    el('div',{className:'banner-card-content'},[
      el('h2',{},banner.title),el('p',{className:'muted'},`Posição ${banner.sort_order} · ${banner.active?'Publicado':'Rascunho'}`),
      el('div',{className:'row-actions'},[
        adminLink('Editar',`/admin/banners/${banner.id}`),
        banner.mobile_path&&banner.desktop_path?actionButton(banner.active?'Ocultar':'Publicar',
          ()=>context.admin.mutate('banner_save',banner.id,{title:banner.title,sort_order:banner.sort_order,active:!banner.active},banner.updated_at),context,
          {success:banner.active?'Banner ocultado.':'Banner publicado.',name:banner.title}):null,
      ]),
    ]),
  ])));
  return panel('Banners',null,[
    filterBar({search:options.search,placeholder:'Descrição do banner',onCommit:values=>context.go(adminURL('/admin/banners',{...values,page:1}))}),
    cards.length?el('ul',{className:'banner-admin-grid'},cards):el('p',{},options.search?'Nenhum banner encontrado.':'Nenhum banner cadastrado.'),
    listPager({page:result.page,total:result.total,hasMore:result.hasMore,path:'/admin/banners',options,go:context.go}),
    pending.total?cleanupPanel(context,{items:[],hasMore:false},pending):null,
  ],[adminLink('Novo banner','/admin/banners/novo')]);
}

export async function bannerForm(context,id) {
  let banner=id?await context.admin.query('banner',{id},context.signal):null;
  if(id&&!banner)return notFound('Banner indisponível','/admin/banners');
  const completed=new Map();
  const fields=[
    {name:'title',label:'Descrição do banner',value:banner?.title||'',required:true,maxLength:160,hint:'Descreva o conteúdo para quem não pode ver a imagem.'},
    {name:'sort_order',label:'Posição',value:banner?.sort_order??0,inputmode:'numeric',required:true,hint:'Menores números aparecem primeiro.'},
    ...Object.entries(bannerFormats).filter(()=>id).map(([variant,format])=>({
      name:variant,label:format.label,type:'file',accept:'image/jpeg,image/png,image/webp',
      hint:`${format.hint} JPEG, PNG ou WebP, até 5 MiB.`,
    })),
    ...(id?[{name:'active',label:'Exibir na loja',value:banner.active,type:'checkbox'}]:[]),
  ];
  const form=makeForm({name:id?'Editar banner':'Novo banner',fields,submitLabel:id?'Salvar banner':'Criar banner',persist:true,onBusy:context.busy,
    onSubmit:async(values,node)=>{
      const errors={};const title=values.title.trim();
      if(!title||title.length>160)errors.title='Descreva o banner em até 160 caracteres.';
      if(!/^\d{1,4}$/.test(values.sort_order))errors.sort_order='Informe uma posição entre 0 e 9999.';
      for(const variant of Object.keys(bannerFormats)) {
        const file=values[variant]?.[0];
        if(file)try{await validateBannerImage(file,variant);}catch(error){errors[variant]=toAppError(error).message;}
        if(id&&values.active&&!file&&!banner[variant+'_path'])errors[variant]='Envie esta imagem para publicar o banner.';
      }
      if(Object.keys(errors).length)throw new ValidationError(errors);
      if(!id){
        const saved=await context.admin.mutate('banner_save',null,{title,sort_order:Number(values.sort_order),active:false});
        cleanForm(node);await context.go(`/admin/banners/${saved.id}`,{force:true});
        context.announce('Banner criado. Envie as duas imagens.','success');return;
      }
      for(const variant of Object.keys(bannerFormats)) {
        const file=values[variant]?.[0];
        const fingerprint=file&&JSON.stringify([file.name,file.size,file.lastModified]);
        if(file&&completed.get(variant)!==fingerprint){
          banner=await context.media.upload('banner-images',id,file,banner.updated_at,variant);
          completed.set(variant,fingerprint);
        }
      }
      banner=await context.admin.mutate('banner_save',id,{title,sort_order:Number(values.sort_order),active:values.active},banner.updated_at);
      cleanForm(node);
      const cleanup=await context.media.flush().catch(()=>({pending:1}));
      await context.go('/admin/banners',{force:true});
      context.announce(cleanup.pending?'Banner salvo. Há arquivos aguardando limpeza.':'Banner salvo.','success');
    },
  });
  const content=[form,adminLink('Cancelar','/admin/banners')];
  if(id){
    const previews=el('div',{className:'banner-upload-previews'});
    for(const [variant,format] of Object.entries(bannerFormats)) {
      const preview=await bannerPreview(context,banner,variant);
      const field=form.querySelector(`[data-field="${variant}"]`);
      field.append(preview);
      const input=form.elements.namedItem(variant);let version=0;let url;
      const remove=button('Remover seleção',()=>{
        input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));input.dispatchEvent(new Event('change'));input.focus();
      },'ghost');
      remove.disabled=true;remove.setAttribute('aria-label',`Remover seleção ${variant}`);field.append(remove);
      const release=()=>{if(url)URL.revokeObjectURL(url);url=null;};
      context.signal.addEventListener('abort',release,{once:true});
      input.addEventListener('change',async()=>{
        const current=++version;const file=input.files[0];release();
        remove.disabled=!file;
        const error=field.querySelector('.field-error');error.textContent='';input.removeAttribute('aria-invalid');
        if(!file){
          const saved=await bannerPreview(context,banner,variant);
          if(current===version&&!context.signal.aborted)preview.replaceChildren(...saved.childNodes);
          return;
        }
        try {
          await validateBannerImage(file,variant);
          if(current!==version||context.signal.aborted)return;
          url=URL.createObjectURL(file);preview.replaceChildren(el('img',{src:url,alt:`Prévia: ${banner.title}`}));
        }catch(reason){
          if(current!==version||context.signal.aborted)return;
          preview.replaceChildren(el('span',{},'Imagem inválida'));
          error.textContent=toAppError(reason).message;error.setAttribute('aria-live','polite');input.setAttribute('aria-invalid','true');
        }
      });
      previews.append(field);
    }
    // Keep the same canonical field/error owner, grouping only the two media fields.
    form.querySelector('fieldset').insertBefore(previews,form.querySelector('[data-field="active"]'));
    content.push(actionButton('Excluir banner',async()=>{
      await context.admin.mutate('banner_remove',id,{},banner.updated_at);
      await context.media.flush().catch(()=>{});
    },context,{tone:'danger',destination:'/admin/banners',success:'Banner excluído.',confirm:{title:'Excluir banner?',description:`“${banner.title}” será removido da loja e suas imagens serão enviadas para exclusão.`,confirmLabel:'Excluir banner',danger:true}}));
    const [orphans,pending]=await Promise.all([
      context.admin.query('orphans',{id,bucket:'banner-images'},context.signal),context.admin.query('cleanup',{},context.signal),
    ]);
    if(pending.total||orphans.items.length)content.push(cleanupPanel(context,orphans,pending,'banner-images',id));
  }
  return panel(id?'Editar banner':'Novo banner',id?null:'Crie o rascunho e envie as imagens na próxima tela.',content);
}
