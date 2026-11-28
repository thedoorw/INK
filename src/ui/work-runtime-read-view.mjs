// Public display-only presenter for the formal WORK/Recipe/translation menu.
// All tool allowlists, Native identities, proposalId consent, phase transitions
// and tool invocation remain in the protected work-runtime controller.
const TITLES=Object.freeze({
 'recipe-engine':'Recipe 引擎 — 既有 Recipe 清單',
 'recipe-workflow':'Recipe 匯入與執行',
 'translate-photoshop':'轉譯 Photoshop Action — 可讀文字',
 'translate-illustrator':'轉譯 Illustrator JSX',
 'translate-figma':'轉譯 Figma Skill',
 'translate-canva':'轉譯 Canva 資料集'
});

export function createWorkReadDialog(documentObject,{entry='recipe-workflow',titleText='Recipe 匯入與執行',tools=[]}={}){
 const root=documentObject.createElement('dialog');
 root.setAttribute('data-ink-work-read-controls','1');
 root.setAttribute('data-extension-entry',entry);
 const title=documentObject.createElement('h2');
 title.textContent=TITLES[entry]||titleText;
 const output=documentObject.createElement('pre');
 output.setAttribute('aria-live','polite');
 output.setAttribute('aria-label','WORK Native structured receipt');
 root.append(title);
 const buttons=new Map();
 for(const tool of tools){
  const button=documentObject.createElement('button');
  button.type='button';button.textContent=tool;
  button.setAttribute('data-read-tool',tool);root.append(button);
  buttons.set(tool,button);
 }
 const recipe=entry==='recipe-engine'?null:createWorkRecipeForm(documentObject);
 if(recipe)root.append(recipe.section);
 root.append(output);
 const close=documentObject.createElement('button');
 close.type='button';close.textContent='關閉 WORK Recipe 呼叫';
 root.append(close);
 return {root,output,buttons,close,recipe};
}

export function createWorkRecipeForm(doc){
 const section=doc.createElement('fieldset');
 const legend=doc.createElement('legend');
 legend.textContent='Recipe 分階段呼叫';
 const help=doc.createElement('p');
 help.textContent='先完成三個唯讀呼叫並確認測試文件。逐步輸入該階段 JSON；核准及執行僅限已取得授權的提案。';
 const label=doc.createElement('label');
 label.textContent='Recipe 階段輸入 JSON';
 const input=doc.createElement('textarea');
 input.setAttribute('aria-label','Recipe 階段輸入 JSON');
 input.rows=8;input.cols=60;input.value='{}';label.append(input);
 const consentLabel=doc.createElement('label');
 consentLabel.textContent='本次核准或執行的 proposalId';
 const consent=doc.createElement('input');
 consent.type='text';consent.autocomplete='off';
 consent.setAttribute('aria-label','本次核准或執行的 proposalId');
 consentLabel.append(consent);
 const state=doc.createElement('pre');
 state.setAttribute('aria-label','Recipe 呼叫狀態');
 state.setAttribute('aria-live','polite');
 section.append(legend,help,label,consentLabel);
 const buttons=new Map();
 for(const action of ['analyze','translate','propose','approve','execute']){
  const button=doc.createElement('button');
  button.type='button';button.textContent='Recipe '+action;
  section.append(button);buttons.set(action,button);
 }
 section.append(state);
 return {section,input,consent,state,buttons};
}

export function presentWorkRecipeState(node,displayState){
 node.textContent=JSON.stringify(displayState,null,2);
}
