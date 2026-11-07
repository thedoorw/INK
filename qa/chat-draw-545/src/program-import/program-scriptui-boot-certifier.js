/*
 * R3: bounded, source-derived immediate-effect ScriptUI boot certification.
 *
 * A syntactic Window/show match is NEVER enough. This checker symbolically
 * tracks only inert ScriptUI handles, proves global UI branches isolated
 * from artwork using the existing AST diagnostic certifier, and accepts
 * global non-UI writes only if equal to the actual pre-boot value.
 *
 * An unproved boot is executed through the ordinary bounded evaluator
 * (and may be fail-closed), never silently dropped.
 */
import {createDiagnosticCertifier} from './program-diagnostic-certifier.js';

const UI=Symbol('certified inert ScriptUI handle');
const PURE=Symbol('proven inert read/value');
const IDENT=/^[A-Za-z_$][\w$]*$/;
const CALLBACKS=new Set(['onClick','onChange','onChanging','onActivate','onDeactivate']);
const UI_ACTIONS=new Set(['show','update','close']);
const HIDDEN=new Set(['start','end','loc','range','raw']);
const denied=new Set(['__proto__','constructor','prototype']);
function pathOf(node){
  if(node?.type==='Identifier')return [node.name];
  if(node?.type!=='MemberExpression'||node.optional)return null;
  const parts=pathOf(node.object);
  const prop=node.computed?
    (node.property?.type==='Literal'&&typeof node.property.value==='string'?node.property.value:null):
    (node.property?.type==='Identifier'?node.property.name:null);
  return parts&&prop&&IDENT.test(prop)&&!denied.has(prop)?[...parts,prop]:null;
}
function visit(node,fn,parent=null){
  if(!node||typeof node!=='object')return;
  if(typeof node.type==='string')fn(node,parent);
  for(const [key,child] of Object.entries(node)){
    if(HIDDEN.has(key))continue;
    if(Array.isArray(child))for(const item of child)visit(item,fn,node);
    else if(child&&typeof child==='object')visit(child,fn,node);
  }
}
function references(node,root,field,charge){
  let found=false;
  visit(node,n=>{
    charge();
    const p=pathOf(n);
    if(p&&p[0]===root&&p[1]===field)found=true;
  });
  return found;
}
export function certifyScriptUiBootImmediate({
  fn,callNode,ir,sourceFunctions,selectedEntrypoint,
  snapshotRoot,proveInertRoot,canUseUnshadowedWindow,charge
}){
  const body=fn?.node?.body?.type==='BlockStatement'?fn.node.body.body:null;
  if(!body||!fn.node?.params||fn.node.params.length||callNode?.arguments?.length)return null;
  let windowConstructed=0,showCalls=0,callbacks=0,idempotentWrites=0,uiBindings=0;
  const locals=new Map(),uiFields=new Map();
  const fail=()=>{throw new Error('R3_BOOT_PROOF_UNAVAILABLE');};
  const keyOf=node=>node?.type==='Identifier'?node.name:null;
  const staticKey=node=>{
    if(node?.type!=='MemberExpression'||node.optional)return null;
    const key=node.computed?
      (node.property?.type==='Literal'&&typeof node.property.value==='string'?node.property.value:null):
      keyOf(node.property);
    return key&&IDENT.test(key)&&!denied.has(key)?key:null;
  };
  function read(node){
    charge();
    if(!node)fail();
    if(node.type==='Literal'){
      if(node.regex||node.bigint||!['string','number','boolean','object'].includes(typeof node.value))fail();
      if(node.value!==null&&typeof node.value==='object')fail();
      return node.value;
    }
    if(node.type==='Identifier'){
      if(locals.has(node.name))return locals.get(node.name);
      const root=snapshotRoot(node.name);
      if(!root.found||typeof root.value==='function')fail();
      if(root.value&&typeof root.value==='object')fail();
      return root.value;
    }
    if(node.type==='MemberExpression'){
      const p=pathOf(node);
      if(!p||p.length!==2)fail();
      const key=p.join('.');
      if(uiFields.has(key))return UI;
      const root=snapshotRoot(p[0]);
      if(!root.found||!root.isRecord||!root.fields.has(p[1]))fail();
      const value=root.fields.get(p[1]);
      if(value&&typeof value==='object')fail();
      if(typeof value==='function')fail();
      return value;
    }
    if(node.type==='ArrayExpression'){
      for(const item of node.elements){if(!item||item.type==='SpreadElement'||read(item)===UI)fail();}
      return PURE;
    }
    if(node.type==='ObjectExpression'){
      for(const p of node.properties){
        if(p.type!=='Property'||p.computed||p.method||p.kind!=='init'||p.shorthand)fail();
        if(!((p.key.type==='Identifier'&&IDENT.test(p.key.name)&&!denied.has(p.key.name))||
          (p.key.type==='Literal'&&typeof p.key.value==='string'&&IDENT.test(p.key.value)&&!denied.has(p.key.value))))fail();
        if(read(p.value)===UI)fail();
      }
      return PURE;
    }
    if(node.type==='NewExpression'){
      if(node.callee?.type!=='Identifier'||node.callee.name!=='Window'||!canUseUnshadowedWindow()||locals.has('Window')||node.arguments.some(a=>a.type==='SpreadElement'))fail();
      for(const arg of node.arguments)if(read(arg)===UI)fail();
      windowConstructed++;
      return UI;
    }
    if(node.type==='CallExpression'){
      if(node.optional||node.callee?.type!=='MemberExpression'||node.callee.optional||node.arguments.some(a=>a.type==='SpreadElement'))fail();
      const method=staticKey(node.callee);
      if(!method||!['add',...UI_ACTIONS].includes(method))fail();
      if(read(node.callee.object)!==UI)fail();
      for(const arg of node.arguments)if(read(arg)===UI)fail();
      if(method==='show')showCalls++;
      return method==='add'?UI:PURE;
    }
    // Unknown expressions, implicit coercion, dynamic code, host reads,
    // arbitrary source calls and computed aliases cannot be certified.
    fail();
  }
  function assign(node){
    charge();
    if(node.type!=='AssignmentExpression'||node.operator!=='=')fail();
    const p=pathOf(node.left);
    if(p?.length===1&&!locals.has(p[0])){
      const current=snapshotRoot(p[0]);
      const after=read(node.right);
      if(!current.found||current.isRecord||after===PURE||after===UI||
        !Object.is(current.value,after))fail();
      idempotentWrites++;return;
    }
    if(!p||p.length!==2)fail();
    const [name,key]=p;
    if(locals.has(name)){
      if(read({type:'Identifier',name})!==UI||!CALLBACKS.has(key))fail();
      if(!['FunctionExpression','ArrowFunctionExpression'].includes(node.right.type))fail();
      callbacks++;return;
    }
    if(!proveInertRoot(name))fail();
    const root=snapshotRoot(name);
    if(!root.isRecord||!root.fields.has(key))fail();
    const before=root.fields.get(key);
    const after=read(node.right);
    if(after===UI){
      // UI handle creation must start from an empty, inert record branch.
      if(before!==null&&before!==undefined)fail();
      const full=name+'.'+key;
      if(uiFields.has(full))fail();
      uiFields.set(full,{root:name,field:key});
      uiBindings++;return;
    }
    if(after===PURE||typeof after==='object'&&after!==null)fail();
    if(!Object.is(before,after))fail();
    // This remains unmodified in the actual headless runtime.
    idempotentWrites++;
  }
  function statement(node){
    charge();
    if(node.type==='EmptyStatement')return;
    if(node.type==='VariableDeclaration'){
      for(const d of node.declarations){
        if(d.id.type!=='Identifier'||locals.has(d.id.name))fail();
        const value=d.init?read(d.init):undefined;
        locals.set(d.id.name,value);
      }
      return;
    }
    if(node.type==='ExpressionStatement'){
      if(node.expression.type==='AssignmentExpression'){assign(node.expression);return;}
      if(node.expression.type==='CallExpression'){const value=read(node.expression);if(value===UI)fail();return;}
    }
    // No loops, try/catch, conditional side effects, returns, throws or
    // source-function invocations are silently dropped.
    fail();
  }
  try {
    for(const s of body)statement(s);
    if(!windowConstructed||!showCalls)return null;

    const ownNode=fn.node;
    const name=fn.name;
    // No indirect/secondary calls to boot (including selected drawing code),
    // returned boot values, or other references to its binding may be ignored.
    if(!name||!IDENT.test(name))return null;
    for(const unit of ir.programs){
      for(const node of unit.ast.body){
        if(node===ownNode)continue;
        if(node.type==='ExpressionStatement'&&node.expression.type==='CallExpression'&&
          node.expression.callee?.type==='Identifier'&&node.expression.callee.name===name&&
          node.expression.arguments.length===0)continue;
        let hasRef=false;
        visit(node,(child,parent)=>{
          charge();
          if(child.type!=='Identifier'||child.name!==name)return;
          if(parent?.type==='FunctionDeclaration'&&parent.id===child)return;
          if(parent?.type==='MemberExpression'&&parent.property===child&&!parent.computed)return;
          hasRef=true;
        });
        if(hasRef)return null;
      }
    }

    if(uiFields.size){
      // Independently prove that the skipped UI handle fields cannot be read,
      // aliased or used as artwork values by any reachable source function.
      // This reuses R2's generic AST proof; it does not use caller hint names.
      const diag=createDiagnosticCertifier({
        ir,functions:sourceFunctions,isUnreachableUiBoot:node=>node===ownNode,
        isInertUiBranch:(root,field)=>{
          const p=uiFields.get(root+'.'+field);
          if(!p)return false;
          const x=snapshotRoot(root);
          return x.found&&x.isRecord&&x.fields.has(field)&&x.fields.get(field)===null;
        },
        spendWork:charge
      });
      const approvedUiReaders=new Set();
      for(const source of sourceFunctions){
        if(source.node===ownNode)continue;
        let touches=false;
        for(const p of uiFields.values()){
          if(references(source.node,p.root,p.field,charge))touches=true;
        }
        if(touches){
          if(!diag.certify(source))return null;
          approvedUiReaders.add(source.node);
        }
      }
      // Purely unused handle branches must still be proven unaliased:
      // a root reference not used as its static member base is disallowed,
      // and any computed dynamic field is conservatively rejected.
      for(const unit of ir.programs){
        let ambiguous=false;
        function inspect(node,parent=null,owner=null){
          if(ambiguous||!node||typeof node!=='object')return;
          if(node===ownNode)return;
          if(typeof node.type==='string'){
            charge();
            if(['FunctionDeclaration','FunctionExpression','ArrowFunctionExpression'].includes(node.type))
              owner=node;
            const parts=pathOf(node);
            if(parts&&uiFields.has(parts.slice(0,2).join('.'))&&!approvedUiReaders.has(owner)){
              ambiguous=true;return;
            }
            if(node.type==='Identifier'&&[...uiFields.values()].some(p=>p.root===node.name)){
              if(parent?.type==='VariableDeclarator'&&parent.id===node)return;
              if(parent?.type==='MemberExpression'&&parent.object===node){
                if(!pathOf(parent))ambiguous=true;
                return;
              }
              ambiguous=true;return;
            }
          }
          for(const [key,val] of Object.entries(node)){
            if(HIDDEN.has(key))continue;
            if(Array.isArray(val))for(const child of val)inspect(child,node,owner);
            else if(val&&typeof val==='object')inspect(val,node,owner);
          }
        }
        inspect(unit.ast);
        if(ambiguous)return null;
      }
    }
    return Object.freeze({
      kind:'AST_SCRIPTUI_IMMEDIATE_ARTWORK_EQUIVALENT',
      windowConstructions:windowConstructed,
      uiShowCalls:showCalls,
      isolatedUiBindings:uiBindings,
      registeredUninvokedCallbacks:callbacks,
      provenIdempotentWrites:idempotentWrites,
      sourceExecuted:false,artworkEffect:false
    });
  } catch(error){
    if(error?.message==='R3_BOOT_PROOF_UNAVAILABLE')return null;
    throw error;
  }
}
