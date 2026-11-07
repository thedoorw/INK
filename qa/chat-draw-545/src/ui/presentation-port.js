const EMPTY_DIAGNOSTICS=Object.freeze({bound:false,generation:0});

function callPath(target,path,args){
  if(!target)return false;
  let value=target;
  for(const key of path)value=value?.[key];
  if(typeof value!=='function')return false;
  const result=value(...args);
  return result===undefined?false:result;
}

export function createRevocablePresentationPort(){
  let current=null;
  let generation=0;
  const presentation=Object.freeze({
    openProject:(...args)=>callPath(current,['openProject'],args),
    snapFeedback:Object.freeze({
      show:(...args)=>callPath(current,['snapFeedback','show'],args),
      clear:(...args)=>callPath(current,['snapFeedback','clear'],args)
    }),
    fullscreen:Object.freeze({
      present:(...args)=>callPath(current,['fullscreen','present'],args)
    })
  });
  const bind=next=>{
    if(!next||typeof next!=='object')throw new TypeError('INK_PRESENTATION_PORT_TARGET_REQUIRED');
    current=next;
    generation+=1;
    return generation;
  };
  const revoke=()=>{
    const hadCurrent=Boolean(current);
    current=null;
    generation+=1;
    return hadCurrent;
  };
  const diagnostics=()=>current?Object.freeze({bound:true,generation}):generation?Object.freeze({bound:false,generation}):EMPTY_DIAGNOSTICS;
  return Object.freeze({presentation,bind,revoke,diagnostics});
}
