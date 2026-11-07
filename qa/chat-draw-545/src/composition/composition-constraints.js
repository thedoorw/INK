import { pathBounds } from '../vector/vector-core.js';
import { stableHash } from '../core/stable-id.js';
const clone = value => JSON.parse(JSON.stringify(value));

function mergeBounds(bounds) { if (!bounds.length) return { x:0,y:0,w:0,h:0 }; const x=Math.min(...bounds.map(b=>b.x)),y=Math.min(...bounds.map(b=>b.y)),r=Math.max(...bounds.map(b=>b.x+b.w)),bottom=Math.max(...bounds.map(b=>b.y+b.h)); return { x,y,w:r-x,h:bottom-y }; }
export function objectBounds(object) {
  if (!object) return { x:0,y:0,w:0,h:0 };
  if (object.type === 'path') return pathBounds(object);
  if (object.type === 'repeat') return mergeBounds((object.instances || []).length ? [pathBounds(object.source)] : [pathBounds(object.source)]);
  if (object.type === 'group') return mergeBounds((object.children || []).map(objectBounds));
  if (object.type === 'text') return { x:Number(object.x)||0,y:(Number(object.y)||0)-(Number(object.fontSize)||16),w:String(object.text||'').length*(Number(object.fontSize)||16)*.58,h:Number(object.fontSize)||16 };
  return object.bounds || { x:0,y:0,w:0,h:0 };
}

export function evaluateComposition(document, constraints = {}) {
  const page = document.pages.find(item => item.id === document.activePageId) || document.pages[0];
  const artboard = constraints.artboard || { x:0,y:0,w:794,h:1123 }, margin = Number(constraints.safeMargin ?? 32);
  const safe = { x:artboard.x+margin,y:artboard.y+margin,w:artboard.w-margin*2,h:artboard.h-margin*2 };
  const entries = page.layers.flatMap(layer => (layer.objects || []).map(object => ({ layer, object, bounds:objectBounds(object), role:object.semantic?.role || object.metadata?.semanticRole || object.metadata?.role || null })));
  const violations = [];
  for (const entry of entries) {
    if (entry.bounds.x < safe.x || entry.bounds.y < safe.y || entry.bounds.x + entry.bounds.w > safe.x + safe.w || entry.bounds.y + entry.bounds.h > safe.y + safe.h) violations.push({ code:'UNINTENDED_CLIPPING_OR_MARGIN', objectId:entry.object.id, role:entry.role, bounds:entry.bounds });
  }
  const main = entries.filter(entry => entry.role === 'main-subject'), secondary = entries.filter(entry => entry.role === 'secondary-subject');
  const area = bounds => bounds.w * bounds.h, mainArea = main.reduce((sum,entry)=>sum+area(entry.bounds),0), secondaryArea=secondary.reduce((sum,entry)=>sum+area(entry.bounds),0);
  const dominance = secondaryArea ? mainArea / secondaryArea : mainArea ? Infinity : 0;
  if (main.length && secondary.length && dominance < Number(constraints.minDominance ?? 1.1)) violations.push({ code:'VISUAL_DOMINANCE_TOO_LOW', value:dominance });
  return { format:'INK-COMPOSITION-CONSTRAINT-REPORT',version:'1.0',status:violations.length?'VIOLATION':'PASS',artboard,safeMargin:margin,safeRegion:safe,objectCount:entries.length,roles:Object.fromEntries([...new Set(entries.map(e=>e.role).filter(Boolean))].map(role=>[role,entries.filter(e=>e.role===role).length])),visualDominanceProxy:dominance,violations,hash:stableHash({artboard,safe,entries:entries.map(e=>({id:e.object.id,bounds:e.bounds,role:e.role})),violations}) };
}

export function compareCompositionPreservation(before, after, changedIds = []) {
  const map = document => { const result=new Map(); const walk=object=>{if(object?.id)result.set(object.id,object);for(const child of object?.children||[])walk(child);if(object?.source)walk(object.source);};for(const page of document.pages)for(const layer of page.layers)for(const object of layer.objects||[])walk(object);return result; };
  const ownHash=object=>{const value=clone(object);delete value.children;delete value.source;return stableHash(value);};
  const a=map(before),b=map(after),changed=new Set(changedIds),preserved=[],violations=[],missing=[];
  for (const [id,object] of a) { if (changed.has(id)) continue; if(!b.has(id)){missing.push(id);continue;} if (ownHash(object) === ownHash(b.get(id))) preserved.push(id); else violations.push(id); }
  return { status:violations.length||missing.length?'FAIL':'PASS',preservedObjectIds:preserved,unexpectedChangedObjectIds:violations,missingObjectIds:missing,unchangedHashesPreserved:!violations.length&&!missing.length };
}
