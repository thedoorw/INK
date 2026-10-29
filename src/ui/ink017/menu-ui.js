// INK Menu UI 001. Presentation-only menu: Native commands and selectors remain authoritative.
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
// INK v4.1: SOURCE-backed 8-category catalogue; coreOnly entries have no command.
const categoryNames={"file":"檔案","edit":"編輯","image":"影像","select":"選取","filter":"濾鏡","view":"檢視","plugins":"擴充","window":"視窗"};
const groups={
 "file": [
  [
   {
    "label": "新增文件…",
    "key": "new"
   },
   {
    "label": "開啟文件…",
    "key": "open"
   },
   {
    "label": "開啟中的文件",
    "dynamic": "sessions"
   },
   {
    "label": "關閉文件…",
    "key": "close"
   },
   {
    "label": "儲存文件",
    "key": "save"
   },
   {
    "label": "文件復原工具…",
    "key": "recover"
   },
   {
    "label": "匯出 PNG／SVG／PDF",
    "children": [
     {
      "label": "PNG…",
      "key": "export:png"
     },
     {
      "label": "SVG…",
      "key": "export:svg"
     },
     {
      "label": "PDF…",
      "key": "export:pdf"
     }
    ]
   },
   {
    "label": "匯入影像…",
    "key": "import-image"
   }
  ]
 ],
 "edit": [
  [
   {
    "label": "復原",
    "key": "undo"
   },
   {
    "label": "重做",
    "key": "redo"
   },
   {
    "label": "複製選取",
    "key": "copy"
   },
   {
    "label": "貼上",
    "key": "paste"
   },
   {
    "label": "刪除選取物件",
    "key": "delete"
   },
   {
    "label": "複製物件",
    "key": "duplicate"
   },
   {
    "label": "物件變形…",
    "key": "transform"
   },
   {
    "label": "物件變形選項",
    "key": "transform"
   },
   {
    "label": "對齊選取…",
    "key": "align"
   },
   {
    "label": "偏好設定",
    "children": [
     {
      "label": "品牌設定…",
      "key": "branding"
     },
     {
      "label": "歷程記錄…",
      "key": "history-limit"
     }
    ]
   },
   {
    "label": "路徑節點操作",
    "coreOnly": true,
    "children": [
     {
      "label": "插入／刪除節點",
      "coreOnly": true
     },
     {
      "label": "角點／平滑／對稱",
      "coreOnly": true
     },
     {
      "label": "簡化路徑",
      "coreOnly": true
     },
     {
      "label": "細化路徑",
      "coreOnly": true
     }
    ]
   }
  ]
 ],
 "image": [
  [
   {
    "label": "選取影像色彩模式",
    "children": [
     {
      "label": "RGB",
      "key": "image-mode:RGB"
     },
     {
      "label": "CMYK",
      "key": "image-mode:CMYK"
     },
     {
      "label": "Lab",
      "key": "image-mode:Lab"
     }
    ]
   },
   {
    "label": "既有調整項目",
    "coreOnly": true,
    "children": [
     {
      "label": "亮度／對比度",
      "coreOnly": true
     },
     {
      "label": "色階",
      "coreOnly": true
     },
     {
      "label": "曲線",
      "coreOnly": true
     },
     {
      "label": "色相／飽和度",
      "coreOnly": true
     },
     {
      "label": "色彩平衡",
      "coreOnly": true
     },
     {
      "label": "漸層對應",
      "coreOnly": true
     }
    ]
   },
   {
    "label": "進階調整運算",
    "coreOnly": true,
    "children": [
     {
      "label": "曝光",
      "coreOnly": true
     },
     {
      "label": "自然飽和度",
      "coreOnly": true
     },
     {
      "label": "黑白",
      "coreOnly": true
     },
     {
      "label": "相片濾鏡",
      "coreOnly": true
     },
     {
      "label": "色版混合器",
      "coreOnly": true
     },
     {
      "label": "色彩查詢",
      "coreOnly": true
     },
     {
      "label": "負片",
      "coreOnly": true
     },
     {
      "label": "色調分離",
      "coreOnly": true
     },
     {
      "label": "臨界值",
      "coreOnly": true
     },
     {
      "label": "可選顏色",
      "coreOnly": true
     }
    ]
   },
   {
    "label": "影像調整",
    "key": "adjustments"
   },
   {
    "label": "選取影像位元深度",
    "children": [
     {
      "label": "8 位元",
      "key": "image-depth:8"
     },
     {
      "label": "16 位元",
      "key": "image-depth:16"
     },
     {
      "label": "32 位元",
      "key": "image-depth:32"
     }
    ]
   },
   {
    "label": "影像尺寸（選取影像）…",
    "key": "image-size"
   },
   {
    "label": "版面尺寸…",
    "key": "canvas-size"
   },
   {
    "label": "裁切選取影像…",
    "key": "crop"
   },
   {
    "label": "整份作品尺寸…",
    "key": "artwork"
   },
   {
    "label": "輸出解析度…",
    "key": "ppi"
   }
  ]
 ],
 "select": [
  [
   {
    "label": "物件選取／移動",
    "coreOnly": true
   },
   {
    "label": "自由套索（物件）",
    "coreOnly": true
   },
   {
    "label": "像素選取工具",
    "coreOnly": true,
    "children": [
     {
      "label": "多邊形套索",
      "coreOnly": true
     },
     {
      "label": "磁性套索",
      "coreOnly": true
     },
     {
      "label": "魔術棒",
      "coreOnly": true
     },
     {
      "label": "快速選取",
      "coreOnly": true
     },
     {
      "label": "像素物件選取",
      "coreOnly": true
     },
     {
      "label": "矩形像素選框",
      "coreOnly": true
     },
     {
      "label": "橢圓像素選框",
      "coreOnly": true
     }
    ]
   },
   {
    "label": "選取合併模式",
    "coreOnly": true,
    "children": [
     {
      "label": "建立新選取",
      "coreOnly": true
     },
     {
      "label": "加入選取",
      "coreOnly": true
     },
     {
      "label": "減去選取",
      "coreOnly": true
     },
     {
      "label": "交集選取",
      "coreOnly": true
     }
    ]
   },
   {
    "label": "修改選取範圍",
    "coreOnly": true,
    "children": [
     {
      "label": "平滑",
      "coreOnly": true
     },
     {
      "label": "羽化",
      "coreOnly": true
     },
     {
      "label": "擴張",
      "coreOnly": true
     },
     {
      "label": "縮減",
      "coreOnly": true
     }
    ]
   },
   {
    "label": "清除暫存像素選取",
    "coreOnly": true
   },
   {
    "label": "選取範圍轉遮色片",
    "coreOnly": true
   }
  ]
 ],
 "filter": [
  [
   {
    "label": "基礎濾鏡",
    "coreOnly": true,
    "children": [
     {
      "label": "高斯模糊",
      "coreOnly": true
     },
     {
      "label": "銳利化",
      "coreOnly": true
     },
     {
      "label": "高反差保留",
      "coreOnly": true
     },
     {
      "label": "邊緣偵測",
      "coreOnly": true
     },
     {
      "label": "顆粒雜訊",
      "coreOnly": true
     },
     {
      "label": "紋理覆蓋",
      "coreOnly": true
     }
    ]
   },
   {
    "label": "進階濾鏡",
    "coreOnly": true,
    "children": [
     {
      "label": "動態模糊",
      "coreOnly": true
     },
     {
      "label": "中間值",
      "coreOnly": true
     },
     {
      "label": "遮色片銳利化",
      "coreOnly": true
     },
     {
      "label": "浮雕",
      "coreOnly": true
     },
     {
      "label": "馬賽克",
      "coreOnly": true
     },
     {
      "label": "最小值",
      "coreOnly": true
     },
     {
      "label": "最大值",
      "coreOnly": true
     },
     {
      "label": "減少雜訊",
      "coreOnly": true
     }
    ]
   },
   {
    "label": "液化",
    "coreOnly": true
   }
  ]
 ],
 "view": [
  [
   {
    "label": "放大顯示",
    "key": "zoom-in"
   },
   {
    "label": "縮小顯示",
    "key": "zoom-out"
   },
   {
    "label": "符合內容",
    "key": "fit"
   },
   {
    "label": "符合工作區域",
    "key": "fit-artboard"
   },
   {
    "label": "100%",
    "key": "100"
   },
   {
    "label": "200%",
    "key": "200"
   },
   {
    "label": "多視圖配置",
    "children": [
     {
      "label": "單一視圖",
      "key": "view:1"
     },
     {
      "label": "兩個視圖",
      "key": "view:2"
     },
     {
      "label": "四個視圖",
      "key": "view:4"
     }
    ]
   },
   {
    "label": "靠齊",
    "key": "view:snap"
   },
   {
    "label": "靠齊至",
    "children": [
     {
      "label": "參考線",
      "key": "view:snap:guides"
     },
     {
      "label": "邊緣",
      "key": "view:snap:edges"
     },
     {
      "label": "中心",
      "key": "view:snap:centers"
     },
     {
      "label": "等距",
      "key": "view:snap:equalDistance"
     }
    ]
   },
   {
    "label": "參考線操作",
    "coreOnly": true,
    "children": [
     {
      "label": "新增參考線…",
      "coreOnly": true
     },
     {
      "label": "移動參考線",
      "coreOnly": true
     },
     {
      "label": "顯示／隱藏",
      "coreOnly": true
     },
     {
      "label": "鎖定／解除鎖定",
      "coreOnly": true
     },
     {
      "label": "刪除參考線",
      "coreOnly": true
     }
    ]
   }
  ]
 ],
 "plugins": [
  [
   {
    "label": "Recipe 引擎",
    "key": "recipe-engine"
   },
   {
    "label": "Recipe 匯入與執行",
    "key": "recipe-workflow"
   },
   {
    "label": "轉譯 Photoshop Action",
    "key": "translate-photoshop"
   },
   {
    "label": "轉譯 Illustrator JSX",
    "key": "translate-illustrator"
   },
   {
    "label": "轉譯 Figma Skill",
    "key": "translate-figma"
   },
   {
    "label": "轉譯 Canva 資料集",
    "key": "translate-canva"
   }
  ]
 ],
 "window": [
  [
   {
    "label": "導覽器 面板",
    "key": "panel:navigator"
   },
   {
    "label": "色彩 面板",
    "key": "panel:color"
   },
   {
    "label": "色票 面板",
    "key": "panel:swatches"
   },
   {
    "label": "字元 面板",
    "key": "panel:character"
   },
   {
    "label": "段落 面板",
    "key": "panel:paragraph"
   },
   {
    "label": "筆刷 面板",
    "key": "panel:brushes"
   },
   {
    "label": "調整 面板",
    "key": "panel:adjustments"
   },
   {
    "label": "圖層 面板",
    "key": "panel:layers"
   },
   {
    "label": "歷程記錄 面板",
    "key": "panel:history"
   },
   {
    "label": "路徑 面板",
    "key": "panel:paths"
   }
  ]
 ]
};
export function mountMenuUi({menu,logo,host,invoke,signal}){
 let category='file',submenu=null,wasOpen=false;
 const state=()=>{
  const s=host.getSnapshot(),h=host.getHistory(),doc=host.select('document.current')||{},transfer=host.select('session.transfer')||{},sessions=host.select('session.list')||[];
  const active=sessions.find(x=>x.active);
  const rasterInfo=host.provider.image.selectedInfo();
  const snapEnabled=host.app.page?.()?.snap?.enabled!==false,snapCategories=host.app.page?.()?.snap?.categories||{};
  return {s,h,doc,transfer,active,sessions,hasDoc:!!s.docs.length&&doc.open!==false,rasterInfo,snapEnabled,snapCategories};
 };
 const enabled=(key,v)=>{
  if(!key)return false;
  if(['recipe-workflow','recipe-engine','translate-photoshop','translate-illustrator','translate-figma','translate-canva'].includes(key))return typeof host.app?.inkPublicApi?.tools?.invoke==='function';
  if(['new','open','about','branding','native-tools','recover','history-limit'].includes(key)||key.startsWith('panel:'))return true;
  if(!v.hasDoc)return false;
  if(key.startsWith('session:'))return v.sessions.some(x=>x.sessionId===key.slice(8));
  if(key==='align')return !v.s.object?.locked&&(v.s.target?.refs?.length||0)>=2;
  if(key==='undo')return v.h.index>0;
  if(key==='redo')return v.h.index<v.h.entries.length-1;
  if(['copy','duplicate','delete','transform'].includes(key))return !!v.s.object&&!v.s.object.locked;
  if(key==='paste')return v.transfer.ready===true;
  if(['image-size','crop'].includes(key))return !!v.s.object?.raster&&!v.s.object.locked&&v.rasterInfo?.bitDepth===8&&v.rasterInfo?.colorMode==='RGB';
  if(key.startsWith('image-mode:')||key.startsWith('image-depth:'))return !!v.s.object?.raster&&!v.s.object.locked;
  if(key==='view:snap'||key.startsWith('view:snap:'))return v.hasDoc;
  return true;
 };
 const renderRow=(item,v,sub=false)=>{
  const children=item.dynamic==='sessions'?v.sessions.map(x=>({label:(x.title||'Untitled')+(x.active?' ✓':''),key:'session:'+x.sessionId})):item.children,valid=children?(item.coreOnly||children.some(x=>enabled(x.key,v))):!item.coreOnly&&enabled(item.key,v);
  const expanded=children&&submenu===item.label;
  const activeValue=item.key==='view:snap'?v.snapEnabled:item.key?.startsWith('view:snap:')?v.snapCategories[item.key.slice(10)]===true:item.key?.startsWith('image-mode:')?v.rasterInfo?.colorMode===item.key.slice(11):item.key?.startsWith('image-depth:')?v.rasterInfo?.bitDepth===Number(item.key.slice(12)):false;
  return `<div class="menu-item-host"><button type="button" class="menu-row${item.coreOnly?' menu-row-core':''}" role="menuitem" ${children?'data-submenu="'+esc(item.label)+'" aria-haspopup="menu" aria-expanded="'+Boolean(expanded)+'"':item.coreOnly?'':'data-command="'+esc(item.key)+'"'} ${valid?'':'disabled aria-disabled="true"'}><span class="menu-label">${esc(item.label)}${activeValue?' ✓':''}</span>${item.shortcut?'<span class="menu-shortcut">'+esc(item.shortcut)+'</span>':''}${children?'<span class="menu-chevron" aria-hidden="true">›</span>':''}</button>${children&&expanded?'<div class="menu-submenu" role="menu" aria-label="'+esc(item.label)+'">'+children.map(x=>renderRow(x,v,true)).join('')+'</div>':''}</div>`;
 };
 const render=()=>{
  if(menu.hidden)return;
  const v=state();
  menu.innerHTML=`<div class="menu-grid"><nav class="menu-categories" role="tablist" aria-orientation="vertical" aria-label="Application menu categories">${Object.keys(groups).map(k=>'<button class="menu-category'+(category===k?' active':'')+'" role="tab" data-category="'+k+'" aria-selected="'+(category===k)+'">'+esc(categoryNames[k])+'</button>').join('')}</nav><div class="menu-panes"><div class="menu-pane" role="menu" aria-label="${esc(category)}">${(category==='window'?[...groups.window,...(v.sessions.length?[v.sessions.map(x=>({label:(x.title||'Untitled')+(x.active?' ✓':''),key:'session:'+x.sessionId}))]:[])]:groups[category]).map(group=>'<div class="menu-group">'+group.map(item=>renderRow(item,v)).join('')+'</div>').join('')}</div></div></div>`;
 };
 const close=(restore=false)=>{menu.hidden=true;logo.setAttribute('aria-expanded','false');submenu=null;wasOpen=false;if(restore)logo.focus();};
 const open=()=>{menu.hidden=false;logo.setAttribute('aria-expanded','true');wasOpen=true;render();menu.querySelector('[data-category="'+category+'"]')?.focus();};
 const selectCategory=key=>{category=key;submenu=null;render();};
 logo.setAttribute('aria-haspopup','true');logo.setAttribute('aria-expanded','false');logo.setAttribute('aria-controls',menu.id);
 logo.addEventListener('click',()=>menu.hidden?open():close(),{signal});
 menu.addEventListener('click',e=>{
  const tab=e.target.closest('[data-category]'),parent=e.target.closest('[data-submenu]'),command=e.target.closest('[data-command]');
  if(tab){selectCategory(tab.dataset.category);menu.querySelector('[data-category="'+category+'"]')?.focus();return;}
  if(parent&&!parent.disabled){const label=parent.dataset.submenu;submenu=submenu===label?null:label;render();menu.querySelector('[data-submenu="'+CSS.escape(label)+'"]')?.focus();return;}
  if(command&&!command.disabled){const key=command.dataset.command;close();Promise.resolve().then(async()=>{
   if(['recipe-workflow','recipe-engine','translate-photoshop','translate-illustrator','translate-figma','translate-canva'].includes(key)){
    if(globalThis.INK_APP!==host.app)throw Error('INK_WORK_RUNTIME_IDENTITY_MISMATCH');
    const {mountWorkExtensionControls}=await import('../../agent/work-runtime-read-controls.mjs');
    return mountWorkExtensionControls({entry:key,globalObject:globalThis,documentObject:document});
   }
   return invoke(key);
  }).catch(error=>host.app?.toast?.(error.message||String(error))); }
 },{signal});
 menu.addEventListener('pointerover',e=>{
  const tab=e.target.closest('[data-category]');if(tab&&tab.dataset.category!==category){selectCategory(tab.dataset.category);return;}
  const parent=e.target.closest('[data-submenu]');if(parent&&!parent.disabled&&submenu!==parent.dataset.submenu){submenu=parent.dataset.submenu;render();}
 },{signal});
 menu.addEventListener('keydown',e=>{
  const target=e.target.closest('button');if(!target)return;
  const tabs=[...menu.querySelectorAll('[data-category]')],all=[...menu.querySelectorAll('.menu-pane .menu-row:not(:disabled)')],child=target.closest('.menu-submenu'),list=child?[...child.querySelectorAll('.menu-row:not(:disabled)')]:target.matches('[data-category]')?tabs:all.filter(x=>!x.closest('.menu-submenu'));
  const pos=list.indexOf(target),move=(i)=>list[(i+list.length)%list.length]?.focus();
  if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close(true);return;}
  if(e.key==='Home'||e.key==='End'){e.preventDefault();(e.key==='Home'?list[0]:list.at(-1))?.focus();return;}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();move(pos+(e.key==='ArrowDown'?1:-1));return;}
  if(e.key==='ArrowRight'){
   e.preventDefault();
   if(target.matches('[data-category]')){all[0]?.focus();return;}
   if(target.matches('[data-submenu]')){submenu=target.dataset.submenu;render();menu.querySelector('.menu-submenu .menu-row:not(:disabled)')?.focus();return;}
   if(child)return;
   tabs[(tabs.findIndex(x=>x.dataset.category===category)+1)%tabs.length]?.click();
   menu.querySelector('.menu-pane .menu-row:not(:disabled)')?.focus();
  }
  if(e.key==='ArrowLeft'){
   e.preventDefault();
   if(child){const parentName=submenu;submenu=null;render();menu.querySelector('[data-submenu="'+CSS.escape(parentName)+'"]')?.focus();return;}
   if(target.matches('[data-category]')){tabs[(tabs.indexOf(target)-1+tabs.length)%tabs.length]?.click();return;}
   menu.querySelector('[data-category="'+category+'"]')?.focus();
  }
  if(e.key==='Enter'||e.key===' '){e.preventDefault();target.click();}
 },{signal});
 document.addEventListener('pointerdown',e=>{if(wasOpen&&!menu.contains(e.target)&&!logo.contains(e.target))close();},{signal});
 const subscription=host.subscribe(()=>{if(!menu.hidden){const focus=document.activeElement?.dataset.command||document.activeElement?.dataset.submenu||document.activeElement?.dataset.category;render();if(focus)menu.querySelector('[data-command="'+CSS.escape(focus)+'"],[data-submenu="'+CSS.escape(focus)+'"],[data-category="'+CSS.escape(focus)+'"]')?.focus();}});
 signal.addEventListener('abort',subscription,{once:true});
 return {render,close,open};
}

