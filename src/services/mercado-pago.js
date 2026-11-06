import {AppError} from '../utils/errors.js';
let loading;
export function loadMercadoPago() {
  if(typeof window.MercadoPago==='function')return Promise.resolve(window.MercadoPago);
  if(loading)return loading;
  loading=new Promise((resolve,reject)=>{
    let settled=false;
    const script=document.createElement('script');script.src='https://sdk.mercadopago.com/js/v2';script.async=true;
    const fail=()=>{if(settled)return;settled=true;clearTimeout(timer);script.remove();loading=null;reject(new AppError('PAYMENT_SDK','Não foi possível carregar o formulário de pagamento. Tente novamente.'));};
    const timer=setTimeout(fail,12000);
    script.addEventListener('error',fail,{once:true});script.addEventListener('load',()=>{if(settled)return;if(typeof window.MercadoPago!=='function'){fail();return;}settled=true;clearTimeout(timer);resolve(window.MercadoPago);},{once:true});
    document.head.append(script);
  });
  return loading;
}
