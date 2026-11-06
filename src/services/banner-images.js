import {validateImageBytes} from './admin-media.js';
import {AppError} from '../utils/errors.js';

export const bannerFormats={
  mobile:{label:'Imagem mobile',ratio:1,hint:'Quadrada (1:1). Sugestão: 1080 × 1080 px.'},
  desktop:{label:'Imagem desktop',ratio:3,hint:'Horizontal (3:1). Sugestão: 1920 × 640 px.'},
};

export async function validateBannerImage(file,variant) {
  const format=bannerFormats[variant];
  if(!format)throw new AppError('INVALID_DATA','Formato de banner inválido.');
  await validateImageBytes(file);
  let bitmap;
  try {
    bitmap=await createImageBitmap(file);
    if(Math.abs(bitmap.width-bitmap.height*format.ratio)>1) {
      throw new AppError('INVALID_DATA',format.hint);
    }
    return {width:bitmap.width,height:bitmap.height};
  }catch(error){
    if(error instanceof AppError)throw error;
    throw new AppError('INVALID_DATA','Não foi possível abrir esta imagem. Escolha outro arquivo.');
  }finally{bitmap?.close();}
}
