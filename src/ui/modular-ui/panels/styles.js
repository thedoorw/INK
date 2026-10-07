const STYLE_ATTR='data-ink-ui-c-panel-styles';

export const UI_C_PANEL_STYLE_TEXT=`
.ink-ui-c-panel-group{position:relative;width:100%;height:100%;min-height:0;overflow:hidden;background:var(--ink-ui-surface-panel);border-bottom:1px solid var(--ink-ui-divider-major);display:grid;grid-template-rows:28px minmax(0,1fr)}
.ink-ui-c-panel-group[data-group="group-c"]{border-bottom:0}
.ink-ui-c-panel-tabs{display:flex;align-items:stretch;min-width:0;border-bottom:1px solid var(--ink-ui-divider);background:var(--ink-ui-surface-panel)}
.ink-ui-c-panel-tab,.ink-ui-c-panel-collapse,.ink-ui-c-panel-menu-trigger{min-width:0;height:28px;padding:0 8px;border:0;border-right:1px solid transparent;background:transparent;color:var(--ink-ui-text-secondary);font:inherit;font-weight:var(--ink-ui-font-weight);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ink-ui-c-panel-collapse,.ink-ui-c-panel-menu-trigger{width:24px;padding:0;display:grid;place-items:center;flex:0 0 auto}
.ink-ui-c-panel-collapse{width:22px}
.ink-ui-c-panel-tab[aria-selected="true"]{color:var(--ink-ui-text);background:var(--ink-ui-surface-control);border-right-color:var(--ink-ui-divider);font-weight:var(--ink-ui-font-weight)}
.ink-ui-c-panel-menu-trigger[aria-expanded="true"]{background:var(--ink-ui-surface-selected);color:var(--ink-ui-text)}
.ink-ui-c-panel-menu{position:absolute;z-index:20;top:27px;right:4px;min-width:132px;padding:3px 0;border:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-control);color:var(--ink-ui-text)}
.ink-ui-c-panel-menu[hidden]{display:none}
.ink-ui-c-panel-menu button{width:100%;height:24px;border:0;background:transparent;color:inherit;font:inherit;text-align:left;padding:0 20px 0 8px;position:relative}
.ink-ui-c-panel-menu button:hover,.ink-ui-c-panel-menu button:focus-visible{background:var(--ink-ui-surface-selected)}
.ink-ui-c-panel-menu button[role="menuitemradio"][aria-checked="true"]::after{content:"";position:absolute;right:8px;top:50%;width:5px;height:9px;border-right:1px solid currentColor;border-bottom:1px solid currentColor;transform:translateY(-65%) rotate(45deg)}
.ink-ui-c-panel-menu-separator{height:1px;margin:3px 2px;background:var(--ink-ui-divider)}
.ink-ui-c-panel-body{min-height:0;overflow:hidden;position:relative}
.ink-ui-c-panel-slot{height:100%;min-height:0;overflow:auto;background:var(--ink-ui-surface-panel)}
.ink-ui-c-panel-slot[hidden]{display:none}
.ink-ui-c-dock{display:none;min-height:0;align-content:start;justify-items:center;gap:1px;padding:2px 0;background:var(--ink-ui-surface-panel)}
.ink-ui-c-dock-button,.ink-ui-c-dock-expand{width:32px;height:30px;border:0;background:transparent;color:var(--ink-ui-text);font:inherit;display:grid;place-items:center;padding:0}
.ink-ui-c-dock-button[aria-pressed="true"]{background:var(--ink-ui-surface-selected)}
.ink-ui-c-panel-icon{width:18px;height:18px;display:block;fill:none;stroke:currentColor;stroke-width:1.35;stroke-linecap:round;stroke-linejoin:round}
.ink-ui-c-panel-menu-trigger{margin-left:auto}.ink-ui-c-panel-menu-trigger .ink-ui-c-panel-icon{width:16px;height:16px}
.ink-ui-c-splitter{position:absolute;left:0;right:0;bottom:-3px;height:6px;z-index:4;cursor:ns-resize;background:transparent}
.ink-ui-c-splitter::after{content:"";position:absolute;left:0;right:0;top:2px;height:1px;background:var(--ink-ui-splitter)}
.ink-ui-c-width-resizer{position:absolute;left:-3px;top:0;bottom:0;width:6px;z-index:5;cursor:ew-resize;background:transparent}
.ink-ui-c-panel-content{height:100%;min-height:0;display:flex;flex-direction:column;background:var(--ink-ui-surface-panel);color:var(--ink-ui-text)}
.ink-ui-c-panel-toolbar{min-height:27px;display:flex;align-items:center;gap:5px;padding:2px 6px;border-bottom:1px solid var(--ink-ui-divider);background:var(--ink-ui-surface-panel)}
.ink-ui-c-panel-toolbar label{display:flex;align-items:center;gap:4px;min-width:0}
.ink-ui-c-panel-toolbar input[type="range"]{min-width:54px;flex:1}
.ink-ui-c-panel-toolbar output{min-width:34px;text-align:right;color:var(--ink-ui-text-secondary)}
.ink-ui-c-panel-toolbar select{height:var(--ink-ui-control-h);min-width:0;border:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-control);color:var(--ink-ui-text);font:inherit}
.ink-ui-c-layer-search{min-width:0;flex:1;height:var(--ink-ui-control-h);border:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-control);color:var(--ink-ui-text);font:inherit;padding:0 5px}
.ink-ui-c-field-list{display:grid;gap:0;min-height:0;overflow:auto}
.ink-ui-c-field{min-height:var(--ink-ui-compact-row-h);display:grid;grid-template-columns:minmax(72px,.9fr) minmax(0,1.1fr);align-items:center;gap:6px;padding:2px 7px;border-bottom:1px solid var(--ink-ui-divider)}
.ink-ui-c-field>span:first-child{color:var(--ink-ui-text-secondary)}
.ink-ui-c-field input,.ink-ui-c-field select{min-width:0;height:var(--ink-ui-control-h);border:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-control);color:var(--ink-ui-text);font:inherit;padding:0 4px}
.ink-ui-c-number-unit,.ink-ui-c-color-control{display:flex;align-items:center;gap:4px;min-width:0}
.ink-ui-c-number-unit input,.ink-ui-c-color-control input{flex:1}
.ink-ui-c-number-unit small,.ink-ui-c-color-control output{color:var(--ink-ui-text-secondary);min-width:28px}
.ink-ui-c-button-group{display:flex;align-items:center;gap:3px}
.ink-ui-c-button-group button{height:var(--ink-ui-control-h);border:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-control);color:var(--ink-ui-text);font:inherit;padding:0 7px}
.ink-ui-c-swatches{display:grid;grid-template-columns:repeat(6,minmax(24px,1fr));gap:4px;padding:7px;overflow:auto}
.ink-ui-c-swatch{aspect-ratio:1;border:1px solid var(--ink-ui-divider-major);padding:2px;background:var(--ink-ui-surface-control)}
.ink-ui-c-swatch>span{display:block;width:100%;height:100%;background:var(--ink-ui-c-swatch-color)}
.ink-ui-c-swatch-toolbar{justify-content:space-between}
.ink-ui-c-color-pair{position:relative;width:34px;height:22px;flex:0 0 34px}
.ink-ui-c-color-pair i{position:absolute;width:18px;height:18px;border:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-c-chip-color)}
.ink-ui-c-color-pair i:first-child{left:0;top:0;z-index:2}.ink-ui-c-color-pair i:last-child{right:0;bottom:0}
.ink-ui-c-color-preview{width:24px;height:20px;border:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-c-selected-color,var(--ink-ui-surface-control))}
.ink-ui-c-layer-filter-row label{width:100%}.ink-ui-c-layer-filter-row label>span{flex:0 0 auto;color:var(--ink-ui-text-secondary)}
.ink-ui-c-layer-appearance-row{display:grid;grid-template-columns:80px minmax(0,1fr);align-items:center}
.ink-ui-c-layer-blend,.ink-ui-c-layer-opacity{min-width:0}.ink-ui-c-layer-blend>span,.ink-ui-c-layer-opacity>span{flex:0 0 auto;white-space:nowrap}.ink-ui-c-layer-blend select{flex:1}.ink-ui-c-layer-opacity input{min-width:36px}
.ink-ui-c-layer-lock-row{gap:4px}.ink-ui-c-layer-lock-row>span:first-child{color:var(--ink-ui-text-secondary)}
.ink-ui-c-layer-lock-row button{width:24px;height:var(--ink-ui-control-h);display:grid;place-items:center;padding:0;border:1px solid transparent;background:transparent;color:var(--ink-ui-text)}
.ink-ui-c-layer-lock-row .ink-ui-c-panel-icon{width:14px;height:14px}
.ink-ui-c-layer-list,.ink-ui-c-history-list{min-height:0;overflow:auto;flex:1}
.ink-ui-c-layer-row{height:var(--ink-ui-panel-row-h);display:grid;grid-template-columns:26px 34px minmax(0,1fr) 26px;align-items:center;border-bottom:1px solid var(--ink-ui-divider);background:var(--ink-ui-surface-panel)}
.ink-ui-c-layer-row[data-active="true"]{background:var(--ink-ui-surface-selected)}
.ink-ui-c-layer-row[data-visible="false"] .ink-ui-c-layer-name{color:var(--ink-ui-text-secondary)}
.ink-ui-c-layer-row[data-locked="true"] .ink-ui-c-layer-name{padding-right:2px}
.ink-ui-c-layer-row[data-dragging="true"]{opacity:.55}
.ink-ui-c-layer-row[data-drop-position="before"]{box-shadow:inset 0 1px 0 var(--ink-ui-focus-accent)}
.ink-ui-c-layer-row[data-drop-position="after"]{box-shadow:inset 0 -1px 0 var(--ink-ui-focus-accent)}
.ink-ui-c-layer-row button{height:100%;border:0;background:transparent;color:var(--ink-ui-text);font:inherit;padding:0}
.ink-ui-c-layer-state{display:grid;place-items:center}
.ink-ui-c-layer-state .ink-ui-c-panel-icon{width:15px;height:15px}
.ink-ui-c-layer-name{min-width:0;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 4px}
.ink-ui-c-layer-thumb{width:28px;height:24px;border:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-control);display:grid;place-items:center;color:var(--ink-ui-text-secondary);font-size:var(--ink-ui-font-size-micro);overflow:hidden;cursor:pointer}
.ink-ui-c-layer-thumb canvas{width:28px;height:24px;display:block;grid-area:1/1}.ink-ui-c-layer-thumb [data-layer-preview-fallback]{grid-area:1/1}
.ink-ui-c-panel-footer{height:25px;min-height:25px;display:flex;align-items:center;gap:2px;padding:0 5px;border-top:1px solid var(--ink-ui-divider-major);background:var(--ink-ui-surface-panel)}
.ink-ui-c-panel-footer button,.ink-ui-c-history-actions button{height:var(--ink-ui-control-h);min-width:24px;border:1px solid transparent;background:transparent;color:var(--ink-ui-text);font:inherit;padding:0 4px;display:grid;place-items:center}
.ink-ui-c-panel-footer button:hover,.ink-ui-c-history-actions button:hover{background:var(--ink-ui-surface-disabled);border-color:var(--ink-ui-divider)}
.ink-ui-c-panel-footer .ink-ui-c-panel-icon{width:15px;height:15px}
.ink-ui-c-fx-button{font-style:italic;font-weight:var(--ink-ui-font-weight)}
.ink-ui-c-footer-spacer{flex:1}
.ink-ui-c-history-actions{display:flex;gap:3px;padding:2px 6px;border-bottom:1px solid var(--ink-ui-divider)}
.ink-ui-c-history-row{width:100%;height:23px;min-height:23px;border:0;border-bottom:1px solid var(--ink-ui-divider);background:var(--ink-ui-surface-panel);color:var(--ink-ui-text);font:inherit;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 7px;text-align:left}
.ink-ui-c-history-row[data-active="true"]{background:var(--ink-ui-surface-selected)}
.ink-ui-c-history-row small{color:var(--ink-ui-text-secondary)}
.ink-ui-c-empty{padding:8px;color:var(--ink-ui-text-secondary)}
.ink-modular-shell[data-panels-expanded="false"] .ink-ui-c-panel-group{display:block;height:auto;border-bottom:0;overflow:visible}
.ink-modular-shell[data-panels-expanded="false"] .ink-ui-c-panel-tabs,.ink-modular-shell[data-panels-expanded="false"] .ink-ui-c-panel-body,.ink-modular-shell[data-panels-expanded="false"] .ink-ui-c-panel-menu,.ink-modular-shell[data-panels-expanded="false"] .ink-ui-c-splitter,.ink-modular-shell[data-panels-expanded="false"] .ink-ui-c-width-resizer{display:none}
.ink-modular-shell[data-panels-expanded="false"] .ink-ui-c-dock{display:grid}
`;

export function installUiCPanelStyles(doc=globalThis.document){
  if(!doc?.head?.append||!doc?.createElement)return false;
  if(doc.head.querySelector?.(`[${STYLE_ATTR}]`))return true;
  const style=doc.createElement('style');
  style.setAttribute(STYLE_ATTR,'');
  style.textContent=UI_C_PANEL_STYLE_TEXT;
  doc.head.append(style);
  return true;
}
