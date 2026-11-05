import { createMediaService,validateImage } from './media.js';
import { AppError,unwrap } from '../utils/errors.js';

export async function validateImageBytes(file) {
  validateImage(file);
  const bytes=new Uint8Array(await file.slice(0,12).arrayBuffer());
  const png=[137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value);
  const jpeg=bytes[0]===255 && bytes[1]===216 && bytes[2]===255;
  const webp=String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!(file.type==='image/png' && png || file.type==='image/jpeg' && jpeg || file.type==='image/webp' && webp)) {
    throw new AppError('INVALID_DATA','O conteúdo do arquivo não corresponde a uma imagem JPEG, PNG ou WebP válida.');
  }
}
export function createAdminMediaService(client,repository) {
  const media=createMediaService(client);const pending=new Map();
  return {
    clear() {pending.clear();},
    async upload(bucket,id,file,expected=null) {
      await validateImageBytes(file);
      const fingerprint=JSON.stringify([bucket,id,file.name,file.size,file.lastModified]);
      let task=pending.get(fingerprint);
      if(!task){const extension=validateImage(file);task={path:`${id}/${crypto.randomUUID()}.${extension}`,uploaded:false,key:crypto.randomUUID(),expected};pending.set(fingerprint,task);}
      if(!task.uploaded) {
        try {await media.uploadAt(bucket,task.path,file);task.uploaded=true;}
        catch(error) {
          // Uma falha de rede pode ocorrer depois do upload. Conferir o caminho conhecido antes de repetir.
          const name=task.path.split('/')[1];
          const matches=await unwrap(client.storage.from(bucket).list(id,{limit:100,search:name})).catch(()=>null);
          if(matches?.some(item=>item.name===name)) task.uploaded=true;else throw error;
        }
      }
      // Se a resposta do banco se perder, a retentativa usa o mesmo arquivo e a mesma chave.
      const result=await repository.mutate(bucket==='product-images'?'image_link':'category_image',id,
        bucket==='product-images'?{path:task.path,alt_text:file.name.slice(0,300)}:{path:task.path},task.expected,task.key);
      pending.delete(fingerprint);return result;
    },
    signedUrl:media.signedUrl,
    async flush() {
      const jobs=await repository.query('cleanup',{limit:100});let removed=0;const failures=[];
      for(const job of jobs.items) {
        try {await media.remove(job.bucket,job.path);await repository.mutate('cleanup_complete',job.id);removed++;}
        catch(error){failures.push({id:job.id,message:error.message});}
      }
      return {removed,pending:jobs.total-removed,failures};
    },
  };
}
