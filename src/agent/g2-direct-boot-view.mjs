// Public-owned CHAT/G2 connection control presentation. No bridge credentials,
// pairing authority, timer, transport or user-trust decisions live in this view.
export function g2ConnectionLabel({paired,failed,recovering,preparation,active,reason}){
  return paired&&!failed?'已連線 CHAT · 斷線'
    :failed?'連線暫停 · 取消'
    :recovering?'重新連線中 · 取消'
    :preparation?'等待文件或尺寸 · 取消'
    :active?'連線中 · 取消':reason==='IDLE'?'連線 CHAT':'已斷線 · 連線 CHAT';
}

export function createG2ConnectControl(documentObject){
  const host=documentObject.createElement('div');
  host.className='menu-item-host';
  const button=documentObject.createElement('button');
  button.type='button';
  button.className='menu-row';
  button.setAttribute('data-ink-g2-connect','');
  button.setAttribute('role','menuitem');
  const label=documentObject.createElement('span');
  label.className='menu-label';
  button.append(label);host.append(button);
  return {host,button};
}
