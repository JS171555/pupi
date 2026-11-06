import {el,button,money} from '../../ui/dom.js';
import {startLoading} from '../../ui/loading.js';
import {notify} from '../../ui/feedback.js';
import {toAppError} from '../../utils/errors.js';
import {loadMercadoPago} from '../../services/mercado-pago.js';
let sequence=0;
export function embeddedPaymentPanel({order,repository,signal,busy,onPaid}) {
  const content=el('div',{className:'payment-content'}),status=el('p',{className:'form-status',role:'status'});
  const panel=el('section',{className:'admin-order-actions payment-panel'},[el('h2',{},'Pagamento'),el('p',{className:'muted'},'Pague com cartão ou Pix aqui no Pupi. Os dados do cartão são processados pelo Mercado Pago.'),content,status]);
  let controller,brickTimer,disposed=false,pending=null,mountVersion=0,stopLoading=()=>{},submitting=false;
  const disposeBrick=async()=>{clearTimeout(brickTimer);const previous=controller;controller=null;if(previous)await Promise.resolve(previous.unmount()).catch(()=>{});};
  signal.addEventListener('abort',()=>{disposed=true;mountVersion++;pending=null;stopLoading();void disposeBrick();},{once:true});
  const verify=()=>perform(async()=>{
    const data=pending?await repository.submitPayment(order.id,pending.key,pending.form):await repository.refreshPayment(order.id);
    await showResult(data);
  });
  async function perform(task) {
    if(disposed||submitting)return;
    submitting=true;busy(true);status.textContent='';stopLoading=startLoading(status,{message:'Verificando pagamento…'});
    try{await task();}catch(error){
      if(disposed)return;
      status.textContent=toAppError(error).message;
      if(['PAYMENT_REJECTED','INVALID_DATA'].includes(error.code)){pending=null;await disposeBrick();content.replaceChildren(button('Tentar novamente',()=>initialize(true),'primary'));}
      else if(error.code==='PAYMENT_UNCERTAIN'){await disposeBrick();content.replaceChildren(el('p',{},'Estamos verificando a tentativa para evitar um pagamento duplicado.'),button('Verificar pagamento',verify,'primary'));}
      else if(!controller)content.replaceChildren(button('Tentar carregar novamente',()=>initialize(),'secondary'));
    }finally{stopLoading();submitting=false;busy(false);}
  }
  async function showResult(data) {
    if(disposed)return;
    const result=data.submission?.result;
    if(data.payment_status==='paid'||result?.status==='paid') {
      pending=null;await disposeBrick();busy(false);await onPaid();return;
    }
    if(!data.submission||data.submission.state==='failed') {
      pending=null;await disposeBrick();content.replaceChildren(el('p',{},result?'Pagamento não aprovado. Você pode tentar novamente.':'Pronto para preencher seus dados.'),button('Tentar novamente',()=>initialize(true),'primary'));return;
    }
    await disposeBrick();content.replaceChildren();
    if(result?.status==='pending'&&result.qr_code) {
      content.append(el('h3',{},'Pague com Pix'),el('p',{},'Use o QR Code ou copie o código para pagar. Depois, verifique o resultado aqui.'));
      if(typeof result.qr_code_base64==='string'&&result.qr_code_base64.startsWith('iVBOR')&&/^[A-Za-z0-9+/=]+$/.test(result.qr_code_base64))content.append(el('img',{className:'payment-pix',src:`data:image/png;base64,${result.qr_code_base64}`,alt:'QR Code para pagar este pedido com Pix',width:240,height:240}));
      const code=el('textarea',{'aria-label':'Código Pix copia e cola',readonly:true,rows:4},result.qr_code);content.append(code,button('Copiar código Pix',async()=>{try{await navigator.clipboard.writeText(result.qr_code);notify('Código Pix copiado.','success');}catch{code.focus();code.select();notify('Selecione e copie o código Pix.');}}));
      if(result.expires_at)content.append(el('p',{className:'muted'},`Válido até ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(result.expires_at))}.`));
    } else content.append(el('h3',{},result?.status==='review'?'Pagamento em conferência':'Pagamento em verificação'),el('p',{},'A confirmação depende do Mercado Pago. Você pode acompanhar o resultado nesta tela.'));
    content.append(button('Verificar pagamento',verify,'primary'));pending=null;
  }
  async function initialize(retry=false) {
    if(disposed||submitting)return;
    const version=++mountVersion;let localTimer,reportedError=false;status.textContent='';content.replaceChildren();stopLoading();stopLoading=startLoading(status,{message:'Carregando pagamento…'});
    try {
      await disposeBrick();const data=await repository.paymentContext(order.id);
      if(disposed||version!==mountVersion)return;
      if(data.payment_status==='paid'){stopLoading();await showResult(data);return;}
      if(data.submission&&(!retry||data.submission.state!=='failed')){stopLoading();await showResult(data);return;}
      const MercadoPago=await loadMercadoPago();if(disposed||version!==mountVersion)return;
      const id=`pupi-payment-${++sequence}`,container=el('div',{id});content.replaceChildren(el('p',{className:'payment-total'},['Total do pedido: ',el('strong',{},money(data.total_cents))]),container);
      const mp=new MercadoPago(data.public_key,{locale:'pt-BR'});
      let timedOut=false;
      localTimer=setTimeout(()=>{timedOut=true;stopLoading();if(!disposed&&version===mountVersion){status.textContent='O formulário demorou para carregar. Tente novamente.';content.append(button('Tentar carregar novamente',()=>initialize(true)));}},15000);
      brickTimer=localTimer;
      const created=await mp.bricks().create('payment',id,{
        initialization:{amount:data.total_cents/100},
        customization:{paymentMethods:{creditCard:'all',debitCard:'all',bankTransfer:'all',maxInstallments:12}},
        callbacks:{
          onReady:()=>{clearTimeout(localTimer);if(!disposed&&!timedOut&&version===mountVersion)stopLoading();},
          onError:()=>{clearTimeout(localTimer);if(!disposed&&!timedOut&&!reportedError&&version===mountVersion){reportedError=true;stopLoading();status.textContent='Não foi possível carregar os dados de pagamento. Confira a conexão e tente novamente.';content.append(button('Tentar carregar novamente',()=>initialize(true)));}},
          onSubmit:async({formData})=>{
            if(disposed||submitting||timedOut||version!==mountVersion)return;
            pending={key:crypto.randomUUID(),form:formData};
            await perform(async()=>{const result=await repository.submitPayment(order.id,pending.key,pending.form);await showResult(result);});
          },
        },
      });
      if(disposed||version!==mountVersion||timedOut){await created.unmount();return;}
      controller=created;
    } catch(error){clearTimeout(localTimer);if(!disposed&&version===mountVersion){stopLoading();status.textContent=toAppError(error).message;if(error.code!=='LEGACY_PAYMENT')content.append(button(error.code==='CONFIG_MISSING'?'Pagar com Mercado Pago':'Tentar carregar novamente',()=>initialize(true)));}}
  }
  content.append(button('Pagar com Mercado Pago',()=>initialize(),'primary'));
  return panel;
}
