/* #317 — site-wide branding release candidate; no browser-local override or deployment credentials. */
(() => {
  'use strict';
  const LEGACY_KEY = 'ink.web.branding.active.v1';
  const MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml']);
  const LIMIT = {logo:768*1024, favicon:256*1024};
  const dataPattern = /^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([a-z0-9+/=]+)$/i;
  const faviconLink = document.querySelector('link[rel~="icon"]');
  const DEFAULT = Object.freeze({
    name:'INK',
    title:document.title || 'INK',
    logo:'assets/ink-mark.svg',
    favicon:faviconLink?.getAttribute('href') || 'assets/favicon.png'
  });
  let draft={...DEFAULT}, assetFiles={logo:null,favicon:null}, dirty=false;
  let previousFocus=null, backdrop=null, logoPreview=null, faviconPreview=null, status=null;
  let nameInput=null, titleInput=null, candidateButton=null;

  // Old per-browser settings are never applied to the tab or the site.
  // Allow one-time proposal reuse without silently losing the USER's previously uploaded art.
  const readLegacyDraft = () => {
    try {
      const saved=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');
      if (!saved || typeof saved !== 'object') return false;
      let found=false;
      for (const kind of ['logo','favicon']) {
        const match=typeof saved[kind]==='string' && dataPattern.exec(saved[kind]);
        if (!match || !MIME.has(match[1].toLowerCase()) || saved[kind].length>LIMIT[kind]*1.5+120) continue;
        draft[kind]=saved[kind];
        assetFiles[kind]={media_type:match[1].toLowerCase(),base64:match[2]};
        found=true;
      }
      // Preserve original labels only when they were actually customized.
      for (const [key,max] of [['name',32],['title',100]]) {
        if (typeof saved[key]==='string' && saved[key].trim() && saved[key].trim()!==DEFAULT[key] && saved[key].trim()!=='INK') {
          draft[key]=saved[key].trim().slice(0,max);
          found=true;
        }
      }
      return found;
    } catch { return false; }
  };

  const make=(tag,attrs={},value='')=>{
    const el=document.createElement(tag);
    for (const [key,val] of Object.entries(attrs)) {
      if (key==='class') el.className=val; else el.setAttribute(key,val);
    }
    if (value) el.textContent=value;
    return el;
  };
  const setStatus=message=>{if(status)status.textContent=message;};
  const updateDraftUI=()=>{
    if (nameInput) nameInput.value=draft.name;
    if (titleInput) titleInput.value=draft.title;
    if (logoPreview) logoPreview.src=draft.logo;
    if (faviconPreview) faviconPreview.src=draft.favicon;
    dirty=!!assetFiles.logo||!!assetFiles.favicon||
      draft.name!==DEFAULT.name||draft.title!==DEFAULT.title;
    if (candidateButton) candidateButton.disabled=!dirty;
  };
  const resetDraft=()=>{
    // USER explicitly discards any old per-browser override being offered for migration.
    try {localStorage.removeItem(LEGACY_KEY);} catch {}
    draft={...DEFAULT};
    assetFiles={logo:null,favicon:null};
    updateDraftUI();
    setStatus('已清除候選及舊本機圖示紀錄；公開網站設定沒有改變。');
  };

  const makeFile=(parent,id,label,kind)=>{
    const heading=make('label',{for:id},label);
    const input=make('input',{id,type:'file',accept:'image/png,image/jpeg,image/webp,image/gif,image/svg+xml'});
    input.addEventListener('change',async()=>{
      const file=input.files?.[0]; input.value=''; if(!file)return;
      if(!MIME.has(file.type)||!file.size||file.size>LIMIT[kind]) {
        setStatus(label+' 格式或大小不符');return;
      }
      try {
        const data=await new Promise((resolve,reject)=>{
          const reader=new FileReader();
          reader.onload=()=>resolve(String(reader.result));
          reader.onerror=()=>reject(new Error('READ_FAILED'));
          reader.readAsDataURL(file);
        });
        const match=dataPattern.exec(data);
        if (!match || match[1].toLowerCase()!==file.type) throw new Error('MIME_MISMATCH');
        draft[kind]=data;
        assetFiles[kind]={media_type:file.type,base64:match[2]};
        updateDraftUI();
        setStatus(label+' 已加入待發布候選；未套用至此瀏覽器或公開網站。');
      } catch {setStatus(label+' 讀取失敗，未更動候選');}
    });
    parent.append(heading,input);
  };

  const exportCandidate=()=>{
    if (!dirty) {setStatus('請先修改網站品牌設定');return;}
    const assets={};
    for (const kind of ['logo','favicon']) if(assetFiles[kind]) assets[kind]=assetFiles[kind];
    const candidate={
      schema:'INK_SITE_BRANDING_CANDIDATE_V2',
      status:'AWAITING_REVIEW',
      intent:'SET_WEBSITE_DEFAULT_AFTER_RELEASE',
      site:'https://thedoorw.github.io/INK/',
      destination:'thedoorw/INK-Browser-QA (Private source) -> Static Sync009 -> thedoorw/INK (Public)',
      metadata:{name:draft.name,title:draft.title},
      assets,
      publication_note:'此檔案只是發布候選；必須經 Private 審查、QA、Public exact-HEAD 核准和 Pages 部署才會對所有裝置生效。'
    };
    const blob=new Blob([JSON.stringify(candidate,null,2)+'\n'],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const link=make('a',{href:url,download:'INK_SITE_BRANDING_CANDIDATE.json'});
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    setStatus('網站預設候選已下載，尚未發布。交由 INK 正式發布流程審查後才會跨裝置生效。');
  };

  const close=()=>{if(!backdrop)return;backdrop.hidden=true;previousFocus?.focus?.();};
  const open=()=>{
    if (!backdrop)mount();
    previousFocus=document.activeElement;
    backdrop.hidden=false;
    nameInput.focus();
    setStatus('此處只準備網站預設候選；本機不會覆蓋網站預設。');
  };
  const mount=()=>{
    if(backdrop)return;
    backdrop=make('div',{class:'ink-branding-backdrop',hidden:''});
    const panel=make('section',{class:'ink-branding-panel',role:'dialog','aria-modal':'true','aria-label':'INK 網站品牌設定'});
    const header=make('header',{class:'dialog-header'});
    header.append(make('h2',{},'網站品牌設定'));
    const dismiss=make('button',{type:'button',class:'dialog-close','aria-label':'Close Branding'},'×');
    dismiss.addEventListener('click',close); header.append(dismiss);panel.append(header);
    const body=make('div',{class:'ink-branding-pref-body'});
    const content=make('div',{class:'ink-branding-pref-content'});
    const fields=make('div',{class:'ink-branding-fields'});
    const addText=(key,label,max)=>{
      const lab=make('label',{for:'inkBrand'+key},label);
      const input=make('input',{id:'inkBrand'+key,type:'text',maxlength:String(max)});
      input.addEventListener('input',()=>{
        draft[key]=input.value.slice(0,max)||DEFAULT[key];
        updateDraftUI();
      });
      fields.append(lab,input); return input;
    };
    nameInput=addText('name','Application Name',32);
    titleInput=addText('title','Browser Title',100);
    content.append(fields);
    const preview=make('div',{class:'ink-branding-preview'});
    logoPreview=make('img',{alt:'網站 Logo 候選預覽'});
    faviconPreview=make('img',{alt:'網站 Favicon 候選預覽'});
    preview.append(logoPreview,faviconPreview);content.append(preview);
    makeFile(content,'inkBrandLogoFile','Choose Logo','logo');
    makeFile(content,'inkBrandFaviconFile','Choose Favicon','favicon');
    const info=make('p',{class:'ink-branding-status'},
      '設為網站預設需經審查與正式發布；此介面不保存僅此瀏覽器的圖示。');
    content.append(info);
    body.append(content);panel.append(body);
    const actions=make('div',{class:'dialog-footer ink-branding-actions'});
    const clear=make('button',{type:'button'},'清除未提交變更');
    clear.addEventListener('click',resetDraft);
    candidateButton=make('button',{type:'button','data-ink-brand-public-candidate':'',class:'primary'},
      '設為網站預設（準備發布）');
    candidateButton.addEventListener('click',exportCandidate);
    const closeButton=make('button',{type:'button','data-ink-brand-close':''},'關閉');
    closeButton.addEventListener('click',close);
    actions.append(clear,candidateButton,closeButton);
    status=make('p',{class:'ink-branding-status',role:'status'});
    panel.append(status,actions);backdrop.append(panel);document.body.append(backdrop);
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)close();});
    backdrop.addEventListener('keydown',event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
      if(event.key==='Tab'){
        const controls=[...panel.querySelectorAll('button:not([disabled]),input:not([disabled])')];
        const first=controls[0],last=controls[controls.length-1];
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    });
    const recovered=readLegacyDraft();
    updateDraftUI();
    if (recovered) setStatus('已在候選中載入舊本機設定，但未套用；提交後才能成為網站預設。');
  };
  window.INK_BRANDING=Object.freeze({
    getLogo:()=>DEFAULT.logo,getName:()=>DEFAULT.name,getTitle:()=>DEFAULT.title
  });
  window.addEventListener('ink:branding-open',open);
  window.addEventListener('ink:ui-shell-mounted',()=>{
    // Site defaults remain the only active visual assets.
    document.querySelectorAll('[data-ink-brand-logo]').forEach(node=>{
      if(node.getAttribute('src')!==DEFAULT.logo)node.setAttribute('src',DEFAULT.logo);
    });
    window.dispatchEvent(new Event('ink:branding-changed'));
  });
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
