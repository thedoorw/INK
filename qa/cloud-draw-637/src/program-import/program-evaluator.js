/*
 * Vendor-neutral, deterministic, bounded Program IR evaluator.
 * Source is represented exclusively as parsed AST values; source JS is never
 * invoked via eval, Function, vm, script tags, dynamic imports, or callbacks.
 * Deliberately no direct Document, History, Renderer or Recipe access.
 */
import {DeterministicRandom} from './expression-ir.js';
import {createDiagnosticCertifier} from './program-diagnostic-certifier.js';
import {certifyScriptUiBootImmediate} from './program-scriptui-boot-certifier.js';

export const PROGRAM_LIMITS=Object.freeze({
  work: 150000000, callDepth: 120, loopIterations: 3000000,
  collectionGrowth: 2000000, sourceOperations: 10000
});
const DENIED_KEYS=new Set(['__proto__','constructor']);
const BUILTIN=Symbol('INK trusted deterministic intrinsic');
const fail=(code)=>{throw Object.assign(new Error(code),{code});};
class RecordValue {
  constructor(ctor=null){this.fields=new Map();this.ctor=ctor;}
}
class FunctionValue {
  constructor(node,env,name=null){this.node=node;this.env=env;this.name=name;this.prototype=new RecordValue();}
}
class BuiltinValue {
  constructor(id,fn){this.id=id;this[BUILTIN]=fn;}
}
class Environment {
  constructor(parent=null,global=null){this.parent=parent;this.vars=new Map();this.global=global||(parent?parent.global:this);}
  get(name){
    if(this.vars.has(name))return this.vars.get(name);
    if(this.parent)return this.parent.get(name);
    fail('INK_PROGRAM_IDENTIFIER_UNBOUND:'+name);
  }
  has(name){return this.vars.has(name)||(this.parent?.has(name)??false);}
  declare(name,value){if(DENIED_KEYS.has(name))fail('INK_PROGRAM_IDENTIFIER_DENIED');this.vars.set(name,value);return value;}
  set(name,value){
    if(DENIED_KEYS.has(name))fail('INK_PROGRAM_IDENTIFIER_DENIED');
    if(this.vars.has(name)){this.vars.set(name,value);return value;}
    if(this.parent)return this.parent.set(name,value);
    // Legacy scripts sometimes use an implicit program-global (e.g. c_len).
    // This is only an inert variable in the session-local bounded environment.
    this.global.vars.set(name,value);
    return value;
  }
}
const own=(x,k)=>x instanceof RecordValue?x.fields.has(k):Array.isArray(x)?
 (k==='length'||Object.prototype.hasOwnProperty.call(x,k)):false;
const primitive=x=>x===null||['number','boolean','string','undefined'].includes(typeof x);
const isCallable=x=>x instanceof FunctionValue||x instanceof BuiltinValue;
const assertKey=k=>{
  const name=String(k);
  if(DENIED_KEYS.has(name))fail('INK_PROGRAM_PROPERTY_ESCAPE');
  if(name==='prototype')return name;
  if(name.length>2048)fail('INK_PROGRAM_PROPERTY_SIZE');
  return name;
};
export function evaluateBoundedProgram(ir,{
  seed=null,entrypoint=null,hostInputs={},diagnosticFunctions=[],limits=PROGRAM_LIMITS
}={}){
  if(ir?.format!=='INK-BOUNDED-PROGRAM-IR')fail('INK_PROGRAM_IR_REQUIRED');
  if(seed!==null&&(!Number.isFinite(seed)||typeof seed!=='number'))fail('INK_PROGRAM_SEED_INVALID');
  if(entrypoint!==null&&(!/^[A-Za-z_$][\w$]*$/.test(entrypoint)))fail('INK_PROGRAM_ENTRYPOINT_INVALID');
  if(Object.keys(limits).some(k=>!Object.hasOwn(PROGRAM_LIMITS,k)))fail('INK_PROGRAM_LIMIT_OVERRIDE_INVALID');
  const budget={work:0,callDepth:0,loopIterations:0,collectionGrowth:0};
  const rng=seed==null?null:new DeterministicRandom(seed);
  const operations=[],diagnostics=[],drawings=[];
  let diagnosticCertifier=null;
  const skippedUiBootNodes=new Set();
  const readonlyRecords=new WeakSet(),readonlyArrays=new WeakSet(),drawingState=new WeakMap(),colorKinds=new WeakMap(),layerOps=new WeakMap();
  const global=new Environment();
  const trusted=(id,fn)=>new BuiltinValue(id,fn);
  const tick=(n=1)=>{
    budget.work+=n;
    if(budget.work>limits.work)fail('INK_PROGRAM_WORK_BUDGET_EXCEEDED');
  };
  const grow=(n)=>{
    budget.collectionGrowth+=n;
    if(budget.collectionGrowth>limits.collectionGrowth)fail('INK_PROGRAM_COLLECTION_BUDGET_EXCEEDED');
  };
  const loop=()=>{
    tick();
    if(++budget.loopIterations>limits.loopIterations)fail('INK_PROGRAM_LOOP_BUDGET_EXCEEDED');
  };
  const record=(value={})=>{
    const r=new RecordValue();
    for(const [k,v] of Object.entries(value)){assertKey(k);r.fields.set(k,v);grow(1);}
    return r;
  };
  const propKeys=value=>{
    if(value instanceof RecordValue){
      const keys=[...value.fields.keys()];
      const numeric=keys.filter(k=>/^(0|[1-9]\d*)$/.test(k)&&Number(k)<4294967295).sort((a,b)=>Number(a)-Number(b));
      return numeric.concat(keys.filter(k=>!numeric.includes(k)));
    }
    if(Array.isArray(value))return Object.keys(value);
    if(typeof value==='string')return Array.from({length:value.length},(_,i)=>String(i));
    fail('INK_PROGRAM_FOR_IN_RECEIVER_DENIED');
  };
  const truth=x=>Boolean(x);
  const toNumber=x=>{
    if(!primitive(x))fail('INK_PROGRAM_NONPRIMITIVE_NUMBER');
    return Number(x);
  };
  const toString=x=>{
    if(x instanceof RecordValue)return '[object Object]';
    if(x instanceof FunctionValue)return '[source function]';
    if(Array.isArray(x))return x.map(v=>v==null?'':toString(v)).join(',');
    return String(x);
  };
  const wrapConstObject=data=>{
    if(!data||typeof data!=='object'||Array.isArray(data))return data;
    const r=new RecordValue();
    for(const [key,value] of Object.entries(data)){
      assertKey(key);
      r.fields.set(key,Array.isArray(value)?value.map(v=>wrapConstObject(v)):wrapConstObject(value));
      grow(1);
    }
    return r;
  };
  const math=record({PI:Math.PI,E:Math.E,LN2:Math.LN2,SQRT2:Math.SQRT2});
  for(const name of ['abs','acos','asin','atan','atan2','ceil','cos','exp','floor','log','max','min','pow','round','sin','sqrt','tan','trunc']){
    math.fields.set(name,trusted('Math.'+name,(args)=>{
      const numbers=args.map(toNumber);
      const n=Math[name](...numbers);
      return n;
    }));
  }
  math.fields.set('random',trusted('Math.random',()=>{
    if(!rng)fail('INK_PROGRAM_EXPLICIT_RANDOM_SEED_REQUIRED');
    return rng.next();
  }));
  global.declare('Math',math);
  global.declare('undefined',undefined);
  global.declare('NaN',NaN);
  global.declare('Infinity',Infinity);
  global.declare('isNaN',trusted('isNaN',([v])=>Number.isNaN(Number(v))));
  global.declare('isFinite',trusted('isFinite',([v])=>Number.isFinite(Number(v))));
  global.declare('parseInt',trusted('parseInt',([v,radix])=>Number.parseInt(toString(v),radix==null?10:toNumber(radix))));
  global.declare('parseFloat',trusted('parseFloat',([v])=>Number.parseFloat(toString(v))));
  global.declare('Number',trusted('Number',([v])=>toNumber(v)));
  global.declare('String',trusted('String',([v])=>toString(v)));
  global.declare('Boolean',trusted('Boolean',([v])=>truth(v)));
  global.declare('redraw',trusted('diagnostic.redraw',()=>{
    diagnostics.push({kind:'REDRAW_NO_ARTWORK'});return undefined;
  }));
  global.declare('alert',trusted('diagnostic.alert',(args)=>{
    diagnostics.push({kind:'USER_DIALOG_NON_ARTWORK',arguments:args.map(toString)});
    return undefined;
  }));
  const arrayMethods=(arr,key)=>{
    if(key==='push')return trusted('Array.push',(args)=>{tick(args.length);grow(args.length);return arr.push(...args);});
    if(key==='pop')return trusted('Array.pop',()=>arr.pop());
    if(key==='shift')return trusted('Array.shift',()=>arr.shift());
    if(key==='unshift')return trusted('Array.unshift',(args)=>{grow(args.length);return arr.unshift(...args);});
    if(key==='slice')return trusted('Array.slice',args=>{const a=arr.slice(...args.map(toNumber));grow(a.length);return a;});
    if(key==='splice')return trusted('Array.splice',args=>{
      const n=Math.max(0,args.length-2);grow(n);
      return arr.splice(...args);
    });
    if(key==='sort')return trusted('Array.sort',(args)=>{
      const compare=args[0];
      if(compare!==undefined&&!isCallable(compare))fail('INK_PROGRAM_SORT_CALLBACK_DENIED');
      arr.sort((a,b)=>compare===undefined?(toString(a)<toString(b)?-1:toString(a)>toString(b)?1:0):
        toNumber(call(compare,[a,b],undefined)));
      return arr;
    });
    if(key==='join')return trusted('Array.join',args=>arr.join(args[0]===undefined?',':toString(args[0])));
    if(key==='indexOf')return trusted('Array.indexOf',args=>arr.indexOf(args[0],args[1]||0));
    if(key==='reverse')return trusted('Array.reverse',()=>arr.reverse());
    if(key==='concat')return trusted('Array.concat',args=>{
      const next=arr.concat(...args);grow(next.length);return next;
    });
    return undefined;
  };
  const builtinArray=trusted('Array',args=>{
    if(args.length===1&&typeof args[0]==='number'){
      const length=args[0];
      if(!Number.isSafeInteger(length)||length<0||length>limits.collectionGrowth)fail('INK_PROGRAM_ARRAY_LENGTH_INVALID');
      grow(length);
      return new Array(length);
    }
    grow(args.length);return args.slice();
  });
  const builtinObject=trusted('Object',([v])=>v instanceof RecordValue?v:record());
  global.declare('Array',builtinArray);
  global.declare('Object',builtinObject);
  // Date is deliberately deterministic and isolated; no wall-clock reads.
  // This is valid only for observational/diagnostic timing, never artwork input.
  const date=trusted('Date',()=>record({getTime:trusted('Date.getTime',()=>0)}));
  global.declare('Date',date);
  diagnostics.push({kind:'TIME_EQUIVALENCE',semantics:'Date.getTime = 0; source wall-clock is not executed'});

  // First-party read-only Source Input facade and neutral drawing-intent records.
  // No source-created program value is a native Document/Layer/Path object.
  const frozen=value=>{
    if(Array.isArray(value)){
      const result=value.map(frozen);grow(result.length);readonlyArrays.add(result);return result;
    }
    if(value&&typeof value==='object'){
      const r=new RecordValue();
      for(const [k,v] of Object.entries(value)){
        assertKey(k);r.fields.set(k,frozen(v));grow(1);
      }
      readonlyRecords.add(r);return r;
    }
    if(!primitive(value))fail('INK_PROGRAM_HOST_INPUT_KIND_DENIED');
    return value;
  };
  const issue=(operation,category,parameters,target={},output={},status='DIRECT')=>{
    if(operations.length>=limits.sourceOperations)fail('INK_PROGRAM_OPERATION_BUDGET_EXCEEDED');
    const op={
      sourceSoftware:'Adobe Illustrator',sourceCommand:'bounded program drawing intent',
      operation,category,parameters,target,output,conversionStatus:status,
      deterministic:true,inkCapabilityMapping:operation,approvedApproximation:status==='APPROXIMATED',
      sourceEvidence:'AST-only evaluated intent; not Illustrator runtime execution'
    };
    operations.push(op);tick();return op;
  };
  let nextDrawing=0;
  const addDrawing=(type,attributes=null)=>{
    const id='program-path-'+(++nextDrawing);
    const r=new RecordValue(),state={id,type,done:false,attributes};
    drawingState.set(r,state);drawings.push(state);grow(1);
    if(type==='ellipse'&&attributes){
      issue('path.ellipse','Path',attributes,{kind:'canvas'},
        {kind:'path',sourceVariable:id,bindingKey:id});
      state.done=true;
    }
    return r;
  };
  const coord=n=>{
    if(typeof n!=='number'||!Number.isFinite(n))fail('INK_PROGRAM_GEOMETRY_NOT_FINITE');
    return n;
  };
  const toHex=n=>Math.max(0,Math.min(255,Math.round(n))).toString(16).padStart(2,'0');
  const colorHex=record=>{
    if(!(record instanceof RecordValue)||!colorKinds.has(record))
      fail('INK_PROGRAM_COLOR_RECORD_REQUIRED');
    const kind=colorKinds.get(record);
    const getC=k=>{const n=record.fields.get(k);if(typeof n!=='number'||!Number.isFinite(n))fail('INK_PROGRAM_COLOR_CHANNEL_INVALID');return n;};
    let rgb;
    if(kind==='RGB')rgb=['red','green','blue'].map(getC);
    else if(kind==='GRAY'){
      const g=getC('gray');
      if(g<0||g>100)fail('INK_PROGRAM_GRAY_RANGE');
      rgb=[255*(1-g/100),255*(1-g/100),255*(1-g/100)];
    }else{
      const [c,m,y,k]=['cyan','magenta','yellow','black'].map(getC);
      if([c,m,y,k].some(v=>v<0||v>100))fail('INK_PROGRAM_CMYK_RANGE');
      rgb=[c,m,y].map(v=>255*(1-v/100)*(1-k/100));
    }
    if(rgb.some(v=>v<0||v>255))fail('INK_PROGRAM_RGB_RANGE');
    return '#'+rgb.map(toHex).join('');
  };
  for(const kind of ['RGB','GRAY','CMYK']){
    const fields=kind==='RGB'?{red:0,green:0,blue:0}:kind==='GRAY'?{gray:0}:{cyan:0,magenta:0,yellow:0,black:0};
    global.declare(({RGB:'RGBColor',GRAY:'GrayColor',CMYK:'CMYKColor'})[kind],trusted(kind+'Color',()=>{
      const r=record(fields);colorKinds.set(r,kind);return r;
    }));
  }
  global.declare('DocumentPreset',trusted('DocumentPreset',()=>record({width:null,height:null,units:null})));
  global.declare('RulerUnits',frozen({Pixels:'Pixels',Points:'Points'}));
  global.declare('DocumentColorSpace',frozen({RGB:'RGB',CMYK:'CMYK'}));
  global.declare('ElementPlacement',frozen({PLACEATEND:'PLACEATEND'}));
  const groupItems=record({add:trusted('groupItems.add',()=>{
    const g=record({name:''});
    g.fields.set('move',trusted('group.move',()=>undefined));
    diagnostics.push({kind:'GROUP_ORGANIZATIONAL_EQUIVALENCE',artworkChange:false});
    return g;
  })});
  const pathItems=record();
  pathItems.fields.set('add',trusted('pathItems.add',()=>addDrawing('path')));
  pathItems.fields.set('ellipse',trusted('pathItems.ellipse',args=>{
    if(args.length!==4 && !(args.length===6&&typeof args[4]==='boolean'&&typeof args[5]==='boolean'))
      fail('INK_PROGRAM_ELLIPSE_ARGUMENTS');
    if(args.length===6)diagnostics.push({kind:'ELLIPSE_PATH_DIRECTION_EQUIVALENCE',sourceReverse:args[4],
      sourceInscribed:args[5],appearanceEquivalent:true});
    const [top,left,width,height]=args.slice(0,4).map(coord);
    if(width<=0||height<=0)fail('INK_PROGRAM_ELLIPSE_DIMENSIONS');
    return addDrawing('ellipse',{cx:left+width/2,cy:top-height/2,rx:width/2,ry:height/2,unit:'pt'});
  }));
  pathItems.fields.set('rectangle',trusted('pathItems.rectangle',args=>{
    if(args.length!==4)fail('INK_PROGRAM_RECTANGLE_ARGUMENTS');
    const [top,left,width,height]=args.map(coord);
    if(width<=0||height<=0)fail('INK_PROGRAM_RECTANGLE_DIMENSIONS');
    const r=addDrawing('rectangle',{x:left,y:top-height,width,height,unit:'pt'});
    const state=drawingState.get(r);state.done=true;
    issue('path.rectangle','Path',state.attributes,{kind:'canvas'},
      {kind:'path',sourceVariable:state.id,bindingKey:state.id});
    return r;
  }));
  const layers=record({add:trusted('layers.add',()=>{
    const layer=record({name:'Imported Program Layer',pathItems,groupItems});
    const op=issue('layer.create','Layer',{name:'Imported Program Layer'},{kind:'document'},{},'EQUIVALENT');
    layerOps.set(layer,op);
    diagnostics.push({kind:'LAYER_ORGANIZATIONAL_EQUIVALENCE',nativeAuthority:'existing Recipe'});
    return layer;
  })});
  const activeLayer=record({pathItems,groupItems});
  const hostDocument=record({
    selection:frozen(Array.isArray(hostInputs.selection)?hostInputs.selection:[]),
    pathItems,layers,activeLayer,
    documentColorSpace:hostInputs.document?.colorSpace==='CMYK'?'CMYK':'RGB'
  });
  readonlyRecords.add(hostDocument);
  const documents=record({
    length:hostInputs.document===null?0:1,
    addDocument:trusted('documents.addDocument',args=>{
      if(args.length!==2||!(args[1] instanceof RecordValue))
        fail('INK_PROGRAM_DOCUMENT_PRESET_REQUIRED');
      const preset=args[1],width=preset.fields.get('width'),height=preset.fields.get('height');
      if(typeof width!=='number'||typeof height!=='number'||
         width!==hostInputs.document?.width||height!==hostInputs.document?.height)
        fail('INK_PROGRAM_CURRENT_CONTAINER_MISMATCH');
      diagnostics.push({kind:'CURRENT_CONTAINER_EQUIVALENCE',source:'addDocument',width,height});
      return hostDocument;
    })
  });
  readonlyRecords.add(documents);
  const hostApp=record({documents,activeDocument:hostDocument,redraw:trusted('app.redraw',()=>{
    diagnostics.push({kind:'REDRAW_NO_ARTWORK'});return undefined;
  })});
  readonlyRecords.add(hostApp);
  for(const r of [pathItems,groupItems,layers,activeLayer])readonlyRecords.add(r);
  global.declare('app',hostApp);
  global.declare('activeDocument',hostDocument);

  const typename=x=>Array.isArray(x)?'Array':x instanceof RecordValue?'Object':typeof x;
  function get(object,key){
    tick();
    key=assertKey(key);

    if(drawingState.has(object)){
      const state=drawingState.get(object);
      if(key==='setEntirePath')return trusted('path.setEntirePath',args=>{
        if(state.type!=='path'||state.done||args.length!==1||!Array.isArray(args[0]))
          fail('INK_PROGRAM_SET_ENTIRE_PATH_INVALID');
        const points=args[0].map(p=>{
          if(!Array.isArray(p)||p.length!==2)fail('INK_PROGRAM_PATH_POINT_INVALID');
          return p.map(coord);
        });
        if(points.length<2||points.length>limits.collectionGrowth)fail('INK_PROGRAM_PATH_POINTS_LIMIT');
        state.points=points;
        state.done=true;
        issue('path.create','Path',{points,d:points.map(([x,y],i)=>(i?'L ':'M ')+x+' '+y).join(' '),closed:false,unit:'pt'},
          {kind:'canvas'},{kind:'path',sourceVariable:state.id,bindingKey:state.id});
        return undefined;
      });
      if(key==='typename')return 'PathItem';
    }

    if(object===null||object===undefined)fail('INK_PROGRAM_NULL_PROPERTY_READ');
    if(object instanceof BuiltinValue){
      if(object.id==='Number'&&Object.prototype.hasOwnProperty.call(
        {MIN_VALUE:Number.MIN_VALUE,MAX_VALUE:Number.MAX_VALUE,
         EPSILON:Number.EPSILON,POSITIVE_INFINITY:Infinity,NEGATIVE_INFINITY:-Infinity},key))
        return ({MIN_VALUE:Number.MIN_VALUE,MAX_VALUE:Number.MAX_VALUE,
          EPSILON:Number.EPSILON,POSITIVE_INFINITY:Infinity,NEGATIVE_INFINITY:-Infinity})[key];
      fail('INK_PROGRAM_BUILTIN_MEMBER_DENIED');
    }
    if(object instanceof FunctionValue){
      if(key==='prototype')return object.prototype;
      fail('INK_PROGRAM_FUNCTION_REFLECTION_DENIED');
    }
    if(object instanceof RecordValue){
      if(object.fields.has(key))return object.fields.get(key);
      let constructor=object.ctor;
      if(constructor instanceof FunctionValue){
        const p=constructor.prototype;
        if(p instanceof RecordValue&&p.fields.has(key))return p.fields.get(key);
      }
      return undefined;
    }
    if(Array.isArray(object)){
      if(readonlyArrays.has(object)&&['push','pop','shift','unshift','splice','sort','reverse'].includes(key))
        fail('INK_PROGRAM_READONLY_HOST_INPUT');
      if(key==='length')return object.length;
      if(/^(0|[1-9]\d*)$/.test(key))return object[Number(key)];
      return arrayMethods(object,key);
    }
    if(typeof object==='string'){
      if(key==='length')return object.length;
      if(/^(0|[1-9]\d*)$/.test(key))return object[Number(key)];
      if(key==='charAt')return trusted('String.charAt',([i])=>object.charAt(i||0));
      if(key==='slice')return trusted('String.slice',args=>object.slice(...args));
      if(key==='split')return trusted('String.split',([sep])=>{const arr=object.split(sep);grow(arr.length);return arr;});
      if(key==='indexOf')return trusted('String.indexOf',([needle])=>object.indexOf(toString(needle)));
      fail('INK_PROGRAM_STRING_METHOD_DENIED');
    }
    fail('INK_PROGRAM_MEMBER_RECEIVER_DENIED');
  }
  function set(object,key,value){
    tick();key=assertKey(key);

    if(readonlyRecords.has(object)||readonlyArrays.has(object))
      fail('INK_PROGRAM_READONLY_HOST_INPUT');
    if(drawingState.has(object)){
      const state=drawingState.get(object);
      if(!state.done)fail('INK_PROGRAM_PENDING_PATH_STYLE_DENIED');
      const attrs={};let status='EQUIVALENT';
      if(key==='closed'){if(typeof value!=='boolean')fail('INK_PROGRAM_PATH_CLOSED_BOOLEAN');attrs.closed=value;}
      else if(key==='filled'||key==='stroked'){
        if(typeof value!=='boolean')fail('INK_PROGRAM_PAINT_FLAG_BOOLEAN');
        attrs[key]=value;
      }
      else if(key==='strokeWidth'){if(typeof value!=='number'||value<0||!Number.isFinite(value))fail('INK_PROGRAM_STROKE_WIDTH');attrs.strokeWidth=value;}
      else if(key==='opacity'){if(typeof value!=='number'||value<0||value>100)fail('INK_PROGRAM_OPACITY');attrs.opacity=value/100;}
      else if(key==='fillColor'||key==='strokeColor'){attrs[key==='fillColor'?'fill':'stroke']=colorHex(value);status='APPROXIMATED';}
      else fail('INK_PROGRAM_DRAWING_PROPERTY_DENIED:'+key);
      issue('style.apply','Path',attrs,{kind:'path',sourceBinding:state.id},{},status);
      return value;
    }
    if(layerOps.has(object)&&key==='name'){
      if(typeof value!=='string'||value.length>120)fail('INK_PROGRAM_LAYER_NAME_INVALID');
      layerOps.get(object).parameters.name=value;
    }

    if(object instanceof FunctionValue&&key==='prototype'){
      if(!(value instanceof RecordValue))fail('INK_PROGRAM_PROTOTYPE_RECORD_REQUIRED');
      object.prototype=value;return value;
    }
    if(object instanceof RecordValue){
      if(key==='prototype')fail('INK_PROGRAM_INSTANCE_PROTOTYPE_DENIED');
      if(!object.fields.has(key))grow(1);
      object.fields.set(key,value);return value;
    }
    if(Array.isArray(object)){
      if(key==='length'){
        const n=toNumber(value);
        if(!Number.isSafeInteger(n)||n<0||n>limits.collectionGrowth)fail('INK_PROGRAM_ARRAY_LENGTH_INVALID');
        grow(Math.max(0,n-object.length));object.length=n;return n;
      }
      if(!/^(0|[1-9]\d*)$/.test(key))fail('INK_PROGRAM_ARRAY_MEMBER_WRITE_DENIED');
      const index=Number(key);
      if(index>limits.collectionGrowth)fail('INK_PROGRAM_ARRAY_INDEX_LIMIT');
      grow(Math.max(0,index+1-object.length));object[index]=value;return value;
    }
    fail('INK_PROGRAM_MEMBER_ASSIGNMENT_DENIED');
  }
  function del(object,key){
    tick();key=assertKey(key);
    if(readonlyRecords.has(object)||readonlyArrays.has(object)||drawingState.has(object))fail('INK_PROGRAM_DELETE_HOST_DENIED');
    if(object instanceof RecordValue){object.fields.delete(key);return true;}
    if(Array.isArray(object)&&/^\d+$/.test(key)){delete object[Number(key)];return true;}
    fail('INK_PROGRAM_DELETE_TARGET_DENIED');
  }
  function ref(node,env,context){
    if(node.type==='Identifier')return {
      read:()=>env.get(node.name),
      write:x=>env.set(node.name,x),
      remove:()=>fail('INK_PROGRAM_DELETE_BINDING_DENIED')
    };
    if(node.type==='MemberExpression'){
      const object=expr(node.object,env,{...context,discarded:false}),key=node.computed?expr(node.property,env,{...context,discarded:false}):node.property.name;
      return{read:()=>get(object,key),write:x=>set(object,key,x),remove:()=>del(object,key),receiver:object};
    }
    fail('INK_PROGRAM_ASSIGN_TARGET_DENIED');
  }
  function perform(op,a,b){
    tick();
    if(op==='===')return a===b;
    if(op==='!==')return a!==b;
    if(op==='==')return a==b; // operands are inert, never arbitrary JS objects with prototype coercions
    if(op==='!=')return a!=b;
    if(op==='in')return own(b,assertKey(a));
    if(op==='instanceof')return a instanceof RecordValue&&b instanceof FunctionValue&&a.ctor===b;
    if(op==='+'&&typeof a==='string'||op==='+'&&typeof b==='string')return toString(a)+toString(b);
    if(!primitive(a)||!primitive(b))fail('INK_PROGRAM_ARITHMETIC_KIND_DENIED');
    switch(op){
      case '+':return a+b; case '-':return a-b;case '*':return a*b;case '/':return a/b;
      case '%':return a%b;case '**':return a**b;
      case '<':return a<b;case '>':return a>b;case '<=':return a<=b;case '>=':return a>=b;
      case '&':return a&b;case '|':return a|b;case '^':return a^b;
      case '<<':return a<<b;case '>>':return a>>b;case '>>>':return a>>>b;
      default:fail('INK_PROGRAM_BINARY_OPERATOR_DENIED:'+op);
    }
  }
  function callableValue(n,env,context){
    if(n.type==='MemberExpression'){
      const r=ref(n,env,context);return{fn:r.read(),receiver:r.receiver};
    }
    return{fn:expr(n,env,{...context,discarded:false}),receiver:undefined};
  }
  function call(fn,args,thisVal,callContext={}){
    tick();
    if(fn instanceof BuiltinValue)return fn[BUILTIN](args);
    if(!(fn instanceof FunctionValue))fail('INK_PROGRAM_CALL_TARGET_DENIED');
    // Caller names only nominate a function for source-derived proof.
    // Never skip source execution without a complete AST/reachable graph
    // certificate AND a discarded result (otherwise normal evaluation).
    if(diagnosticFunctions.includes(fn.name)&&callContext?.discarded===true){
      if(!diagnosticCertifier){
        diagnosticCertifier=createDiagnosticCertifier({
          ir,
          functions:[...global.vars.values()].filter(v=>v instanceof FunctionValue),
          isInertUiBranch:(root,field)=>{
            if(!global.has(root))return false;
            const host=global.get(root);
            return host instanceof RecordValue&&!readonlyRecords.has(host)&&
              host.fields.has(field)&&host.fields.get(field)===null;
          },
          // Only actual source UI launch invocations excluded by the
          // selected entrypoint may be removed from artwork-read analysis.
          // If the same boot function is referenced elsewhere it is reachable.
          isUnreachableUiBoot:node=>{
            if(!skippedUiBootNodes.has(node))return false;
            const boot=[...global.vars.entries()].find(([name,v])=>v instanceof FunctionValue&&v.node===node);
            if(!boot)return false;
            const bootName=boot[0];
            let reachable=false;
            function check(node,parent=null){
              if(reachable||!node||typeof node!=='object')return;
              tick();
              if(node.type==='Identifier'&&node.name===bootName){
                if(parent?.type==='FunctionDeclaration'&&parent.id===node)return;
                if(parent?.type==='MemberExpression'&&parent.property===node&&!parent.computed)return;
                reachable=true;return;
              }
              for(const [k,v] of Object.entries(node)){
                if(['start','end','raw','loc','range'].includes(k))continue;
                if(Array.isArray(v))for(const child of v)check(child,node);
                else if(v&&typeof v==='object')check(v,node);
              }
            }
            for(const program of ir.programs){
              for(const statement of program.ast.body){
                // This one top-level boot launch was explicitly excluded.
                if(statement.type==='ExpressionStatement'&&
                   statement.expression.type==='CallExpression'&&
                   statement.expression.callee.type==='Identifier'&&
                   statement.expression.callee.name===bootName)continue;
                check(statement);
              }
            }
            return !reachable;
          },
          spendWork:tick
        });
      }
      const proof=diagnosticCertifier.certify(fn);
      if(proof){
        diagnostics.push({kind:'DIAGNOSTIC_FUNCTION_EQUIVALENCE',name:fn.name,args:args.map(toString),
          certification:proof.kind,certifiedSourceFunctions:proof.certifiedSourceFunctions,
          sinkCount:proof.sinkCount,artworkEffect:false,sourceBodySkipped:true});
        tick();return undefined;
      }
      diagnostics.push({kind:'DIAGNOSTIC_HINT_UNCERTIFIED_EXECUTED',name:fn.name,sourceBodySkipped:false});
    }

    if(budget.callDepth>=limits.callDepth)fail('INK_PROGRAM_CALL_DEPTH_EXCEEDED');
    budget.callDepth++;
    try{
      const frame=new Environment(fn.env);
      frame.declare('this',thisVal);
      const names=fn.node.params;
      if(names.some(p=>p.type!=='Identifier'))fail('INK_PROGRAM_PARAMETER_PATTERN_DENIED');
      for(let i=0;i<names.length;i++)frame.declare(names[i].name,args[i]);
      if(fn.node.type==='ArrowFunctionExpression'&&fn.node.body.type!=='BlockStatement')
        return expr(fn.node.body,frame,{});
      const result=executeStatements(fn.node.body.body,frame,{});
      if(result?.flow==='return')return result.value;
      if(result)fail('INK_PROGRAM_CONTROL_ESCAPE');
      return undefined;
    }finally{budget.callDepth--;}
  }
  function expr(n,env,context={}){
    tick();
    if(!n) return undefined;
    switch(n.type){
      case 'Literal':
        if(n.regex||n.bigint)fail('INK_PROGRAM_LITERAL_DENIED');
        return n.value;
      case 'Identifier':return env.get(n.name);
      case 'ThisExpression':return env.get('this');
      case 'ArrayExpression':{
        const a=n.elements.map(x=>x?expr(x,env,context):undefined);
        grow(a.length);return a;
      }
      case 'ObjectExpression':{
        const r=new RecordValue();
        for(const p of n.properties){
          if(p.type!=='Property'||p.kind!=='init'||p.method||p.shorthand&&p.value.type!=='Identifier'||p.type==='SpreadElement')
            fail('INK_PROGRAM_OBJECT_PROPERTY_DENIED');
          const key=p.computed?expr(p.key,env,context):p.key.type==='Identifier'?p.key.name:p.key.value;
          set(r,key,expr(p.value,env,context));
        }
        return r;
      }
      case 'FunctionExpression':case 'ArrowFunctionExpression':
        return new FunctionValue(n,env,n.id?.name||null);
      case 'UnaryExpression':{
        if(n.operator==='delete'){const r=ref(n.argument,env,context);return r.remove();}
        const x=expr(n.argument,env,context);
        if(n.operator==='!')return !truth(x);
        if(n.operator==='typeof')return x instanceof FunctionValue||x instanceof BuiltinValue?'function':typename(x);
        if(n.operator==='void')return undefined;
        if(n.operator==='+')return +toNumber(x);
        if(n.operator==='-')return -toNumber(x);
        if(n.operator==='~')return ~toNumber(x);
        fail('INK_PROGRAM_UNARY_DENIED');
      }
      case 'BinaryExpression':return perform(n.operator,expr(n.left,env,context),expr(n.right,env,context));
      case 'LogicalExpression':{
        const a=expr(n.left,env,context);
        if(n.operator==='&&')return truth(a)?expr(n.right,env,context):a;
        if(n.operator==='||')return truth(a)?a:expr(n.right,env,context);
        if(n.operator==='??')return a==null?expr(n.right,env,context):a;
        fail('INK_PROGRAM_LOGICAL_DENIED');
      }
      case 'ConditionalExpression':return truth(expr(n.test,env,context))?
        expr(n.consequent,env,context):expr(n.alternate,env,context);
      case 'SequenceExpression':{
        let v;for(const x of n.expressions)v=expr(x,env,context);return v;
      }
      case 'MemberExpression':return ref(n,env,context).read();
      case 'AssignmentExpression':{
        const r=ref(n.left,env,context);
        const b=expr(n.right,env,context);
        if(n.operator==='=')return r.write(b);
        if(n.operator==='&&=')return r.write(truth(r.read())?b:r.read());
        if(n.operator==='||=')return r.write(truth(r.read())?r.read():b);
        return r.write(perform(n.operator.slice(0,-1),r.read(),b));
      }
      case 'UpdateExpression':{
        const r=ref(n.argument,env,context),old=toNumber(r.read());
        const next=old+(n.operator==='++'?1:n.operator==='--'?-1:0);
        r.write(next);return n.prefix?next:old;
      }
      case 'CallExpression':{
        if(n.optional)fail('INK_PROGRAM_OPTIONAL_CALL_DENIED');
        const target=callableValue(n.callee,env,context);
        const args=n.arguments.map(x=>{if(x.type==='SpreadElement')fail('INK_PROGRAM_SPREAD_DENIED');return expr(x,env,{...context,discarded:false});});
        return call(target.fn,args,target.receiver,{discarded:context.discarded===true});
      }
      case 'NewExpression':{
        const ctor=expr(n.callee,env,context),args=n.arguments.map(x=>expr(x,env,context));
        if(ctor instanceof BuiltinValue)return call(ctor,args,undefined);
        if(!(ctor instanceof FunctionValue))fail('INK_PROGRAM_CONSTRUCTOR_DENIED');
        const object=new RecordValue(ctor);grow(1);
        const v=call(ctor,args,object);
        return v instanceof RecordValue?v:object;
      }
      default:fail('INK_PROGRAM_EXPRESSION_DENIED:'+n.type);
    }
  }
  function hoist(list,env){
    for(const item of list)if(item.type==='FunctionDeclaration'){
      if(!item.id||item.id.type!=='Identifier')fail('INK_PROGRAM_FUNCTION_NAME_REQUIRED');
      env.declare(item.id.name,new FunctionValue(item,env,item.id.name));
    }
  }
  function statement(n,env,context={}){
    tick();
    switch(n.type){
      case 'EmptyStatement':return null;
      case 'FunctionDeclaration':return null;
      case 'VariableDeclaration':{
        for(const d of n.declarations){
          if(d.id.type!=='Identifier')fail('INK_PROGRAM_DESTRUCTURING_DENIED');
          const value=d.init?expr(d.init,env,context):undefined;
          env.declare(d.id.name,value);
        }return null;
      }
      case 'ExpressionStatement':expr(n.expression,env,n.expression.type==='CallExpression'?{...context,discarded:true}:context);return null;
      case 'ReturnStatement':return{flow:'return',value:n.argument?expr(n.argument,env,context):undefined};
      case 'BreakStatement':return{flow:'break'};
      case 'ContinueStatement':return{flow:'continue'};
      case 'BlockStatement':return executeStatements(n.body,env,context);
      case 'IfStatement':return truth(expr(n.test,env,context))?
        statement(n.consequent,env,context):n.alternate?statement(n.alternate,env,context):null;
      case 'WhileStatement':{
        while(truth(expr(n.test,env,context))){
          loop();const result=statement(n.body,env,context);
          if(result?.flow==='return')return result;
          if(result?.flow==='break')break;
        }return null;
      }
      case 'DoWhileStatement':{
        do{
          loop();const result=statement(n.body,env,context);
          if(result?.flow==='return')return result;
          if(result?.flow==='break')break;
        }while(truth(expr(n.test,env,context)));
        return null;
      }
      case 'ForStatement':{
        if(n.init){
          if(n.init.type==='VariableDeclaration')statement(n.init,env,context);
          else expr(n.init,env,context);
        }
        while(!n.test||truth(expr(n.test,env,context))){
          loop();const result=statement(n.body,env,context);
          if(result?.flow==='return')return result;
          if(result?.flow==='break')break;
          if(n.update)expr(n.update,env,context);
        }return null;
      }
      case 'ForInStatement':{
        const source=expr(n.right,env,context),keys=propKeys(source);
        for(const key of keys){
          loop();
          if(n.left.type==='VariableDeclaration'){
            if(n.left.declarations.length!==1||n.left.declarations[0].id.type!=='Identifier')
              fail('INK_PROGRAM_FOR_IN_TARGET_DENIED');
            env.set(n.left.declarations[0].id.name,key);
          }else ref(n.left,env,context).write(key);
          const result=statement(n.body,env,context);
          if(result?.flow==='return')return result;
          if(result?.flow==='break')break;
        }return null;
      }
      case 'ThrowStatement':fail('INK_PROGRAM_SOURCE_THROW');
      default:fail('INK_PROGRAM_STATEMENT_DENIED:'+n.type);
    }
  }
  function executeStatements(list,env,context={}){
    hoist(list,env);
    for(const n of list){
      const result=statement(n,env,context);
      if(result)return result;
    }return null;
  }
  // R3 source-derived immediate-effect/selected-artwork-equivalence certificate.
  // A Window/show shape alone NEVER authorizes a silent skip.
  function certifiedScriptUiBoot(fn,topLevelCall){
    if(!(fn instanceof FunctionValue))return null;
    return certifyScriptUiBootImmediate({
      fn,callNode:topLevelCall,ir,selectedEntrypoint:entrypoint,
      sourceFunctions:[...global.vars.values()].filter(v=>v instanceof FunctionValue),
      snapshotRoot:name=>{
        if(!global.vars.has(name))return{found:false};
        const value=global.vars.get(name);
        return{found:true,value,isRecord:value instanceof RecordValue&&
          !readonlyRecords.has(value)&&!drawingState.has(value)&&!layerOps.has(value),
          fields:value instanceof RecordValue?value.fields:null};
      },
      canUseUnshadowedWindow:()=>!global.has('Window'),
      proveInertRoot:name=>{
        const value=global.vars.get(name);
        return value instanceof RecordValue&&!readonlyRecords.has(value)&&
          !drawingState.has(value)&&!layerOps.has(value)&&
          [...global.vars.entries()].filter(([key,v])=>v===value).length===1;
      },
      charge:tick
    });
  }

  // Program declarations and source-local globals precede explicit entrypoint.
  // For an explicit entrypoint, top-level invocations are explicitly reported
  // as bypassed boot calls, not silently represented as executed.
  for(const program of ir.programs)hoist(program.ast.body,global);
  for(const program of ir.programs){
    for(const node of program.ast.body){
      if(node.type==='FunctionDeclaration'||node.type==='EmptyStatement')continue;
      if(entrypoint && node.type==='ExpressionStatement'&&node.expression.type==='CallExpression'&&
        node.expression.callee.type==='Identifier'&&global.has(node.expression.callee.name)){
        const name=node.expression.callee.name;
        const candidate=global.get(name);
        const bootProof=name===entrypoint?null:certifiedScriptUiBoot(candidate,node.expression);
        if(name===entrypoint || bootProof){
          if(bootProof)skippedUiBootNodes.add(candidate.node);
          diagnostics.push({kind:name===entrypoint?'EXPLICIT_ENTRYPOINT_LAUNCH_COLLAPSED':'UNSELECTED_TOP_LEVEL_CALL',
            name,source:program.name,offset:node.start,executed:false,
            certification:name===entrypoint?'explicit-single-entrypoint':'AST-ScriptUI-boot',
            ...(bootProof?{
              immediateEffectProof:bootProof.kind,sourceBodySkipped:true,
              provenIdempotentWrites:bootProof.provenIdempotentWrites,
              isolatedUiBindings:bootProof.isolatedUiBindings,
              registeredUninvokedCallbacks:bootProof.registeredUninvokedCallbacks,
              windowConstructions:bootProof.windowConstructions,
              uiShowCalls:bootProof.uiShowCalls,
              artworkEffect:false
            }:null)});
          continue;
        }
      }
      const result=statement(node,global,{});
      if(result)fail('INK_PROGRAM_TOP_LEVEL_CONTROL_DENIED');
    }
  }
  if(entrypoint){
    const fn=global.get(entrypoint);
    if(!(fn instanceof FunctionValue))fail('INK_PROGRAM_ENTRYPOINT_NOT_DECLARED');
    call(fn,[],undefined);
  }
  for(const state of drawings)if(!state.done)fail('INK_PROGRAM_UNFINISHED_PATH');
  return Object.freeze({
    status:'EVALUATED',irFormat:ir.format,sourceExecuted:false,
    nativeMutation:false,operations,diagnostics,budget:{...budget},
    environment:global
  });
}
