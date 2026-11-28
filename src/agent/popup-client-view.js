// Public-owned presentation of the existing private read-only popup menu.
// Window creation, consent, challenge and MessagePort authority stay protected.
export function createPrivateReadOnlyMenuRow(documentObject){
  const host=documentObject.createElement('div');
  host.className='menu-item-host';
  const button=documentObject.createElement('button');
  button.type='button';
  button.className='menu-row';
  button.setAttribute('role','menuitem');
  button.setAttribute('data-ink-readonly-popup','');
  const label=documentObject.createElement('span');
  label.className='menu-label';
  label.textContent='開啟私人唯讀連線';
  button.append(label);host.append(button);
  return host;
}
