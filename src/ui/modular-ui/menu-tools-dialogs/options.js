import { UI_B_002_RASTER_OPTIONS } from './control-matrix.js';
import { escapeText, runCommand, stateRerender } from './module-utils.js';
import { normalizedOptionValue, routeUiB002Option } from './option-routing.js';
import {
  toolPresentation, UI_B_SELECTION_MODE_LABELS, UI_B_SHAPE_LABELS, UI_B_TEXT_DIRECTION_LABELS
} from './presentation.js';

const DRAW=new Set(['pen','pencil','marker','brush','airbrush','eraser']);
const numberField=(scope,key,label,value,min,max,step,unit='')=>`<label><span>${escapeText(label)}</span><input type="number" data-option-key="${key}" data-${scope}-option="${key}" value="${Number(value)}" min="${min}" max="${max}" step="${step}" aria-label="${escapeText(label)}">${unit?`<span class="mui-b-option-unit">${escapeText(unit)}</span>`:''}</label>`;
const optionList=(values,current,labels={})=>values.map(value=>`<option value="${escapeText(value)}" ${current===value?'selected':''}>${escapeText(labels[value]||value)}</option>`).join('');
const rasterField=(key,value)=>{
  const numeric={
    radius:['大小',1,300,1,'px'],strength:['強度',0,1,.05,''],opacity:['透明度',0,1,.05,''],
    hardness:['硬度',0,1,.05,''],tolerance:['容差',0,255,1,''],edgeThreshold:['邊緣',0,255,1,''],
    searchRadius:['搜尋半徑',2,64,1,'px'],sampleRadius:['取樣半徑',0,32,1,'px']
  };
  if(numeric[key])return numberField('option',key,...numeric[key].slice(0,1),value,...numeric[key].slice(1));
  if(key==='contiguous')return `<label class="mui-b-option-check"><input type="checkbox" data-option-key="${key}" data-option="${key}" ${value?'checked':''}>連續</label>`;
  if(key==='selectionMode')return `<label><span>選取模式</span><select data-option-key="${key}" data-option="${key}" aria-label="選取模式">${optionList(['new','add','subtract','intersect'],value,UI_B_SELECTION_MODE_LABELS)}</select></label>`;
  if(key==='gradientType')return `<label><span>漸層</span><select data-option-key="${key}" data-option="${key}" aria-label="漸層類型">${optionList(['linear','radial'],value,{linear:'線性',radial:'放射'})}</select></label>`;
  if(key==='spongeMode')return `<label><span>模式</span><select data-option-key="${key}" data-option="${key}" aria-label="海綿模式">${optionList(['saturate','desaturate'],value,{saturate:'增加飽和',desaturate:'降低飽和'})}</select></label>`;
  if(key==='replacementColor'||key==='gradientStart'||key==='gradientEnd')return `<label><span>${key==='replacementColor'?'取代色':key==='gradientStart'?'起點色':'終點色'}</span><input type="color" data-option-key="${key}" data-option="${key}" value="${escapeText(value||'#202020')}" aria-label="${key==='replacementColor'?'取代色':key==='gradientStart'?'起點色':'終點色'}"></label>`;
  return '';
};

export function createUiB002OptionsModule(){return{id:'ui-b-002.options.v3',slot:'options',mount(ctx){
  const render=()=>{
    const native=ctx.services.uiBTools;
    const current=native?.activeTool?.()||ctx.selectors.get('tool.current');
    const drawingTool=native?.drawingTool?.()||current;
    const settings=ctx.selectors.get('tool.settings',{tool:DRAW.has(current)?drawingTool:undefined})||{};
    const opts=ctx.selectors.get('tool.options')||{};
    const raster=native?.rasterOptions?.()||{};
    const presentation=toolPresentation(current,{label:'工具'});
    let body='';
    if(DRAW.has(current)){
      body=`<label><span>顏色</span><input type="color" data-option-key="color" data-core-option="color" value="${escapeText(settings.color||'#202020')}" aria-label="繪圖顏色"></label>${numberField('core','size','大小',settings.size||4,.5,120,.5,'px')}${numberField('core','opacity','透明度',settings.opacity??1,.01,1,.01)}${numberField('core','smoothing','平滑',settings.smoothing??.5,0,1,.01)}`;
    } else if(UI_B_002_RASTER_OPTIONS[current]){
      body=UI_B_002_RASTER_OPTIONS[current].map(key=>rasterField(key,raster[key])).join('');
      if(current==='patternStamp'){
        const pattern=native?.patternInfo?.()||{};
        body+=`<label class="mui-b-pattern-input"><span>圖樣</span><input type="file" data-pattern-file accept="image/png,image/jpeg,image/webp" aria-label="載入圖樣影像"></label><span data-pattern-status>${pattern.loaded?escapeText(pattern.name||'已載入'):'尚未載入'}</span>`;
      }
      if(['cloneStamp','healingBrush','patch'].includes(current))body+='<span class="mui-b-options-note">Alt／Option 點擊設定來源點</span>';
      if(!body)body='<span class="mui-b-options-note">此工具沒有即時參數</span>';
    } else if(current?.startsWith('shape:')||current==='shape'){
      const shapeValue=opts.shapeType||current?.split(':')[1]||'line';
      body=`<label><span>形狀</span><select data-option-key="shape" data-core-option="shape" aria-label="形狀">${optionList(['line','arrow','rect','ellipse','triangle'],shapeValue,UI_B_SHAPE_LABELS)}</select></label><label class="mui-b-option-check"><input type="checkbox" data-option-key="shapeFill" data-core-option="shapeFill" ${opts.shapeFill?'checked':''}>填色</label>`;
    } else if(current?.startsWith('text:')||current==='text'){
      const direction=native?.textDirection?.()||current?.split(':')[1]||'horizontal-tb';
      body=`<label><span>字型</span><input data-option-key="fontFamily" data-core-option="fontFamily" value="${escapeText(opts.font?.family||'system-ui')}" aria-label="字型"></label>${numberField('core','fontSize','字級',opts.font?.size||32,4,512,1,'px')}<label><span>方向</span><select data-option-key="textDirection" data-special-option="textDirection" aria-label="文字方向">${optionList(['horizontal-tb','vertical-rl','vertical-lr'],direction,UI_B_TEXT_DIRECTION_LABELS)}</select></label>`;
    } else if(current==='pan'){
      body='<button type="button" data-view="fit">符合內容</button><button type="button" data-view="reset">重設視圖</button>';
    } else if(current==='select'){
      body='<button type="button" data-selection="clear">取消選取</button><span class="mui-b-options-note">移動／框選</span>';
    } else {
      body='<span class="mui-b-options-note">此工具沒有即時參數</span>';
    }
    const workspace=ctx.selectors.get('workspace.current')||{},space=workspace.activeSpace||workspace.id||workspace.space||'creation';
    const layout=space==='layout',workspaceAvailable=ctx.commands.has('workspace.activate.v1');
    const workspaceIcon=layout
      ? '<svg viewBox="0 0 18 16" aria-hidden="true"><rect x="2.5" y="2.5" width="13" height="11"/><path d="M5 5h8M5 8h8M5 11h5"/></svg>'
      : '<svg viewBox="0 0 18 16" aria-hidden="true"><path d="M3 12.5c2.8-5.5 6.1-7.9 11.5-9"/><path d="M4 11c1.2.2 2.1.9 2.5 2.1"/><path d="M12.8 2.8l2.4 2.4"/></svg>';
    ctx.root.innerHTML=`<div class="mui-b-options"><span class="mui-b-options-title">${escapeText(presentation.label)}</span><span class="mui-b-options-separator" aria-hidden="true"></span>${body}<span class="mui-b-options-spacer"></span><button type="button" class="mui-b-workspace-toggle" data-workspace-toggle data-workspace-space="${layout?'layout':'creation'}" aria-pressed="${layout?'true':'false'}" aria-label="${layout?'目前為圖紙；切換至手繪板':'目前為手繪板；切換至圖紙'}" ${workspaceAvailable?'':'disabled'}>${workspaceIcon}</button></div>`;
  };
  const apply=event=>{
    const node=event.target.closest?.('[data-option],[data-core-option],[data-special-option]');if(!node)return;
    const isDiscrete=node.matches?.('select,input[type="checkbox"]');
    if(event.type==='input'&&isDiscrete)return;
    if(event.type==='change'&&!isDiscrete)return;
    const scope=node.dataset.option?'raster':node.dataset.specialOption?'special':'core';
    const key=node.dataset.option||node.dataset.specialOption||node.dataset.coreOption;
    routeUiB002Option(ctx,{scope,key,value:normalizedOptionValue(node),drawingTool:ctx.services.uiBTools?.drawingTool?.()||null});
  };
  ctx.listen(ctx.root,'input',apply);ctx.listen(ctx.root,'change',apply);
  ctx.listen(ctx.root,'change',async event=>{
    const input=event.target.closest?.('[data-pattern-file]');if(!input)return;
    const file=input.files?.[0];if(!file)return;
    try{await ctx.services.uiBTools?.loadPatternFile?.(file);ctx.services.report?.(`圖樣已載入：${file.name}`);}catch(error){ctx.services.report?.(error?.message||'圖樣載入失敗');}
    finally{input.value='';}
  });
  ctx.listen(ctx.root,'click',event=>{const workspaceToggle=event.target.closest?.('[data-workspace-toggle]');if(workspaceToggle){const current=workspaceToggle.dataset.workspaceSpace==='layout'?'layout':'creation';runCommand(ctx,'workspace.activate.v1',{space:current==='layout'?'creation':'layout'});return;}const view=event.target.dataset.view;if(view==='fit')runCommand(ctx,'view.fit.content.v1');else if(view==='reset')runCommand(ctx,'view.reset.v1');if(event.target.dataset.selection==='clear')runCommand(ctx,'selection.clear.v1');});
  let queueRender=()=>{};queueRender=stateRerender(ctx,render);const offNative=ctx.services.uiBTools?.subscribe?.(queueRender);if(offNative)ctx.cleanup(offNative);render();
}};}
