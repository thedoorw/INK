/*
 * R2: source-derived diagnostic certificate for the bounded Program IR.
 *
 * Caller-supplied diagnosticFunctions names have zero authority here. A
 * certificate requires a closed, effect-restricted AST call graph AND a
 * complete no-alias/no-artwork-read proof for each UI-only root.field sink.
 *
 * Unsupported syntax, unknown calls, ambiguous aliases, return values,
 * geometry reads or state writes fail to certify; the ordinary bounded
 * evaluator must then run the source body or fail closed.
 */
const SIMPLE_ID=/^[A-Za-z_$][A-Za-z0-9_$]*$/;
const ALLOWED_UI_METHODS=new Set(['update','show','close']);
const ALLOWED_DIAGNOSTIC_PRIMITIVES=new Set(['alert','redraw']);
const BAD_OPS=new Set(['in','instanceof']);
const IGNORE_AST_KEYS=new Set(['start','end','loc','raw','range']);
function pathOf(n){
  if(n?.type==='Identifier')return [n.name];
  if(n?.type!=='MemberExpression'||n.optional)return null;
  const p=pathOf(n.object);
  if(!p)return null;
  const k=n.computed?(n.property.type==='Literal'&&typeof n.property.value==='string'?n.property.value:null):
    n.property?.type==='Identifier'?n.property.name:null;
  return k&&SIMPLE_ID.test(k)?[...p,k]:null;
}
function walk(node,visitor,parent=null){
  if(!node||typeof node!=='object')return;
  if(typeof node.type==='string')visitor(node,parent);
  for(const [key,val] of Object.entries(node)){
    if(IGNORE_AST_KEYS.has(key))continue;
    if(Array.isArray(val))for(const item of val)walk(item,visitor,node);
    else if(val&&typeof val==='object')walk(val,visitor,node);
  }
}
const bodyOf=node=>node?.body?.type==='BlockStatement'?node.body.body:null;

/**
 * fn is the actual FunctionValue supplied by the bounded evaluator.
 * No source code is executed during certification, and each proof is tied to
 * that source node, not a string name or importer metadata.
 */
export function createDiagnosticCertifier({
  ir,functions,isInertUiBranch,isUnreachableUiBoot,spendWork
}){
  const checked=new WeakMap(),approved=new WeakMap();
  const known=Array.isArray(ir?.programs)?ir.programs:[];
  const sourceByNode=new Map(functions.filter(f=>f?.node).map(f=>[f.node,f]));
  const declared=new Map(functions.filter(f=>f?.node&&f.name).map(f=>[f.name,f.node]));
  function charge(){spendWork(1);}
  function structural(root){
    if(checked.has(root))return checked.get(root);
    const paths=new Map(),visited=new Set(),stack=new Set();
    let hasEffect=false;
    function certifyFunction(node,scope){
      charge();
      if(!node||!bodyOf(node)||stack.has(node))return false;
      if(visited.has(node))return true;
      if(node.params.some(p=>p.type!=='Identifier'))return false;
      const params=new Set(node.params.map(p=>p.name));
      if(params.size!==node.params.length)return false;
      const locals=new Map(scope);
      for(const s of bodyOf(node)){
        if(s.type==='FunctionDeclaration'){
          if(!s.id?.name||locals.has(s.id.name))return false;
          locals.set(s.id.name,s);
        }
      }
      const pure=n=>{
        charge();
        if(!n)return false;
        switch(n.type){
          case 'Literal':return !n.regex&&!n.bigint&&
            (n.value===null||['string','number','boolean'].includes(typeof n.value));
          case 'Identifier':return params.has(n.name)||n.name==='undefined';
          case 'UnaryExpression':return ['!','+','-','~','void'].includes(n.operator)&&pure(n.argument);
          case 'BinaryExpression':return !BAD_OPS.has(n.operator)&&pure(n.left)&&pure(n.right);
          case 'LogicalExpression':return ['||','&&','??'].includes(n.operator)&&pure(n.left)&&pure(n.right);
          case 'ConditionalExpression':return pure(n.test)&&pure(n.consequent)&&pure(n.alternate);
          default:return false;
        }
      };
      const sink=(n,mode)=>{
        charge();
        const p=pathOf(n);
        if(!p||p.length!==3)return false;
        const [rootName,field,action]=p;
        if(mode==='text'&&action!=='text')return false;
        if(mode==='ui'&&!ALLOWED_UI_METHODS.has(action))return false;
        if(!isInertUiBranch(rootName,field))return false;
        paths.set(rootName+'.'+field,{rootName,field});
        hasEffect=true;
        return true;
      };
      function acceptsCall(n){
        charge();
        if(n.type!=='CallExpression'||n.optional||n.arguments.some(a=>a.type==='SpreadElement'||!pure(a)))
          return false;
        if(n.callee.type==='MemberExpression')return sink(n.callee,'ui');
        if(n.callee.type!=='Identifier')return false;
        const name=n.callee.name;
        const next=locals.get(name)||declared.get(name);
        if(next)return certifyFunction(next,locals);
        if(ALLOWED_DIAGNOSTIC_PRIMITIVES.has(name)) {
          hasEffect=true;return true;
        }
        return false;
      }
      function acceptsStatement(s){
        charge();
        switch(s.type){
          case 'EmptyStatement':return true;
          case 'FunctionDeclaration':return true; // checked only on reachable calls
          case 'BlockStatement':return s.body.every(acceptsStatement);
          case 'IfStatement':return pure(s.test)&&acceptsStatement(s.consequent)&&
            (!s.alternate||acceptsStatement(s.alternate));
          case 'ExpressionStatement':{
            const n=s.expression;
            if(n.type==='AssignmentExpression')return ['=','+='].includes(n.operator)&&
              sink(n.left,'text')&&pure(n.right);
            return acceptsCall(n);
          }
          // No return values, global/local state, host access or uncontrolled
          // calls can be discarded in a diagnostic certificate.
          default:return false;
        }
      }
      stack.add(node);
      const passed=bodyOf(node).every(acceptsStatement);
      stack.delete(node);
      if(passed)visited.add(node);
      return passed;
    }
    const valid=certifyFunction(root.node,new Map());
    // Do not cache a failed candidate in case the inert UI branch becomes
    // available only later; the geometry and sink audit is still required.
    const result=valid&&hasEffect?{nodes:visited,paths:[...paths.values()]}:null;
    if(result)checked.set(root,result);
    return result;
  }
  function safeOutside(node,paths,certNodes){
    // Root references outside the proven diagnostic graph must not alias,
    // overwrite or consume the UI-only branch; a syntactic key collision in
    // other code is not assumed harmless. Unreachable certified UI boot is
    // excluded from the selected-entrypoint program only.
    let safe=true;
    function scan(n,parent=null,skip=false){
      if(!safe||!n||typeof n!=='object')return;
      if(typeof n.type==='string'){
        charge();
        if(certNodes.has(n))return;
        if(['FunctionDeclaration','FunctionExpression'].includes(n.type)&&
          isUnreachableUiBoot(n))return;
        if(n.type==='MemberExpression'){
          const p=pathOf(n);
          if(p===null && paths.some(s=>pathOf(n.object)?.[0]===s.rootName)){
            safe=false;return;
          }
          if(p&&paths.some(s=>p[0]===s.rootName&&p.length>=2&&p[1]===s.field)){
            safe=false;return;
          }
        }
        if(n.type==='Identifier'&&paths.some(s=>s.rootName===n.name)){
          // Root may be used only as an object base of a statically named,
          // different member, or as its top-level declaration binding.
          if(parent?.type==='MemberExpression'&&parent.object===n&&!parent.computed)return;
          if(parent?.type==='VariableDeclarator'&&parent.id===n)return;
          if(parent?.type==='FunctionDeclaration'&&parent.id===n)return;
          safe=false;return;
        }
      }
      for(const [key,val] of Object.entries(n)){
        if(IGNORE_AST_KEYS.has(key))continue;
        if(Array.isArray(val))for(const ch of val)scan(ch,n);
        else if(val&&typeof val==='object')scan(val,n);
      }
    }
    for(const unit of known)scan(unit.ast);
    return safe;
  }
  function certify(fn){
    const cached=approved.get(fn);
    if(cached){
      return cached.paths.every(p=>isInertUiBranch(p.rootName,p.field))?cached.proof:null;
    }
    const candidate=structural(fn);
    if(!candidate)return null;
    for(const p of candidate.paths)if(!isInertUiBranch(p.rootName,p.field))return null;
    // Other independently proven diagnostic-only helpers may be excluded
    // from the no-consumer graph, but names alone never grant exclusion.
    const ignored=new Set(candidate.nodes);
    for(const f of sourceByNode.values()){
      if(f===fn)continue;
      const other=structural(f);
      if(other)for(const node of other.nodes)ignored.add(node);
    }
    if(!safeOutside(ir,candidate.paths,ignored))return null;
    const proof={
      kind:'AST_REACHABLE_DIAGNOSTIC_ONLY',
      certifiedSourceFunctions:ignored.size,
      sinkCount:candidate.paths.length,
      nativeMutation:false,sourceBodySkipped:true
    };
    approved.set(fn,{proof,paths:candidate.paths});
    return proof;
  }
  return Object.freeze({certify});
}
