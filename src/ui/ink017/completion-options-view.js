// Public-facing completion tool parameter fields. The Native completion
// session owns all masks, commands, target checks and state transitions.
import {field,esc} from './shared-controls.js';

const PIXEL=new Set(['rectangleMarquee','ellipseMarquee','magicWand','polygonalLasso','magneticLasso']);
export function renderCompletionOptions(s,opts){
 const o=s.options;
 const f=(key,label,value,type='number',choices)=>field('complete:'+key,label,value,type,choices);
 const b=(key,label,disabled=false)=>'<button type="button" data-completion-action="'+key+'"'+(disabled?' disabled':'')+'>'+esc(label)+'</button>';
 if(s.id==='vector-pen')return f('closed','閉合',o.closed?'On':'Off','text',['On','Off'])+f('stroke','線色',o.stroke,'color')+f('strokeWidth','線寬',o.strokeWidth)+f('fill','填色',o.fill,'text')+'<span class="field-row" role="status">節點 '+s.count+'</span>'+b('finish','完成',s.count<(o.closed?3:2))+b('cancel','取消',!s.count);
 if(s.id==='lasso')return '<span class="context-readout">拖曳圈選物件；Shift 加入選取。</span>';
 if(!PIXEL.has(s.id))return '';
 const count=s.pixels;
 return f('selectionMode','選區',opts.selectionMode,'text',['new','add','subtract','intersect'])+
  (s.id==='magicWand'?f('tolerance','容差',opts.tolerance)+f('contiguous','相鄰',opts.contiguous?'On':'Off','text',['On','Off']):'')+
  (['polygonalLasso','magneticLasso'].includes(s.id)?(s.id==='magneticLasso'?f('searchRadius','吸附半徑 px',opts.searchRadius)+f('edgeThreshold','邊緣靈敏度',opts.edgeThreshold):'')+'<span class="context-readout">節點 '+s.count+'</span>'+b('finish-pixel','完成選區',s.count<3)+b('remove-pixel','移除末點',!s.count):'')+
  '<span class="field-row" role="status">'+count+' px</span>'+b('mask','套用遮色片',!count)+b('clear','取消選取',!s.selection);
}
