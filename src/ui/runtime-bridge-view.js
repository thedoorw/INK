// Public-presented legacy CHAT Runtime Bridge controls.
// Native pairing, consent and request authorization stay in the controller.
export function createRuntimeBridgeControls(documentObject=globalThis.document){
 const root=documentObject.createElement('div');
 root.setAttribute('data-ink-runtime-bridge-controls','1');
 const status=documentObject.createElement('span');
 status.setAttribute('data-ink-runtime-status','1');
 const pending=documentObject.createElement('span');
 pending.setAttribute('data-ink-runtime-pending','1');
 const error=documentObject.createElement('span');
 error.setAttribute('data-ink-runtime-error','1');
 error.setAttribute('role','alert');
 const buttons={};
 for(const [key,label] of Object.entries({connect:'Connect CHAT',revoke:'Disconnect',
  check:'Check request',approve:'Approve request',reject:'Reject request'})){
  const button=documentObject.createElement('button');
  button.type='button';button.textContent=label;buttons[key]=button;
 }
 root.append(status,pending,error,buttons.connect,buttons.revoke,buttons.check,buttons.approve,buttons.reject);
 return {root,elements:{status,pending,error,...buttons}};
}

export function presentRuntimeBridgeControls(elements,{paired=false,pairInFlight=false,ready=true,
 accepting=false,pendingAction='',pendingRequestId='',pendingProposalId='',busy=false,error=''}={}){
 const {status,pending,connect,revoke,check,approve,reject}=elements;
 status.textContent=paired?(busy?'CHAT connected · working':'CHAT connected'):
  (pairInFlight||busy?'CHAT connecting':'CHAT disconnected');
 pending.textContent=pendingRequestId?
  pendingAction+' · '+pendingRequestId+(pendingProposalId?' · proposal '+pendingProposalId:''):
  'No pending request';
 elements.error.textContent=error||'';
 connect.disabled=busy||paired||pairInFlight||ready===false;
 revoke.disabled=busy||(!paired&&!pairInFlight);
 check.disabled=busy||!accepting;
 approve.disabled=busy||!pendingRequestId;
 reject.disabled=busy||!pendingRequestId;
}
