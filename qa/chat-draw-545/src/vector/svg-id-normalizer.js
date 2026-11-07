import { fnv1a32 } from '../core/stable-id.js';

const IMPORTABLE = new Set(['path','rect','circle','ellipse','polygon','polyline','line','text','use']);
const ID_RE = /\sid\s*=\s*(["'])([^"']+)\1/i;
const ROLE_RE = /\b(?:data-ink-role|data-semantic-role)\s*=\s*(["'])([^"']+)\1/i;
const CLASS_RE = /\bclass\s*=\s*(["'])([^"']+)\1/i;
const clean = value => String(value ?? 'none').trim().replace(/[^A-Za-z0-9_.-]+/g,'-').replace(/^-+|-+$/g,'') || 'none';
const hash = value => fnv1a32(String(value));

export function inspectSvgIds(svg) {
  const ids=[...String(svg).matchAll(/\sid\s*=\s*["']([^"']+)["']/gi)].map(match=>match[1]);
  const counts=new Map(); for(const id of ids)counts.set(id,(counts.get(id)||0)+1);
  const duplicateGroups=[...counts.entries()].filter(([,count])=>count>1).map(([id,count])=>({id,count}));
  return {idOccurrences:ids.length,uniqueIds:counts.size,duplicateGroupCount:duplicateGroups.length,duplicateGroups};
}

export function normalizeSvgIds(svg,{sourceDocumentIdentity='svg-document',importSessionSeed='0'}={}) {
  const source=String(svg),inspection=inspectSvgIds(source),counts=new Map(inspection.duplicateGroups.map(item=>[item.id,item.count])),seen=new Map(),stack=[],tagCounters=new Map(),generated=[];
  const sourceHash=hash(sourceDocumentIdentity),seedHash=hash(importSessionSeed),idMap=[];
  const output=source.replace(/<\/?([A-Za-z][\w:.-]*)(?:\s[^<>]*?)?\s*\/?>/g,(tag,rawName)=>{
    const closing=tag.startsWith('</'),selfClosing=/\/\s*>$/.test(tag),name=rawName.toLowerCase();
    if(closing){if(stack.length)stack.pop();return tag;}
    const parent=stack.join('/'),key=`${parent}/${name}`,index=tagCounters.get(key)||0;tagCounters.set(key,index+1);const hierarchyPath=`${parent}/${name}[${index}]`;
    let next=tag,match=tag.match(ID_RE),original=match?.[2]||null,occurrence=original?(seen.get(original)||0):0;
    if(original)seen.set(original,occurrence+1);
    const role=tag.match(ROLE_RE)?.[2]||tag.match(CLASS_RE)?.[2]||name;
    let normalized=original;
    if(original && (counts.get(original)||0)>1){
      normalized=`${clean(original)}:import:${sourceHash}:occ-${occurrence}:path-${hash(hierarchyPath)}:${clean(role)}:seed-${seedHash}`;
      next=tag.replace(ID_RE,` id="${normalized}"`);generated.push(normalized);idMap.push({originalId:original,normalizedId:normalized,occurrenceIndex:occurrence,hierarchyPath,semanticRole:role,reason:'DUPLICATE_ID'});
    } else if(!original && IMPORTABLE.has(name)) {
      normalized=`svg-object:import:${sourceHash}:path-${hash(hierarchyPath)}:${clean(role)}:seed-${seedHash}`;
      next=tag.replace(new RegExp(`^<${rawName}`,'i'),`<${rawName} id="${normalized}"`);generated.push(normalized);idMap.push({originalId:null,normalizedId:normalized,occurrenceIndex:0,hierarchyPath,semanticRole:role,reason:'MISSING_ID'});
    }
    if(!selfClosing && !['path','rect','circle','ellipse','polygon','polyline','line','text','use','stop','image','meta','link','input','br'].includes(name))stack.push(name);
    return next;
  });
  const after=inspectSvgIds(output);
  return {svg:output,report:{format:'INK-SVG-ID-NORMALIZATION',version:'1.0',sourceDocumentIdentity,importSessionSeed:String(importSessionSeed),sourceHash,original:inspection,normalized:after,normalizedOccurrenceCount:idMap.filter(item=>item.reason==='DUPLICATE_ID').length,generatedIdCount:idMap.filter(item=>item.reason==='MISSING_ID').length,idMap,randomUuidUsed:false,status:after.duplicateGroupCount===0?'PASS':'FAIL'}};
}
