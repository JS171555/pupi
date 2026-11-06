import {el,button,money} from '../../ui/dom.js';
import {startLoading} from '../../ui/loading.js';
import {notify} from '../../ui/feedback.js';
import {toAppError} from '../../utils/errors.js';
import {loadMercadoPago,challengeUrl} from '../../services/mercado-pago.js';
let sequence=0;
export function embeddedPaymentPanel({order,payerEmail,repository,signal,busy,onPaid}) {
  const accountEmail=typeof payerEmail==='string'?payerEmail.trim():'';
  const content=el('div',{className:'payment-content'}),status=el('p',{className:'form-status',role:'status'});
  const panel=el('section',{className:'admin-order-actions payment-panel'},[el('h2',{},'Pagamento'),content,status]);
  let controller,brickTimer,pollTimer,disposed=false,pending=null,mountVersion=0,stopLoading=()=>{},submitting=false,checking=false,deadline=0,lastData=null,lastDisplay='',cleanupChallenge=()=>{};
  const disposeBrick=async()=>{clearTimeout(brickTimer);const previous=controller;controller=null;if(previous)await Promise.resolve(previous.unmount()).catch(()=>{});};
  const stopMonitoring=()=>{clearTimeout(pollTimer);deadline=0;lastData=null;cleanupChallenge();cleanupChallenge=()=>{};};
  const expired=result=>typeof result?.expires_at==='string'&&Number.isFinite(Date.parse(result.expires_at))&&Date.parse(result.expires_at)<=Date.now();
  const signature=data=>JSON.stringify([data.payment_status,data.payment_review_required,data.test_mode,data.submission,expired(data.submission?.result)]);
  const verify=()=>perform(async()=>{const data=pending?await repository.submitPayment(order.id,pending.key,pending.form):await repository.refreshPayment(order.id);await showResult(data);});
  const visible=()=>{if(!document.hidden&&lastData)void checkPayment();};
  document.addEventListener('visibilitychange',visible);window.addEventListener('online',visible);
  signal.addEventListener('abort',()=>{disposed=true;mountVersion++;pending=null;stopLoading();stopMonitoring();document.removeEventListener('visibilitychange',visible);window.removeEventListener('online',visible);void disposeBrick();},{once:true});
  function schedule(data) {
    lastData=data;clearTimeout(pollTimer);
    if(data.submission?.result?.status!=='pending'||!data.submission.result.payment_id)return;
    if(!deadline)deadline=Date.now()+120000;
    if(Date.now()<deadline&&!document.hidden&&navigator.onLine!==false)pollTimer=setTimeout(()=>void checkPayment(),8000);
  }
  async function checkPayment() {
    if(disposed||submitting||checking||document.hidden||navigator.onLine===false)return;
    checking=true;
    try{
      const data=await repository.refreshPayment(order.id);
      if(disposed)return;
      if(signature(data)!==lastDisplay)await showResult(data);else schedule(data);
    }catch(error){
      if(disposed)return;
      if(error.code==='SESSION_EXPIRED'){stopMonitoring();status.textContent=toAppError(error).message;}
      else{status.textContent='A atualização automática está indisponível. Use Verificar pagamento para consultar o resultado.';if(lastData)schedule(lastData);}
    }finally{checking=false;}
  }
  async function perform(task,message='Verificando pagamento…') {
    if(disposed||submitting||checking)return;
    submitting=true;busy(true);status.textContent='';
    const trigger=document.activeElement;
    stopLoading=startLoading(status,{message,button:trigger?.matches('.button')&&panel.contains(trigger)?trigger:undefined,showIndicator:false});
    try{await task();}catch(error){
      if(disposed)return;
      status.textContent=toAppError(error).message;
      if(error.code==='PAYMENT_UNCERTAIN'&&lastData?.submission?.result?.payment_id){schedule(lastData);return;}
      if(['PAYMENT_REJECTED','INVALID_DATA'].includes(error.code)){pending=null;stopMonitoring();await disposeBrick();content.replaceChildren(button('Tentar novamente',()=>initialize(true),'primary'));}
      else if(['PAYMENT_UNCERTAIN','PAYMENT_BLOCKED'].includes(error.code)){
        if(error.code==='PAYMENT_BLOCKED')pending=null;
        await disposeBrick();content.replaceChildren(el('p',{},'Estamos verificando a tentativa para evitar um pagamento duplicado.'),button('Verificar pagamento',verify,'primary'));
      }else{
        pending=null;stopMonitoring();await disposeBrick();content.replaceChildren(el('p',{},error.code==='SESSION_EXPIRED'?'Entre novamente na sua conta e reabra este pedido.':'O pagamento não pôde ser iniciado. Você pode consultar novamente após a loja ajustar a configuração.'),...(error.code==='SESSION_EXPIRED'?[]:[button('Tentar carregar novamente',()=>initialize(),'secondary')]));
      }
    }finally{stopLoading();submitting=false;busy(false);}
  }
  async function showResult(data) {
    if(disposed)return;
    const result=data.submission?.result;
    lastDisplay=signature(data);lastData=null;clearTimeout(pollTimer);
    if(!data.payment_review_required&&!['review','refunded','failed'].includes(result?.status)&&(data.payment_status==='paid'||result?.status==='paid')) {
      pending=null;stopMonitoring();await disposeBrick();busy(false);await onPaid();return;
    }
    cleanupChallenge();cleanupChallenge=()=>{};
    if(!data.submission||data.submission.state==='failed') {
      const message=result?.reason==='test_attempt_released'?'Tentativa encerrada após conferência. Você pode preencher os dados novamente.':result?'Pagamento não aprovado. Confira os dados ou escolha outro meio de pagamento.':'Pronto para preencher seus dados.';
      pending=null;stopMonitoring();await disposeBrick();content.replaceChildren(el('p',{},message),button('Tentar novamente',()=>initialize(true),'primary'));return;
    }
    await disposeBrick();content.replaceChildren();
    if(result?.status==='refunded'||data.payment_status==='refunded'){
      pending=null;stopMonitoring();content.append(el('h3',{},'Pagamento estornado'),el('p',{},'O provedor confirmou o estorno deste pagamento. Consulte o prazo de devolução com seu banco.'));return;
    }
    const url=result?.requires_action?challengeUrl(data.action?.url):null;
    if(result?.requires_action&&url){
      const frame=el('iframe',{className:'payment-auth-frame',src:url.href,title:'Autenticação do cartão no banco',sandbox:'allow-scripts allow-forms allow-same-origin',referrerpolicy:'no-referrer'});
      const complete=event=>{if(event.origin===url.origin&&event.source===frame.contentWindow&&event.data?.status==='COMPLETE')void checkPayment();};
      window.addEventListener('message',complete);cleanupChallenge=()=>{window.removeEventListener('message',complete);frame.remove();};
      content.append(el('h3',{},'Confirme o pagamento com seu banco'),el('p',{},'Conclua a verificação abaixo. Depois consultaremos a confirmação do pagamento.'),frame);
    }else if(result?.status==='pending'&&result.qr_code){
      if(expired(result))content.append(el('h3',{},'Pix vencido'),el('p',{},'O prazo deste código terminou. Verifique o resultado antes de tentar novamente.'));
      else{
        content.append(el('h3',{},'Pague com Pix'),el('p',{},data.test_mode?'Este código não gera uma cobrança real. Não pague pelo banco; use Verificar pagamento para acompanhar.':'Use o QR Code ou copie o código para pagar. O resultado será atualizado nesta tela.'));
        if(typeof result.qr_code_base64==='string'&&result.qr_code_base64.startsWith('iVBOR')&&/^[A-Za-z0-9+/=]+$/.test(result.qr_code_base64))content.append(el('img',{className:'payment-pix',src:`data:image/png;base64,${result.qr_code_base64}`,alt:'QR Code para pagar este pedido com Pix',width:240,height:240}));
        const code=el('textarea',{'aria-label':'Código Pix copia e cola',readonly:true,rows:4},result.qr_code);
        content.append(code,button('Copiar código Pix',async()=>{if(expired(result)){notify('O prazo do código terminou. Verifique o pagamento.');return;}try{await navigator.clipboard.writeText(result.qr_code);notify('Código Pix copiado.','success');}catch{code.focus();code.select();notify('Selecione e copie o código Pix.');}}));
        if(result.expires_at)content.append(el('p',{className:'muted'},`Válido até ${new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'America/Sao_Paulo'}).format(new Date(result.expires_at))}.`));
      }
    }else content.append(el('h3',{},result?.status==='review'||data.payment_review_required?'Pagamento em conferência':result?.requires_action?'Verificação do banco pendente':'Pagamento em verificação'),el('p',{},result?.status==='review'||data.payment_review_required?'A loja precisa conferir este pagamento. Consulte o pedido antes de fazer outra tentativa.':'Verifique o pagamento antes de tentar novamente.'));
    content.append(button('Verificar pagamento',verify,'primary'));pending=null;schedule(data);
  }
  async function initialize(retry=false) {
    if(disposed||submitting||checking)return;
    const version=++mountVersion;let localTimer,reportedError=false;status.textContent='';
    const loadingButton=button('Pagar com Mercado Pago',()=>{},'primary');loadingButton.disabled=true;content.replaceChildren(loadingButton);
    stopMonitoring();stopLoading();stopLoading=startLoading(status,{button:loadingButton});
    try {
      await disposeBrick();const data=await repository.paymentContext(order.id);
      if(disposed||version!==mountVersion)return;
      if(data.payment_status==='paid'){stopLoading();await showResult(data);return;}
      if(data.submission&&(!retry||data.submission.state!=='failed')){stopLoading();await showResult(data.submission.result?.requires_action?await repository.refreshPayment(order.id):data);return;}
      const MercadoPago=await loadMercadoPago();if(disposed||version!==mountVersion)return;
      const id=`pupi-payment-${++sequence}`,container=el('div',{id});content.replaceChildren(...(data.test_mode?[el('p',{className:'payment-context-note'},'Este pagamento não gera uma cobrança real.')]:[]),el('p',{className:'payment-total'},['Total do pedido: ',el('strong',{},money(data.total_cents))]),loadingButton,container);
      const mp=new MercadoPago(data.public_key,{locale:'pt-BR'});
      let timedOut=false;
      localTimer=setTimeout(()=>{timedOut=true;stopLoading();if(!disposed&&version===mountVersion){loadingButton.remove();status.textContent='O formulário demorou para carregar. Tente novamente.';content.append(button('Tentar carregar novamente',()=>initialize(true)));}},15000);
      brickTimer=localTimer;
      const created=await mp.bricks().create('payment',id,{
        initialization:{amount:data.total_cents/100,...(accountEmail?{payer:{email:accountEmail}}:{})},
        customization:{paymentMethods:{creditCard:'all',debitCard:'all',bankTransfer:'all',maxInstallments:12}},
        callbacks:{
          onReady:()=>{clearTimeout(localTimer);if(!disposed&&!timedOut&&version===mountVersion){stopLoading();loadingButton.remove();}},
          onError:()=>{clearTimeout(localTimer);if(!disposed&&!timedOut&&!reportedError&&version===mountVersion){reportedError=true;stopLoading();loadingButton.remove();status.textContent='Não foi possível carregar os dados de pagamento. Confira a conexão e tente novamente.';content.append(button('Tentar carregar novamente',()=>initialize(true)));}},
          onSubmit:async({formData,selectedPaymentMethod},additionalData)=>{
            if(disposed||submitting||checking||timedOut||version!==mountVersion)return;
            pending={key:crypto.randomUUID(),form:{...formData,payment_type_id:additionalData?.paymentTypeId||formData.payment_type_id||selectedPaymentMethod}};
            await perform(async()=>{const result=await repository.submitPayment(order.id,pending.key,pending.form);await showResult(result);},'Enviando pagamento…');
          },
        },
      });
      if(disposed||version!==mountVersion||timedOut){await created.unmount();return;}
      controller=created;
    } catch(error){clearTimeout(localTimer);if(!disposed&&version===mountVersion){stopLoading();loadingButton.remove();status.textContent=toAppError(error).message;if(!['LEGACY_PAYMENT','SESSION_EXPIRED'].includes(error.code))content.append(button(error.code==='CONFIG_MISSING'?'Pagar com Mercado Pago':'Tentar carregar novamente',()=>initialize(true)));}}
  }
  content.append(button('Pagar com Mercado Pago',()=>initialize(),'primary'));
  return panel;
}
