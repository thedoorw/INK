// First-party configuration only. Client IDs are public configuration, not credentials.
// No registration, scope grant or token request happens without a real user's gesture.
export async function createDriveTokenProvider({clientId,globalObject=window,documentObject=document}={}){
  const fail=code=>{throw Object.assign(new Error(code),{code});};
  if(typeof clientId!=='string'||clientId.length>256||!/^[-A-Za-z0-9]+\.apps\.googleusercontent\.com$/.test(clientId))fail('INK_LINK_AUTH_CONFIGURATION_REQUIRED');
  if(!globalObject.google?.accounts?.oauth2){
    await new Promise((resolve,reject)=>{
      const script=documentObject.createElement('script');script.src='https://accounts.google.com/gsi/client';script.async=true;
      const timer=setTimeout(()=>{script.remove();reject(Object.assign(new Error('INK_LINK_AUTH_SDK_UNAVAILABLE'),{code:'INK_LINK_AUTH_SDK_UNAVAILABLE'}));},20000);
      script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);reject(Object.assign(new Error('INK_LINK_AUTH_SDK_UNAVAILABLE'),{code:'INK_LINK_AUTH_SDK_UNAVAILABLE'}));};
      documentObject.head.append(script);
    });
  }
  let token=null,expires=0,pending=null;
  const client=globalObject.google.accounts.oauth2.initTokenClient({client_id:clientId,
    scope:'https://www.googleapis.com/auth/drive.file',include_granted_scopes:false,
    callback:response=>{
      const request=pending;pending=null;if(!request)return;
      const granted=typeof response?.scope==='string'?response.scope.split(/\s+/):[];
      if(response?.error||typeof response?.access_token!=='string'||!response.access_token||/[\r\n]/.test(response.access_token)||!granted.includes('https://www.googleapis.com/auth/drive.file')){token=null;request.reject(Object.assign(new Error('INK_LINK_AUTH_REQUIRED'),{code:'INK_LINK_AUTH_REQUIRED'}));return;}
      token=response.access_token;expires=Date.now()+Math.max(0,Number(response.expires_in)||0)*1000-30000;request.resolve(token);
    },error_callback:()=>{const request=pending;pending=null;token=null;request?.reject(Object.assign(new Error('INK_LINK_AUTH_REQUIRED'),{code:'INK_LINK_AUTH_REQUIRED'}));}});
  return()=>{
    if(token&&Date.now()<expires)return Promise.resolve(token);
    if(pending)return Promise.reject(Object.assign(new Error('INK_LINK_AUTH_BUSY'),{code:'INK_LINK_AUTH_BUSY'}));
    return new Promise((resolve,reject)=>{pending={resolve,reject};try{client.requestAccessToken({prompt:''});}catch{pending=null;reject(Object.assign(new Error('INK_LINK_AUTH_REQUIRED'),{code:'INK_LINK_AUTH_REQUIRED'}));}});
  };
}
