/* #317 — isolated browser-local brand settings, no Core / Document / History authority. */
(() => {
  'use strict';
  const KEY = 'ink.web.branding.active.v1';
  const DEFAULT = Object.freeze({name:'INK',title:'INK',logo:'assets/ink-mark.svg',favicon:'assets/favicon.png?v=20261013-ink64'});
  const LIMIT = {logo:768*1024,favicon:256*1024};
  const MIME = new Set(['image/png','image/jpeg','image/webp','image/gif']);
  const read = () => {
    try {
      const v=JSON.parse(localStorage.getItem(KEY)||'null');
      if(!v||typeof v!=='object') return {...DEFAULT};
      const safe=k=>typeof v[k]==='string' && (/^data:image\/(?:png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(v[k]) || v[k]===DEFAULT[k]) && v[k].length < 1150000 ? v[k] : DEFAULT[k];
      const safeLabel=(key,max)=>typeof v[key]==='string'&&v[key].trim()?v[key].trim().slice(0,max):DEFAULT[key];
      return {name:safeLabel('name',32),title:safeLabel('title',100),logo:safe('logo'),favicon:safe('favicon')};
    } catch {return {...DEFAULT};}
  };
  let current=read(), previousFocus=null, backdrop=null,logo=null,fav=null,status=null,nameInput=null,titleInput=null;
  const apply = value => {
    current={...value};
    document.title=current.title||'INK';
    if(nameInput&&nameInput.value!==current.name)nameInput.value=current.name;
    if(titleInput&&titleInput.value!==current.title)titleInput.value=current.title;
    const link=document.querySelector('link[rel~="icon"]');
    if(link) {link.href=current.favicon;link.type=current.favicon.startsWith('data:')?current.favicon.slice(5,current.favicon.indexOf(';')):'image/png';}
    if(logo && logo.src!==new URL(current.logo,location.href).href)logo.src=current.logo;
    if(fav && fav.src!==new URL(current.favicon,location.href).href)fav.src=current.favicon;
    document.querySelectorAll('[data-ink-brand-logo]').forEach(node=>{if(node.getAttribute('src')!==current.logo)node.setAttribute('src',current.logo);});
    window.dispatchEvent(new Event('ink:branding-changed'));
  };
  const save=value=>{
    try {localStorage.setItem(KEY,JSON.stringify(value));apply(value);return true;}
    catch {setStatus('儲存空間不足或無法寫入；設定未保存');return false;}
  };
  const setStatus=msg=>{if(status)status.textContent=msg;};
  const make=(tag,attrs={},text='')=>{
    const el=document.createElement(tag);
    for(const [k,v] of Object.entries(attrs)){if(k==='class')el.className=v;else el.setAttribute(k,v);}
    if(text)el.textContent=text;
    return el;
  };
  const makeFile=(panel,id,label,kind)=>{
    const l=make('label',{for:id},label);
    const input=make('input',{id,type:'file',accept:'image/png,image/jpeg,image/webp,image/gif'});
    input.addEventListener('change',async()=>{
      const file=input.files?.[0];input.value='';if(!file)return;
      if(!MIME.has(file.type)||file.size>LIMIT[kind]||file.size===0){setStatus('僅接受 PNG、JPEG、WebP、GIF；圖片大小超出限制');return;}
      try {
        const data=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(String(reader.result));
          reader.onerror=()=>reject(new Error('檔案讀取失敗'));
          reader.readAsDataURL(file);
        });
        if(!data.startsWith('data:'+file.type+';base64,')){setStatus('圖片格式不符');return;}
        if(save({...current,[kind]:data}))setStatus(label+' 已儲存並套用至此瀏覽器');
      }catch {setStatus('圖片讀取失敗');}
    });
    panel.append(l,input);
  };
  const close=()=>{if(!backdrop)return;backdrop.hidden=true;previousFocus?.focus?.();};
  const open=()=>{
    if(!backdrop)mount();
    previousFocus=document.activeElement;
    apply(current);backdrop.hidden=false;backdrop.querySelector('[data-ink-brand-close]').focus();
    setStatus('設定只保存在目前瀏覽器，不會修改 INK 文件或所有訪客的品牌圖示');
  };
  const mount=()=>{
    if(backdrop)return;
    backdrop=make('div',{class:'ink-branding-backdrop',hidden:''});
    const panel=make('section',{class:'ink-branding-panel',role:'dialog','aria-modal':'true','aria-label':'INK 品牌圖示'});
    panel.append(make('h2',{},'Preferences'));
    const body=make('div',{class:'ink-branding-pref-body'});
    const nav=make('nav',{class:'ink-branding-pref-nav','aria-label':'Preferences sections'});
    nav.append(make('span',{class:'active'},'Branding'));
    const content=make('div',{class:'ink-branding-pref-content'});
    content.append(make('h3',{},'Branding'));
    content.append(make('p',{class:'ink-branding-help'},'Customize the application identity in this browser.'));
    const fields=make('div',{class:'ink-branding-fields'});
    const addText=(key,label,max)=>{
      const l=make('label',{for:'inkBrand'+key},label);
      const field=make('input',{id:'inkBrand'+key,type:'text',maxlength:String(max)});
      field.value=current[key];
      field.addEventListener('change',()=>{const next=field.value.trim().slice(0,max)||DEFAULT[key];if(save({...current,[key]:next}))setStatus(label+' saved');});
      fields.append(l,field);return field;
    };
    nameInput=addText('name','Application Name',32);
    titleInput=addText('title','Browser Title',100);
    content.append(fields);
    const preview=make('div',{class:'ink-branding-preview'});
    logo=make('img',{alt:'LOGO 預覽'}); fav=make('img',{alt:'Favicon 預覽'});
    preview.append(logo,fav);content.append(preview);
    makeFile(content,'inkBrandLogoFile','Choose Logo','logo');
    makeFile(content,'inkBrandFaviconFile','Choose Favicon','favicon');
    body.append(nav,content);panel.append(body);
    const actions=make('div',{class:'ink-branding-actions'});
    const reset=make('button',{type:'button'},'恢復產品預設');
    reset.addEventListener('click',()=>{if(save(DEFAULT))setStatus('已恢復產品預設');});
    const closeBtn=make('button',{type:'button','data-ink-brand-close':''},'關閉');
    closeBtn.addEventListener('click',close);
    actions.append(reset,closeBtn);
    status=make('p',{class:'ink-branding-status',role:'status'});
    panel.append(actions,status);backdrop.append(panel);document.body.append(backdrop);
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)close();});
    backdrop.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        const focusable=[...panel.querySelectorAll('button,input:not([disabled])')];
        const first=focusable[0],last=focusable[focusable.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    apply(current);
  };
  window.INK_BRANDING=Object.freeze({getLogo:()=>current.logo,getName:()=>current.name,getTitle:()=>current.title});
  window.addEventListener('ink:branding-open',open);
  window.addEventListener('ink:ui-shell-mounted',()=>apply(current));
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
