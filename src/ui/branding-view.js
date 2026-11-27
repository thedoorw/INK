/* #765 Pure branding view shared by Real and Mock: no IO or product commands. */
(() => {
  'use strict';
  const make=(tag,attrs={},text='')=>{
    const node=document.createElement(tag);
    for(const [key,value] of Object.entries(attrs)){
      if(key==='class')node.className=value;
      else node.setAttribute(key,value);
    }
    if(text)node.textContent=text;
    return node;
  };
  function createBrandingView({ownerUpload}={}){
    const backdrop=make('div',{class:'ink-branding-backdrop',hidden:''});
    backdrop.hidden=true;
    const panel=make('section',{class:'ink-branding-panel',role:'dialog','aria-modal':'true',
      'aria-label':'網站品牌設定','aria-describedby':'inkBrandHelp'});
    const header=make('header',{class:'dialog-header ink-branding-header'});
    const title=make('h2',{},'網站品牌設定');
    const close=make('button',{type:'button',class:'dialog-close','aria-label':'關閉品牌設定'},'×');
    header.append(title,close);panel.append(header);
    const body=make('div',{class:'ink-branding-pref-body'});
    const content=make('div',{class:'ink-branding-pref-content'});
    const fields=make('div',{class:'ink-branding-fields'});
    const makeText=(key,label,max)=>{
      const lab=make('label',{for:'inkBrand'+key},label);
      const input=make('input',{id:'inkBrand'+key,type:'text',maxlength:String(max)});
      fields.append(lab,input);return input;
    };
    const nameInput=makeText('name','Application Name',32);
    const titleInput=makeText('title','Browser Title',100);
    content.append(fields);
    const preview=make('div',{class:'ink-branding-preview'});
    const logoGroup=make('div',{class:'ink-branding-preview-item'});
    logoGroup.append(make('span',{class:'ink-branding-preview-label'},'Logo'));
    const logoImage=make('img',{alt:'網站 Logo 預覽'});
    logoGroup.append(logoImage);
    const faviconGroup=make('div',{class:'ink-branding-preview-item'});
    faviconGroup.append(make('span',{class:'ink-branding-preview-label'},'Favicon'));
    const faviconImage=make('img',{alt:'網站 Favicon 預覽'});
    faviconGroup.append(faviconImage);
    preview.append(logoGroup,faviconGroup);content.append(preview);
    const logoRow=make('div',{class:'ink-branding-file-row'});
    const logoHeading=make('label',{for:'inkBrandLogoFile'},'Choose Logo');
    const logoControls=make('div',{class:'ink-branding-file-controls'});
    const logoChoose=make('button',{type:'button',class:'ink-branding-file-choose','data-ink-brand-choose':'logo'},'選擇圖檔');
    const logoFilename=make('span',{class:'ink-branding-file-name'},'未選擇檔案');
    const logoInput=make('input',{id:'inkBrandLogoFile',type:'file',accept:'image/png,image/jpeg,image/webp,image/gif,image/svg+xml',hidden:''});
    logoInput.hidden=true;
    logoControls.append(logoChoose,logoFilename,logoInput);
    logoRow.append(logoHeading,logoControls);content.append(logoRow);
    const faviconRow=make('div',{class:'ink-branding-file-row'});
    const ownerLink=make('a',{
      href:ownerUpload||'',target:'_blank',rel:'noopener noreferrer',
      'data-ink-brand-owner-favicon':''
    },'在 GitHub 更換 Favicon');
    faviconRow.append(make('label',{},'Favicon'),ownerLink);content.append(faviconRow);
    content.append(make('p',{id:'inkBrandHelp',class:'ink-branding-help'},
      'Favicon：在 GitHub 上傳 favicon-user.png 並提交，重新整理 INK 即生效。其他網站設定仍由 INK PUBLISH 發布。'));
    body.append(content);panel.append(body);
    const status=make('p',{class:'ink-branding-status',role:'status','aria-live':'polite'});
    status.hidden=true;panel.append(status);
    const footer=make('div',{class:'dialog-footer ink-branding-actions'});
    const clearButton=make('button',{type:'button','data-ink-brand-clear':''},'清除');
    const candidateButton=make('button',{type:'button','data-ink-brand-public-candidate':'',class:'primary'},'下載其他設定候選');
    const dismiss=make('button',{type:'button','data-ink-brand-close':''},'關閉');
    footer.append(clearButton,candidateButton,dismiss);panel.append(footer);
    backdrop.append(panel);
    return {backdrop,panel,header,close,nameInput,titleInput,logoImage,faviconImage,
      logoChoose,logoFilename,logoInput,ownerLink,status,clearButton,candidateButton,dismiss};
  }
  globalThis.INK_BRANDING_VIEW=Object.freeze({createBrandingView});
})();
