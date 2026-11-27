import test from 'node:test';
import assert from 'node:assert/strict';
import {renderNewDocumentSizeDialog} from '../../src/ui/ink017/shared-controls.js';

test('New Document has the Native size-dialog structure without Native dependencies',()=>{
 const html=renderNewDocumentSizeDialog({ppiMin:36,ppiMax:2400,presetOptions:'<option value="0">A4</option>'});
 assert.match(html,/^<dialog class="ink-size-dialog" data-size-dialog="new"/);
 for(const field of ['width','height','units','ppi','lock'])
  assert.match(html,new RegExp('data-size-field="'+field+'"'));
 for(const action of ['data-size-swap','data-size-save-preset','data-size-apply','data-size-cancel'])
  assert.ok(html.includes(action),action);
 assert.ok(html.includes('min="36" max="2400"'));
 assert.ok(html.includes('<option value="0">A4</option>'));
 assert.doesNotMatch(html,/<script\b|on(?:click|load|error)\s*=/i);
});

test('New Document rejects invalid presentation-only bounds',()=>{
 assert.throws(()=>renderNewDocumentSizeDialog({ppiMin:2400,ppiMax:36}),/Invalid display-only/);
});
