// Optional reads never block navigation. Results belong only to the current account.
export function createNavigationIndicators({readCart,readOrders,onChange}) {
  let owner=null,controller,version=0;
  let values={cart:false,orders:false};
  const publish=()=>onChange({...values});
  const clear=()=>{
    controller?.abort();controller=undefined;version++;owner=null;
    values={cart:false,orders:false};publish();
  };
  const show=userId=>{
    if(owner!==(userId||null)){clear();owner=userId||null;}
    publish();
  };
  return {
    clear,show,
    async refresh(userId) {
      show(userId);
      if(!owner)return;
      controller?.abort();controller=new AbortController();
      const signal=controller.signal;const request=++version;
      const results=await Promise.allSettled([readCart(userId,signal),readOrders(userId,signal)]);
      if(signal.aborted||request!==version||owner!==userId)return;
      for(const [index,key] of ['cart','orders'].entries()){
        if(results[index].status==='fulfilled')values[key]=results[index].value===true;
      }
      publish();
    },
  };
}
