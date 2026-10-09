import { serializeCrossDocumentSelection, pasteCrossDocumentSelection } from '../editor/cross-document-transfer.js';

const err=code=>{throw Object.assign(new Error(code),{code});};
const read=run=>({history:'NONE',invalidation:'UI_REFRESH',documentPolicy:'MAY_REPLACE_DOCUMENT',run});
export function installMultiDocumentController(app,{createSecondaryView}={}){
  if(!app?.sessions||!app?.commands||typeof createSecondaryView!=='function')err('INK_MULTIDOC_PREREQUISITES_REQUIRED');
  const registry=app.sessions;
  let comparison=null,transfer=null;
  const ensureCompare=()=>{
    if(!comparison)return null;
    const session=registry.get(comparison.sessionId);
    if(!session||!['OPEN','CLOSING'].includes(session.state)||session.generation!==comparison.generation||registry.activeId===comparison.sessionId){
      comparison.view.dispose();comparison=null;return null;
    }
    comparison.view.render();return comparison;
  };
  const setCompare=sessionId=>{
    if(sessionId&&app.multiView?.enabled)err('INK_COMPARE_USE_VIEW_LAYOUT');
    const session=sessionId?registry.get(sessionId):null;
    if(sessionId&&(!session||session.state!=='OPEN'||session.sessionId===registry.activeId))err('INK_COMPARE_INVALID_SECONDARY');
    // Validation precedes disposal: rejected choices leave the old view intact.
    if(comparison){comparison.view.dispose();comparison=null;}
    if(!sessionId){app.commands.notify('session-compare-off');return false;}
    const target=Object.freeze({sessionId:session.sessionId,documentId:session.documentId,generation:session.generation,pageId:session.doc.activePageId});
    const view=createSecondaryView(session);
    comparison={...target,view};
    app.commands.notify('session-compare-on');
    return true;
  };
  const activate=(sessionId,lease=null)=>{
    if(app.multiView?.enabled)return app.multiView.focus(sessionId,{lease});
    const oldCompare=comparison?.sessionId;
    const target=registry.activate(sessionId,{lease});
    if(oldCompare===sessionId)setCompare(null);
    else ensureCompare();
    return target;
  };
  const close=async(sessionId,decision,lease=null)=>{
    const oldCompare=comparison?.sessionId||null;
    let result;
    try{result=await registry.close(sessionId,{decision,lease});}
    catch(error){
      if(oldCompare&&!comparison&&registry.get(oldCompare)?.state==='OPEN'&&oldCompare!==registry.activeId)setCompare(oldCompare);
      throw error;
    }
    // Cancelled/failed Close must preserve the existing compared view.
    if(result.closed)ensureCompare();
    return result;
  };
  const list=()=>registry.list();
  const status=()=>Object.freeze({primary:registry.activeId,secondary:comparison?.sessionId||null,ready:Boolean(ensureCompare()),readOnly:true});
  const copy=(sourceSessionId,lease=null)=>{
    const id=sourceSessionId||registry.activeId;
    registry.assertIdle(lease);
    transfer=serializeCrossDocumentSelection(registry,id);
    app.commands.notify('session-copy');
    return{count:transfer.objects.length,sourceSessionId:id};
  };
  const paste=(lease=null)=>{
    registry.assertIdle(lease);
    if(!transfer)err('INK_TRANSFER_CLIPBOARD_EMPTY');
    const result=pasteCrossDocumentSelection(app,transfer);
    ensureCompare();
    app.commands.notify('session-paste');
    return result;
  };
  app.commands.registerOwned('multi-document-session',{commands:[
    {id:'session.activate.v1',definition:read((args,envelope,execution)=>({changed:true,result:activate(args.sessionId,execution.sessionOperation)}))},
    {id:'session.close.v1',definition:{...read(async (args,envelope,execution)=>{const result=await close(args.sessionId,args.decision,execution.sessionOperation);return{changed:result.closed,result};}),async:true}},
    {id:'session.compare.v1',definition:read(args=>({changed:true,result:{enabled:setCompare(args.sessionId||null)}}))},
    {id:'session.copy.v1',definition:read((args,envelope,execution)=>({changed:false,result:copy(args.sessionId,execution.sessionOperation)}))},
    {id:'session.paste.v1',definition:read((args,envelope,execution)=>paste(execution.sessionOperation))},
    {id:'session.recovery.restore.v1',definition:{...read(async (args,envelope,execution)=>({changed:true,result:await registry.recover(args.key,{lease:execution.sessionOperation})})),async:true}},
    {id:'session.view.layout.v1',definition:read((args,envelope,execution)=>({changed:true,result:app.multiView.setLayout(args.layout,{lease:execution.sessionOperation})}))},
    {id:'session.view.show.v1',definition:read((args,envelope,execution)=>({changed:true,result:app.multiView.show(args.sessionId,{lease:execution.sessionOperation})}))},
    {id:'session.view.hide.v1',definition:read((args,envelope,execution)=>({changed:true,result:app.multiView.hide(args.sessionId,{lease:execution.sessionOperation})}))},
    {id:'session.view.mode.v1',definition:read((args,envelope,execution)=>({changed:true,result:app.multiView.setReadOnly(args.sessionId,args.readOnly,{lease:execution.sessionOperation})}))},
  ],selectors:[
    {id:'session.list',selector:()=>list()},
    {id:'session.views',selector:()=>app.multiView?.status()||{enabled:false,layout:1,visible:[],hidden:[]}},
    {id:'session.view.diagnostics',selector:()=>app.multiView?.diagnostics()||null},
    {id:'session.compare',selector:()=>status()},
    {id:'session.recovery.list',selector:()=>registry.recoverable()},
    {id:'session.transfer',selector:()=>({ready:Boolean(transfer),count:transfer?.objects.length||0,source:transfer?.source?.sessionId||null})}
  ]});
  const subscription=app.commands.subscribe(event=>{
    if(event.reason==='native-session-change'||event.reason==='native-session-close'||event.reason==='native-session-replaced'||event.reason==='native-session-add'||event.type==='command'&&event.commandId!=='session.compare.v1'){
      if(comparison)ensureCompare();
    }
  });
  return Object.freeze({list,activate,close,copy,paste,setCompare,status,dispose(){subscription();setCompare(null);app.commands.unregisterOwned('multi-document-session');}});
}
