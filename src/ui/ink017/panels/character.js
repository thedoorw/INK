import {lifecycle,selected,field,esc,nativeToolEmptyState,wireNativeToolEmptyState} from '../shared-controls.js';
import {baselineAvailable,baselinePatch,eligibleKerningPairs,kerningPairPatch} from './character-typography.js';

let pairSelection={id:null,start:null},lastError='';
const fonts=['Arial','Helvetica','Microsoft JhengHei','Noto Sans TC','Times New Roman','Georgia','Courier New','Verdana','Tahoma'];
const weights=[['Regular',400],['Bold',700],['Italic','italic'],['Bold Italic','bold-italic'],['Light',300],['Semibold',600]];
const sizes=[6,8,9,10,11,12,14,16,18,20,21,24,26,30,36,48,60,72];
const leadings=['auto',10,12,14,16,18,20,21,24,28,30,36,48,60,72];
const tracking=[-100,-75,-50,-25,0,25,50,75,100,150,200];
const kerningValues=[['度量標準','metrics'],['視覺','optical'],...[-50,-25,0,25,50,100].map(n=>[String(n),n])];
const languages=['英文：美國','英文：英國','繁體中文','簡體中文','日文','韓文','法文','德文'];
const antialias=['銳利','無','清晰','強烈','平滑'];
const styleGlyphs=[['仿粗體','B'],['仿斜體','I'],['全部大寫','TT'],['小型大寫','Tᴛ'],['上標','T¹'],['下標','T₁'],['底線','T̲'],['刪除線','T̶'],['標準合字','fi'],['可選合字','ﬆ'],['上下文替代字','a'],['替代大寫字','a̅'],['裝飾字形','𝒯'],['序數','1ˢᵗ'],['分數','½'],['字體替代字形','aᵃ']];
function combo(label,key,items,value,glyph='',supported=true,extra=''){
 const choices=items.map(item=>Array.isArray(item)?item:[String(item),item]);
 if(value!==null&&value!==undefined&&!choices.some(item=>String(item[1])===String(value)))choices.unshift([String(value),value]);
 const opts=choices.map(([caption,val])=>'<option value="'+esc(val)+'"'+(String(val)===String(value)?' selected':'')+(!supported||val==='italic'||val==='bold-italic'||val==='metrics'||val==='optical'||val==='auto'?' disabled':'')+'>'+esc(caption)+'</option>').join('');
 return '<label class="ps-native-char-combo '+extra+'" title="'+esc(label)+'"><span class="ps-native-char-glyph" aria-hidden="true">'+esc(glyph)+'</span><span class="ps-native-char-select"><select data-key="'+esc(key)+'" aria-label="'+esc(label)+'"'+(supported?'':' disabled title="INK Native 尚未支援"')+'>'+opts+'</select></span></label>';
}
function edit(label,key,value,glyph,supported){
 return '<label class="ps-native-char-edit" title="'+esc(label)+'"><span class="ps-native-char-glyph" aria-hidden="true">'+esc(glyph)+'</span><input aria-label="'+esc(label)+'" data-key="'+esc(key)+'" value="'+esc(value)+'" type="text"'+(supported?'':' disabled title="INK Native 尚未支援"')+'></label>';
}
export default lifecycle('character',s=>{
 const found=selected(s),hasText=found?.type==='text',o=hasText?found:{font:'Arial',weight:400,size:14,leading:0,tracking:0,textColor:'#272727',text:'',w:0,h:0};
 const disabled=!hasText||o.locked,base=hasText&&baselineAvailable(o),pairs=hasText?eligibleKerningPairs(o):[];
 if(pairSelection.id!==o.id){pairSelection={id:o.id,start:null};lastError='';}
 const savedPair=o.kerningPairs?.find(p=>pairs.some(x=>x.start===p.start));
 const pairStart=pairs.some(p=>p.start===pairSelection.start)?pairSelection.start:(savedPair?.start??pairs[0]?.start??0);
 const kerning=o.kerningPairs?.find(p=>p.start===pairStart)?.adjustment??0,baseline=o.textRuns?.[0]?.baselineShift??0;
 const pairControl=pairs.length?'<label class="field-row"><span>字偶</span><select data-kerning-pair aria-label="Manual kerning pair">'+pairs.map(p=>'<option value="'+p.start+'"'+(p.start===pairStart?' selected':'')+'>'+esc(p.text)+' · '+p.start+'</option>').join('')+'</select></label>':'<span class="capability-empty">字偶調整僅支援單行 ASCII 文字框</span>';
 const style=weights.find(([,weight])=>weight===Number(o.weight))?.[1]??(Number(o.weight)||400);
 const activeStyle=o.textPresentation?.case==='upper';
 const leading=hasText&&Number(o.leading)>0?Math.round(Number(o.leading)*100)/100:'auto';
 const color=hasText?o.textColor:'#272727';
 const pick=(label,key,options,value,glyph='',supported=true,extra='')=>combo(label,key,options,value,glyph,!disabled&&supported,extra);
 return '<div class="ps-native-character">' +
  '<fieldset class="ps-native-character-face"'+(disabled?' disabled':'')+'>' +
  '<div class="ps-native-char-main">' +
  '<div class="ps-native-char-pair ps-native-char-family">'+pick('字型','font',fonts,o.font,'',true,'font')+pick('字體樣式','weight',weights,style,'',true,'style')+'</div>' +
  '<div class="ps-native-char-pair">'+pick('字級（px）','size',sizes.map(n=>[n+' px',n]),o.size,'Tᵀ')+pick('行距（px）','leading',leadings.map(n=>[n==='auto'?'(自動)':n+' px',n]),leading,'A↕',true)+'</div>' +
  '<div class="ps-native-char-pair">'+pick('字偶間距','kerningAdjust',kerningValues,kerning,'V/A',pairs.length>0)+pick('字距','tracking',tracking,o.tracking,'VA↔')+'</div>' +
  '<div class="ps-native-char-pair">'+pick('亞洲文字間距','tsume',['0%','5%','10%','15%','25%','50%'],'0%','あ',false)+'<span></span></div>' +
  '<div class="ps-native-char-pair">'+edit('垂直縮放','verticalScale','100%','↕T',false)+edit('水平縮放','horizontalScale','100%','T↔',false)+'</div>' +
  '<div class="ps-native-char-pair">'+edit('基線位移','baseline',baseline+' px','A↟',base)+'<label class="ps-native-char-color"><span>顏色：</span><input type="color" data-key="textColor" aria-label="文字顏色" value="'+esc(color)+'"></label></div>' +
  '</div><div class="ps-native-char-styles" role="toolbar" aria-label="文字呈現方式">' +
  styleGlyphs.map(([label,glyph])=>'<button type="button" class="ps-native-char-style" aria-label="'+esc(label)+'" title="'+esc(label)+(label==='全部大寫'?'':'（Native 尚未支援）')+'" aria-pressed="'+(label==='全部大寫'&&activeStyle)+'"'+(label==='全部大寫'&&o.textBox?' data-presentation="case"':' disabled')+'>'+esc(glyph)+'</button>').join('') +
  '</div><div class="ps-native-char-bottom">'+pick('語言','language',languages,languages[0],'',false)+pick('消除鋸齒','antialias',antialias,antialias[0],'aa',false)+'</div>' +
  '</fieldset>' +
  '<details class="ps-native-char-advanced" data-disclosure="native-text"><summary>INK 原生文字編輯</summary>' +
  (hasText||!s.docs.length?'':nativeToolEmptyState('請先選取文字物件','text','使用文字工具',s)) +
  '<fieldset'+(disabled?' disabled':'')+'><div class="character-native-typography">'+pairControl+
  field('boxWidth','框寬',hasText?(o.textBox?.width||Math.max(10,o.w)):'','number',undefined,'Box W')+
  field('boxHeight','框高',hasText?(o.textBox?.height||Math.max(10,o.h)):'','number',undefined,'Box H')+
  '<div class="character-text-edit">'+field('text','文字',o.text,'text',undefined,'Text')+'</div></div></fieldset>' +
  '<p class="unit-hint">INK 原生尺寸為 px。文字修改可由原有 History 復原。</p></details>' +
  (lastError?'<p class="capability-empty" role="status">'+esc(lastError)+'</p>':'') +
  '</div>';
},(r,h,signal,paint)=>{
 wireNativeToolEmptyState(r,h,signal);
 const send=patch=>{
  const result=h.dispatch({type:'text.patch',patch,target:JSON.parse(r.dataset.nativeTarget),source:'character'});
  lastError=result.ok?'':String(result.error?.message||result.error||'文字操作無法使用');
  if(!result.ok)paint();
  return result;
 };
 const unsupported=message=>{lastError=message;paint();};
 r.addEventListener('change',e=>{
  if(e.target.matches('[data-kerning-pair]')){
   const o=selected(h.getSnapshot()),start=Number(e.target.value);
   pairSelection={id:o?.id,start};
   const input=r.querySelector('[data-key="kerningAdjust"]');
   if(input)input.value=String(o?.kerningPairs?.find(p=>p.start===start)?.adjustment??0);
   return;
  }
  const k=e.target.dataset.key;if(!k||e.target.disabled)return;
  const o=selected(h.getSnapshot());if(o?.type!=='text'||o.locked)return;
  const raw=e.target.value;
  const value=['size','leading','tracking','weight','kerningAdjust','baseline','boxWidth','boxHeight'].includes(k)?Number.parseFloat(raw):raw;
  if(k==='baseline'){const patch=baselinePatch(o,value);if(patch)send(patch);else unsupported('此文字或數值不支援基線位移');return;}
  if(k==='kerningAdjust'){
   const start=Number(r.querySelector('[data-kerning-pair]')?.value);
   const patch=kerningPairPatch(o,start,value);if(patch)send(patch);else unsupported('字偶間距需要有效的相鄰字偶與數值');
   return;
  }
  if(k==='boxWidth'||k==='boxHeight')send({textBox:{width:o.textBox?.width||Math.max(10,o.w),height:o.textBox?.height||Math.max(10,o.h),[k==='boxWidth'?'width':'height']:value}});
  else if(k==='text'){
   const changed=value!==o.text;send(changed&&(o.textRuns?.length||o.kerningPairs?.length)?{text:value,textRuns:null,kerningPairs:null}:{text:value});
  }else{
   const keys={font:'fontFamily',weight:'fontWeight',size:'fontSize',leading:'lineHeight',tracking:'tracking',textColor:'color'};
   if(!keys[k]||!Number.isFinite(value)&&['weight','size','leading','tracking'].includes(k))return;
   send({[keys[k]]:k==='leading'?value/o.size:value});
  }
 },{signal});
 r.addEventListener('click',e=>{
  const b=e.target.closest('[data-presentation]');if(!b||b.disabled)return;
  const o=selected(h.getSnapshot());if(!o||o.locked)return;
  send({textPresentation:{...o.textPresentation,case:o.textPresentation?.case==='upper'?'none':'upper'}});
 },{signal});
});
