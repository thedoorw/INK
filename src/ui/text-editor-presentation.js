export function createTextEditorPresentation(app,{document=globalThis.document}={}){
  if(!app)throw new TypeError('INK_TEXT_EDITOR_PRESENTATION_APP_REQUIRED');
  if(!document?.getElementById)throw new TypeError('INK_TEXT_EDITOR_PRESENTATION_DOCUMENT_REQUIRED');
  let mounted=false;
  const bindings=[];
  const nodes=()=>({
    commit:document.getElementById('textCommit'),
    cancel:document.getElementById('textCancel'),
    input:document.getElementById('textInput')
  });
  const bind=(target,type,listener,options)=>{
    target.addEventListener(type,listener,options);
    bindings.push([target,type,listener,options]);
  };
  function mount(){
    if(mounted)return false;
    const current=nodes();
    if(!current.commit||!current.cancel||!current.input)throw new Error('INK_TEXT_EDITOR_PRESENTATION_NODES_REQUIRED');
    const commit=()=>app.commitTextEditor();
    const cancel=()=>app.closeTextEditor();
    const keydown=event=>{
      if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){
        event.preventDefault?.();
        app.commitTextEditor();
        return;
      }
      if(event.key==='Escape')app.closeTextEditor();
    };
    bind(current.commit,'click',commit);
    bind(current.cancel,'click',cancel);
    bind(current.input,'keydown',keydown);
    mounted=true;
    return true;
  }
  function dispose(){
    if(!mounted)return false;
    for(const [target,type,listener,options] of bindings.splice(0).reverse())target.removeEventListener(type,listener,options);
    mounted=false;
    return true;
  }
  function diagnostics(){
    const current=nodes();
    return Object.freeze({
      mounted,
      bindingCount:bindings.length,
      nodes:Object.freeze({
        commit:Boolean(current.commit),
        cancel:Boolean(current.cancel),
        input:Boolean(current.input)
      })
    });
  }
  return Object.freeze({mount,dispose,diagnostics,get mounted(){return mounted;}});
}
