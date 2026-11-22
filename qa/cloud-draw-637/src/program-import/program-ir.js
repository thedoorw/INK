/*
 * INK vendor-neutral bounded source program syntax. Acorn is used ONLY to parse
 * ECMAScript into syntax; no source is evaluated by Acorn or host JavaScript.
 * Exact vendored Acorn 8.14.0: nodejs/node@5d2feb257bcee090e57900eb51720171a6aa92f3
 * deps/acorn/acorn/dist/acorn.mjs (MIT license in vendor/ACORN-LICENSE).
 */
import {parse} from './vendor/acorn.mjs';
const MAX_SOURCE_BYTES=131072;
const MAX_NODES=150000;
const encoder=new TextEncoder();
const fail=(code,details='')=>{throw Object.assign(new Error(code+(details?':'+details:'')),{code});};
// #target and #include are static program directives, not JS syntax. Replace only
// exact whole-line directives, retaining original byte-independent offsets.
function stripDirectives(text){
  const directives=[];
  // Illustrator and old ExtendScript sources may use CR-only lines.
  // Mask only whole-line directives and retain exact code-unit offsets.
  const transformed=String(text).replace(/(^|[\r\n])([ \t]*)#(target|include)\b([^\r\n]*)/g,
    (whole,prefix,spaces,kind,raw,offset)=>{
      const value=raw.trim();
      if(kind==='target' && !/^["']?illustrator["']?$/i.test(value))
        fail('INK_PROGRAM_TARGET_DENIED');
      if(kind==='include'&&!/^(["'])[a-zA-Z0-9._/-]+\1$/.test(value))
        fail('INK_PROGRAM_INCLUDE_INVALID');
      directives.push({kind,value,offset:offset+prefix.length});
      return prefix+' '.repeat(whole.length-prefix.length);
    });
  return {transformed,directives};
}
const safeKeys=new Set(['__proto__','prototype','constructor']);
function inspectTree(node,budget){
  if(!node||typeof node!=='object')return;
  if(typeof node.type==='string'){
    if(++budget.nodes>MAX_NODES)fail('INK_PROGRAM_AST_NODE_LIMIT');
    if(node.type==='WithStatement'||node.type==='ImportExpression'||node.type==='MetaProperty'||
      node.type==='Super'||node.type==='ThisExpression'&&budget.rejectThis)
      fail('INK_PROGRAM_SYNTAX_DENIED',node.type);
    if(node.type==='Identifier'&&safeKeys.has(node.name)&&node.name==='__proto__') fail('INK_PROGRAM_PROTO_POLLUTION');
    if((node.type==='CallExpression'||node.type==='NewExpression')&&
       node.callee?.type==='Identifier'&&['eval','Function'].includes(node.callee.name))
      fail('INK_PROGRAM_DYNAMIC_CODE_DENIED',node.callee.name);
    if(node.type==='MemberExpression'&&!node.computed&&
      node.property?.type==='Identifier'&&['__proto__','constructor'].includes(node.property.name))
      fail('INK_PROGRAM_MEMBER_ESCAPE',node.property.name);
  }
  for(const [key,val] of Object.entries(node)){
    if(['start','end','loc','range','raw'].includes(key))continue;
    if(Array.isArray(val))for(const part of val)inspectTree(part,budget);
    else if(val&&typeof val==='object')inspectTree(val,budget);
  }
}
export function parseBoundedProgram({text='',dependencies=[],name='source.jsx'}={}){
  if(typeof text!=='string'||encoder.encode(text).length>MAX_SOURCE_BYTES)fail('INK_PROGRAM_SOURCE_LIMIT');
  if(!Array.isArray(dependencies)||dependencies.length>12)fail('INK_PROGRAM_DEPENDENCIES_INVALID');
  const units=[{name,text,primary:true},...dependencies.map(d=>({...d,primary:false}))];
  const programs=[],declaredNames=new Set();
  for(const unit of units){
    if(typeof unit.text!=='string'||encoder.encode(unit.text).length>MAX_SOURCE_BYTES)
      fail('INK_PROGRAM_DEPENDENCY_LIMIT');
    const pre=stripDirectives(unit.text);
    let ast;
    try{ast=parse(pre.transformed,{ecmaVersion:2020,sourceType:'script',allowHashBang:false});}
    catch(e){fail('INK_PROGRAM_PARSE_FAILED',unit.name+':'+e.message);}
    const budget={nodes:0,rejectThis:false};
    inspectTree(ast,budget);
    for(const statement of ast.body){
      if(statement.type==='FunctionDeclaration' && statement.id)declaredNames.add(statement.id.name);
    }
    programs.push({name:unit.name,ast,directives:pre.directives,sourceLength:unit.text.length,nodes:budget.nodes,primary:unit.primary});
  }
  // Include declarations have already been checked for exact Git-object identity,
  // and dependencies execute lexical declarations before the primary source.
  return Object.freeze({
    format:'INK-BOUNDED-PROGRAM-IR',
    version:1,
    sourceName:name,
    programs:[...programs.filter(x=>!x.primary),...programs.filter(x=>x.primary)],
    declaredFunctions:[...declaredNames].sort(),
    totalNodes:programs.reduce((s,p)=>s+p.nodes,0),
    sourceExecuted:false
  });
}
