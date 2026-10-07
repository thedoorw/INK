/*
 * INK UI-B Full Capability Creative Controls.
 * UI-only orchestration. Existing Document / History / Renderer / Core authorities remain authoritative.
 */
import { Matrix as M } from '../src/core/index.js';
import {
  IMAGE_CAPABILITIES, FILTER_GALLERY,
  createAdjustment, createFilter, createLiquifyFilter, createLayerEffect, createRasterMask,
  cropImageData, resizeImageData, colorRasterToRgba8, createColorRaster, serializeColorRaster, deserializeColorRaster,
  imageHistogram, createImageSnapshot, compareImageStates,
  convertBitDepth, convertColor, readNormalizedSample, writeNormalizedSample, inspectIccProfile, parseIccProfile
} from '../src/image/image-core.js';
import { createSkewMatrix, createProjectiveTransform, mapProjectivePoint, createWarpDeformationPlan } from '../src/editor/transform-advanced.js';
import { applyNonDestructiveDeformation } from '../src/vector/deformation.js';
import { normalizeGradientFill, normalizePatternFill } from '../src/vector/fill-appearance.js';
import { updateTextObject } from '../src/editor/text-object.js';
import { verifyStorageRecord } from '../src/document/storage.js';
import { UI_B_MENU_CONTRIBUTIONS, UI_B_TOOL_GROUPS, UI_B_RASTER_OPTION_FIELDS, UI_B_NATIVE_OPTION_ROUTES, UI_B_DIALOGS, UI_B_CONTRIBUTION_REPORT } from './capability-contributions.js';
import { createRasterToolController, UI_B_RASTER_TOOL_IDS } from './capability-raster-tools.js';

const $=(selector,root=document)=>root.querySelector(selector);
const $$=(selector,root=document)=>[...root.querySelectorAll(selector)];
const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const number=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const fileSafe=value=>String(value||'INK').replace(/[\\/:*?"<>|]+/g,'-').trim()||'INK';

const IDENTITY_LUT_2=Object.freeze({size:2,data:[
    0,0,0, 1,0,0, 0,1,0, 1,1,0,
    0,0,1, 1,0,1, 0,1,1, 1,1,1
  ]});
const ADJUSTMENT_DEFAULTS=Object.freeze({
  brightnessContrast:{brightness:0,contrast:0},levels:{black:0,white:255,gamma:1},curves:{points:[[0,0],[255,255]]},
  hueSaturation:{hue:0,saturation:0,lightness:0},colorBalance:{red:0,green:0,blue:0},gradientMap:{},
  exposure:{exposure:0,offset:0,gamma:1},vibrance:{amount:0},blackWhite:{weights:{r:.3,g:.59,b:.11}},photoFilter:{color:'#ffaa66',density:25,preserveLuminosity:true},
  channelMixer:{matrix:[[1,0,0],[0,1,0],[0,0,1]],constant:[0,0,0]},colorLookup:{lut:IDENTITY_LUT_2},invert:{},posterize:{levels:4},threshold:{level:128},selectiveColor:{corrections:{}}
});
const FILTER_DEFAULTS=Object.freeze({
  gaussianBlur:{radius:2},sharpen:{amount:1},highPass:{radius:2},edgeDetection:{amount:1},noiseGrain:{amount:12},
  textureOverlay:{amount:18,scale:7},motionBlur:{distance:4,angle:0},median:{radius:2},unsharpMask:{radius:2,amount:100,threshold:0},
  emboss:{strength:1,angle:135},mosaic:{size:8},minimum:{radius:1},maximum:{radius:1},reduceNoise:{radius:1,strength:50,preserveEdges:24}
});
const EFFECT_DEFAULTS=Object.freeze({
  dropShadow:{color:'#000000',opacity:.55,offsetX:8,offsetY:8,blur:12,spread:0},
  innerShadow:{color:'#000000',opacity:.4,offsetX:4,offsetY:4,blur:8,choke:0},
  outerGlow:{color:'#ffffff',opacity:.65,radius:10,spread:0},
  colorOverlay:{color:'#3b63fb',opacity:.6},
  stroke:{color:'#000000',opacity:1,size:3,position:'outside'}
});
const BLEND_MODES=Object.freeze(IMAGE_CAPABILITIES.blendModes||['source-over','multiply','screen','overlay']);

function htmlNode(markup){
  const template=document.createElement('template');template.innerHTML=markup.trim();return template.content.firstElementChild;
}
const UI_LABELS = Object.freeze({
  'source-over':'正常',multiply:'色彩增值',screen:'濾色',overlay:'覆蓋','soft-light':'柔光','hard-light':'實光',darken:'變暗',lighten:'變亮','color-dodge':'加亮顏色','color-burn':'加深顏色',difference:'差異化',exclusion:'排除',hue:'色相',saturation:'飽和度',color:'顏色',luminosity:'明度',
  new:'新增',add:'增加',subtract:'減去',intersect:'交集',linear:'線性',radial:'放射',saturate:'增加飽和度',desaturate:'降低飽和度',
  brightnessContrast:'亮度／對比',levels:'色階',curves:'曲線',hueSaturation:'色相／飽和度',colorBalance:'色彩平衡',gradientMap:'漸層對應',exposure:'曝光度',vibrance:'自然飽和度',blackWhite:'黑白',photoFilter:'相片濾鏡',channelMixer:'混合色版',colorLookup:'顏色查詢',invert:'負片效果',posterize:'色調分離',threshold:'臨界值',selectiveColor:'選取顏色',
  gaussianBlur:'高斯模糊',sharpen:'銳利化',highPass:'高反差保留',edgeDetection:'邊緣偵測',noiseGrain:'雜訊／顆粒',textureOverlay:'紋理覆蓋',motionBlur:'動態模糊',median:'中間值',unsharpMask:'遮色片銳利化',emboss:'浮雕',mosaic:'馬賽克',minimum:'最小值',maximum:'最大值',reduceNoise:'減少雜訊',
  dropShadow:'陰影',innerShadow:'內陰影',outerGlow:'外光暈',innerGlow:'內光暈',bevelEmboss:'斜角與浮雕',colorOverlay:'顏色覆蓋',gradientOverlay:'漸層覆蓋',patternOverlay:'圖樣覆蓋',stroke:'筆畫'
});
function uiLabel(value){return UI_LABELS[value] || UI_B_TOOL_GROUPS.flatMap(group=>group.tools).find(([id])=>id===value)?.[1] || String(value);}
function button(label,attrs=''){return '<button type="button" '+attrs+'><span>'+esc(uiLabel(label))+'</span></button>';}
function selectOptions(values,current=null){return values.map(value=>'<option value="'+esc(value)+'"'+(String(value)===String(current)?' selected':'')+'>'+esc(uiLabel(value))+'</option>').join('');}
function downloadBytes(app,bytes,name,type='application/octet-stream'){
  const blob=bytes instanceof Blob?bytes:new Blob([bytes],{type});app.download(blob,name);
}
function selectedFound(app,predicate=()=>true){return app.selectedObjects().find(item=>predicate(item.object,item))||null;}
function objectTarget(app,found){return found?app.objectPath(found):null;}

function objectBoundsLocal(object){
  if(object.type==='path'){
    const points=(object.subpaths||[]).flatMap(sub=>(sub.anchors||[]).map(a=>({x:a.x,y:a.y})));
    if(points.length){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);return{x:Math.min(...xs),y:Math.min(...ys),w:Math.max(...xs)-Math.min(...xs),h:Math.max(...ys)-Math.min(...ys)};}
  }
  return{x:0,y:0,w:Math.max(1,number(object.w??object.width,100)),h:Math.max(1,number(object.h??object.height,100))};
}

function convertRasterMode(serialized,targetMode){
  const source=deserializeColorRaster(serialized);
  if(source.colorMode===targetMode)return serializeColorRaster(source);
  if(targetMode==='Multichannel')throw new Error('Multichannel conversion requires explicit channel construction');
  if(!['RGB','CMYK','Lab'].includes(source.colorMode)||!['RGB','CMYK','Lab'].includes(targetMode))throw new Error('Unsupported color-mode conversion');
  const out=createColorRaster({width:source.width,height:source.height,bitDepth:source.bitDepth,colorMode:targetMode});
  const count=source.width*source.height;
  for(let index=0;index<count;index++){
    const values=Array.from({length:source.channelCount},(_,channel)=>readNormalizedSample(source,index,channel));
    const converted=convertColor(values,source.colorMode,targetMode);
    for(let channel=0;channel<out.channelCount;channel++)writeNormalizedSample(out,index,channel,converted[channel]??0);
  }
  if(source.alpha&&out.alpha)out.alpha.set(source.alpha);
  return serializeColorRaster(out);
}

function dialogShell(id,title,body,wide=false){
  return htmlNode('<section id="uiB-'+esc(id)+'" class="dialog-backdrop ui-b-dialog" data-ui-b-dialog="'+esc(id)+'" hidden>'+
    '<div class="dialog elevated-panel'+(wide?' ui-b-dialog-wide':'')+'">'+
    '<div class="panel-header"><div><span class="eyebrow">INK</span><strong>'+esc(title)+'</strong></div><button class="mini-button" data-ui-b-close="'+esc(id)+'" aria-label="關閉">×</button></div>'+
    '<div class="ui-b-dialog-body">'+body+'</div></div></section>');
}

export function installFullCapabilityControls(app){
  if(app.uiBControls)return app.uiBControls;
  const shell=window.INK_WEB_SHELL;
  const state={lastToolByGroup:new Map(),activeCapabilityTool:null,switchingRaster:false,dialogContext:null,selectedChannel:null,rasterSnapshot:null,recoveryCandidates:[]};
  const raster=createRasterToolController(app,{onStateChange:()=>refreshContextOptions()});

  function toast(message,time=2400){app.toast(message,time);}
  function closeMenus(){if(shell?.closeMenus)shell.closeMenus();}
  function openPanel(id){if(shell?.open)shell.open(id);else if(shell?.toggle)shell.toggle(id);else toast('Panel route unavailable');}

  function installMenus(){
    const byMenu=new Map();
    for(const item of UI_B_MENU_CONTRIBUTIONS){if(!byMenu.has(item.menu))byMenu.set(item.menu,[]);byMenu.get(item.menu).push(item);}
    for(const [menuId,items] of byMenu){
      const menu=$('#'+menuId+'Menu');if(!menu)continue;
      if(menuId==='filter')$$('button[disabled]',menu).forEach(node=>node.remove());
      let lastSection=null;
      for(const item of items){
        if(menu.querySelector('[data-ui-b-contribution="'+item.id+'"]'))continue;
        if(lastSection!==null&&lastSection!==item.section)menu.appendChild(htmlNode('<div class="application-menu-separator" role="separator"></div>'));
        const node=htmlNode('<button type="button" role="menuitem" data-ui-b-contribution="'+esc(item.id)+'" data-ui-b-command="'+esc(item.command)+'"><span>'+esc(item.label)+'</span>'+(item.shortcut?'<kbd>'+esc(item.shortcut)+'</kbd>':'')+'</button>');
        node.title=item.authority;menu.appendChild(node);lastSection=item.section;
      }
      menu.addEventListener('click',event=>{const command=event.target.closest('[data-ui-b-command]')?.dataset.uiBCommand;if(command){event.preventDefault();closeMenus();dispatch(command);}});
    }
  }

  const TOOL_GROUP_ICON_IDS=Object.freeze({draw:'i-pen',lasso:'i-lasso','smart-selection':'i-quick-selection',fill:'i-fill',sampling:'i-eyedropper',clone:'i-clone-stamp',healing:'i-healing',tone:'i-dodge',detail:'i-blur',shape:'i-shape',text:'i-text'});
  function toolGroupIcon(group){return TOOL_GROUP_ICON_IDS[group.id]||'i-select';}
  function toolSvg(icon){return '<span class="tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#'+icon+'"/></svg></span>';}
  function createToolButton(group){
    return htmlNode('<button type="button" class="tool-button tool-stack ui-b-tool-group" data-ui-b-tool-group="'+esc(group.id)+'" aria-haspopup="menu" aria-expanded="false" title="'+esc(group.label)+'">'+toolSvg(toolGroupIcon(group))+'<span class="tool-label">'+esc(group.label)+'</span><span class="stack-corner" aria-hidden="true"></span></button>');
  }
  function ensureToolFlyout(){
    let flyout=$('#uiBToolFlyout');if(flyout)return flyout;
    flyout=htmlNode('<div id="uiBToolFlyout" class="brush-family-popover elevated-panel ui-b-tool-flyout" role="menu" hidden><div class="brush-family-list"></div></div>');
    $('.app')?.appendChild(flyout);
    flyout.addEventListener('click',event=>{const button=event.target.closest('[data-ui-b-tool]');if(!button)return;activateTool(button.dataset.uiBTool);flyout.hidden=true;document.querySelector('[data-ui-b-tool-group][aria-expanded="true"]')?.setAttribute('aria-expanded','false');});
    window.addEventListener('pointerdown',event=>{if(!flyout.hidden&&!flyout.contains(event.target)&&!event.target.closest('[data-ui-b-tool-group]'))flyout.hidden=true;});
    return flyout;
  }
  function openToolGroup(group,anchor){
    const flyout=ensureToolFlyout(),list=$('.brush-family-list',flyout);
    list.innerHTML=group.tools.map(([id,label])=>'<button type="button" class="subtool-button" data-ui-b-tool="'+esc(id)+'">'+toolSvg(toolGroupIcon(group))+'<span><strong>'+esc(label)+'</strong></span></button>').join('');
    const rect=anchor.getBoundingClientRect();
    flyout.style.left=(app.isMobile()?Math.max(8,Math.min(innerWidth-204,rect.left)):Math.max(40,rect.right+2))+'px';
    flyout.style.top=(app.isMobile()?Math.max(58,Math.min(innerHeight-320,rect.top-260)):Math.max(61,rect.top))+'px';flyout.hidden=false;
    document.querySelectorAll('[data-ui-b-tool-group][aria-expanded="true"]').forEach(node=>node.setAttribute('aria-expanded','false'));
    anchor.setAttribute('aria-expanded','true');
  }
  function bindToolGroupHold(node,group){
    let timer=null;
    node.addEventListener('pointerdown',event=>{
      if(event.button!==0)return;
      timer=setTimeout(()=>openToolGroup(group,node),420);
    });
    for(const type of ['pointerup','pointercancel','pointerleave']){
      node.addEventListener(type,()=>{if(timer)clearTimeout(timer);timer=null;});
    }
  }
  function installTools(){
    const rail=$('.tool-group');if(!rail)return;
    const existingDraw=$('#drawToolButton');
    const drawGroup=UI_B_TOOL_GROUPS.find(group=>group.id==='draw');
    if(existingDraw&&drawGroup){
      existingDraw.dataset.uiBToolGroup='draw';
      existingDraw.addEventListener('contextmenu',event=>{event.preventDefault();openToolGroup(drawGroup,existingDraw);});
    }
    const existingLasso=$('[data-tool="lasso"]');
    const lassoGroup=UI_B_TOOL_GROUPS.find(group=>group.id==='lasso');
    if(existingLasso&&lassoGroup){
      existingLasso.classList.add('tool-stack');existingLasso.dataset.uiBToolGroup='lasso';existingLasso.setAttribute('aria-haspopup','menu');
      if(!$('.stack-corner',existingLasso))existingLasso.appendChild(htmlNode('<span class="stack-corner" aria-hidden="true"></span>'));
      existingLasso.addEventListener('contextmenu',event=>{event.preventDefault();openToolGroup(lassoGroup,existingLasso);});
      existingLasso.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();openToolGroup(lassoGroup,existingLasso);},true);
    }
    for(const [groupId,selector] of [['shape','[data-tool="shape"]'],['text','[data-tool="text"]']]){
      const existing=$(selector),group=UI_B_TOOL_GROUPS.find(item=>item.id===groupId);
      if(!existing||!group)continue;
      existing.classList.add('tool-stack');existing.dataset.uiBToolGroup=groupId;existing.setAttribute('aria-haspopup','menu');
      if(!$('.stack-corner',existing))existing.appendChild(htmlNode('<span class="stack-corner" aria-hidden="true"></span>'));
      existing.addEventListener('contextmenu',event=>{event.preventDefault();openToolGroup(group,existing);});
      existing.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();openToolGroup(group,existing);},true);
      bindToolGroupHold(existing,group);
    }
    const toolHost=existingLasso?.parentElement||rail,insertion=existingLasso?.nextElementSibling||null;
    for(const group of UI_B_TOOL_GROUPS.filter(group=>!['draw','lasso','shape','text'].includes(group.id))){
      if($('[data-ui-b-tool-group="'+group.id+'"]'))continue;
      const node=createToolButton(group);toolHost.insertBefore(node,insertion);
      node.addEventListener('click',()=>openToolGroup(group,node));
      node.addEventListener('keydown',event=>{if(event.key==='ArrowRight'||event.key==='ArrowDown'){event.preventDefault();openToolGroup(group,node);}});
      node.addEventListener('contextmenu',event=>{event.preventDefault();openToolGroup(group,node);});
      bindToolGroupHold(node,group);
    }
    const brushButton=$('#psBrushTool');
    brushButton?.addEventListener('click',event=>{event.preventDefault();event.stopImmediatePropagation();activateTool('brush');},true);
    existingDraw?.addEventListener('click',event=>{if(app.tool==='brush'){event.preventDefault();event.stopImmediatePropagation();activateTool('pen');}},true);
    const zoomTrigger=$('#psZoomControls');
    if(zoomTrigger && !$('#psZoomMenu')){
      const menu=htmlNode('<div id="psZoomMenu" class="application-command-menu ps-tool-zoom-menu" role="menu" aria-label="縮放控制" hidden><button type="button" role="menuitem" data-zoom-action="in">放大</button><button type="button" role="menuitem" data-zoom-action="out">縮小</button><button type="button" role="menuitem" data-zoom-action="fit">符合內容</button></div>');
      document.body.append(menu);
      const close=()=>{menu.hidden=true;zoomTrigger.setAttribute('aria-expanded','false');};
      zoomTrigger.addEventListener('click',()=>{const r=zoomTrigger.getBoundingClientRect();menu.style.left=(r.right+3)+'px';menu.style.top=r.top+'px';menu.hidden=!menu.hidden;zoomTrigger.setAttribute('aria-expanded',String(!menu.hidden));});
      menu.addEventListener('click',event=>{const action=event.target.closest('[data-zoom-action]')?.dataset.zoomAction;if(!action)return;if(action==='fit')app.runUiCommand('view.fit.content.v1');else app.runUiCommand('view.zoom.by.v1',{factor:action==='in'?1.2:1/1.2});close();});
      document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target)&&!zoomTrigger.contains(event.target))close();});
      document.addEventListener('keydown',event=>{if(event.key==='Escape')close();});
    }
    const shortcuts=[
      ['psObjectSelect','影像物件選取','i-object-select',()=>activateTool('objectSelection')],
      ['psCropTool','裁切影像…','i-crop',()=>openDialog('image-crop')],
      ['psFrameTool','框架選取物件','i-frame',()=>{if(!app.selection?.length){toast('請先選取要建立框架的物件');return;}app.creativeWorkspace?.runComposeAction?.('frame');}],
      ['psPathEditTool','編輯選取節點','i-path',()=>{const found=selectedFound(app);if(found?.object.type==='stroke')app.enterStrokeEdit?.();else app.enterPathEdit?.();}]
    ];
    const groupHost=$('.tool-rail .tool-group');
    for(const [id,label,icon,action] of shortcuts){
      if($('#'+id))continue;
      const node=htmlNode('<button id="'+id+'" class="tool-action" type="button" title="'+label+'" aria-label="'+label+'">'+toolSvg(icon)+'</button>');
      groupHost.append(node);node.addEventListener('click',action);
    }
    const psCapabilityOrder=['[data-tool="select"]','#psObjectSelect','[data-tool="lasso"]','[data-ui-b-tool-group="smart-selection"]','#psCropTool','#psFrameTool','[data-ui-b-tool-group="sampling"]','[data-ui-b-tool-group="healing"]','#psBrushTool','[data-ui-b-tool-group="clone"]','[data-tool="eraser"]','[data-ui-b-tool-group="fill"]','[data-ui-b-tool-group="detail"]','[data-ui-b-tool-group="tone"]','#drawToolButton','#psPathEditTool','[data-tool="text"]','[data-tool="shape"]','[data-tool="pan"]','#psZoomControls'];
    for(const selector of psCapabilityOrder){const node=$(selector);if(node&&node.parentElement===groupHost)groupHost.appendChild(node);}
    rail.querySelectorAll('.ui-b-glyph').forEach(node=>node.classList.remove('ui-b-glyph'));
    const mobileHost=$('#mobileToolSheet .mobile-tool-grid');
    for(const group of UI_B_TOOL_GROUPS){
      if(!mobileHost||mobileHost.querySelector('[data-ui-b-mobile-group="'+group.id+'"]'))continue;
      const node=htmlNode('<button type="button" class="tool-button ui-b-mobile-group" data-ui-b-mobile-group="'+esc(group.id)+'" aria-haspopup="menu" aria-expanded="false">'+toolSvg(toolGroupIcon(group))+'<span class="tool-label">'+esc(group.label)+'</span></button>');
      mobileHost.appendChild(node);
      node.addEventListener('click',()=>openToolGroup(group,node));
    }
    if(existingDraw){
      const pop=$('#brushFamilyPopover .brush-family-list');
      if(pop){
        for(const [id,label] of [['blender','混色'],['smudge','塗抹']]){
          if(pop.querySelector('[data-ui-b-tool="'+id+'"]'))continue;
          const node=htmlNode('<button type="button" class="subtool-button" data-ui-b-tool="'+id+'">'+toolSvg('i-brush')+'<span><strong>'+label+'</strong></span></button>');
          pop.appendChild(node);node.addEventListener('click',()=>{activateTool(id);app.toggleBrushFamilyPopover(false);});
        }
        if(!pop.querySelector('[data-ui-b-brush-package="import"]')){
          const divider=htmlNode('<div class="application-menu-separator" role="separator"></div>'),importButton=htmlNode('<button type="button" class="subtool-button" data-ui-b-brush-package="import">'+toolSvg('i-export')+'<span><strong>匯入筆刷套件…</strong></span></button>'),exportButton=htmlNode('<button type="button" class="subtool-button" data-ui-b-brush-package="export">'+toolSvg('i-export')+'<span><strong>匯出筆刷套件…</strong></span></button>');
          pop.append(divider,importButton,exportButton);
          importButton.addEventListener('click',()=>pickBrushPackage());
          exportButton.addEventListener('click',()=>{$('#brushPackageExport')?.click();app.toggleBrushFamilyPopover(false);});
        }
      }
    }
  }

  function pickBrushPackage(){
    let input=$('#uiBBrushPackageInput');
    if(!input){
      input=htmlNode('<input id="uiBBrushPackageInput" type="file" accept="application/json,.json,.inkbrush" hidden>');
      $('.app')?.appendChild(input);
      input.addEventListener('change',async event=>{
        const file=event.target.files?.[0];event.target.value='';if(!file)return;
        try{
          const raw=JSON.parse(await file.text()),api=window.INK_STUDIO?.drawing;
          if(!api?.importBrushPackage)throw new Error('Brush Package authority unavailable');
          api.importBrushPackage(raw);toast('Brush Package 已匯入');
        }catch(error){console.error(error);toast('Brush Package 匯入失敗：'+error.message,3200);}
      });
    }
    input.click();app.toggleBrushFamilyPopover(false);
  }

  function activateTool(tool){
    app.openMobileToolSheet?.(false);
    for(const group of UI_B_TOOL_GROUPS){if(group.tools.some(([id])=>id===tool))state.lastToolByGroup.set(group.id,tool);}
    if(tool.startsWith('shape:')){
      raster.clearTool();app.runUiCommand('tool.shape.set.v1',{shape:tool.slice(6)});app.runUiCommand('tool.activate.v1',{tool:'shape'});app.refreshToolUI?.();
    }else if(tool.startsWith('text:')){
      raster.clearTool();app.uiBTextMode=tool.slice(5);app.runUiCommand('tool.activate.v1',{tool:'text'});toast('文字模式：'+app.uiBTextMode+'；版面描述已啟用，實際 glyph/render 能力依既有 Text Renderer');
    }else if(tool==='gradient'&&selectedFound(app,object=>object.type==='path')){
      raster.clearTool();app.runUiCommand('tool.activate.v1',{tool:'select'});openDialog('gradient-editor');
    }else if(UI_B_RASTER_TOOL_IDS.has(tool)){
      state.switchingRaster = true;
      try { raster.setTool(tool); } finally { state.switchingRaster = false; }
    }else if(['blender','smudge'].includes(tool)){
      raster.clearTool();app.runUiCommand('tool.activate.v1',{tool:'select'});
      openPanel('specialist');
      const preset=$('#paintBrush');if(preset){preset.value=tool;preset.scrollIntoView({block:'center'});}
      toast((tool==='blender'?'混色':'塗抹')+' 使用既有 Brush Engine / Stroke Session authority；由 Properties 重播或套用');
    }else if(['pen','pencil','marker','brush','airbrush','lasso','image'].includes(tool)){
      raster.clearTool();app.runUiCommand('tool.activate.v1',{tool});
    }else raster.clearTool();
    state.activeCapabilityTool=tool;
    $$('.ui-b-tool-group').forEach(button=>button.classList.toggle('active',UI_B_TOOL_GROUPS.find(group=>group.id===button.dataset.uiBToolGroup)?.tools.some(([id])=>id===tool)));
    app.refreshToolUI?.();
    refreshContextOptions();
    if(!['blender','smudge'].includes(tool)&&!tool.startsWith('text:'))toast('工具：'+tool);
  }

  function ensureContextHost(){
    let host=$('#uiBCapabilityOptions');if(host)return host;
    host=htmlNode('<div id="uiBCapabilityOptions" class="contextual-tool-controls ui-b-context-controls" hidden></div>');
    $('.contextual-control-host')?.appendChild(host);return host;
  }
  function refreshContextOptions(){
    const host=ensureContextHost(),tool=raster.activeTool()||(['blender','smudge'].includes(state.activeCapabilityTool)?state.activeCapabilityTool:app.tool);
    if(!tool){host.hidden=true;return;}
    // setOption notifies synchronously; preserve the field/focus while typing.
    if(host.dataset.tool===tool&&document.activeElement?.matches('[data-ui-b-option]')&&host.contains(document.activeElement))return;
    host.hidden=false;
    host.dataset.tool=tool;
    host.dataset.toolLabel=uiLabel(tool);
    const o=raster.options();
    const numeric={radius:['大小',1,300,1],strength:['強度',0,1,.05],opacity:['透明度',0,1,.05],hardness:['硬度',0,1,.05],tolerance:['容差',0,255,1],edgeThreshold:['邊緣',0,255,1],searchRadius:['搜尋',2,64,1],sampleRadius:['取樣半徑',0,32,1]};
    const choices={selectionMode:['選取模式',['new','add','subtract','intersect']],gradientType:['漸層類型',['linear','radial']],spongeMode:['海綿模式',['saturate','desaturate']]};
    let markup=(UI_B_RASTER_OPTION_FIELDS[tool]||[]).map(key=>{
      if(numeric[key]){const [label,min,max,step]=numeric[key];return '<label>'+label+' <input type="number" min="'+min+'" max="'+max+'" step="'+step+'" value="'+o[key]+'" data-ui-b-option="'+key+'"></label>';}
      if(choices[key])return '<label>'+choices[key][0]+' <select data-ui-b-option="'+key+'">'+selectOptions(choices[key][1],o[key])+'</select></label>';
      if(key==='contiguous')return '<label><input type="checkbox" '+(o[key]?'checked':'')+' data-ui-b-option="'+key+'">連續</label>';
      const label={gradientStart:'起始色',gradientEnd:'結束色',replacementColor:'替換色'}[key];
      return '<label>'+label+' <input type="color" value="'+o[key]+'" data-ui-b-option="'+key+'"></label>';
    }).join('');
    if(tool==='gradient')markup+='<button type="button" data-ui-b-context-action="gradient-editor">編輯…</button>';
    if(tool==='patternStamp')markup+='<button type="button" data-ui-b-context-action="pattern-image">圖樣…</button><span class="ui-b-context-hint">'+esc(raster.state.patternName||'無圖樣')+'</span>';
    const actions = UI_B_NATIVE_OPTION_ROUTES[tool] || [];
    const labels = {'select-all':'全選','select-clear':'取消選取','zoom-out':'縮小','zoom-in':'放大','fit-content':'符合內容','reset-view':'重設視圖','paint-replay':'替換並重播','stroke-session':'筆畫 Session…'};
    for(const action of actions){
      if(action==='snap-angle')markup+='<label><input type="checkbox" data-ui-b-native-option="snap-angle" '+(app.snapAngles?'checked':'')+'>角度吸附</label>';
      else if(action==='text-direction')markup+='<label>方向 <select data-ui-b-native-option="text-direction">'+[['horizontal-tb','水平'],['vertical-rl','直排右至左'],['vertical-lr','直排左至右']].map(([id,label])=>'<option value="'+id+'"'+((app.uiBTextMode||'horizontal-tb')===id?' selected':'')+'>'+label+'</option>').join('')+'</select></label>';
      else markup+='<button type="button" data-ui-b-native-action="'+action+'">'+labels[action]+'</button>';
    }
    host.hidden=!markup;

    host.innerHTML=markup;
    $$('[data-ui-b-native-option]',host).forEach(input=>input.addEventListener('change',()=>{
      if(input.dataset.uiBNativeOption==='snap-angle'){const target=$('#snapToggle');target.checked=input.checked;target.dispatchEvent(new Event('change',{bubbles:true}));}
      else app.uiBTextMode=input.value;
    }));
    $$('[data-ui-b-native-action]',host).forEach(control=>control.addEventListener('click',()=>{
      const action=control.dataset.uiBNativeAction;
      if(action==='select-all'||action==='select-clear')dispatch(action);
      else if(action==='zoom-in'||action==='zoom-out')app.runUiCommand('view.zoom.by.v1',{factor:action==='zoom-in'?1.2:1/1.2});
      else if(action==='fit-content')app.runUiCommand('view.fit.content.v1');
      else if(action==='reset-view')app.runUiCommand('view.reset.v1');
      else if(action==='paint-replay')$('#paintReplay')?.click();
      else if(action==='stroke-session')openPanel('specialist');
    }));
    $$('[data-ui-b-option]',host).forEach(input=>{const key=input.dataset.uiBOption;const handler=()=>{if(input.type==='number'&&!input.validity.valid)return;const value=input.type==='checkbox'?input.checked:input.type==='number'?number(input.value):input.value;if(raster.options()[key]!==value)raster.setOption(key,value);};input.addEventListener('input',handler);input.addEventListener('change',handler);});
    $$('[data-ui-b-context-action]',host).forEach(control=>control.addEventListener('click',()=>{const action=control.dataset.uiBContextAction;if(action==='gradient-editor')openDialog('gradient-editor',{target:'raster'});else if(action==='pattern-image')pickPatternImage();}));
  }

  function pickPatternImage(){
    let input=$('#uiBPatternImageInput');
    if(!input){
      input=htmlNode('<input id="uiBPatternImageInput" type="file" accept="image/png,image/jpeg,image/webp" hidden>');
      $('.app')?.appendChild(input);
      input.addEventListener('change',async event=>{
        const file=event.target.files?.[0];event.target.value='';if(!file)return;
        try{
          const bitmap=await createImageBitmap(file),canvas=document.createElement('canvas'),max=256,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));
          canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
          const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close?.();
          raster.setPattern(context.getImageData(0,0,canvas.width,canvas.height),file.name);toast('Pattern loaded: '+file.name);
        }catch(error){console.error(error);toast('Pattern 載入失敗：'+error.message,3000);}
      });
    }
    input.click();
  }

  function installPointerCapture(){
    const canvas=app.el.canvas;
    canvas.addEventListener('pointerdown',event=>raster.pointerDown(event),true);
    canvas.addEventListener('pointermove',event=>raster.pointerMove(event),true);
    canvas.addEventListener('pointerup',event=>raster.pointerUp(event,false),true);
    canvas.addEventListener('pointercancel',event=>raster.pointerUp(event,true),true);
  }

  function selectedImage(){
    const found=selectedFound(app,object=>object.type==='image');
    if(!found){toast('請先選取影像');return null;}return found;
  }
  function selectedRasterImage(){
    const found=selectedFound(app,object=>object.type==='image'&&object.rasterState?.colorRaster);
    if(!found){toast('此操作需要具有 Raster State 的影像');return null;}return found;
  }
  function selectedObject(){const found=selectedFound(app);if(!found)toast('請先選取物件');return found;}
  function mutateObject(label,found,fn){if(!found)return;app.history.pushScoped(label,[objectTarget(app,found)],()=>fn(found.object,found));app.spatialDirty=true;app.refreshAll();app.renderer.render();}

  function addAdjustment(type){
    const found=selectedFound(app,object=>object.type==='image'),target=found?.object||app.layer();
    if(!target)return;
    app.history.pushScoped('新增 Adjustment：'+type,[found?app.objectPath(found):app.layerPath(target)],()=>{target.adjustments=target.adjustments||[];target.adjustments.push(createAdjustment(type,ADJUSTMENT_DEFAULTS[type]||{}));});
    app.refreshAll();app.renderer.render();
    refreshPanels();toast('Adjustment：'+type);
  }
  function addFilter(type,params=null){
    const found=selectedFound(app,object=>object.type==='image'),target=found?.object||app.layer();
    if(!target)return;
    app.history.pushScoped('新增 Filter：'+type,[found?app.objectPath(found):app.layerPath(target)],()=>{target.filterStack=target.filterStack||[];target.filterStack.push(createFilter(type,params||FILTER_DEFAULTS[type]||{}));});
    app.refreshAll();app.renderer.render();
    refreshPanels();toast('Filter：'+type);
  }
  function addLayerEffect(type,params){
    const found=selectedImage();if(!found)return;
    mutateObject('新增 Layer Effect：'+type,found,object=>{object.effects=object.effects||[];object.effects.push(createLayerEffect(type,params||EFFECT_DEFAULTS[type]||{}));});
    refreshPanels();
  }

  function installPanels(){
    const adjustments=$('[data-shell-panel-section="adjustments"] .shell-panel-body')||$('[data-content="adjustments"] .shell-panel-body');
    if(adjustments){
      adjustments.innerHTML='<div class="ui-b-panel-grid" id="uiBAdjustmentGrid"></div><div id="uiBAdjustmentStack" class="ui-b-stack-list"></div>';
      $('#uiBAdjustmentGrid').innerHTML=Object.keys(ADJUSTMENT_DEFAULTS).map(type=>button(type,'data-ui-b-adjustment="'+esc(type)+'"')).join('');
      $('#uiBAdjustmentGrid').addEventListener('click',event=>{const type=event.target.closest('[data-ui-b-adjustment]')?.dataset.uiBAdjustment;if(type)addAdjustment(type);});
    }
    const channels=$('[data-shell-panel-section="channels"] .shell-panel-body')||$('[data-content="channels"] .shell-panel-body');
    if(channels)channels.innerHTML='<div id="uiBChannelsList" class="ui-b-stack-list"></div><div class="ui-b-panel-actions">'+button('新增 Alpha','data-ui-b-channel="add-alpha"')+button('新增特別色','data-ui-b-channel="add-spot"')+button('重新命名','data-ui-b-channel="rename"')+button('上移','data-ui-b-channel="up"')+button('下移','data-ui-b-channel="down"')+button('移除','data-ui-b-channel="remove"')+'</div>';
    channels?.addEventListener('click',event=>{const cmd=event.target.closest('[data-ui-b-channel]')?.dataset.uiBChannel;if(cmd)channelCommand(cmd);});
    const layers=$('[data-shell-panel-section="layers"] .shell-panel-body')||$('[data-content="layers"]');
    if(layers&&!$('#uiBLayerAppearance')){
      const filterOptions=Object.keys(FILTER_DEFAULTS).map(type=>'<option value="'+esc(type)+'">'+esc(uiLabel(type))+'</option>').join('');
      const block=htmlNode('<div id="uiBLayerAppearance" class="ui-b-layer-appearance">'+
        '<details class="ui-b-layer-filter-menu"><summary aria-label="圖層影像濾鏡"><svg viewBox="0 0 10 7" aria-hidden="true"><use href="#i-panel-menu"/></svg></summary><div class="ui-b-layer-filter"><span>濾鏡</span><select id="uiBLayerFilterType" aria-label="圖層濾鏡種類">'+filterOptions+'</select><button type="button" data-layer-action="add-filter" aria-label="新增圖層濾鏡" title="新增圖層濾鏡">＋</button></div></details>'+
        '<div class="ui-b-layer-lock"><span>鎖定</span><button type="button" data-layer-action="toggle-lock" aria-pressed="false"><svg><use href="#i-lock"/></svg></button></div>'+
      '</div>');
      layers.prepend(block);
      const opacity=layers.querySelector('.layer-opacity-card');if(opacity)block.before(opacity);
      const filterMenu=block.querySelector('.ui-b-layer-filter-menu');
      const layerFooter=layers.querySelector('.layer-bottom-toolbar');
      if(filterMenu&&layerFooter){layerFooter.insertBefore(filterMenu,layerFooter.firstChild);filterMenu.addEventListener('click',event=>{if(event.target.closest('[data-layer-action="add-filter"]'))block.dispatchEvent(new CustomEvent('ink-layer-filter-add'));});}
      block.addEventListener('ink-layer-filter-add',()=>{const layer=app.layer(),type=$('#uiBLayerFilterType')?.value;if(!layer||!type)return;app.history.pushScoped('新增圖層濾鏡：'+type,[app.layerPath(layer)],()=>{layer.filterStack=layer.filterStack||[];layer.filterStack.push(createFilter(type,FILTER_DEFAULTS[type]||{}));});filterMenu.open=false;app.refreshAll();app.renderer.render();refreshPanels();});
      block.addEventListener('click',event=>{
        const action=event.target.closest('[data-layer-action]')?.dataset.layerAction;
        if(action==='add-filter'){
          const layer=app.layer(),type=$('#uiBLayerFilterType')?.value;if(!layer||!type)return;
          app.history.pushScoped('新增 Layer Filter：'+type,[app.layerPath(layer)],()=>{layer.filterStack=layer.filterStack||[];layer.filterStack.push(createFilter(type,FILTER_DEFAULTS[type]||{}));});
          app.refreshAll();app.renderer.render();refreshPanels();
        }else if(action==='toggle-lock'){
          const layer=app.layer();if(!layer)return;
          app.history.pushScoped(layer.locked?'解除圖層鎖定':'鎖定圖層',[app.layerPath(layer)],()=>layer.locked=!layer.locked);
          app.refreshLayers();refreshPanels();
        }
      });
      const footer=layers.querySelector('.layer-bottom-toolbar'),spacer=footer?.querySelector('.layer-toolbar-spacer');
      if(footer&&spacer&&!footer.querySelector('[data-ui-b-layer-footer="mask"]')){
        const mask=htmlNode('<button type="button" class="layer-tool-button" data-ui-b-layer-footer="mask" data-ui-b-command="mask-add" title="新增遮色片" aria-label="新增遮色片"><svg><use href="#i-mask"/></svg></button>');
        const fx=htmlNode('<button type="button" class="layer-tool-button" data-ui-b-layer-footer="fx" data-ui-b-command="layer-effects" title="圖層效果" aria-label="圖層效果"><svg><use href="#i-fx"/></svg></button>');
        footer.insertBefore(mask,spacer);footer.insertBefore(fx,spacer);
        for(const node of [mask,fx])node.addEventListener('click',()=>dispatch(node.dataset.uiBCommand));
      }
    }
    const objectPanel=$('[data-content="object"]');
    if(objectPanel&&!$('#uiBObjectBlend')){
      const blendBlock=htmlNode('<div id="uiBObjectBlend" class="property-card ui-b-object-blend"><label class="control-row"><span>混合</span><select id="uiBBlendMode">'+selectOptions(BLEND_MODES)+'</select></label></div>');
      objectPanel.prepend(blendBlock);
      $('#uiBBlendMode').addEventListener('change',event=>{const found=selectedObject();if(found)mutateObject('Blend Mode',found,object=>object.blendMode=event.target.value);});
    }
    if(objectPanel&&!$('#uiBRasterProperties'))objectPanel.appendChild(htmlNode('<div id="uiBRasterProperties" class="property-card ui-b-raster-properties"><div class="subpanel-title"><strong>Raster / Image</strong><span>RASTER</span></div><div id="uiBRasterStateReadout" class="shell-panel-note">No raster selected</div><div id="uiBRasterSourceReadout" class="shell-panel-note"></div><div class="ui-b-panel-actions">'+button('Crop…','data-ui-b-command="image-crop"')+button('Resize…','data-ui-b-command="image-resize"')+button('Profile…','data-ui-b-command="color-profile"')+'</div><div class="ui-b-panel-actions">'+button('Histogram','data-ui-b-raster-insight="histogram"')+button('Snapshot','data-ui-b-raster-insight="snapshot"')+button('Compare','data-ui-b-raster-insight="compare"')+'</div><div id="uiBRasterAnalysis" class="shell-panel-note"></div><div id="uiBFilterStack" class="ui-b-stack-list"></div><div id="uiBEffectStack" class="ui-b-stack-list"></div></div>'));
    objectPanel?.addEventListener('click',event=>{const command=event.target.closest('[data-ui-b-command]')?.dataset.uiBCommand;if(command)dispatch(command);const insight=event.target.closest('[data-ui-b-raster-insight]')?.dataset.uiBRasterInsight;if(insight)runRasterInsight(insight);});
    const geometryPanel=$('[data-content="geometry"]');
    if(geometryPanel&&!$('#uiBVectorAppearance'))geometryPanel.appendChild(htmlNode('<div id="uiBVectorAppearance" class="property-card"><div class="subpanel-title"><strong>Vector Appearance</strong><span>VECTOR</span></div><div id="uiBVectorAppearanceReadout" class="shell-panel-note">Select a Path</div><div class="ui-b-panel-actions">'+button('Gradient…','data-ui-b-command="gradient-editor"')+button('圖樣…','data-ui-b-command="pattern-editor"')+'</div></div>'));
    geometryPanel?.addEventListener('click',event=>{const command=event.target.closest('[data-ui-b-command]')?.dataset.uiBCommand;if(command)dispatch(command);});
    refreshPanels();
  }

  function refreshPanels(){
    refreshTextProperties();
    const crop=$('#psCropTool');if(crop)crop.disabled=false;
    const frame=$('#psFrameTool');if(frame)frame.disabled=false;
    const path=$('#psPathEditTool');if(path)path.disabled=!selectedFound(app,object=>['path','stroke'].includes(object.type));
    const found=selectedFound(app),object=found?.object,stackTarget=object?.type==='image'?object:app.layer();
    const blend=$('#uiBBlendMode');if(blend)blend.value=object?.blendMode||'source-over';
    const layerLock=$('[data-layer-action="toggle-lock"]');if(layerLock){const locked=Boolean(app.layer()?.locked);layerLock.setAttribute('aria-pressed',String(locked));layerLock.classList.toggle('active',locked);}
    const readout=$('#uiBRasterStateReadout');
    if(readout){
      if(object?.rasterState?.colorRaster){const r=deserializeColorRaster(object.rasterState.colorRaster);readout.textContent=r.width+'×'+r.height+' · '+r.bitDepth+'-bit · '+r.colorMode+(object.rasterState.icc?.inspection?' · ICC':'');}
      else readout.textContent='No raster selected';
    }
    const sourceReadout=$('#uiBRasterSourceReadout');if(sourceReadout)sourceReadout.textContent=object?.rasterState?.source?'Source: '+[object.rasterState.source.format,object.rasterState.source.compression].filter(Boolean).join(' · '):(object?.sourceId?'Reusable source: '+object.sourceId:'');
    const vectorReadout=$('#uiBVectorAppearanceReadout');if(vectorReadout)vectorReadout.textContent=object?.type==='path'?(object.fillAppearance?.type?('Fill: '+object.fillAppearance.type):'Path fill: ordinary'):'Select a Path';
    const filterStack=$('#uiBFilterStack');if(filterStack)filterStack.innerHTML=(stackTarget?.filterStack||[]).map((item,index)=>'<div class="ui-b-stack-row"><span>'+esc(item.type)+'</span><span class="ui-b-stack-actions"><button title="上移" data-ui-b-filter-move="'+index+':-1">↑</button><button title="下移" data-ui-b-filter-move="'+index+':1">↓</button><button title="移除" data-ui-b-filter-remove="'+index+'">×</button></span></div>').join('');
    const mutateStack=(label,operation)=>{const current=selectedFound(app,item=>item.type==='image'),target=current?.object||app.layer();if(!target)return;app.history.pushScoped(label,[current?app.objectPath(current):app.layerPath(target)],()=>operation(target));app.refreshAll();app.renderer.render();};
    filterStack?.querySelectorAll('[data-ui-b-filter-remove]').forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.uiBFilterRemove);mutateStack('移除 Filter',target=>target.filterStack.splice(index,1));}));
    filterStack?.querySelectorAll('[data-ui-b-filter-move]').forEach(button=>button.addEventListener('click',()=>{const [rawIndex,rawDelta]=button.dataset.uiBFilterMove.split(':').map(Number),target=clamp(rawIndex+rawDelta,0,(stackTarget?.filterStack||[]).length-1);if(target===rawIndex)return;mutateStack('移動 Filter',object=>{const [item]=object.filterStack.splice(rawIndex,1);object.filterStack.splice(target,0,item);});}));
    const effectStack=$('#uiBEffectStack');if(effectStack)effectStack.innerHTML=(object?.effects||[]).map((item,index)=>'<div class="ui-b-stack-row"><span>fx · '+esc(item.type)+'</span><button data-ui-b-effect-remove="'+index+'">×</button></div>').join('');
    effectStack?.querySelectorAll('[data-ui-b-effect-remove]').forEach(button=>button.addEventListener('click',()=>{const current=selectedImage();if(!current)return;const index=Number(button.dataset.uiBEffectRemove);mutateObject('移除 Effect',current,obj=>obj.effects.splice(index,1));}));
    const adjustmentStack=$('#uiBAdjustmentStack');if(adjustmentStack)adjustmentStack.innerHTML=(stackTarget?.adjustments||[]).map((item,index)=>'<div class="ui-b-stack-row"><span>'+esc(item.type)+'</span><button data-ui-b-adjustment-remove="'+index+'">×</button></div>').join('');
    adjustmentStack?.querySelectorAll('[data-ui-b-adjustment-remove]').forEach(button=>button.addEventListener('click',()=>{const index=Number(button.dataset.uiBAdjustmentRemove);mutateStack('移除 Adjustment',target=>target.adjustments.splice(index,1));}));
    refreshChannels();
  }

  function rasterPreview(found=selectedFound(app,object=>object.type==='image'&&object.rasterState?.colorRaster)){
    if(!found)return null;
    const preview=colorRasterToRgba8(found.object.rasterState.colorRaster,{icc:found.object.rasterState.icc?.bytes||null});
    if(preview.status!=='ok')return{found,preview,error:preview.reason||preview.status};
    return{found,preview,image:preview.imageData};
  }

  function runRasterInsight(command){
    const target=rasterPreview();if(!target){toast('請先選取 Raster 影像');return;}
    if(target.error){toast('Raster readout unavailable: '+target.error,3000);return;}
    const out=$('#uiBRasterAnalysis');
    if(command==='histogram'){
      const report=imageHistogram(target.image);
      if(out)out.textContent='Histogram mean · R '+report.mean.red.toFixed(1)+' · G '+report.mean.green.toFixed(1)+' · B '+report.mean.blue.toFixed(1)+' · A '+report.mean.alpha.toFixed(1);
      return;
    }
    if(command==='snapshot'){
      state.rasterSnapshot=createImageSnapshot(target.image,{name:'Raster compare baseline',stackState:{adjustments:target.found.object.adjustments||[],filters:target.found.object.filterStack||[],effects:target.found.object.effects||[]}});
      if(out)out.textContent='Snapshot captured · '+state.rasterSnapshot.width+'×'+state.rasterSnapshot.height;
      toast('Raster snapshot 已建立');return;
    }
    if(command==='compare'){
      if(!state.rasterSnapshot){toast('請先建立 Snapshot');return;}
      const before={width:state.rasterSnapshot.width,height:state.rasterSnapshot.height,data:Uint8ClampedArray.from(state.rasterSnapshot.data)};
      if(before.width!==target.image.width||before.height!==target.image.height){toast('Snapshot 尺寸不同，無法直接比較');return;}
      const report=compareImageStates(before,target.image);
      if(out)out.textContent='Compare · changed '+(report.changedRatio*100).toFixed(2)+'% · MAE '+report.meanAbsoluteError.toFixed(2)+' · max '+report.maxError;
      return;
    }
  }

  async function refreshRecoveryDialog(){
    const list=$('#uiBRecoveryList');if(!list)return;
    list.textContent='載入中…';
    const sources=[];
    const current=await app.store.loadRecord('autosave'),previous=await app.store.loadRecord('autosave:previous'),checkpoints=await app.store.loadRecord('autosave:checkpoints');
    if(current)sources.push({name:'current',record:current});
    if(previous)sources.push({name:'previous',record:previous});
    for(const [index,record] of (Array.isArray(checkpoints)?checkpoints:[]).entries())sources.push({name:'checkpoint-'+(index+1),record});
    state.recoveryCandidates=sources.map(source=>({source:source.name,...verifyStorageRecord(source.record)}));
    if(!state.recoveryCandidates.length){list.innerHTML='<p class="shell-panel-note">No recovery records.</p>';return;}
    list.innerHTML=state.recoveryCandidates.map((item,index)=>'<div class="ui-b-stack-row"><span><strong>'+esc(item.source)+'</strong><small>'+(item.valid?'verified '+(item.verified?'yes':'legacy'):'invalid · '+esc(item.reason||'unknown'))+'</small></span><button type="button" data-ui-b-recovery-index="'+index+'" '+(item.valid?'':'disabled')+'>Restore</button></div>').join('');
  }

  function restoreRecoveryCandidate(index){
    const candidate=state.recoveryCandidates[index];if(!candidate?.valid||!candidate.value)return;
    if(!confirm('Restore '+candidate.source+'? Current unsaved view will be replaced.'))return;
    try{app.replaceDocument(candidate.value);app.history.clear();app.dirty=false;closeDialog('recovery');toast('已從 '+candidate.source+' 恢復');}
    catch(error){console.error(error);toast('Recovery failed: '+error.message,3200);}
  }

  function refreshChannels(){
    const list=$('#uiBChannelsList');if(!list)return;
    const found=selectedFound(app,object=>object.type==='image'&&object.rasterState?.colorRaster);
    if(!found){list.innerHTML='<p class="shell-panel-note">選取點陣影像以檢視頻道。</p>';return;}
    const raster=deserializeColorRaster(found.object.rasterState.colorRaster),stateImage=found.object.rasterState;
    const rows=raster.channelNames.map((name,index)=>({kind:'process',index,name})).concat((stateImage.alphaChannels||[]).map((channel,index)=>({kind:'alpha',index,name:channel.name||'Alpha '+(index+1)})),(stateImage.spotChannels||[]).map((channel,index)=>({kind:'spot',index,name:channel.name||'Spot '+(index+1)})));
    list.innerHTML=rows.map(row=>'<button class="ui-b-channel-row'+(state.selectedChannel&&state.selectedChannel.kind===row.kind&&state.selectedChannel.index===row.index?' active':'')+'" data-ui-b-channel-select="'+row.kind+':'+row.index+'"><span>'+esc(row.name)+'</span><small>'+(row.kind==='process'?'色彩':row.kind==='alpha'?'Alpha':'特別色')+'</small></button>').join('');
    $$('[data-ui-b-channel-select]',list).forEach(button=>button.addEventListener('click',()=>{const [kind,index]=button.dataset.uiBChannelSelect.split(':');state.selectedChannel={kind,index:Number(index)};refreshChannels();}));
  }
  function channelCommand(command){
    const found=selectedRasterImage();if(!found)return;
    const stateImage=found.object.rasterState,raster=deserializeColorRaster(stateImage.colorRaster),length=raster.width*raster.height;
    mutateObject('Channel '+command,found,object=>{
      object.rasterState.alphaChannels=object.rasterState.alphaChannels||[];object.rasterState.spotChannels=object.rasterState.spotChannels||[];
      if(command==='add-alpha')object.rasterState.alphaChannels.push({id:'alpha-'+Date.now().toString(36),name:'Alpha '+(object.rasterState.alphaChannels.length+1),kind:'alpha',data:Array(length).fill(0)});
      else if(command==='add-spot')object.rasterState.spotChannels.push({id:'spot-'+Date.now().toString(36),name:'Spot '+(object.rasterState.spotChannels.length+1),kind:'spot',data:Array(length).fill(0),previewColor:[255,0,0],solidity:.5});
      else if(command==='remove'&&state.selectedChannel?.kind==='alpha')object.rasterState.alphaChannels.splice(state.selectedChannel.index,1);
      else if(command==='remove'&&state.selectedChannel?.kind==='spot')object.rasterState.spotChannels.splice(state.selectedChannel.index,1);
      else if(['rename','up','down'].includes(command)&&['alpha','spot'].includes(state.selectedChannel?.kind)){
        const key=state.selectedChannel.kind==='alpha'?'alphaChannels':'spotChannels',items=object.rasterState[key],index=state.selectedChannel.index;
        if(command==='rename'){const next=prompt('Channel name',items[index]?.name||'Channel');if(next)items[index].name=next.trim()||items[index].name;}
        else{const target=clamp(index+(command==='up'?-1:1),0,items.length-1);if(target!==index){const [item]=items.splice(index,1);items.splice(target,0,item);state.selectedChannel={...state.selectedChannel,index:target};}}
      }
    });if(['add-alpha','add-spot','remove'].includes(command))state.selectedChannel=null;refreshPanels();
  }

  function installDialogs(){
    const root=$('.app');if(!root)return;
    const specs=[
      ['select-and-mask','選取並遮住','<label>Smooth <input id="uiBMaskSmooth" type="number" value="0" min="0" max="20"></label><label>Feather <input id="uiBMaskFeather" type="number" value="0" min="0" max="50"></label><label>Expand <input id="uiBMaskExpand" type="number" value="0" min="-50" max="50"></label><div class="button-row"><button class="primary-button" data-ui-b-apply="select-and-mask">Apply Mask</button></div>'],
      ['layer-effects','圖層效果','<label>Effect <select id="uiBEffectType">'+selectOptions(Object.keys(EFFECT_DEFAULTS))+'</select></label><label>Color <input id="uiBEffectColor" type="color" value="#000000"></label><label>Opacity <input id="uiBEffectOpacity" type="number" min="0" max="1" step=".05" value=".6"></label><label>Size/Radius <input id="uiBEffectSize" type="number" min="0" max="200" value="8"></label><div class="button-row"><button class="primary-button" data-ui-b-apply="layer-effects">Add Effect</button></div>'],
      ['filter-params','Filter','<div id="uiBFilterName" class="ui-b-dialog-note"></div><label>Amount / Radius <input id="uiBFilterAmount" type="number" min="0" max="100" step=".1" value="2"></label><div class="button-row"><button class="primary-button" data-ui-b-apply="filter-params">Add Filter</button></div>'],
      ['filter-gallery','濾鏡收藏館','<div id="uiBFilterGalleryList" class="ui-b-gallery"></div>'],
      ['liquify','液化','<label>Operation <select id="uiBLiquifyType">'+selectOptions(['forwardWarp','twirl','pucker','bloat','reconstruct'])+'</select></label><label>半徑 <input id="uiBLiquifyRadius" type="number" min="1" max="1000" value="80"></label><label>強度 <input id="uiBLiquifyStrength" type="number" min="-1" max="1" step=".05" value=".4"></label><label>dx <input id="uiBLiquifyDx" type="number" value="12"></label><label>dy <input id="uiBLiquifyDy" type="number" value="0"></label><label><input id="uiBLiquifyFreezeSelection" type="checkbox"> Protect current raster selection</label><div class="button-row"><button class="primary-button" data-ui-b-apply="liquify">Add Liquify Filter</button></div>'],
      ['gradient-editor','漸層編輯器','<label>Type <select id="uiBGradientType">'+selectOptions(['linear','radial'])+'</select></label><label>Start <input id="uiBGradientStart" type="color" value="#202020"></label><label>End <input id="uiBGradientEnd" type="color" value="#ffffff"></label><label>Opacity <input id="uiBGradientOpacity" type="number" min="0" max="1" step=".05" value="1"></label><div class="button-row"><button class="primary-button" data-ui-b-apply="gradient-editor">Apply to selected Path</button></div>'],
      ['pattern-editor','Pattern Fill','<label>Pattern ref <input id="uiBPatternRef" type="text" value="pattern-default"></label><label>Scale <input id="uiBPatternScale" type="number" step=".1" value="1"></label><label>Rotation <input id="uiBPatternRotation" type="number" value="0"></label><div class="button-row"><button class="primary-button" data-ui-b-apply="pattern-editor">Apply to selected Path</button></div>'],
      ['color-profile','色彩描述檔','<div id="uiBProfileReadout" class="ui-b-dialog-note">No profile</div><input id="uiBProfileInput" type="file" accept=".icc,.icm" hidden><div class="button-row"><button data-ui-b-profile-load>Load ICC…</button></div>'],
      ['image-size','影像尺寸','<label>Width <input id="uiBImageWidth" type="number" min="1"></label><label>Height <input id="uiBImageHeight" type="number" min="1"></label><div class="button-row"><button class="primary-button" data-ui-b-apply="image-size">調整尺寸</button></div>'],
      ['image-crop','Crop Image','<label>X <input id="uiBCropX" type="number" min="0" value="0"></label><label>Y <input id="uiBCropY" type="number" min="0" value="0"></label><label>Width <input id="uiBCropW" type="number" min="1"></label><label>Height <input id="uiBCropH" type="number" min="1"></label><div class="button-row"><button class="primary-button" data-ui-b-apply="image-crop">裁切</button></div>'],
      ['advanced-transform','進階變形','<div id="uiBTransformMode" class="ui-b-dialog-note"></div><label>A <input id="uiBTransformA" type="number" step=".1" value="10"></label><label>B <input id="uiBTransformB" type="number" step=".1" value="0"></label><div class="button-row"><button class="primary-button" data-ui-b-apply="advanced-transform">套用</button></div>'],
      ['keyboard-shortcuts','鍵盤快捷鍵','<div class="ui-b-shortcuts"><p><kbd>V</kbd> Select</p><p><kbd>F</kbd> Fit</p><p><kbd>R</kbd> Rulers</p><p><kbd>Ctrl+Z</kbd> Undo</p><p><kbd>Ctrl+Shift+Z</kbd> Redo</p><p><kbd>Delete</kbd> Delete selection</p><p><kbd>Space</kbd> temporary Pan</p><p><kbd>Shift</kbd> constrained/angle snap</p></div>'],
      ['pen-calibration','觸控筆校準','<p class="ui-b-dialog-note">Calibration profile uses the existing device-validation authority.</p><div class="button-row"><button data-ui-b-pen-calibration-open>Open Specialist calibration controls</button></div>'],
      ['recovery','復原','<p class="ui-b-dialog-note">Recovery uses the existing storage/checkpoint authority. No second autosave model is created.</p><div id="uiBRecoveryList" class="ui-b-stack-list">載入中…</div>']
    ];
    for(const [id,title,body] of specs)if(!$('#uiB-'+id))root.appendChild(dialogShell(id,title,body,['filter-gallery','liquify'].includes(id)));
    root.addEventListener('click',event=>{
      const close=event.target.closest('[data-ui-b-close]');if(close){closeDialog(close.dataset.uiBClose);return;}
      const apply=event.target.closest('[data-ui-b-apply]');if(apply){applyDialog(apply.dataset.uiBApply);return;}
      if(event.target.closest('[data-ui-b-profile-load]'))$('#uiBProfileInput')?.click();
      if(event.target.closest('[data-ui-b-pen-calibration-open]')){closeDialog('pen-calibration');openPanel('specialist');$('#calibrationProfileSelect')?.scrollIntoView({block:'center'});}
      const recovery=event.target.closest('[data-ui-b-recovery-index]');if(recovery)restoreRecoveryCandidate(Number(recovery.dataset.uiBRecoveryIndex));
    });
    $('#uiBProfileInput')?.addEventListener('change',async event=>{const file=event.target.files?.[0];if(!file)return;try{const bytes=new Uint8Array(await file.arrayBuffer()),profile=parseIccProfile(bytes),inspection=inspectIccProfile(profile),found=selectedRasterImage();if(!found)return;mutateObject('Assign ICC Profile',found,object=>{object.rasterState.icc={bytes:Array.from(bytes),inspection};});refreshProfileDialog();toast('ICC profile assigned');}catch(error){toast('ICC：'+error.message,3000);}});
    document.addEventListener('keydown',event=>{if(event.key!=='Escape')return;const open=Array.from(document.querySelectorAll('.ui-b-dialog')).find(dialog=>!dialog.hidden);if(!open)return;event.preventDefault();event.stopPropagation();closeDialog(open.dataset.uiBDialog);},true);
  }

  function openDialog(id,context=null){
    state.dialogContext=context;
    const dialog=$('#uiB-'+id);if(!dialog){toast('Dialog unavailable: '+id);return;}
    if(id==='filter-gallery')refreshFilterGallery();
    if(id==='color-profile')refreshProfileDialog();
    if(id==='recovery')refreshRecoveryDialog();
    if(id==='image-size'||id==='image-crop'){const found=selectedRasterImage();if(!found)return;const raster=deserializeColorRaster(found.object.rasterState.colorRaster);if(id==='image-size'){$('#uiBImageWidth').value=raster.width;$('#uiBImageHeight').value=raster.height;}else{$('#uiBCropW').value=raster.width;$('#uiBCropH').value=raster.height;}}
    if(id==='filter-params')$('#uiBFilterName').textContent=context?.type||'Filter';
    if(id==='advanced-transform')$('#uiBTransformMode').textContent=context?.mode||'Transform';
    dialog.hidden=false;closeMenus();
  }
  function closeDialog(id){const dialog=$('#uiB-'+id);if(dialog)dialog.hidden=true;state.dialogContext=null;}
  function refreshFilterGallery(){
    const list=$('#uiBFilterGalleryList');if(!list)return;
    const descriptors=FILTER_GALLERY||[];
    list.innerHTML=descriptors.map(entry=>'<button data-ui-b-gallery-filter="'+esc(entry.id||entry.type||entry.name)+'"><strong>'+esc(entry.name||entry.id||entry.type)+'</strong><span>'+esc(entry.group||entry.category||'Filter')+'</span></button>').join('');
    $$('[data-ui-b-gallery-filter]',list).forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.uiBGalleryFilter;addFilter(id);closeDialog('filter-gallery');}));
  }
  function refreshProfileDialog(){
    const readout=$('#uiBProfileReadout');if(!readout)return;
    const found=selectedFound(app,object=>object.type==='image'&&object.rasterState?.colorRaster);
    const inspection=found?.object.rasterState?.icc?.inspection;
    readout.textContent=inspection?JSON.stringify({versionMajor:inspection.versionMajor,colorSpace:inspection.colorSpace,pcs:inspection.pcs,fingerprint:inspection.fingerprint},null,2):'No embedded ICC profile';
  }

  function applyDialog(id){
    try{
      if(id==='select-and-mask'){
        const selection=raster.refineSelection({smooth:number($('#uiBMaskSmooth').value),feather:number($('#uiBMaskFeather').value),expand:number($('#uiBMaskExpand').value)});
        const found=selectedRasterImage();if(!found)return;
        mutateObject('選取並遮住',found,object=>object.rasterMask=createRasterMask(selection.width,selection.height,selection.alpha,{feather:number($('#uiBMaskFeather').value),expand:number($('#uiBMaskExpand').value)}));closeDialog(id);
      }else if(id==='layer-effects'){
        const type=$('#uiBEffectType').value,color=$('#uiBEffectColor').value,opacity=number($('#uiBEffectOpacity').value,.6),size=number($('#uiBEffectSize').value,8);
        const params={...(EFFECT_DEFAULTS[type]||{}),color,opacity};
        if(type==='stroke')params.size=size;
        else if(type==='dropShadow'||type==='innerShadow')params.blur=size;
        else if(type==='outerGlow')params.radius=size;
        addLayerEffect(type,params);closeDialog(id);
      }else if(id==='filter-params'){
        const type=state.dialogContext?.type;
        if(type){
          const amount=number($('#uiBFilterAmount').value,2),base={...(FILTER_DEFAULTS[type]||{})};
          const key=type==='motionBlur'?'distance':type==='emboss'?'strength':type==='mosaic'?'size':type==='reduceNoise'?'strength':('radius' in base?'radius':('amount' in base?'amount':'radius'));
          base[key]=amount;addFilter(type,base);
        }closeDialog(id);
      }else if(id==='liquify'){
        const found=selectedRasterImage();if(!found)return;
        const type=$('#uiBLiquifyType').value,radius=number($('#uiBLiquifyRadius').value,80),strength=number($('#uiBLiquifyStrength').value,.4),dx=number($('#uiBLiquifyDx').value,12),dy=number($('#uiBLiquifyDy').value,0);
        const object=found.object,rasterState=deserializeColorRaster(object.rasterState.colorRaster),x=rasterState.width/2,y=rasterState.height/2,freeze=$('#uiBLiquifyFreezeSelection')?.checked?raster.selection():null,filter=createLiquifyFilter([{type,x,y,radius,strength,dx,dy}],{freezeMask:freeze?.alpha||null,maxWork:Math.max(4096,rasterState.width*rasterState.height*2)});
        mutateObject('液化',found,obj=>{obj.filterStack=obj.filterStack||[];obj.filterStack.push(filter);});closeDialog(id);
      }else if(id==='gradient-editor'){
        const type=$('#uiBGradientType').value,start=$('#uiBGradientStart').value,end=$('#uiBGradientEnd').value,opacity=number($('#uiBGradientOpacity').value,1);
        if(state.dialogContext?.target==='raster'){
          raster.setOption('gradientType',type);raster.setOption('gradientStart',start);raster.setOption('gradientEnd',end);raster.setOption('opacity',opacity);closeDialog(id);refreshContextOptions();toast('Raster Gradient options updated');return;
        }
        const found=selectedFound(app,object=>object.type==='path');if(!found){toast('請先選取 Path');return;}
        const descriptor=normalizeGradientFill({type,start:{x:0,y:0},end:{x:1,y:0},center:{x:.5,y:.5},radius:.5,stops:[{offset:0,color:start},{offset:1,color:end}],opacity});
        mutateObject('Vector Gradient',found,object=>object.fillAppearance=descriptor);closeDialog(id);toast('Gradient descriptor 已套用；renderer fidelity 由既有 authority 決定');
      }else if(id==='pattern-editor'){
        const found=selectedFound(app,object=>object.type==='path');if(!found){toast('請先選取 Path');return;}
        const descriptor=normalizePatternFill({patternRef:$('#uiBPatternRef').value,scale:number($('#uiBPatternScale').value,1),rotation:number($('#uiBPatternRotation').value,0)});
        mutateObject('Pattern Fill',found,object=>object.fillAppearance=descriptor);closeDialog(id);
      }else if(id==='image-size')resizeSelectedImage();
      else if(id==='image-crop')cropSelectedImage();
      else if(id==='advanced-transform')applyAdvancedTransform(state.dialogContext?.mode);
    }catch(error){console.error(error);toast(error.message||('Operation '+id+' failed'),3200);}
  }

  function resizeSelectedImage(){
    const found=selectedRasterImage();if(!found)return;const raster=deserializeColorRaster(found.object.rasterState.colorRaster),preview=colorRasterToRgba8(found.object.rasterState.colorRaster,{icc:found.object.rasterState.icc?.bytes||null});
    if(preview.status!=='ok'||raster.bitDepth!==8||raster.colorMode!=='RGB'){toast('目前 UI resize 僅對 8-bit RGB raster 啟用');return;}
    const width=Math.max(1,Math.floor(number($('#uiBImageWidth').value,raster.width))),height=Math.max(1,Math.floor(number($('#uiBImageHeight').value,raster.height))),result=resizeImageData(preview.imageData,width,height);
    const rgb=new Uint8Array(width*height*3),alpha=new Uint8Array(width*height);for(let i=0;i<width*height;i++){rgb[i*3]=result.data[i*4];rgb[i*3+1]=result.data[i*4+1];rgb[i*3+2]=result.data[i*4+2];alpha[i]=result.data[i*4+3];}
    mutateObject('Image Resize',found,object=>{object.rasterState.colorRaster=serializeColorRaster(createColorRaster({width,height,bitDepth:8,colorMode:'RGB',data:rgb,alpha}));object.w=width;object.h=height;});closeDialog('image-size');
  }
  function cropSelectedImage(){
    const found=selectedRasterImage();if(!found)return;const raster=deserializeColorRaster(found.object.rasterState.colorRaster),preview=colorRasterToRgba8(found.object.rasterState.colorRaster,{icc:found.object.rasterState.icc?.bytes||null});
    if(preview.status!=='ok'||raster.bitDepth!==8||raster.colorMode!=='RGB'){toast('目前 UI crop 僅對 8-bit RGB raster 啟用');return;}
    const result=cropImageData(preview.imageData,{x:number($('#uiBCropX').value),y:number($('#uiBCropY').value),w:number($('#uiBCropW').value,raster.width),h:number($('#uiBCropH').value,raster.height)}),rgb=new Uint8Array(result.width*result.height*3),alpha=new Uint8Array(result.width*result.height);
    for(let i=0;i<result.width*result.height;i++){rgb[i*3]=result.data[i*4];rgb[i*3+1]=result.data[i*4+1];rgb[i*3+2]=result.data[i*4+2];alpha[i]=result.data[i*4+3];}
    mutateObject('裁切影像',found,object=>{object.rasterState.colorRaster=serializeColorRaster(createColorRaster({width:result.width,height:result.height,bitDepth:8,colorMode:'RGB',data:rgb,alpha}));object.w=result.width;object.h=result.height;});closeDialog('image-crop');
  }

  function setBitDepth(depth){
    const found=selectedRasterImage();if(!found)return;const target=Number(depth);
    app.history.pushScoped('Bit Depth '+target,[objectTarget(app,found),['colorState']],()=>{found.object.rasterState.colorRaster=serializeColorRaster(convertBitDepth(deserializeColorRaster(found.object.rasterState.colorRaster),target));app.doc.colorState={...(app.doc.colorState||{}),bitDepth:target};});
    app.refreshAll();app.renderer.render();refreshPanels();
  }
  function setColorMode(mode){
    const found=selectedRasterImage();if(!found)return;
    try{app.history.pushScoped('Color Mode '+mode,[objectTarget(app,found),['colorState']],()=>{found.object.rasterState.colorRaster=convertRasterMode(found.object.rasterState.colorRaster,mode);app.doc.colorState={...(app.doc.colorState||{}),colorMode:mode};});app.refreshAll();app.renderer.render();refreshPanels();}
    catch(error){toast(error.message,3200);}
  }

  function applyAdvancedTransform(mode){
    const found=selectedObject();if(!found)return;
    const a=number($('#uiBTransformA').value,10),b=number($('#uiBTransformB').value,0);
    if(mode==='skew'){
      const bounds=app.renderer.objectWorldBounds(found.object,found.parentWorldMatrix),pivot={x:bounds.x+bounds.w/2,y:bounds.y+bounds.h/2},matrix=createSkewMatrix({xDegrees:a,yDegrees:b,pivot});
      app.history.pushScoped('Skew',[app.objectPath(found)],()=>{const current=app.findObject({layerId:found.layer.id,objectId:found.object.id});if(current)current.object.matrix=M.multiply(matrix,current.object.matrix||M.identity());});app.refreshAll();closeDialog('advanced-transform');return;
    }
    if(mode==='warp'){
      if(found.object.type!=='path'){toast('Warp 目前只對 Path 啟用');return;}
      const plan=createWarpDeformationPlan(objectBoundsLocal(found.object),{strength:clamp(a/100,-1,1),maxDisplacement:clamp(Math.abs(b||.5),0,.5)});
      mutateObject('Warp',found,object=>applyNonDestructiveDeformation(object,{bend:plan.parameters.bend}));closeDialog('advanced-transform');return;
    }
    if(!['distort','perspective'].includes(mode)||found.object.type!=='path'){toast('Distort/Perspective 目前需選取 Path');return;}
    const bounds=objectBoundsLocal(found.object),source=[{x:bounds.x,y:bounds.y},{x:bounds.x+bounds.w,y:bounds.y},{x:bounds.x+bounds.w,y:bounds.y+bounds.h},{x:bounds.x,y:bounds.y+bounds.h}],dest=source.map(point=>({...point}));
    dest[0].x+=a;dest[1].y+=b;dest[2].x-=a;dest[3].y-=b;const matrix=createProjectiveTransform(source,dest);
    mutateObject(mode==='distort'?'Distort':'Perspective',found,object=>{for(const sub of object.subpaths||[])for(const anchor of sub.anchors||[]){const center=mapProjectivePoint(matrix,{x:anchor.x,y:anchor.y}),incoming=mapProjectivePoint(matrix,{x:anchor.x+(anchor.in?.x||0),y:anchor.y+(anchor.in?.y||0)}),outgoing=mapProjectivePoint(matrix,{x:anchor.x+(anchor.out?.x||0),y:anchor.y+(anchor.out?.y||0)});anchor.x=center.x;anchor.y=center.y;anchor.in={x:incoming.x-center.x,y:incoming.y-center.y};anchor.out={x:outgoing.x-center.x,y:outgoing.y-center.y};}});closeDialog('advanced-transform');
  }

  function updateTextMode(mode){
    app.uiBTextMode=mode;app.runUiCommand('tool.activate.v1',{tool:'text'});
    const found=selectedFound(app,object=>object.type==='text');
    if(found)mutateObject('Text Writing Mode',found,object=>updateTextObject(object,{writingMode:mode}));
    toast('Text mode：'+mode);
  }
  function textOnPath(){
    const selected=app.selectedObjects(),text=selected.find(item=>item.object.type==='text'),path=selected.find(item=>item.object.type==='path');
    if(!text||!path){toast('請同時選取 Text 與 Path');return;}
    mutateObject('Text on Path',text,object=>updateTextObject(object,{pathText:{pathId:path.object.id,startOffset:0}}));toast('Text-on-Path descriptor 已建立');
  }

  function addMask(){
    const found=selectedRasterImage();if(!found)return;const selection=raster.selection(),r=deserializeColorRaster(found.object.rasterState.colorRaster);
    const alpha=selection?.alpha&&selection.width===r.width&&selection.height===r.height?selection.alpha:new Uint8ClampedArray(r.width*r.height).fill(255);
    mutateObject('建立 Mask',found,object=>object.rasterMask=createRasterMask(r.width,r.height,alpha));refreshPanels();
  }

  async function openExternalImage(){
    let input=$('#uiBExternalImageInput');if(!input){input=htmlNode('<input id="uiBExternalImageInput" type="file" accept=".psd,.psb,.tif,.tiff,.exr,.raw,application/octet-stream" hidden>');$('.app').appendChild(input);input.addEventListener('change',async event=>{const file=event.target.files?.[0];event.target.value='';if(!file)return;try{await app.importImageFormat(new Uint8Array(await file.arrayBuffer()),{name:file.name});toast('已匯入 '+file.name);}catch(error){console.error(error);toast('外部格式匯入失敗：'+error.message,3600);}});}input.click();
  }

  function installExportInterop(){
    const select=$('#exportFormat');if(!select)return;
    for(const [value,label] of [['psd','PSD（flattened bounded）'],['tiff','TIFF'],['exr','EXR'],['psb','PSB（需要 adapter）'],['raw','RAW（不可匯出）']])if(!select.querySelector('option[value="'+value+'"]'))select.appendChild(htmlNode('<option value="'+value+'">'+label+'</option>'));
    const baseRun=app.runExport.bind(app),baseRefresh=app.refreshExportUI.bind(app),cancelButton=$('#cancelExportBtn');
    let resumeButton=$('#uiBResumeExportBtn');
    if(!resumeButton&&cancelButton){resumeButton=htmlNode('<button id="uiBResumeExportBtn" type="button" class="wide-button ui-b-export-resume" hidden>繼續分塊匯出</button>');cancelButton.parentElement?.appendChild(resumeButton);}
    cancelButton?.addEventListener('click',()=>{
      const job=app.activeExportJob;
      if(!job||$('#exportFormat').value!=='png')return;
      state.resumableExportJob=job;state.resumableExportName=fileSafe(app.doc.title)+'-'+fileSafe(app.page().name)+'.png';
      if(resumeButton){resumeButton.hidden=false;resumeButton.disabled=true;}
      const wait=()=>{if(!state.resumableExportJob||!resumeButton)return;if(state.resumableExportJob.state==='cancelled'){resumeButton.disabled=false;return;}if(['running','cancelling'].includes(state.resumableExportJob.state))setTimeout(wait,60);else{resumeButton.hidden=true;state.resumableExportJob=null;}};
      setTimeout(wait,60);
    },true);
    resumeButton?.addEventListener('click',async()=>{
      const job=state.resumableExportJob;if(!job)return;
      if(job.state!=='cancelled'){toast('等待取消完成後再繼續');return;}
      const status=$('#exportProgress');resumeButton.disabled=true;status.hidden=false;status.textContent='從 checkpoint 繼續分塊匯出…';
      try{
        const tiled=await job.resume({onProgress:progress=>status.textContent='繼續分塊匯出 '+progress.completed+'/'+progress.total+'（'+Math.round(progress.ratio*100)+'%）'});
        const encoded=await app.pngWorkerEncoder.encode(tiled.canvas,{onProgress:progress=>status.textContent='PNG '+progress.phase+' · '+Math.round((progress.progress||0)*100)+'%'});
        downloadBytes(app,encoded.blob,state.resumableExportName||'INK-resumed.png','image/png');
        tiled.canvas.width=1;tiled.canvas.height=1;state.resumableExportJob=null;resumeButton.hidden=true;$('#exportDialog').hidden=true;toast('分塊匯出已從 checkpoint 完成');
      }catch(error){console.error(error);resumeButton.disabled=false;toast('繼續匯出失敗：'+error.message,3200);}
    });
    app.refreshExportUI=function(){baseRefresh();const format=$('#exportFormat').value;if(['psd','tiff','exr','psb','raw'].includes(format)){const summary=$('#exportSummary');if(format==='psb')summary.textContent='PSB：需要已註冊的格式 adapter';else if(format==='raw')summary.textContent='RAW export 目前不可用';else summary.textContent=format.toUpperCase()+'：輸出目前選取的 Raster State';}};
    app.runExport=async function(){
      const format=$('#exportFormat').value;if(!['psd','tiff','exr','psb','raw'].includes(format))return baseRun();
      if(format==='raw')throw new Error('RAW export is not supported in the current format contract');
      if(format==='psb')throw new Error('PSB encode requires a registered adapter');
      const found=selectedRasterImage();if(!found)return;
      try{const bytes=app.exportImageFormat(format.toUpperCase(),found.object);downloadBytes(app,bytes,fileSafe(app.doc.title)+'.'+format);$('#exportDialog').hidden=true;toast(format.toUpperCase()+' 已建立');}catch(error){toast('匯出失敗：'+error.message,3600);}
    };
    select.addEventListener('change',()=>{if(resumeButton&&select.value!=='png')resumeButton.hidden=true;app.refreshExportUI();});
  }

  async function dispatch(command){
    try{
      if(command.startsWith('panel:'))return openPanel(command.slice(6));
      if(command.startsWith('tool:'))return activateTool(command.slice(5));
      if(command.startsWith('filter:')){const type=command.slice(7);return openDialog('filter-params',{type});}
      if(command.startsWith('bit-depth:'))return setBitDepth(command.slice(10));
      if(command.startsWith('color-mode:'))return setColorMode(command.slice(11));
      if(command.startsWith('text-mode:'))return updateTextMode(command.slice(10));
      if(command.startsWith('transform:'))return openDialog('advanced-transform',{mode:command.slice(10)});
      if(command.startsWith('arrange:'))return app.reorderSelection(command.endsWith('front')?'front':'back');
      if(command.startsWith('align:'))return app.runUiCommand('object.align.v1',{mode:command.slice(6)});
      if(command.startsWith('proxy:')){
        const target=document.getElementById(command.slice(6));
        if(!target){toast('UI route unavailable: '+command);return;}
        target.click();return;
      }
      if(command.startsWith('snap:')){
        const kind=command.slice(5);if(kind==='enabled')return app.runUiCommand('page.snap.set.v1',{key:'enabled',value:!(app.page().snap?.enabled!==false)});return app.runUiCommand('page.snap.set.v1',{key:kind,value:!app.page().snap?.categories?.[kind]});
      }
      if(command.startsWith('workspace:'))return app.runWorkspaceCommand(command.slice(10));
      if(command==='external-open')return openExternalImage();
      if(command==='reference-import'){openPanel('reference');return;}
      if(command==='svg-import'){openPanel('specialist');$('#svgStudioInput')?.click();return;}
      if(command==='print'){app.openExport();$('#exportFormat').value='print';app.refreshExportUI();return;}
      if(command==='duplicate')return app.runUiCommand('selection.duplicate.v1');
      if(command==='delete')return app.runUiCommand('selection.delete.v1');
      if(command==='preferences')return globalThis.dispatchEvent(new CustomEvent('ink:branding-open'));
      if(command==='canvas-settings')return $('#settingsToggle')?.click();
      if(command==='image-adjustments')return openPanel('adjustments');
      if(command==='color-profile')return openDialog('color-profile');
      if(command==='gradient-editor')return openDialog('gradient-editor');
      if(command==='pattern-editor')return openDialog('pattern-editor');
      if(command==='image-crop')return openDialog('image-crop');
      if(command==='image-resize')return openDialog('image-size');
      if(command==='layer-new')return app.runUiCommand('layer.create.v1');
      if(command==='layer-duplicate')return app.runUiCommand('layer.duplicate.v1',{layerId:app.layer()?.id});
      if(command==='layer-delete')return app.runUiCommand('layer.delete.v1',{layerId:app.layer()?.id});
      if(command==='group')return app.groupSelection();
      if(command==='ungroup')return app.ungroupSelection();
      if(command==='frame-selection')return app.frameSelection();
      if(command==='mask-add')return addMask();
      if(command==='select-and-mask')return openDialog('select-and-mask');
      if(command==='layer-effects')return openDialog('layer-effects');
      if(command==='text-on-path')return textOnPath();
      if(command==='select-all'){const p=app.page();app.selection=p.layers.flatMap(layer=>layer.visible===false?[]:layer.objects.map(object=>({layerId:layer.id,objectId:object.id})));app.refreshSelectionUI();app.renderer.render();return;}
      if(command==='select-clear')return app.runUiCommand('selection.clear.v1');
      if(command==='filter-gallery')return openDialog('filter-gallery');
      if(command==='liquify')return openDialog('liquify');
      if(command==='guides:toggle'){const guides=app.page().guides||[],visible=guides.some(guide=>guide.visible!==false);for(const guide of guides)app.runUiCommand('guide.visibility.set.v1',{guideId:guide.id,visible:!visible});return;}
      if(command==='guides:lock'){const guides=app.page().guides||[],lock=guides.some(guide=>!guide.locked);for(const guide of guides)app.runUiCommand('guide.lock.set.v1',{guideId:guide.id,locked:lock});return;}
      if(command==='guides:clear'){for(const guide of [...(app.page().guides||[])])app.runUiCommand('guide.remove.v1',{guideId:guide.id});return;}
      if(command==='keyboard-shortcuts')return openDialog('keyboard-shortcuts');
      if(command==='updates'){globalThis.dispatchEvent(new CustomEvent('ink:branding-open',{detail:{category:'storage'}}));$('#checkUpdateBtn')?.click();return;}
      if(command==='pen-calibration')return globalThis.dispatchEvent(new CustomEvent('ink:branding-open',{detail:{category:'tools'}}));
      if(command==='recovery')return openDialog('recovery');
      toast('Command route unavailable：'+command);
    }catch(error){console.error(error);toast(error.message||('Command failed: '+command),3200);}
  }

  function bridgeLegacySpecialist(){
    const adjustmentAdd=$('#adjustmentAdd'),filterAdd=$('#filterAdd'),maskAdd=$('#maskAdd');
    adjustmentAdd?.addEventListener('click',()=>{const type=$('#adjustmentType')?.value;if(type)addAdjustment(type);});
    filterAdd?.addEventListener('click',()=>{const type=$('#filterType')?.value;if(type)addFilter(type);});
    maskAdd?.addEventListener('click',()=>addMask());
  }

  function renderLayerThumbnails(){
    const page=app.page?.();if(!page||!app.renderer?.drawLayerObjects)return;
    for(const row of document.querySelectorAll('.layer-row[data-layer-id]')){
      const layer=page.layers.find(item=>item.id===row.dataset.layerId),thumb=row.querySelector('.layer-thumb');
      if(!layer||!thumb)continue;
      let canvas=thumb.querySelector('canvas');
      if(!canvas){canvas=document.createElement('canvas');canvas.width=64;canvas.height=56;canvas.setAttribute('aria-hidden','true');thumb.replaceChildren(canvas);}
      const context=canvas.getContext('2d');if(!context)continue;
      context.setTransform(1,0,0,1,0,0);context.clearRect(0,0,64,56);
      const bounds=app.renderer.contentBounds?.({...page,layers:[{...layer,visible:true}]});
      if(!bounds||!Number.isFinite(bounds.w)||bounds.w<=0||bounds.h<=0)continue;
      const scale=Math.min(60/bounds.w,52/bounds.h);
      context.save();context.setTransform(scale,0,0,scale,32-(bounds.x+bounds.w/2)*scale,28-(bounds.y+bounds.h/2)*scale);
      context.globalAlpha=layer.opacity??1;
      try{app.renderer.drawLayerObjects(context,layer,page,{preferredScale:scale});}catch(error){console.warn('Layer thumbnail',error);}
      context.restore();
    }
  }
  function refreshTextProperties(){
    const panel=$('[data-content="object"]');if(!panel)return;
    let host=$('#uiBTextProperties');
    if(!host){
      host=htmlNode('<div id="uiBTextProperties" class="property-card"><label class="control-row"><span>行高</span><input type="number" min="0.1" max="10" step="0.05" data-ui-b-text-line-height></label></div>');
      ($('#selectionControls')||panel).prepend(host);
      $('[data-ui-b-text-line-height]',host).addEventListener('change',event=>{
        const found=selectedFound(app,object=>object.type==='text');
        if(found)mutateObject('Text Line Height',found,object=>updateTextObject(object,{lineHeight:clamp(number(event.target.value,1.25),.1,10)}));
      });
    }
    const found=selectedFound(app,object=>object.type==='text');host.hidden=!found;
    if(found)$('[data-ui-b-text-line-height]',host).value=found.object.lineHeight||1.25;
  }

  function refreshBrushExtraOptions(){
    let host=$('#uiBBrushExtraOptions');
    if(!host){host=htmlNode('<div id="uiBBrushExtraOptions" class="contextual-tool-controls ui-b-context-controls"></div>');$('.contextual-control-host')?.append(host);}
    const settings=app.toolSettings[app.tool];
    const drawing=['pen','pencil','marker','brush','airbrush'].includes(app.tool);
    const fields=drawing?[
      ...(['pen','marker','brush','airbrush'].includes(settings?.kind)?[['taper','收尖']]:[]),
      ...(['pencil','drybrush','brush','airbrush'].includes(settings?.kind)?[['grain','顆粒']]:[]),
      ...(['brush','airbrush'].includes(settings?.kind)?[['softness','柔度']]:[]),
    ]:[];
    host.hidden=!fields.length;
    host.innerHTML=fields.map(([key,label])=>'<label class="quick-slider context-inline-control"><span class="context-control-label">'+label+'</span><input type="range" min="'+(key==='softness'?5:key==='flow'?10:0)+'" max="100" value="'+Math.round((settings[key]||0)*100)+'" data-ui-b-brush-option="'+key+'"><output>'+Math.round((settings[key]||0)*100)+'%</output></label>').join('');
    $$('[data-ui-b-brush-option]',host).forEach(input=>input.addEventListener('input',()=>{
      app.runUiCommand('tool.setting.set.v1',{tool:app.tool,key:input.dataset.uiBBrushOption,value:number(input.value)/100});
      input.nextElementSibling.value=input.value+'%';
    }));
  }

  function installLifecycleRefresh(){
    const nativeSetTool=app.setTool.bind(app);
    app.setTool=function(tool){
      if(!state.switchingRaster){if(raster.activeTool())raster.clearTool();state.activeCapabilityTool=null;}
      const result=nativeSetTool(tool);refreshContextOptions();return result;
    };
    const originalToolUI=app.refreshToolUI.bind(app);
    app.refreshToolUI=function(){const result=originalToolUI();const mediaPanel=$('#brushOptions');if(mediaPanel&&!mediaPanel.querySelector('input,select,button'))mediaPanel.hidden=true;$$('[data-shape]').forEach(control=>control.classList.toggle('active',control.dataset.shape===app.shapeType));if(app.tool==='brush'){const draw=$('#drawToolButton');draw?.classList.remove('active');if(draw)draw.dataset.tool='pen';$('#drawToolUse')?.setAttribute('href','#i-pen');const label=$('#drawToolLabel');if(label)label.textContent='鋼筆';}const activeRaster=raster.activeTool();if(activeRaster){$$('.tool-rail .tool-button,.tool-rail .tool-action').forEach(node=>node.classList.remove('active'));const group=UI_B_TOOL_GROUPS.find(item=>item.tools.some(([id])=>id===activeRaster));const target=activeRaster==='objectSelection'?$('#psObjectSelect'):$('[data-ui-b-tool-group="'+group?.id+'"]');target?.classList.add('active');}else $('#psObjectSelect')?.classList.remove('active');refreshContextOptions();refreshBrushExtraOptions();return result;};
    const originalLayers=app.refreshLayers.bind(app);
    app.refreshLayers=function(){const result=originalLayers();renderLayerThumbnails();return result;};
    const original=app.refreshSelectionUI.bind(app);
    app.refreshSelectionUI=function(){const result=original();refreshPanels();refreshContextOptions();return result;};
  }

  installMenus();installTools();installPointerCapture();installPanels();installDialogs();installExportInterop();bridgeLegacySpecialist();installLifecycleRefresh();app.refreshToolUI();refreshContextOptions();refreshPanels();renderLayerThumbnails();

  const api={
    version:'1.0',app,state,raster,registry:UI_B_CONTRIBUTION_REPORT,
    dispatch,activateTool,openDialog,closeDialog,refreshPanels,
    addAdjustment,addFilter,addLayerEffect,addMask
  };
  app.uiBControls=api;window.INK_UI_B=api;
  document.dispatchEvent(new CustomEvent('ink:ui-b-controls-ready',{detail:{menuCount:UI_B_CONTRIBUTION_REPORT.menuCount,toolGroupCount:UI_B_CONTRIBUTION_REPORT.toolGroupCount}}));
  return api;
}
