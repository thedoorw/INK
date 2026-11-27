import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import vm from 'node:vm';

const root=resolve(import.meta.dirname,'../..');
const source=await readFile(join(root,'src/ui/branding-view.js'),'utf8');
const controller=await readFile(join(root,'src/ui/branding-settings.js'),'utf8');
const preview=await readFile(join(root,'preview/ink-ui-shared/preview-entry.js'),'utf8');

// A deliberately small DOM double: the shared view must be constructible
// without a browser, file system, network or storage. Native command tests
// separately supply spy adapters; Mock never receives those commands.
class Element {
 constructor(tag){
  this.tag=tag;this.attrs={};this.children=[];this.handlers=new Map();
  this.style={};this.hidden=false;this.value='';this.disabled=false;
  this.textContent='';this.clicks=0;
 }
 set className(value){this.attrs.class=value}
 get className(){return this.attrs.class||''}
 setAttribute(key,value){this.attrs[key]=String(value)}
 getAttribute(key){return this.attrs[key]??null}
 removeAttribute(key){delete this.attrs[key]}
 append(...nodes){this.children.push(...nodes)}
 remove(){this.removed=true}
 addEventListener(key,callback){
  const listeners=this.handlers.get(key)||[];listeners.push(callback);this.handlers.set(key,listeners);
 }
 fire(key,event={}){for(const handler of this.handlers.get(key)||[])handler(event)}
 focus(){this.focused=true}
 click(){this.clicks++;this.fire('click')}
}
function scene({native=false}={}){
 const requests=[],storage=[],links=[],exports=[],timers=[];
 const favicon={getAttribute:()=> 'assets/favicon.png?v=95de05792e06',setAttribute:()=>{}};
 const doc={title:'INK v0.1 · Web',readyState:'complete',body:new Element('body'),
  activeElement:null,createElement:tag=>new Element(tag),
  querySelector:selector=>selector==='link[rel~="icon"]'?favicon:null,
  querySelectorAll:()=>[],addEventListener:()=>{}};
 const events=new Map();
 const context={document:doc,console,
  addEventListener:(key,callback)=>events.set(key,callback),
  dispatchEvent:()=>{},
  fetch:async(url,options)=>{requests.push({url,options});return {ok:false}},
  localStorage:{getItem:key=>{storage.push(['get',key]);return null},
   removeItem:key=>storage.push(['remove',key])},
  URL:{createObjectURL:blob=>{exports.push(blob);return 'blob:unit-test'},revokeObjectURL:()=>{}},
  Blob:class {constructor(parts,options){this.parts=parts;this.options=options}},
  setTimeout:callback=>timers.push(callback)};
 context.window=context;
 vm.runInNewContext(source,context,{filename:'branding-view.js'});
 if(native)vm.runInNewContext(controller,context,{filename:'branding-settings.js'});
 return {context,doc,events,requests,storage,links,exports,timers};
}
const select=(node,predicate)=>{
 if(predicate(node))return node;
 for(const child of node.children){const found=select(child,predicate);if(found)return found}
 return null;
};
const attr=(root,key,value)=>select(root,node=>node.attrs[key]===value);
const serialize=node=>({tag:node.tag,attrs:node.attrs,text:node.textContent,
 children:node.children.map(serialize)});

test('pure Branding view uses exact Native controls and creates no IO',()=>{
 const {context,doc,requests,storage,exports}=scene();
 const view=context.INK_BRANDING_VIEW.createBrandingView({ownerUpload:'https://github.com/thedoorw/INK/upload/main/assets'});
 assert.equal(doc.body.children.length,0,'creating a view does not mount or fetch');
 assert.deepEqual([requests.length,storage.length,exports.length],[0,0,0]);
 assert.equal(view.backdrop.attrs.class,'ink-branding-backdrop');
 assert.equal(view.panel.attrs.role,'dialog');
 assert.equal(view.header.attrs.class,'dialog-header ink-branding-header');
 assert.equal(attr(view.backdrop,'id','inkBrandname'),view.nameInput);
 assert.equal(attr(view.backdrop,'id','inkBrandtitle'),view.titleInput);
 assert.equal(attr(view.backdrop,'id','inkBrandLogoFile'),view.logoInput);
 assert.equal(attr(view.backdrop,'data-ink-brand-choose','logo'),view.logoChoose);
 assert.equal(attr(view.backdrop,'data-ink-brand-owner-favicon',''),view.ownerLink);
 assert.equal(attr(view.backdrop,'data-ink-brand-public-candidate',''),view.candidateButton);
 assert.equal(attr(view.backdrop,'data-ink-brand-close',''),view.dismiss);
 assert.equal(view.logoInput.attrs.accept,'image/png,image/jpeg,image/webp,image/gif,image/svg+xml');
 assert.equal(view.logoInput.hidden,true);
 assert.equal(view.ownerLink.attrs.target,'_blank');
 assert.equal(view.ownerLink.attrs.rel,'noopener noreferrer');
 assert.match(JSON.stringify(serialize(view.backdrop)),/網站品牌設定/);
});

test('Native Branding still mounts the shared view and binds its original commands',()=>{
 const {context,doc,events,requests,storage,exports,timers}=scene({native:true});
 assert.equal(doc.body.children.length,1);
 const backdrop=doc.body.children[0];
 assert.equal(backdrop.hidden,true);
 assert.equal(requests.length,1,'Native still probes owner favicon; pure Mock does not');
 assert.equal(requests[0].options.method,'HEAD');
 assert.deepEqual(storage.map(row=>row[0]),['get']);
 events.get('ink:branding-open')();
 assert.equal(backdrop.hidden,false);
 const name=attr(backdrop,'id','inkBrandname');
 const candidate=attr(backdrop,'data-ink-brand-public-candidate','');
 assert.equal(name.value,'INK');
 assert.equal(candidate.disabled,true);
 name.value='New name';name.fire('input');
 assert.equal(candidate.disabled,false,'Native validates an edited candidate');
 candidate.click();
 assert.equal(exports.length,1,'Native export is still available');
 const downloaded=JSON.parse(exports[0].parts[0]);
 assert.equal(downloaded.metadata.name,'New name');
 assert.equal(downloaded.schema,'INK_SITE_BRANDING_CANDIDATE_V2');
 assert.equal(timers.length,1);
 const chooser=attr(backdrop,'data-ink-brand-choose','logo');
 const file=attr(backdrop,'id','inkBrandLogoFile');
 chooser.click();
 assert.equal(file.clicks,1,'Native retains logo file chooser');
 attr(backdrop,'data-ink-brand-clear','').click();
 assert.equal(name.value,'INK');
 assert.equal(candidate.disabled,true);
 assert.deepEqual(storage.map(row=>row[0]),['get','remove']);
 attr(backdrop,'data-ink-brand-close','').click();
 assert.equal(backdrop.hidden,true);
 assert.equal(typeof context.INK_BRANDING.getName,'function');
});

test('Mock uses that same Branding view with memory-only controls and no IO',()=>{
 const {context,doc,events,requests,storage,exports}=scene();
 const begin=preview.indexOf('function mountMockBrandingView(){');
 const end=preview.indexOf('\nasync function main(){',begin);
 assert.ok(begin>=0&&end>begin,'Mock must retain pure mount boundary');
 vm.runInNewContext(preview.slice(begin,end),context,{filename:'mock-branding.js'});
 const result=vm.runInNewContext('mountMockBrandingView()',context);
 assert.equal(doc.body.children.length,1);
 assert.equal(result.view.backdrop.hidden,true);
 assert.equal(result.view.logoChoose.disabled,true);
 assert.equal(result.view.logoInput.disabled,true);
 assert.equal(result.view.candidateButton.disabled,true);
 assert.equal(result.view.ownerLink.attrs['aria-disabled'],'true');
 let prevented=false;
 result.view.ownerLink.fire('click',{preventDefault(){prevented=true}});
 assert.equal(prevented,true);
 events.get('ink:branding-open')();
 assert.equal(result.view.backdrop.hidden,false);
 result.view.nameInput.value='Preview name';result.view.nameInput.fire('input');
 result.view.clearButton.click();
 assert.equal(result.view.nameInput.value,'INK');
 assert.equal(result.view.candidateButton.disabled,true);
 assert.equal(result.view.logoInput.clicks,0);
 assert.deepEqual([requests.length,storage.length,exports.length],[0,0,0],
  'Mock must never make Native owner HEAD/storage/file exports');
});
