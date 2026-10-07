import { createWorkflowIR } from '../workflow-ir.js';
import {
  SOURCE_ADAPTER_CONTRACT,
  SOURCE_ADAPTER_CONTRACT_VERSION,
  createAdapterDetection,
  extensionOf
} from '../source-adapters.js';
import { DeterministicRandom, evaluateDeterministicExpression } from '../expression-ir.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const SOURCE_SOFTWARE = 'Adobe Illustrator';
const SUBSET_MARKER = /@ink-illustrator-subset\s+1\b/i;
const FLEURIFY_SIGNATURE = /function\s+knotHandles\b/i;
const FLEURIFY_SNAPSHOT_FNV1A = '3c5ab671';
const stableSourceHash = source => {
  let hash=2166136261;
  for(const char of String(source).replace(/\r\n/g,'\n')){hash^=char.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return(hash>>>0).toString(16).padStart(8,'0');
};

export const ILLUSTRATOR_JSX_CANDIDATE_MATRIX = Object.freeze([
  { id:'JSX-MOD-001', candidate:'Path creation', sourceSyntax:'pathItems.add + setEntirePath', canonical:'path.create', disposition:'DIRECT', boundary:'bounded sequential container + static point array' },
  { id:'JSX-MOD-002', candidate:'Petal creation', sourceSyntax:'@ink-watercolor-petal translation hint', canonical:'brush.watercolor-petal', disposition:'APPROXIMATED', dependency:'Vector Brush Material; target must be reserved external role target' },
  { id:'JSX-MOD-003', candidate:'Repeat', sourceSyntax:'bounded for duplicate/rotate loop', canonical:'repeat.radial', disposition:'PARTIAL', runtimeDisposition:'REJECTED', dependency:'existing repeat compiler/runtime parameter + original-inclusion semantics are not equivalent enough to execute' },
  { id:'JSX-MOD-004', candidate:'Ellipse', sourceSyntax:'pathItems.ellipse(top,left,width,height)', canonical:'path.ellipse', disposition:'DIRECT', unit:'pt', boundary:'bounded active container only' },
  { id:'JSX-MOD-005', candidate:'Rectangle', sourceSyntax:'pathItems.rectangle(top,left,width,height)', canonical:'path.rectangle', disposition:'DIRECT', unit:'pt', boundary:'bounded active container only' },
  { id:'JSX-MOD-006', candidate:'Deterministic math', sourceSyntax:'ordered whitelisted expression declaration', canonical:'expression.evaluate', disposition:'DIRECT' },
  { id:'JSX-MOD-007', candidate:'Deterministic random', sourceSyntax:'ordered Math.random with @ink-seed', canonical:'expression.evaluate', disposition:'EQUIVALENT', dependency:'explicit seed; one sequential deterministic RNG per source' },
  { id:'JSX-MOD-008', candidate:'Brush application', sourceSyntax:'@ink-watercolor-stroke translation hint', canonical:'brush.watercolor-stroke', disposition:'APPROXIMATED', dependency:'Vector Brush Material; target must be reserved external role target' },
  { id:'JSX-MOD-009', candidate:'Transparency', sourceSyntax:'target.opacity = percent', canonical:'blend.opacity', disposition:'EQUIVALENT', unit:'percent→0..1', boundary:'reserved external role target only; created-variable mutation rejected' },
  { id:'JSX-MOD-010', candidate:'Blend', sourceSyntax:'target.blendingMode = BlendModes.<whitelist>', canonical:'blend.mode', disposition:'EQUIVALENT', boundary:'reserved external role target only; inspected blend whitelist only' },
  { id:'JSX-MOD-011', candidate:'Layer / Group', sourceSyntax:'layers.add / sequential layer.groupItems.add', canonical:'layer.create / group.create', disposition:'EQUIVALENT', boundary:'group owner must be current just-created layer' },
  { id:'JSX-MOD-012', candidate:'Export', sourceSyntax:'exportFile(new File(<exact static string>), inspected ExportType, omitted|{})', canonical:'export.file', disposition:'PARTIAL', dependency:'actual exporter outside translation runtime; complete argument list validated; intent only' }
]);

const lineAt = (text, offset) => text.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
const pseudoMatch = (text, start, end) => ({ index:start, 0:text.slice(start,end) });
const evidenceAt = (text, match, label='Illustrator JSX') => [{ label, line: lineAt(text, match?.index || 0), excerpt: String(match?.[0] || '').trim().slice(0, 220) }];
const operation = ({ text, match, operation, category, parameters={}, target={}, dependency=[], conversionStatus='DIRECT', deterministic=true, unsupportedReason=null, fallbackCandidate=null, sourceCommand=null, input={}, output={}, confidence=null }) => ({
  _offset: match?.index || 0,
  sourceSoftware: SOURCE_SOFTWARE,
  sourceCommand: sourceCommand || String(match?.[0] || operation).trim(),
  operation,
  category,
  target: clone(target),
  parameters: clone(parameters),
  dependency: clone(dependency),
  input: clone(input),
  output: clone(output),
  destructive: false,
  deterministic,
  inkCapabilityMapping: conversionStatus === 'REJECTED' ? null : operation,
  fallbackCandidate,
  confidence: confidence ?? (conversionStatus === 'DIRECT' ? .96 : conversionStatus === 'EQUIVALENT' ? .86 : conversionStatus === 'APPROXIMATED' ? .7 : .42),
  evidence: evidenceAt(text, match),
  unsupportedReason,
  unsupportedStep: ['PARTIAL','REJECTED','MANUAL STEP REQUIRED','EXTERNAL EXECUTION REQUIRED'].includes(conversionStatus),
  conversionStatus
});

function maskLexicalNonCode(text) {
  const chars=[...text], masked=[...text], directives=[], errors=[];
  let state='code', quote=null, start=0;
  const blank=index=>{ if(masked[index] !== '\n' && masked[index] !== '\r') masked[index]=' '; };
  for(let index=0; index<chars.length; index++){
    const char=chars[index], next=chars[index+1];
    if(state==='line-comment'){
      blank(index);
      if(char==='\n'){
        const raw=text.slice(start,index);
        const directive=raw.match(/^\/\/\s*(@ink-[^\r\n]*)/i);
        if(directive) directives.push({start,end:index,raw,body:directive[1].trim()});
        state='code';
      }
      continue;
    }
    if(state==='block-comment'){
      blank(index);
      if(char==='*'&&next==='/'){blank(index+1);index++;state='code';}
      continue;
    }
    if(state==='string'){
      if(char==='\\'){blank(index);if(index+1<chars.length){blank(index+1);index++;}continue;}
      if(char===quote){ masked[index]=char; state='code'; quote=null; }
      else blank(index);
      continue;
    }
    if(char==='/'&&next==='/'){start=index;blank(index);blank(index+1);index++;state='line-comment';continue;}
    if(char==='/'&&next==='*'){start=index;blank(index);blank(index+1);index++;state='block-comment';continue;}
    if(char==='"'||char==="'"||char==='\`'){start=index;quote=char;masked[index]=char;state='string';continue;}
  }
  if(state==='line-comment'){
    const raw=text.slice(start);
    const directive=raw.match(/^\/\/\s*(@ink-[^\r\n]*)/i);
    if(directive) directives.push({start,end:text.length,raw,body:directive[1].trim()});
  } else if(state==='block-comment'){
    errors.push({start,end:text.length,raw:text.slice(start),reason:'unterminated block comment'});
  } else if(state==='string'){
    errors.push({start,end:text.length,raw:text.slice(start),reason:`unterminated ${quote==='\`'?'template':'string'} literal`});
  }
  return {masked:masked.join(''),directives,errors};
}

function findMatching(masked,start,open,close){
  let depth=0;
  for(let index=start;index<masked.length;index++){
    if(masked[index]===open)depth++;
    else if(masked[index]===close){depth--;if(depth===0)return index;}
  }
  return -1;
}

function extractForBlocks(masked,text){
  const blocks=[]; const regex=/\bfor\s*\(/g; let match;
  while((match=regex.exec(masked))){
    const paren=masked.indexOf('(',match.index), parenEnd=findMatching(masked,paren,'(',')');
    if(parenEnd<0){blocks.push({start:match.index,end:text.length,raw:text.slice(match.index),validStructure:false});break;}
    let brace=parenEnd+1;while(/\s/.test(masked[brace]||''))brace++;
    if(masked[brace]!=='{'){let end=masked.indexOf(';',brace);if(end<0)end=text.length-1;blocks.push({start:match.index,end:end+1,raw:text.slice(match.index,end+1),validStructure:false});regex.lastIndex=end+1;continue;}
    const braceEnd=findMatching(masked,brace,'{','}');
    if(braceEnd<0){blocks.push({start:match.index,end:text.length,raw:text.slice(match.index),validStructure:false});break;}
    blocks.push({start:match.index,end:braceEnd+1,header:text.slice(paren+1,parenEnd),body:text.slice(brace+1,braceEnd),maskedBody:masked.slice(brace+1,braceEnd),validStructure:true});
    regex.lastIndex=braceEnd+1;
  }
  return blocks;
}

function blankSpans(masked,spans){
  const chars=[...masked];
  for(const span of spans)for(let i=span.start;i<span.end;i++)if(chars[i]!=='\n'&&chars[i]!=='\r')chars[i]=' ';
  return chars.join('');
}

function splitStatements(masked,text,ignored=[]){
  let work=blankSpans(masked,ignored);
  const hashTargets=[],errors=[];
  work=work.replace(/#target[^\r\n]*/gi,(value,offset)=>{hashTargets.push({start:offset,end:offset+value.length,raw:text.slice(offset,offset+value.length)});return value.replace(/[^\r\n]/g,' ');});
  const statements=[];let start=0,paren=0,bracket=0,brace=0;
  const push=end=>{
    const visible=work.slice(start,end),first=visible.search(/\S/);
    if(first>=0){
      let last=visible.length-1;while(last>=first&&/\s/.test(visible[last]))last--;
      const statementStart=start+first,statementEnd=start+last+1;
      statements.push({start:statementStart,end:statementEnd,raw:text.slice(statementStart,statementEnd),masked:work.slice(statementStart,statementEnd)});
    }
    start=end;
  };
  for(let i=0;i<work.length;i++){
    const ch=work[i];
    if(ch==='(')paren++;
    else if(ch===')'){if(paren===0)errors.push({start:i,end:i+1,raw:text.slice(i,i+1),reason:'unmatched closing parenthesis'});else paren--;}
    else if(ch==='[')bracket++;
    else if(ch===']'){if(bracket===0)errors.push({start:i,end:i+1,raw:text.slice(i,i+1),reason:'unmatched closing bracket'});else bracket--;}
    else if(ch==='{')brace++;
    else if(ch==='}'){if(brace===0)errors.push({start:i,end:i+1,raw:text.slice(i,i+1),reason:'unmatched closing brace'});else brace--;}
    if(ch===';'&&paren===0&&bracket===0&&brace===0)push(i+1);
  }
  push(work.length);
  if(paren||bracket||brace)errors.push({start:Math.max(0,start),end:text.length,raw:text.slice(Math.max(0,start)),reason:`unclosed delimiter(s): paren=${paren}, bracket=${bracket}, brace=${brace}`});
  return {statements,hashTargets,errors};
}

function parseArgumentList(source) {
  const input=String(source),args=[];let start=0,quote=null,stack=[];
  const pairs={')':'(',']':'[','}':'{'};
  for(let index=0;index<input.length;index++){
    const char=input[index];
    if(quote){
      if(char==='\\'){index++;if(index>=input.length)return{args:[],error:'unterminated escape in argument string'};continue;}
      if(char===quote){quote=null;continue;}
      if(char==='\n'||char==='\r')return{args:[],error:'unescaped newline in argument string'};
      continue;
    }
    if(char==='"'||char==="'"){quote=char;continue;}
    if(char==='\`')return{args:[],error:'template literals are outside the bounded argument subset'};
    if('([{'.includes(char)){stack.push(char);continue;}
    if(')]}'.includes(char)){
      if(stack.pop()!==pairs[char])return{args:[],error:`mismatched delimiter ${char}`};
      continue;
    }
    if(char===','&&stack.length===0){
      const value=input.slice(start,index).trim();
      if(!value)return{args:[],error:'empty argument'};
      args.push(value);start=index+1;
    }
  }
  if(quote)return{args:[],error:'unterminated argument string'};
  if(stack.length)return{args:[],error:'unclosed argument delimiter'};
  const tail=input.slice(start).trim();
  if(tail)args.push(tail);
  else if(input.trim()&&input.trim().endsWith(','))return{args:[],error:'trailing empty argument'};
  return{args,error:null};
}

function parsePoints(source, scope, random){
  const input=String(source).trim();
  if(!(input.startsWith('[')&&input.endsWith(']')))return null;
  const outer=parseArgumentList(input.slice(1,-1));
  if(outer.error||outer.args.length<2)return null;
  const points=[];
  for(const item of outer.args){
    const pairSource=item.trim();
    if(!(pairSource.startsWith('[')&&pairSource.endsWith(']')))return null;
    const pair=parseArgumentList(pairSource.slice(1,-1));
    if(pair.error||pair.args.length!==2)return null;
    const x=evaluateNumber(pair.args[0],scope,random),y=evaluateNumber(pair.args[1],scope,random);
    if(x==null||y==null)return null;
    points.push([x,y]);
  }
  return points;
}
const pathData=(points,closed)=>points.map(([x,y],index)=>(index?'L':'M')+` ${x} ${y}`).join(' ')+(closed?' Z':'');
function parseStaticString(source){
  const input=String(source).trim(),quote=input[0];
  if(!(quote==='"'||quote==="'"))return null;
  let value='';
  const simple={b:'\b',f:'\f',n:'\n',r:'\r',t:'\t',v:'\v','\\':'\\','"':'"',"'":"'",'/':'/'};
  for(let index=1;index<input.length;index++){
    const char=input[index];
    if(char===quote)return input.slice(index+1).trim()===''?value:null;
    if(char==='\n'||char==='\r')return null;
    if(char!=='\\'){value+=char;continue;}
    index++;if(index>=input.length)return null;
    const escaped=input[index];
    if(escaped==='\n')continue;
    if(escaped==='\r'){if(input[index+1]==='\n')index++;continue;}
    if(escaped==='0'){
      if(/\d/.test(input[index+1]||''))return null;
      value+='\0';continue;
    }
    if(Object.prototype.hasOwnProperty.call(simple,escaped)){value+=simple[escaped];continue;}
    if(escaped==='x'){
      const hex=input.slice(index+1,index+3);
      if(!/^[0-9a-fA-F]{2}$/.test(hex))return null;
      value+=String.fromCharCode(parseInt(hex,16));index+=2;continue;
    }
    if(escaped==='u'){
      if(input[index+1]==='{'){
        const close=input.indexOf('}',index+2);
        if(close<0)return null;
        const hex=input.slice(index+2,close);
        if(!/^[0-9a-fA-F]{1,6}$/.test(hex))return null;
        const code=parseInt(hex,16);if(code>0x10ffff)return null;
        value+=String.fromCodePoint(code);index=close;continue;
      }
      const hex=input.slice(index+1,index+5);
      if(!/^[0-9a-fA-F]{4}$/.test(hex))return null;
      value+=String.fromCharCode(parseInt(hex,16));index+=4;continue;
    }
    return null;
  }
  return null;
}

function parseStaticFileExpression(source){
  const input=String(source).trim(),match=input.match(/^new\s+File\s*\(([\s\S]*)\)$/);
  if(!match)return null;
  const parsed=parseArgumentList(match[1]);
  if(parsed.error||parsed.args.length!==1)return null;
  const value=parseStaticString(parsed.args[0]);
  return value==null?null:{path:value};
}

function parseInertExportOptions(source){
  const input=String(source).trim();
  return input==='{}'?{kind:'empty-object'}:null;
}

function evaluateNumber(expression,scope,random){
  try{const result=evaluateDeterministicExpression(String(expression).trim(),scope,{random,log:[]});return Number.isFinite(Number(result.value))?Number(result.value):null;}catch{return null;}
}
function parseHint(line){
  const values={};
  for(const match of line.matchAll(/([A-Za-z][\w-]*)=("[^"]*"|'[^']*'|[^\s]+)/g))values[match[1]]=match[2].replace(/^["']|["']$/g,'');
  return values;
}

function fleurifyOperation(text,masked){
  const match=FLEURIFY_SIGNATURE.exec(masked);
  if(stableSourceHash(text)!==FLEURIFY_SNAPSHOT_FNV1A)return null;
  if(!match||!/leftDirection\s*=/.test(masked)||!/rightDirection\s*=/.test(masked)||!/function\s+calculatePos\b/i.test(masked))return null;
  const promptMatch=text.match(/prompt\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/i);
  return operation({text,match:pseudoMatch(text,match.index,match.index+match[0].length),category:'PathPoint',operation:'illustrator.pathpoint.fleurify',sourceCommand:'knotHandles()',parameters:{
    behaviorId:'FLEURIFY_OUTLINE_FROM_CLOSED_PATH',
    percentage:{type:'number',default:Number(promptMatch?.[2]||100),min:0,max:200,unit:'percent',validation:'finite-number'},
    anchorInvariant:true,closedPathRequired:true,selectedPointMode:'ANCHORPOINT',
    controlFlow:['for','if','array-index','previous-next-cyclic-index','function-call','math']
  },target:{kind:'path'},output:{anchorInvariant:true},conversionStatus:'DIRECT'});
}

function coverageRecord(text,unit,classification,status,detail=null){
  return {start:unit.start,end:unit.end,line:lineAt(text,unit.start),classification,status,detail,excerpt:String(unit.raw||text.slice(unit.start,unit.end)).trim().replace(/\s+/g,' ').slice(0,220)};
}

function rejectedSourceOperation(text,unit,reason,category='External Dependency'){
  return operation({text,match:pseudoMatch(text,unit.start,unit.end),category,operation:'external.illustratorUnsupported',conversionStatus:'REJECTED',unsupportedReason:reason,parameters:{sourceSpan:{start:unit.start,end:unit.end}}});
}

function finalizeFailClosed(operations,reason){
  return operations.map(item=>{
    if(item.conversionStatus==='REJECTED')return item;
    return {...item,inkCapabilityMapping:null,conversionStatus:'REJECTED',unsupportedStep:true,confidence:Math.min(item.confidence??.4,.4),unsupportedReason:`fail-closed source: ${reason}; mapped operation retained as evidence but is not executable`};
  });
}

function containerSafe(owner,{docAliases,lastLayerVar,currentGroupVar}){
  if(currentGroupVar)return owner===currentGroupVar;
  if(lastLayerVar)return owner===lastLayerVar||docAliases.has(owner);
  return docAliases.has(owner)||owner==='app.activeDocument';
}

function parseRepeatBlock(text,block,scope,random){
  if(!block.validStructure)return {operation:rejectedSourceOperation(text,block,'malformed for-loop is outside the bounded subset','Repeat'),coverage:coverageRecord(text,block,'unsupported-control-flow','REJECTED','malformed for-loop'),unsafe:true};
  if(/\b(?:if|for|while|switch|try|catch|function|do|with)\b/.test(block.maskedBody))return {operation:rejectedSourceOperation(text,block,'nested/mixed control flow inside repeat is outside the bounded subset','Repeat'),coverage:coverageRecord(text,block,'unsupported-control-flow','REJECTED','nested control flow'),unsafe:true};
  const header=block.header.match(/^\s*var\s+([A-Za-z_$][\w$]*)\s*=\s*0\s*;\s*\1\s*<\s*([^;]+)\s*;\s*\1\+\+\s*$/);
  if(!header)return {operation:rejectedSourceOperation(text,block,'repeat header must be for(var i=0;i<N;i++) with statically resolvable N','Repeat'),coverage:coverageRecord(text,block,'unsupported-repeat','REJECTED','unsupported loop header'),unsafe:true};
  const count=evaluateNumber(header[2],scope,random);
  const body=block.body.trim();
  const bodyMatch=body.match(/^\s*var\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.duplicate\s*\(\s*\)\s*;\s*\1\.rotate\s*\(\s*([\s\S]+?)\s*\)\s*;?\s*$/);
  if(!(Number.isInteger(count)&&count>0&&count<=4096&&bodyMatch))return {operation:rejectedSourceOperation(text,block,'repeat requires bounded integer count <= 4096 and exact duplicate()+rotate() body','Repeat'),coverage:coverageRecord(text,block,'unsupported-repeat','REJECTED','unsupported repeat body/count'),unsafe:true};
  const sourceVar=bodyMatch[2],angleExpression=bodyMatch[3];
  if(sourceVar!=='target')return {operation:rejectedSourceOperation(text,block,`repeat source ${sourceVar} cannot be bound to a created JSX variable through the existing neutral Recipe target seam`,'Repeat'),coverage:coverageRecord(text,block,'target-binding-gap','REJECTED','created-variable repeat target'),unsafe:true};
  const op=operation({text,match:pseudoMatch(text,block.start,block.end),category:'Repeat',operation:'repeat.radial',target:{kind:'path',selector:'target'},parameters:{count,sourceVariable:'target',sourceIndexVariable:header[1],sourceAngleExpression:angleExpression,sourceOriginalRemains:true},input:{targetVariable:'target'},output:{kind:'repeat',sourceDuplicateCount:count},conversionStatus:'REJECTED',unsupportedReason:'bounded source loop is structurally understood, but existing canonical repeat compiler emits angleStart/angleEnd while native Repeat consumes startAngle/sweep and original/duplicate inclusion equivalence is not proven; execution is blocked rather than guessed'});
  return {operation:op,coverage:coverageRecord(text,block,'consumed-repeat','PARTIAL','structurally parsed; runtime execution blocked'),unsafe:false};
}

export function parseIllustratorJsxSubset({name='illustrator.jsx',text='',metadata={}}={}){
  text=String(text||'');
  const lexical=maskLexicalNonCode(text), masked=lexical.masked;
  const hasIllustrator=/#target\s+["']?illustrator\b/i.test(masked)||/\bpathItems\b|\bpathPoints\b|\bgroupItems\b|\blayers\.(?:add|getByName)\b|\bartboards\b|PathPointSelection|ExportType\./i.test(masked);
  const hasPhotoshop=/#target\s+["']?photoshop\b/i.test(masked)||/\bActionDescriptor\b|\bexecuteAction\s*\(|\bartLayers\b|\bLayerKind\b|\bcharIDToTypeID\b|\bstringIDToTypeID\b/i.test(masked);
  if(hasIllustrator&&hasPhotoshop)throw Object.assign(new Error('INK_ILLUSTRATOR_JSX_AMBIGUOUS_HOST'),{code:'AMBIGUOUS_HOST'});

  const fleurify=fleurifyOperation(text,masked);
  if(fleurify){
    delete fleurify._offset;
    return createWorkflowIR({
      source:metadata.source||{name,format:'ILLUSTRATOR_JSX_READABLE_SUBSET',sourceSoftware:SOURCE_SOFTWARE},
      metadata:{...clone(metadata),name,sourceSoftware:SOURCE_SOFTWARE,sourceFormat:'ILLUSTRATOR_JSX_READABLE_SUBSET',readOnly:true,adapterSubset:'fleurify-compatibility',sourceCoverage:{mode:'legacy-inspected-fleurify-compatibility',unclassifiedExecutable:0}},
      operations:[fleurify],dependencies:['Adobe Illustrator DOM (source-only)'],warnings:[],
      adapter:{id:ILLUSTRATOR_JSX_MODULE.id,contract:ILLUSTRATOR_JSX_MODULE.contract,version:ILLUSTRATOR_JSX_MODULE.version,boundary:'static-readable-subset; no JSX execution'}
    });
  }

  const marker=lexical.directives.some(item=>SUBSET_MARKER.test(item.body));
  const simplePrimitive=!/\b(?:function|if|for|while|switch|try|catch|do|with)\b/.test(masked)&&/\.pathItems\.(?:ellipse|rectangle)\s*\(/.test(masked);
  if(!marker&&!simplePrimitive)throw Object.assign(new Error('INK_ILLUSTRATOR_JSX_OUTSIDE_BOUNDED_SUBSET'),{code:'UNSUPPORTED_SUBSET'});

  const seedDirectives=lexical.directives.filter(item=>/^@ink-seed\b/i.test(item.body));
  const seeds=seedDirectives.map(item=>Number(item.body.match(/^@ink-seed\s+(-?\d+(?:\.\d+)?)/i)?.[1])).filter(Number.isFinite);
  const seed=seeds.length?seeds[0]:null;
  const conflictingSeed=seeds.some(value=>value!==seed);
  const random=new DeterministicRandom(seed??1), scope={}, operations=[], sourceCoverage=[];
  const docAliases=new Set(), declarations=new Map(), invalidVariables=new Set(), pendingPaths=new Map();
  let lastLayerVar=null,currentGroupVar=null,unsafeReason=null,expressionSequence=0;
  const append=op=>operations.push(op);
  const classify=(unit,classification,status='CONSUMED',detail=null)=>sourceCoverage.push(coverageRecord(text,unit,classification,status,detail));
  const reject=(unit,reason,category='External Dependency')=>{append(rejectedSourceOperation(text,unit,reason,category));classify(unit,'unsupported-executable','REJECTED',reason);unsafeReason ||= reason;};

  for(const lexicalError of lexical.errors||[])reject(lexicalError,`lexical source rejected: ${lexicalError.reason}`,'Lexical');

  for(const directive of lexical.directives){
    const unit={...directive,raw:directive.raw};
    if(/^@ink-illustrator-subset\s+1\b/i.test(directive.body))classify(unit,'directive-subset','CONSUMED');
    else if(/^@ink-seed\b/i.test(directive.body))classify(unit,'directive-seed',Number.isFinite(Number(directive.body.match(/^@ink-seed\s+(-?\d+(?:\.\d+)?)/i)?.[1]))?'CONSUMED':'REJECTED');
    else if(/^@ink-watercolor-(petal|stroke)\b/i.test(directive.body)){ /* processed in ordered units below */ }
    else {classify(unit,'unknown-directive','REJECTED','unsupported INK directive');unsafeReason ||= 'unsupported INK directive';}
  }
  if(conflictingSeed)unsafeReason ||= 'conflicting @ink-seed directives';

  const forBlocks=extractForBlocks(masked,text);
  const maskedWithoutFor=blankSpans(masked,forBlocks);
  const forbidden=[...maskedWithoutFor.matchAll(/\b(if|while|switch|try|catch|function|do|with|else|return|throw)\b/g)];
  if(forbidden.length){
    for(const match of forbidden){
      const unit={start:match.index,end:match.index+match[0].length,raw:text.slice(match.index,match.index+match[0].length)};
      reject(unit,`unsupported control-flow keyword ${match[1]} causes fail-closed translation`,'Control Flow');
    }
  }

  const {statements,hashTargets,errors:statementErrors}=splitStatements(masked,text,forBlocks);
  for(const structureError of statementErrors||[])reject(structureError,`malformed source rejected: ${structureError.reason}`,'Lexical');
  for(const unit of hashTargets){
    if(/^#target\s+["']?illustrator\b/i.test(unit.raw.trim()))classify(unit,'host-directive','CONSUMED');
    else reject(unit,'only #target illustrator is accepted in this bounded adapter','Host');
  }

  const ordered=[
    ...statements.map(unit=>({...unit,type:'statement'})),
    ...forBlocks.map(unit=>({...unit,type:'for'})),
    ...lexical.directives.filter(item=>/^@ink-watercolor-(petal|stroke)\b/i.test(item.body)).map(unit=>({...unit,raw:unit.raw,type:'brush-directive'}))
  ].sort((a,b)=>a.start-b.start);

  const updateExisting=(variable,kind,mutate)=>{
    const record=declarations.get(variable);
    if(record?.kind!==kind)return false;
    mutate(record);
    return true;
  };

  for(const unit of ordered){
    if(unit.type==='for'){
      const parsed=parseRepeatBlock(text,unit,scope,random);append(parsed.operation);sourceCoverage.push(parsed.coverage);
      if(parsed.unsafe)unsafeReason ||= parsed.operation.unsupportedReason;
      continue;
    }
    if(unit.type==='brush-directive'){
      const directive=unit.body.match(/^@ink-watercolor-(petal|stroke)\b([\s\S]*)/i),kind=directive?.[1]?.toLowerCase(),hint=parseHint(directive?.[2]||'');
      const numericSeed=hint.seed==null?seed:Number(hint.seed),brushId=hint.brushId,brushVersion=hint.brushVersion||null,target=hint.target;
      if(target!=='target'){reject(unit,`watercolor directive target ${target||'(missing)'} cannot be bound; only reserved external role target is executable`,'Brush');continue;}
      if(!brushId||numericSeed==null||!Number.isFinite(numericSeed)){reject(unit,'watercolor directive requires brushId and explicit deterministic seed','Brush');continue;}
      const canonical=kind==='petal'?'brush.watercolor-petal':'brush.watercolor-stroke';
      append(operation({text,match:pseudoMatch(text,unit.start,unit.end),category:'Brush',operation:canonical,target:{kind:'path',selector:'target'},dependency:[`Vector Brush Material:${brushId}${brushVersion?'@'+brushVersion:''}`],parameters:{brushId,brushVersion,seed:numericSeed,color:hint.color||undefined,scale:hint.scale==null?undefined:Number(hint.scale),id:hint.id||undefined,replaceTarget:false},deterministic:true,conversionStatus:'APPROXIMATED',unsupportedReason:'Illustrator brush internals are not claimed equivalent; INK executes its versioned vector watercolor material',fallbackCandidate:'licensed/versioned INK Vector Brush Material'}));
      classify(unit,'mapped-brush-directive','APPROXIMATED');
      continue;
    }

    const raw=unit.raw.trim(), matchObj=pseudoMatch(text,unit.start,unit.end);
    if(!raw)continue;

    let match=raw.match(/^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*app\.activeDocument\s*;$/);
    if(match){docAliases.add(match[1]);declarations.set(match[1],{kind:'document',offset:unit.start});classify(unit,'declaration-document','CONSUMED');continue;}

    match=raw.match(/^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.layers\.add\s*\(\s*\)\s*;$/);
    if(match){
      const [,variable,owner]=match;
      if(!docAliases.has(owner)){reject(unit,`layer owner ${owner} is not a declared active-document alias`,'Layer');continue;}
      const op=operation({text,match:matchObj,category:'Layer',operation:'layer.create',target:{kind:'document'},parameters:{name:'Imported Illustrator Layer',sourceVariable:variable},conversionStatus:'EQUIVALENT'});
      append(op);declarations.set(variable,{kind:'layer',offset:unit.start,operation:op});lastLayerVar=variable;currentGroupVar=null;classify(unit,'mapped-layer-create','EQUIVALENT');continue;
    }

    match=raw.match(/^([A-Za-z_$][\w$]*)\.name\s*=\s*([\s\S]+?)\s*;$/);
    if(match){
      const variable=match[1],nameValue=parseStaticString(match[2]),record=declarations.get(variable);
      if(!record||!['layer','group'].includes(record.kind)||nameValue==null){reject(unit,`name assignment target ${variable} is not a currently translatable created layer/group with a static string`,'Layer / Group');continue;}
      record.operation.parameters.name=nameValue;classify(unit,'folded-created-object-name','CONSUMED',`folded into ${record.kind}.create`);continue;
    }

    match=raw.match(/^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.groupItems\.add\s*\(\s*\)\s*;$/);
    if(match){
      const [,variable,owner]=match;
      if(owner!==lastLayerVar){reject(unit,`group owner ${owner} is not the current just-created layer; existing Recipe group creation has no arbitrary created-layer selector`,'Group');continue;}
      const op=operation({text,match:matchObj,category:'Group',operation:'group.create',target:{kind:'g'},parameters:{name:'Imported Illustrator Group',sourceVariable:variable,sourceParentVariable:owner},conversionStatus:'EQUIVALENT'});
      append(op);declarations.set(variable,{kind:'group',offset:unit.start,operation:op});currentGroupVar=variable;classify(unit,'mapped-group-create','EQUIVALENT');continue;
    }

    match=raw.match(/^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.pathItems\.add\s*\(\s*\)\s*;$/);
    if(match){
      const [,variable,owner]=match;
      if(!containerSafe(owner,{docAliases,lastLayerVar,currentGroupVar})){reject(unit,`path owner ${owner} is not the bounded current Recipe container`,'Path');continue;}
      pendingPaths.set(variable,{variable,owner,unit,points:null,closed:false,operation:null});
      declarations.set(variable,{kind:'path',offset:unit.start,pending:true});classify(unit,'path-declaration-pending','CONSUMED');continue;
    }

    match=raw.match(/^([A-Za-z_$][\w$]*)\.setEntirePath\s*\(\s*([\s\S]+)\s*\)\s*;$/);
    if(match){
      const pending=pendingPaths.get(match[1]);
      if(!pending){reject(unit,`setEntirePath target ${match[1]} has no preceding bounded pathItems.add declaration`,'Path');continue;}
      const points=parsePoints(match[2],scope,random);
      if(!points){reject(unit,'setEntirePath contains unresolved/non-whitelisted coordinates','Path');continue;}
      pending.points=points;
      const op=operation({text,match:pseudoMatch(text,pending.unit.start,unit.end),category:'Path',operation:'path.create',target:{kind:'canvas'},parameters:{d:pathData(points,pending.closed),points,closed:pending.closed,unit:'pt',sourceVariable:pending.variable,sourceContainerVariable:pending.owner},output:{kind:'path',editable:true,sourceVariable:pending.variable},conversionStatus:'DIRECT'});
      append(op);pending.operation=op;declarations.set(pending.variable,{kind:'path',offset:pending.unit.start,operation:op});classify(unit,'folded-setEntirePath','CONSUMED');continue;
    }

    match=raw.match(/^([A-Za-z_$][\w$]*)\.closed\s*=\s*(true|false)\s*;$/);
    if(match){
      const pending=pendingPaths.get(match[1]);
      if(!pending?.operation){reject(unit,`closed assignment target ${match[1]} has no completed bounded setEntirePath mapping`,'Path');continue;}
      pending.closed=match[2]==='true';pending.operation.parameters.closed=pending.closed;pending.operation.parameters.d=pathData(pending.points,pending.closed);classify(unit,'folded-path-closed','CONSUMED');continue;
    }

    match=raw.match(/^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\.pathItems\.(ellipse|rectangle)\s*\(([\s\S]*)\)\s*;$/);
    if(match){
      const [,variable,owner,shape,argSource]=match;
      if(!containerSafe(owner,{docAliases,lastLayerVar,currentGroupVar})){reject(unit,`${shape} owner ${owner} is not the bounded current Recipe container`,'Path');continue;}
      const parsedArgs=parseArgumentList(argSource),args=parsedArgs.args,values=args.map(value=>evaluateNumber(value,scope,random));
      if(parsedArgs.error||args.length!==4||values.some(value=>value==null)){reject(unit,`${shape} requires exactly four ordered statically resolvable point arguments with no trailing expressions`,'Path');continue;}
      const [top,left,width,height]=values;
      const parameters=shape==='ellipse'?{cx:left+width/2,cy:top+height/2,rx:Math.abs(width)/2,ry:Math.abs(height)/2,unit:'pt',illustratorBounds:{top,left,width,height},sourceVariable:variable,sourceContainerVariable:owner}:{x:left,y:top,width,height,unit:'pt',illustratorBounds:{top,left,width,height},sourceVariable:variable,sourceContainerVariable:owner};
      const op=operation({text,match:matchObj,category:'Path',operation:`path.${shape}`,target:{kind:'canvas'},parameters,output:{kind:'path',shape,sourceVariable:variable},conversionStatus:'DIRECT'});
      append(op);declarations.set(variable,{kind:'path',offset:unit.start,operation:op});classify(unit,`mapped-${shape}`,'DIRECT');continue;
    }

    match=raw.match(/^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(["'][\s\S]*["'])\s*;$/);
    if(match){
      const variable=match[1],value=parseStaticString(match[2]);
      if(declarations.has(variable)){reject(unit,`variable ${variable} is redeclared/reassigned; binding becomes ambiguous`,'Binding');continue;}
      if(value==null){reject(unit,`declaration ${variable} is not exactly one well-formed static string literal; concatenation/interpolation/trailing expressions are rejected`,'Expression');continue;}
      declarations.set(variable,{kind:'string',offset:unit.start,value});classify(unit,'inert-static-string-declaration','CONSUMED');continue;
    }

    match=raw.match(/^(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]+?)\s*;$/);
    if(match){
      const variable=match[1],expression=match[2].trim();
      if(declarations.has(variable)){reject(unit,`variable ${variable} is redeclared/reassigned; binding becomes ambiguous`,'Expression');invalidVariables.add(variable);continue;}
      if(/\b(?:app|new\s+File|ExportType|BlendModes)\b|\.(?:pathItems|layers|groupItems|duplicate)\b/i.test(expression)){reject(unit,`declaration ${variable} uses unsupported object expression`,'Expression');continue;}
      const usesRandom=/Math\.random\s*\(|\brandom\s*\(/.test(expression);
      if(usesRandom&&seed==null){append(operation({text,match:matchObj,category:'Expression',operation:'expression.evaluate',conversionStatus:'REJECTED',deterministic:false,unsupportedReason:'unseeded randomness is rejected; declare // @ink-seed <number>',fallbackCandidate:'add an explicit deterministic seed',parameters:{sourceExpression:expression,seedRequired:true,sourceVariable:variable}}));classify(unit,'expression-unseeded-random','REJECTED');unsafeReason ||= 'unseeded randomness';continue;}
      const value=evaluateNumber(expression,scope,random);
      if(value==null){reject(unit,`expression for ${variable} exceeds the ordered deterministic whitelist or references a value not yet declared`,'Expression');invalidVariables.add(variable);continue;}
      scope[variable]=value;declarations.set(variable,{kind:'number',offset:unit.start,value});
      append(operation({text,match:matchObj,category:'Expression',operation:'expression.evaluate',conversionStatus:usesRandom?'EQUIVALENT':'DIRECT',deterministic:true,parameters:{expression:String(value),sourceExpression:expression,seed:seed??1,sourceVariable:variable,evaluatedValue:value,sequenceIndex:expressionSequence++}}));
      classify(unit,usesRandom?'mapped-seeded-random':'mapped-deterministic-expression',usesRandom?'EQUIVALENT':'DIRECT');continue;
    }

    match=raw.match(/^([A-Za-z_$][\w$]*)\.opacity\s*=\s*([^;]+)\s*;$/);
    if(match){
      const selector=match[1],percent=evaluateNumber(match[2],scope,random);
      if(selector!=='target'){reject(unit,`opacity target ${selector} cannot be bound to a JSX-created variable through existing neutral Recipe role mapping`,'Transparency');continue;}
      if(percent==null||percent<0||percent>100){reject(unit,'Illustrator opacity must resolve in source order to 0..100 percent','Transparency');continue;}
      append(operation({text,match:matchObj,category:'Transparency',operation:'blend.opacity',target:{kind:'path',selector:'target'},parameters:{opacity:percent/100,sourcePercent:percent,sourceTarget:'target'},conversionStatus:'EQUIVALENT'}));classify(unit,'mapped-external-target-opacity','EQUIVALENT');continue;
    }

    match=raw.match(/^([A-Za-z_$][\w$]*)\.blendingMode\s*=\s*BlendModes\.([A-Z_]+)\s*;$/);
    if(match){
      const selector=match[1],BLEND={NORMAL:'source-over',MULTIPLY:'multiply',SCREEN:'screen',OVERLAY:'overlay',DARKEN:'darken',LIGHTEN:'lighten'},mapped=BLEND[match[2]];
      if(selector!=='target'){reject(unit,`blend target ${selector} cannot be bound to a JSX-created variable through existing neutral Recipe role mapping`,'Blend');continue;}
      if(!mapped){reject(unit,`Illustrator blend mode ${match[2]} has no inspected bounded INK renderer mapping`,'Blend');continue;}
      append(operation({text,match:matchObj,category:'Blend',operation:'blend.mode',target:{kind:'path',selector:'target'},parameters:{blendMode:mapped,sourceBlendMode:match[2],sourceTarget:'target'},conversionStatus:'EQUIVALENT'}));classify(unit,'mapped-external-target-blend','EQUIVALENT');continue;
    }

    match=raw.match(/^([A-Za-z_$][\w$]*)\.exportFile\s*\(([\s\S]*)\)\s*;$/);
    if(match){
      const owner=match[1],parsedArgs=parseArgumentList(match[2]),args=parsedArgs.args;
      if(!docAliases.has(owner)){reject(unit,'exportFile owner is not a declared active-document alias','Export');continue;}
      if(parsedArgs.error||args.length<2||args.length>3){reject(unit,`exportFile requires exactly 2 or 3 fully parsed arguments; ${parsedArgs.error||`received ${args.length}`}`,'Export');continue;}
      const file=parseStaticFileExpression(args[0]),typeMatch=args[1].match(/^ExportType\.([A-Z0-9_]+)$/);
      const EXPORT_TYPES={PNG24:'png',PNG8:'png',JPEG:'jpeg',SVG:'svg'};
      const sourceType=typeMatch?.[1]||null,format=sourceType?EXPORT_TYPES[sourceType]:null;
      if(!file){reject(unit,'exportFile first argument must be exactly new File(<one static string literal>) with no executable expression','Export');continue;}
      if(!format){reject(unit,'exportFile second argument must be one inspected ExportType: PNG24, PNG8, JPEG or SVG','Export');continue;}
      const options=args.length===3?parseInertExportOptions(args[2]):{kind:'omitted'};
      if(!options){reject(unit,'exportFile optional third argument must be omitted or exactly the inspected inert empty object {}; executable/options expressions are rejected','Export');continue;}
      append(operation({text,match:matchObj,category:'Export',operation:'export.file',target:{kind:'document'},dependency:['INK exporter / browser download authority'],parameters:{fileName:file.path.split(/[\\/]/).pop(),format,sourceExportType:sourceType,sourceOptions:options.kind,intentOnly:true,validatedArgumentCount:args.length},conversionStatus:'PARTIAL',unsupportedReason:'translation records a validated inert export intent only; it does not execute Illustrator export or claim byte/visual equivalence',fallbackCandidate:'existing INK export authority'}));classify(unit,'mapped-export-intent','PARTIAL',`validated ${args.length} complete inert argument(s)`);continue;
    }

    match=raw.match(/^([A-Za-z_$][\w$]*)\s*=\s*([^=][\s\S]*?)\s*;$/);
    if(match&&declarations.has(match[1])){invalidVariables.add(match[1]);reject(unit,`reassignment of declared variable ${match[1]} is outside the bounded binding model`,'Binding');continue;}

    reject(unit,'executable statement is not in the bounded Illustrator subset; side effects/calls are preserved as explicit rejected evidence');
  }

  for(const pending of pendingPaths.values())if(!pending.operation){
    const reason=`pathItems.add variable ${pending.variable} has no consumed setEntirePath mapping`;
    append(rejectedSourceOperation(text,pending.unit,reason,'Path'));unsafeReason ||= reason;
  }

  if(conflictingSeed){
    const unit=seedDirectives[0]||{start:0,end:0,raw:''};
    append(rejectedSourceOperation(text,unit,'conflicting @ink-seed directives','Expression'));
  }

  let clean=operations.sort((a,b)=>a._offset-b._offset);
  if(unsafeReason)clean=finalizeFailClosed(clean,unsafeReason);
  clean=clean.map(item=>{const value={...item};delete value._offset;return value;});
  if(!clean.length)clean.push({
    sourceSoftware:SOURCE_SOFTWARE,sourceCommand:'bounded subset',operation:'external.illustratorUnsupported',category:'External Dependency',target:{},parameters:{},dependency:[],input:{},output:{},destructive:false,deterministic:true,inkCapabilityMapping:null,fallbackCandidate:'Architecture review',confidence:.3,evidence:[{label:'Illustrator JSX',line:1,excerpt:name}],unsupportedReason:'no executable bounded Illustrator operation was recognized',unsupportedStep:true,conversionStatus:'REJECTED'
  });

  const executableCoverage=sourceCoverage.filter(item=>!['directive-subset','directive-seed','host-directive'].includes(item.classification));
  const unclassifiedExecutable=0;
  const brushDependencies=[...new Set(clean.flatMap(item=>item.dependency||[]).filter(value=>String(value).startsWith('Vector Brush Material:')))];
  return createWorkflowIR({
    source:metadata.source||{name,format:'ILLUSTRATOR_JSX_READABLE_SUBSET',sourceSoftware:SOURCE_SOFTWARE},
    metadata:{...clone(metadata),name,sourceSoftware:SOURCE_SOFTWARE,sourceFormat:'ILLUSTRATOR_JSX_READABLE_SUBSET',readOnly:true,adapterSubset:'issue-200-static-r2',seed,coordinateSemantics:{sourceUnit:'pt',sourceConvention:'Illustrator ellipse/rectangle top,left,width,height',inkConvention:'bounded artboard-local x/y',normalization:'left→x and top→y are preserved numerically only inside the declared active-container subset; no universal Illustrator axis/host equivalence is claimed'},targetSemantics:{externalRole:'target',createdVariableMutation:'REJECTED_NO_NEUTRAL_RUNTIME_BINDING',containerModel:'ordered active document → just-created layer → just-created group only'},sourceCoverage:{mode:'lexical-structural-fail-closed-r2',entries:sourceCoverage,executableTotal:executableCoverage.length,classifiedExecutable:executableCoverage.length,unclassifiedExecutable,failClosed:Boolean(unsafeReason),wholeSourceRejected:Boolean(unsafeReason),failClosedReason:unsafeReason},candidateCensus:clone(ILLUSTRATOR_JSX_CANDIDATE_MATRIX)},
    operations:clean,dependencies:['Adobe Illustrator DOM (source-only)',...brushDependencies],warnings:[unsafeReason?`fail-closed: ${unsafeReason}`:null].filter(Boolean),
    adapter:{id:ILLUSTRATOR_JSX_MODULE.id,contract:ILLUSTRATOR_JSX_MODULE.contract,version:ILLUSTRATOR_JSX_MODULE.version,boundary:'static lexical/structural readable subset; no JSX execution'}
  });
}

export const ILLUSTRATOR_JSX_MODULE = Object.freeze({
  id:'illustrator-jsx-readable-subset-v1',
  contract:SOURCE_ADAPTER_CONTRACT,
  version:SOURCE_ADAPTER_CONTRACT_VERSION,
  sourceTypes:['ILLUSTRATOR_JSX_READABLE_SUBSET'],
  sourceSoftware:SOURCE_SOFTWARE,
  detect({name='',text='',bytes=null}={}){
    if(bytes)return{accepted:false,confidence:0};
    const source=String(text||''),extension=extensionOf(name),lexical=maskLexicalNonCode(source),masked=lexical.masked;
    const illustrator=/#target\s+["']?illustrator\b/i.test(masked)||/\bpathItems\b|\bpathPoints\b|\bgroupItems\b|\blayers\.(?:add|getByName)\b|\bartboards\b|PathPointSelection|ExportType\./i.test(masked);
    const photoshop=/#target\s+["']?photoshop\b/i.test(masked)||/\bActionDescriptor\b|\bexecuteAction\s*\(|\bartLayers\b|\bLayerKind\b|\bcharIDToTypeID\b|\bstringIDToTypeID\b/i.test(masked);
    const ambiguous=illustrator&&photoshop;
    const fleurify=stableSourceHash(source)===FLEURIFY_SNAPSHOT_FNV1A&&FLEURIFY_SIGNATURE.test(masked)&&/leftDirection\s*=/.test(masked)&&/rightDirection\s*=/.test(masked);
    const marker=lexical.directives.some(item=>SUBSET_MARKER.test(item.body));
    const simplePrimitive=illustrator&&!/\b(?:function|if|for|while|switch|try|catch|do|with)\b/.test(masked)&&/\.pathItems\.(?:ellipse|rectangle)\s*\(/.test(masked);
    const accepted=ambiguous||fleurify||marker||simplePrimitive;
    const confidence=ambiguous ? 1 : fleurify ? 0.99 : marker ? 0.98 : simplePrimitive ? 0.94 : 0;
    return{accepted,confidence,detection:createAdapterDetection({format:ambiguous?'ILLUSTRATOR_JSX_AMBIGUOUS':'ILLUSTRATOR_JSX_READABLE_SUBSET',sourceSoftware:ambiguous?'Adobe JSX (ambiguous host)':SOURCE_SOFTWARE,confidence,extension,binary:false,evidence:[ambiguous?'mixed Illustrator + Photoshop executable host markers':fleurify?'Fleurify Illustrator executable signature':marker?'@ink-illustrator-subset 1 directive':'simple Illustrator primitive subset']})};
  },
  parse(input={}){return parseIllustratorJsxSubset(input);}
});

export const ILLUSTRATOR_JSX_ADAPTER = ILLUSTRATOR_JSX_MODULE;
