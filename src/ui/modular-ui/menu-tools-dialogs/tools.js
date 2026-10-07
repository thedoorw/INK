import { UI_B_002_FIXED_TOOLS, UI_B_002_TOOL_GROUPS, UI_B_002_TOOL_LAYOUT } from './control-matrix.js';
import { createBodyPopover, escapeText, runCommand, stateRerender } from './module-utils.js';
import { createImportImageDialogModule } from './dialogs.js';
import { toolPresentation } from './presentation.js';

const iconMarkup=(icon)=>`<span class="mui-b-tool-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><use href="#${escapeText(icon||'i-select')}"></use></svg></span>`;
const flyoutMarker='<svg class="mui-b-flyout-marker" viewBox="0 0 3 3" aria-hidden="true"><path d="M0 3h3V0Z"/></svg>';
const collapseGlyph='<svg class="mui-b-collapse-glyph" viewBox="0 0 7 5" aria-hidden="true"><path d="M6 0 3.5 2.5 6 5M3.5 0 1 2.5 3.5 5"/></svg>';

export function createUiB002ToolsModule(){
  return {id:'ui-b-002.tools.v3',slot:'tools',mount(ctx){
    const groups=new Map(UI_B_002_TOOL_GROUPS.map(group=>[group.id,group]));
    const remembered=new Map(UI_B_002_TOOL_GROUPS.map(group=>[group.id,group.primary]));
    const popover=createBodyPopover(ctx,{className:'mui-b-tool-popover'});
    const toolMeta=id=>{for(const group of UI_B_002_TOOL_GROUPS){const item=group.tools.find(([tool])=>tool===id);if(item)return{group,item};}return null;};
    const availableTool=([id, ,meta])=>!meta?.panel||Boolean(ctx.services.canOpenPanel?.(meta.panel,{intent:meta.intent||null,id:`tool.${id}`}));
    const activateTool=id=>{
      const meta=toolMeta(id);
      if(meta){const route=meta.item[2];if(route?.panel){ctx.services.panelOpen?.(route.panel,{intent:route.intent||null,id:`tool.${id}`});return;}remembered.set(meta.group.id,id);}
      ctx.services.uiBTools?.activate?.(id);
    };
    const flyoutItem=([id,label],fallbackIcon)=>{const p=toolPresentation(id,{label,icon:fallbackIcon});return `<button type="button" role="menuitem" data-popover-tool="${escapeText(id)}" aria-label="${escapeText(p.label)}">${iconMarkup(p.icon)}<span class="mui-b-tool-flyout-label">${escapeText(p.label)}</span></button>`;};
    const openGroup=(group,anchor)=>{
      const items=group.tools.filter(availableTool);
      popover.open(anchor,`<div class="mui-b-tool-flyout" aria-label="${escapeText(group.label)}">${items.map(item=>flyoutItem(item,group.icon)).join('')}</div>`);
    };
    ctx.listen(popover.node,'click',event=>{const id=event.target.closest?.('[data-popover-tool]')?.dataset.popoverTool;if(!id)return;activateTool(id);popover.close({returnFocus:true});});
    const render=()=>{
      const native=ctx.services.uiBTools;
      const current=native?.activeTool?.()||ctx.selectors.get('tool.current');
      const colors=native?.colors?.()||{foreground:'#202020',background:'#ffffff'};
      const itemHtml=UI_B_002_TOOL_LAYOUT.map(([kind,id])=>{
        if(kind==='fixed'){
          const tool=UI_B_002_FIXED_TOOLS[id];if(!tool)return'';
          const p=toolPresentation(tool.id,{label:tool.label,icon:tool.icon});const active=current===tool.id;
          if(tool.route==='dialog')return `<button type="button" class="mui-b-tool-cell" data-fixed-dialog="${escapeText(tool.dialog)}" aria-label="${escapeText(p.label)}">${iconMarkup(p.icon)}</button>`;
          return `<button type="button" class="mui-b-tool-cell ${active?'active':''}" data-tool="${escapeText(tool.id)}" aria-label="${escapeText(p.label)}${tool.shortcut?` (${escapeText(tool.shortcut)})`:''}" aria-pressed="${active}">${iconMarkup(p.icon)}</button>`;
        }
        const group=groups.get(id);if(!group)return'';
        const visible=group.tools.filter(availableTool);if(!visible.length)return'';
        const rememberedId=visible.some(([tool])=>tool===remembered.get(id))?remembered.get(id):group.primary;
        if(group.tools.some(([tool])=>tool===current))remembered.set(id,current);
        const active=group.tools.some(([tool])=>tool===current),rememberedMeta=visible.find(([tool])=>tool===rememberedId)||visible[0];
        const p=toolPresentation(rememberedId,{label:rememberedMeta?.[1]||group.label,icon:group.icon});
        return `<div class="mui-b-tool-stack ${active?'active':''}" data-tool-group="${escapeText(group.id)}"><button type="button" class="mui-b-tool-cell mui-b-tool-primary" data-group-primary="${escapeText(group.id)}" aria-label="${escapeText(p.label)}；展開可選其他${escapeText(group.label)}工具" aria-pressed="${active}">${iconMarkup(p.icon)}</button><button type="button" class="mui-b-tool-flyout-trigger" data-group-flyout="${escapeText(group.id)}" aria-label="展開${escapeText(group.label)}工具" aria-haspopup="menu" aria-expanded="false">${flyoutMarker}</button><span hidden data-remembered-tool="${escapeText(rememberedId)}"></span></div>`;
      }).join('');
      ctx.root.innerHTML=`<div class="mui-b-tools" role="toolbar" aria-label="工具"><button type="button" class="mui-b-tools-expand" data-tools-expand aria-label="切換單欄／雙欄工具列">${collapseGlyph}</button>${itemHtml}<div class="mui-b-tool-colors" aria-label="前景與背景色"><button type="button" class="mui-b-color-reset" data-color-action="reset" aria-label="重設前景與背景色">${iconMarkup('i-color-reset')}</button><button type="button" class="mui-b-color-swap" data-color-action="swap" aria-label="交換前景與背景色">${iconMarkup('i-color-swap')}</button><label class="mui-b-color-swatch mui-b-color-background" aria-label="背景色"><span style="--mui-b-swatch:${escapeText(colors.background||'#ffffff')}" aria-hidden="true"></span><input data-tool-color="background" type="color" value="${escapeText(colors.background||'#ffffff')}" aria-label="背景色"></label><label class="mui-b-color-swatch mui-b-color-foreground" aria-label="前景色"><span style="--mui-b-swatch:${escapeText(colors.foreground||'#202020')}" aria-hidden="true"></span><input data-tool-color="foreground" type="color" value="${escapeText(colors.foreground||'#202020')}" aria-label="前景色"></label></div></div>`;
    };
    ctx.listen(ctx.root,'click',event=>{
      const tool=event.target.closest?.('[data-tool]')?.dataset.tool;if(tool){ctx.services.uiBTools?.activate?.(tool);return;}
      const primary=event.target.closest?.('[data-group-primary]')?.dataset.groupPrimary;if(primary){const group=groups.get(primary);activateTool(remembered.get(primary)||group?.primary);return;}
      const flyout=event.target.closest?.('[data-group-flyout]');if(flyout){const group=groups.get(flyout.dataset.groupFlyout);if(group)openGroup(group,flyout);return;}
      const dialog=event.target.closest?.('[data-fixed-dialog]')?.dataset.fixedDialog;if(dialog==='import-image'){ctx.services.dialogs?.present(createImportImageDialogModule());return;}
      const action=event.target.closest?.('[data-color-action]')?.dataset.colorAction;if(action==='swap')ctx.services.uiBTools?.swapColors?.();else if(action==='reset')ctx.services.uiBTools?.resetColors?.();
      if(event.target.closest?.('[data-tools-expand]'))ctx.services.layout?.toggleTools?.();
    });
    ctx.listen(ctx.root,'keydown',event=>{
      const flyout=event.target.closest?.('[data-group-flyout]');if(flyout&&['Enter',' ','ArrowRight'].includes(event.key)){event.preventDefault();const group=groups.get(flyout.dataset.groupFlyout);if(group)openGroup(group,flyout);}
      if(event.key==='Escape')popover.close({returnFocus:true});
    });
    ctx.listen(ctx.root,'input',event=>{const role=event.target.dataset.toolColor;if(role==='foreground')runCommand(ctx,'tool.color.set.v1',{color:event.target.value});else if(role==='background')ctx.services.uiBTools?.setBackgroundColor?.(event.target.value);});
    let queueRender=()=>{};queueRender=stateRerender(ctx,render);const offNative=ctx.services.uiBTools?.subscribe?.(queueRender);if(offNative)ctx.cleanup(offNative);render();
  }};
}
