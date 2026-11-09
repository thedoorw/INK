// This binding is installed only by trusted first-party Runtime composition.
// Named tools never accept a decoder, endpoint, token or Native document here.
// The same binding must be visible to bundled importers and the Runtime's
// separately loaded first-party bootstrap. A module-local WeakMap would split
// authority across those two module instances. Functions cannot enter via JSON.
const key=Symbol.for('INK_TRUSTED_NATIVE_ADOBE_ENGINE_V1');
export function bindAdobeNativeEngine(app,engine){
  if(!app||typeof app!=='object')throw new Error('INK_ADOBE_HOST_REQUIRED');
  if(engine===null){delete app[key];return;}
  if(engine?.schema!=='INK_ADOBE_NATIVE_ENGINE_V1'||engine.id!=='photoshopapi-0.9.1'||typeof engine.decode!=='function')
    throw new Error('INK_ADOBE_NATIVE_ENGINE_INVALID');
  const decode=engine.decode.bind(engine);
  Object.defineProperty(app,key,{value:Object.freeze({schema:engine.schema,id:engine.id,decode}),enumerable:false,configurable:true});
}
export const adobeNativeEngineFor=app=>app?.[key]||null;

// The native Illustrator engine must be injected by a trusted Node host; agent
// JSON/tool arguments cannot supply executable decoders or a source URL.
const illustratorKey=Symbol.for('INK_TRUSTED_ILLUSTRATOR_ENGINE_V1');
export function bindAdobeIllustratorEngine(app,engine){
 if(!app||typeof app!=='object')throw new Error('INK_ADOBE_HOST_REQUIRED');
 if(engine===null){delete app[illustratorKey];return;}
 if(engine?.schema!=='INK_ADOBE_NATIVE_ENGINE_V1'||!['create-design-ai-0.0.17','vectorcraft-ai-0.22.0'].includes(engine.id)||typeof engine.decode!=='function')
  throw new Error('INK_ILLUSTRATOR_NATIVE_ENGINE_INVALID');
 const decode=engine.decode.bind(engine);
 Object.defineProperty(app,illustratorKey,{value:Object.freeze({schema:engine.schema,id:engine.id,decode}),enumerable:false,configurable:true});
}
export const adobeIllustratorEngineFor=app=>app?.[illustratorKey]||null;
