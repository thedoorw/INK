/* #317 — INK site-default branding: Master UI geometry and governed candidate release. */
(() => {
  'use strict';
  const LEGACY_KEY='ink.web.branding.active.v1';
  // Site-owner media is intentionally outside Static Sync009 managed runtime files.
  const OWNER_FAVICON='https://thedoorw.github.io/INK/assets/favicon-user.png';
  const OWNER_UPLOAD='https://github.com/thedoorw/INK/upload/main/assets';
  const MIME=new Set(['image/png','image/jpeg','image/webp','image/gif','image/svg+xml']);
  const LIMIT={logo:768*1024,favicon:256*1024};
  const DATA_RE=/^data:(image\/(?:png|jpeg|webp|gif|svg\+xml));base64,([a-z0-9+/=]+)$/i;
  const faviconLink=document.querySelector('link[rel~="icon"]');
  const DEFAULT = Object.freeze({
    name:'INK',title:document.title||'INK',
    logo:'assets/ink-mark.svg',
    favicon:faviconLink?.getAttribute('href')||'assets/favicon.png'
  });
  let draft={...DEFAULT};
  let assetFiles={logo:null,favicon:null};
  let backdrop=null,panel=null,header=null,nameInput=null,titleInput=null,button=null,status=null;
  let logoImage=null,faviconImage=null,clearButton=null,previousFocus=null,drag=null;
  let offsetX=0,offsetY=0,pending=0;
  const filenames={logo:null,favicon:null};
  const make=(tag,attrs={},text='')=>{
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)){
      if(key==='class')node.className=value;
      else node.setAttribute(key,value);
    }
    if(text)node.textContent=text;
    return node;
  };
  const statusText=(message='')=>{
    if(!status)return;
    status.textContent=message;
    status.hidden=!message;
  };
  const updated=()=>!!assetFiles.logo||!!assetFiles.favicon||
    draft.name!==DEFAULT.name||draft.title!==DEFAULT.title;
  const refresh=(syncText=false)=>{
    if(syncText){
      if(nameInput)nameInput.value=draft.name;
      if(titleInput)titleInput.value=draft.title;
    }
    if(logoImage)logoImage.src=draft.logo;
    if(faviconImage)faviconImage.src=draft.favicon;
    if(button)button.disabled=pending>0||!updated();
  };
  // GitHub already authenticates the owner; INK only detects their Public-owned file.
  const loadOwnerFavicon=async()=>{
    try{
      const response=await fetch(OWNER_FAVICON+'?v='+Date.now(),{
        method:'HEAD',cache:'no-store'
      });
      if(!response.ok||!/^image\/png\b/i.test(response.headers.get('content-type')||''))return;
      const href=OWNER_FAVICON+'?v='+Date.now();
      faviconLink?.setAttribute('href',href);
      if(!assetFiles.favicon)draft.favicon=href;
      refresh();
    }catch{/* Offline, nonexistent owner file: use built-in favicon. */}
  };
  const imageData=(raw,kind)=>{
    const match=DATA_RE.exec(raw);
    if(!match||!MIME.has(match[1].toLowerCase())||
      raw.length>LIMIT[kind]*1.5+120)return null;
    return {media_type:match[1].toLowerCase(),base64:match[2]};
  };
  function safeSvg(raw){
    if(!/^\s*(?:<\?xml[^>]*\?>\s*)?<svg\b/i.test(raw)||
       !/\bviewBox\s*=\s*["'][^"']+["']/i.test(raw)||
       !/<\/svg\s*>\s*$/i.test(raw))return false;
    if(/<!|<\?(?!xml\b)|\bon[a-z][\w-]*\s*=|\b(?:href|src|style)\s*=|url\s*\(|@import|javascript:|data:/i.test(raw))return false;
    const allowed=new Set(['svg','g','path','rect','circle','ellipse','line','polyline','polygon','title','desc']);
    for(const m of raw.matchAll(/<\s*\/?\s*([a-z][\w:.-]*)\b/gi))
      if(!allowed.has(m[1].toLowerCase()))return false;
    return true;
  }
  const validateData=(data,type)=>{
    const match=DATA_RE.exec(data);
    if(!match||match[1].toLowerCase()!==type)throw Error('圖檔格式與內容不一致');
    // The CLI independently verifies decoded image signatures and rejects active SVG.
    if(typeof atob==='function'){
      const binary=atob(match[2]);
      if(!binary.length)throw Error('圖檔內容為空');
      if(type==='image/svg+xml'&&(!safeSvg(
        new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,ch=>ch.charCodeAt(0)))
      )))throw Error('SVG 含有不允許的內容');
      if(type==='image/png'&&binary.slice(0,8)!=='\x89PNG\r\n\x1a\n')throw Error('PNG 圖檔不正確');
      if(type==='image/jpeg'&&!(binary.charCodeAt(0)===255&&binary.charCodeAt(1)===216&&
        binary.charCodeAt(binary.length-2)===255&&binary.charCodeAt(binary.length-1)===217))
        throw Error('JPEG 圖檔不正確');
      if(type==='image/gif'&&!['GIF87a','GIF89a'].includes(binary.slice(0,6)))throw Error('GIF 圖檔不正確');
      if(type==='image/webp'&&!(binary.slice(0,4)==='RIFF'&&binary.slice(8,12)==='WEBP'))
        throw Error('WebP 圖檔不正確');
    }
    return match[2];
  };
  const restoreLegacy=()=>{
    try{
      const old=JSON.parse(localStorage.getItem(LEGACY_KEY)||'null');
      if(!old||typeof old!=='object')return false;
      let any=false;
      // Old local favicon drafts must never mask the Public owner's current icon.
      for(const kind of ['logo']){
        const entry=typeof old[kind]==='string'&&imageData(old[kind],kind);
        if(entry){draft[kind]=old[kind];assetFiles[kind]=entry;any=true;}
      }
      for(const [key,max] of [['name',32],['title',100]]){
        if(typeof old[key]==='string'&&old[key].trim()&&
          old[key].trim()!==DEFAULT[key]&&old[key].trim()!=='INK'){
          draft[key]=old[key].trim().slice(0,max);any=true;
        }
      }
      return any;
    }catch{return false;}
  };
  const recenter=()=>{
    drag=null;offsetX=0;offsetY=0;
    if(panel)panel.style.transform='';
    if(header)header.removeAttribute('data-dragging');
  };
  const close=()=>{
    if(!backdrop||backdrop.hidden)return;
    backdrop.hidden=true;recenter();
    previousFocus?.focus?.();
  };
  const open=()=>{
    if(!backdrop)mount();
    if(!backdrop.hidden)return;
    previousFocus=document.activeElement;
    recenter();backdrop.hidden=false;
    statusText('');
    nameInput.focus();
  };
  const reset=()=>{
    try{localStorage.removeItem(LEGACY_KEY);}catch{}
    draft={...DEFAULT};
    assetFiles={logo:null,favicon:null};
    for(const kind of ['logo','favicon']){
      if(filenames[kind])filenames[kind].textContent='未選擇檔案';
    }
    refresh(true);
    statusText('未提交變更已清除；網站設定沒有改變。');
  };
  const makeFile=(parent,id,label,kind)=>{
    const row=make('div',{class:'ink-branding-file-row'});
    const heading=make('label',{for:id},label);
    const controls=make('div',{class:'ink-branding-file-controls'});
    const chooser=make('button',{type:'button',class:'ink-branding-file-choose','data-ink-brand-choose':kind},'選擇圖檔');
    const filename=make('span',{class:'ink-branding-file-name'},'未選擇檔案');
    filenames[kind]=filename;
    const input=make('input',{id,type:'file',accept:[...MIME].join(','),hidden:''});
    input.hidden=true;
    chooser.addEventListener('click',()=>input.click());
    input.addEventListener('change',()=>{
      const file=input.files?.[0];input.value='';
      if(!file)return;
      if(!MIME.has(file.type)||!file.size||file.size>LIMIT[kind]){
        statusText(label+' 格式或大小不符');return;
      }
      pending++;refresh();
      const reader=new FileReader();
      reader.onload=()=>{
        try{
          const data=String(reader.result);
          const base64=validateData(data,file.type);
          if(Math.ceil(base64.length*3/4)>LIMIT[kind])throw Error('圖檔超過大小限制');
          draft[kind]=data;
          assetFiles[kind]={media_type:file.type,base64};
          filename.textContent=file.name||'已選擇圖檔';
          filename.title=file.name||'';
          statusText(label+' 已加入發布候選，尚未更新網站。');
        }catch(error){statusText(label+' 無法使用：'+error.message);}
        finally{pending--;refresh();}
      };
      reader.onerror=()=>{pending--;refresh();statusText(label+' 無法讀取圖檔。');};
      reader.readAsDataURL(file);
    });
    controls.append(chooser,filename,input);
    row.append(heading,controls);parent.append(row);
  };
  const exportCandidate=()=>{
    if(pending||!updated())return;
    const name=draft.name.trim(),title=draft.title.trim();
    if(!name||!title||name.length>32||title.length>100||
      /[\u0000-\u001f\u007f<>]/u.test(name+title)){
      statusText('網站名稱或標題不符合規格。');return;
    }
    const assets={};
    for(const kind of ['logo','favicon'])if(assetFiles[kind])assets[kind]=assetFiles[kind];
    const candidate={
      schema:'INK_SITE_BRANDING_CANDIDATE_V2',
      status:'AWAITING_REVIEW',
      intent:'SET_WEBSITE_DEFAULT_AFTER_RELEASE',
      site:'https://thedoorw.github.io/INK/',
      destination:'thedoorw/INK-Browser-QA (Private source) -> Static Sync009 -> thedoorw/INK (Public)',
      metadata:{name,title},assets,
      publication_note:'需經 INK PUBLISH 審查、Private QA、Public exact-HEAD 核准及 Pages 部署才會在所有裝置生效。'
    };
    const blob=new Blob([JSON.stringify(candidate,null,2)+'\n'],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=make('a',{href:url,download:'INK_SITE_BRANDING_CANDIDATE.json'});
    document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);
    statusText('網站設定候選已下載，正式發布後生效。');
  };
  function mount(){
    if(backdrop)return;
    backdrop=make('div',{class:'ink-branding-backdrop',hidden:''});
    backdrop.hidden=true;
    panel=make('section',{class:'ink-branding-panel',role:'dialog','aria-modal':'true',
      'aria-label':'網站品牌設定','aria-describedby':'inkBrandHelp'});
    header=make('header',{class:'dialog-header ink-branding-header'});
    const title=make('h2',{},'網站品牌設定');
    const x=make('button',{type:'button',class:'dialog-close','aria-label':'關閉品牌設定'},'×');
    x.addEventListener('click',close);header.append(title,x);panel.append(header);
    const body=make('div',{class:'ink-branding-pref-body'});
    const content=make('div',{class:'ink-branding-pref-content'});
    const fields=make('div',{class:'ink-branding-fields'});
    const makeText=(key,label,max)=>{
      const lab=make('label',{for:'inkBrand'+key},label);
      const input=make('input',{id:'inkBrand'+key,type:'text',maxlength:String(max)});
      input.addEventListener('input',()=>{
        draft[key]=input.value.slice(0,max);
        refresh(); // preserve the cursor, selection and typed spacing
      });
      fields.append(lab,input);return input;
    };
    nameInput=makeText('name','Application Name',32);
    titleInput=makeText('title','Browser Title',100);
    content.append(fields);
    const preview=make('div',{class:'ink-branding-preview'});
    const logoGroup=make('div',{class:'ink-branding-preview-item'});
    logoGroup.append(make('span',{class:'ink-branding-preview-label'},'Logo'));
    logoImage=make('img',{alt:'網站 Logo 預覽'});
    logoGroup.append(logoImage);
    const faviconGroup=make('div',{class:'ink-branding-preview-item'});
    faviconGroup.append(make('span',{class:'ink-branding-preview-label'},'Favicon'));
    faviconImage=make('img',{alt:'網站 Favicon 預覽'});
    faviconGroup.append(faviconImage);
    preview.append(logoGroup,faviconGroup);content.append(preview);
    makeFile(content,'inkBrandLogoFile','Choose Logo','logo');
    const faviconRow=make('div',{class:'ink-branding-file-row'});
    const ownerLink=make('a',{
      href:OWNER_UPLOAD,target:'_blank',rel:'noopener noreferrer',
      'data-ink-brand-owner-favicon':''
    },'在 GitHub 更換 Favicon');
    faviconRow.append(make('label',{},'Favicon'),ownerLink);
    content.append(faviconRow);
    content.append(make('p',{id:'inkBrandHelp',class:'ink-branding-help'},
      'Favicon：在 GitHub 上傳 favicon-user.png 並提交，重新整理 INK 即生效。其他網站設定仍由 INK PUBLISH 發布。'));
    body.append(content);panel.append(body);
    status=make('p',{class:'ink-branding-status',role:'status','aria-live':'polite'});
    status.hidden=true;
    panel.append(status);
    const footer=make('div',{class:'dialog-footer ink-branding-actions'});
    clearButton=make('button',{type:'button','data-ink-brand-clear':''},'清除');
    clearButton.addEventListener('click',reset);
    button=make('button',{type:'button','data-ink-brand-public-candidate':'',class:'primary'},'下載其他設定候選');
    button.addEventListener('click',exportCandidate);
    const dismiss=make('button',{type:'button','data-ink-brand-close':''},'關閉');
    dismiss.addEventListener('click',close);
    footer.append(clearButton,button,dismiss);panel.append(footer);
    backdrop.append(panel);document.body.append(backdrop);
    backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
    backdrop.addEventListener('keydown',e=>{
      if(e.key==='Escape'){e.preventDefault();close();}
      if(e.key==='Tab'){
        const all=[...panel.querySelectorAll('button:not([disabled]),input:not([disabled]):not([hidden])')];
        const first=all[0],last=all[all.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
    });
    header.addEventListener('pointerdown',e=>{
      if(backdrop.hidden||e.button!==0||e.pointerType!=='mouse'||
        (typeof matchMedia==='function'&&matchMedia('(max-width:600px)').matches)||
        e.target.closest('button,input,a'))return;
      const r=panel.getBoundingClientRect();e.preventDefault();
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top,width:r.width,height:r.height,offsetX,offsetY};
      header.setPointerCapture(e.pointerId);
      header.setAttribute('data-dragging','true');
    });
    header.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      const mx=Math.max(8-drag.left,Math.min(window.innerWidth-drag.width-8-drag.left,e.clientX-drag.x));
      const my=Math.max(8-drag.top,Math.min(window.innerHeight-drag.height-8-drag.top,e.clientY-drag.y));
      offsetX=drag.offsetX+mx;offsetY=drag.offsetY+my;
      panel.style.transform='translate('+offsetX+'px,'+offsetY+'px)';
    });
    const end=e=>{
      if(!drag||e.pointerId!==drag.id)return;
      drag=null;header.removeAttribute('data-dragging');
      if(header.hasPointerCapture(e.pointerId))header.releasePointerCapture(e.pointerId);
    };
    header.addEventListener('pointerup',end);
    header.addEventListener('pointercancel',end);
    window.addEventListener('resize',()=>{if(!backdrop.hidden)recenter();});
    const legacy=restoreLegacy();
    refresh(true);
    if(legacy)statusText('舊本機設定已載入為候選，不會覆蓋網站圖示。');
  }
  window.INK_BRANDING=Object.freeze({
    getLogo:()=>DEFAULT.logo,getName:()=>DEFAULT.name,getTitle:()=>DEFAULT.title
  });
  window.addEventListener('ink:branding-open',open);
  window.addEventListener('ink:ui-shell-mounted',()=>{
    document.querySelectorAll('[data-ink-brand-logo]').forEach(node=>{
      if(node.getAttribute('src')!==DEFAULT.logo)node.setAttribute('src',DEFAULT.logo);
    });
    window.dispatchEvent(new Event('ink:branding-changed'));
  });
  void loadOwnerFavicon();
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
})();
