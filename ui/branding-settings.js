(() => {
  'use strict';

  const ACTIVE_KEY = 'ink.web.branding.active.v1';
  const PRODUCT_DEFAULT_KEY = 'ink.web.branding.product-default.v1';
  const LOGO_MAX_BYTES = 768 * 1024;
  const FAVICON_MAX_BYTES = 256 * 1024;

  const els = {};
  let factoryBranding = null;
  let activeBranding = null;
  let bootstrapFactoryBranding = null;
  let bootstrapBranding = null;
  const BOOTSTRAP_STYLE_ID = 'ink-branding-bootstrap-style';

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function safeParse(raw) {
    if (!raw) return null;
    try {
      const value = JSON.parse(raw);
      return value && typeof value === 'object' ? value : null;
    } catch {
      return null;
    }
  }

  function readStored(key) {
    try { return safeParse(localStorage.getItem(key)); } catch { return null; }
  }

  function writeStored(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      setStatus('無法寫入本機偏好儲存空間', 'error');
      return false;
    }
  }

  function removeStored(key) {
    try { localStorage.removeItem(key); } catch {}
  }

  function normalize(value, fallback) {
    const source = value || {};
    const clean = {
      name: String(source.name || fallback.name || 'INK').trim().slice(0, 40) || 'INK',
      title: String(source.title || fallback.title || 'INK').trim().slice(0, 100) || 'INK',
      logo: String(source.logo || fallback.logo || ''),
      favicon: String(source.favicon || fallback.favicon || '')
    };
    if (!/^(?:assets\/|data:image\/)/i.test(clean.logo)) clean.logo = fallback.logo;
    if (!/^(?:assets\/|data:image\/)/i.test(clean.favicon)) clean.favicon = fallback.favicon;
    return clean;
  }

  function getProductDefault() {
    return normalize(readStored(PRODUCT_DEFAULT_KEY), factoryBranding);
  }

  function bootstrapFirstPaint() {
    if (document.readyState !== 'loading') return;
    const favicon = document.querySelector('link[rel~="icon"]');
    bootstrapFactoryBranding = {
      name: 'INK',
      title: document.title || 'INK',
      logo: 'assets/INK_MARK_SOURCE_W-300.jpg?v=0.1',
      favicon: favicon?.getAttribute('href') || 'assets/favicon.svg?v=0.1'
    };
    const stored = readStored(ACTIVE_KEY) || readStored(PRODUCT_DEFAULT_KEY);
    if (!stored) return;
    bootstrapBranding = normalize(stored, bootstrapFactoryBranding);
    document.title = bootstrapBranding.title;
    const appNameMeta = document.querySelector('meta[name="application-name"]');
    if (appNameMeta) appNameMeta.content = bootstrapBranding.name;
    if (favicon) favicon.href = bootstrapBranding.favicon;
    const style = document.createElement('style');
    style.id = BOOTSTRAP_STYLE_ID;
    style.textContent = '[data-brand-app-name],[data-brand-logo]{visibility:hidden}';
    document.head.appendChild(style);
  }

  bootstrapFirstPaint();

  function setStatus(message, state = 'ok') {
    if (!els.status) return;
    els.status.textContent = message;
    els.status.dataset.state = state;
  }

  function syncDialogFields(branding) {
    if (!els.nameInput) return;
    els.nameInput.value = branding.name;
    els.titleInput.value = branding.title;
    els.previewName.textContent = branding.name;
    els.previewTitle.textContent = branding.title;
    els.previewLogo.src = branding.logo;
  }

  function applyBranding(branding, { persist = false, status = '' } = {}) {
    const next = normalize(branding, factoryBranding);
    activeBranding = next;

    document.title = next.title;
    const appNameMeta = document.querySelector('meta[name="application-name"]');
    if (appNameMeta) appNameMeta.content = next.name;

    document.querySelectorAll('[data-brand-app-name]').forEach(node => { node.textContent = next.name; });
    document.querySelectorAll('[data-brand-logo]').forEach(img => { img.src = next.logo; });
    document.querySelectorAll('.menu-app-mark,.brand').forEach(node => {
      node.setAttribute('aria-label', next.name + ' · ' + next.title);
    });

    let favicon = document.querySelector('link[rel~="icon"]');
    if (!favicon) {
      favicon = document.createElement('link');
      favicon.rel = 'icon';
      document.head.appendChild(favicon);
    }
    favicon.href = next.favicon;

    syncDialogFields(next);
    if (persist) writeStored(ACTIVE_KEY, next);
    if (status) setStatus(status);
    globalThis.dispatchEvent(new CustomEvent('ink:branding-changed', { detail: clone(next) }));
    return next;
  }

  function applyDraftFromInputs() {
    const next = {
      ...activeBranding,
      name: els.nameInput.value,
      title: els.titleInput.value
    };
    applyBranding(next, { persist: true, status: '已即時套用並保存' });
  }

  function fileToDataUrl(file, maxBytes, label) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('未選擇檔案'));
      if (!String(file.type || '').startsWith('image/')) return reject(new Error(label + ' 必須是圖片檔'));
      if (file.size > maxBytes) return reject(new Error(label + ' 檔案過大'));
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('無法讀取 ' + label));
      reader.readAsDataURL(file);
    });
  }

  async function handleAsset(kind, file) {
    const isLogo = kind === 'logo';
    try {
      const dataUrl = await fileToDataUrl(file, isLogo ? LOGO_MAX_BYTES : FAVICON_MAX_BYTES, isLogo ? 'Logo' : 'Favicon');
      applyBranding({ ...activeBranding, [kind]: dataUrl }, {
        persist: true,
        status: (isLogo ? 'Logo' : 'Favicon') + ' 已即時套用並保存'
      });
    } catch (error) {
      setStatus(error?.message || '品牌圖檔無法使用', 'error');
    } finally {
      if (isLogo && els.logoInput) els.logoInput.value = '';
      else if (!isLogo && els.faviconInput) els.faviconInput.value = '';
    }
  }

  // Categorize the original, live controls. IDs, handlers and state owners survive
  // reparenting; no duplicated settings values or replacement persistence layer.
  const CATEGORIES = [
    ['general', '一般'], ['interface', '介面'], ['tools', '工具'],
    ['canvas', '畫布與輸入'], ['guides', '尺規／參考線／貼齊'],
    ['performance', '效能'], ['storage', '儲存'], ['branding', '品牌']
  ];
  let settingsMounted = false;
  let returnFocus = null;

  function showCategory(id = 'general') {
    const aliases = { paper: 'canvas', system: 'performance' };
    id = aliases[id] || id;
    const selected = CATEGORIES.some(([key]) => key === id) ? id : 'interface';
    document.querySelectorAll('[data-preference-page]').forEach(page => { page.hidden = page.dataset.preferencePage !== selected; });
    document.querySelectorAll('[data-preference-category]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.preferenceCategory === selected));
      button.setAttribute('aria-selected', String(button.dataset.preferenceCategory === selected));
    });
    els.dialog.dataset.category = selected;
    const layout = document.querySelector('#preferencesToolbarLayout');
    if (layout) layout.value = document.querySelector('#app')?.dataset.toolbarLayout || 'dual';
    const rulers = document.querySelector('#preferencesRulers');
    if (rulers) rulers.checked = document.querySelector('#app')?.dataset.rulers === 'true';
    const guides = document.querySelector('#preferencesGuides');
    if (guides) { const list = globalThis.INK_APP?.page?.()?.guides || []; guides.checked = list.some(guide => guide.visible !== false); guides.disabled = list.length === 0; }
    const renderCard = document.querySelector('#renderEngineCard');
    if (renderCard && selected === 'performance') renderCard.hidden = false;
  }

  function mountSettings() {
    if (settingsMounted || !globalThis.INK_APP) return;
    const content = document.querySelector('#preferencesContent');
    const nav = document.querySelector('#preferencesCategories');
    nav.setAttribute('role','tablist');
    nav.setAttribute('aria-orientation','vertical');
    const pages = new Map();
    for (const [id, label] of CATEGORIES) {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.preferenceCategory = id;
      button.textContent = label;
      button.setAttribute('aria-controls', 'preferences-' + id);
      button.setAttribute('role', 'tab');
      button.addEventListener('click', () => showCategory(id));
      nav.append(button);
      let page = document.querySelector('[data-preference-page="' + id + '"]');
      if (!page) {
        page = document.createElement('section');
        page.className = 'preferences-category';
        page.dataset.preferencePage = id;
        page.setAttribute('aria-label', label);
        content.append(page);
      }
      page.id = 'preferences-' + id;
      page.setAttribute('role','tabpanel');
      const heading = document.createElement('h2');
      heading.textContent = label;
      page.prepend(heading);
      pages.set(id, page);
    }
    const move = (id, category) => {
      const control = document.getElementById(id);
      if (!control) return;
      pages.get(category).append(control.closest('.control-row,.toggle-row,.button-row') || control);
    };
    // Re-home the original live controls. IDs, handlers and native state owners are preserved.
    const canvas = document.querySelector('#canvasSettings');
    for (const child of [...canvas.children]) if (!child.matches('.panel-header')) pages.get('canvas').append(child);
    for (const id of ['paperType', 'paperColor']) move(id, 'canvas');
    move('fingerDrawToggle', 'tools');
    for (const node of [...pages.get('canvas').querySelectorAll('.pen-calibration-title,.pen-calibration-actions,.pen-calibration-status')]) pages.get('tools').append(node);
    for (const id of ['penPressureMin', 'penPressureMax', 'penPressureGamma', 'penPressureSmoothing', 'penTiltSensitivity', 'penUsePredicted', 'penPalmRejection']) move(id, 'tools');
    pages.get('tools').append(document.querySelector('.pen-calibration-actions'), document.querySelector('#penCalibrationStatus'));
    for (const id of ['snapToggle', 'smartGuidesToggle', 'gridSnapToggle', 'gridSize', 'artboardUnit']) move(id, 'guides');
    move('resetViewBtn', 'general');
    move('historyLimit', 'general');
    for (const id of ['releaseHealthBtn', 'releaseHealthStatus']) move(id, 'performance');
    const render = document.querySelector('#renderEngineCard');
    if (render) { render.hidden = false; pages.get('performance').append(render); }
    for (const id of ['storageHealthBtn', 'storageHealthStatus', 'downloadDiagnosticsBtn', 'checkUpdateBtn', 'updateStatus']) move(id, 'storage');
    // Existing presentation authority remains toolbarLayoutToggle in web-shell.
    pages.get('interface').insertAdjacentHTML('beforeend', '<label class="control-row"><span>工具列欄數</span><select id="preferencesToolbarLayout"><option value="dual">雙欄</option><option value="single">單欄</option></select></label>');
    document.querySelector('#preferencesToolbarLayout').addEventListener('change', event => {
      if (document.querySelector('#app').dataset.toolbarLayout !== event.target.value) document.querySelector('#toolbarLayoutToggle').click();
    });
    pages.get('guides').insertAdjacentHTML('beforeend', '<label class="toggle-row"><input id="preferencesRulers" type="checkbox"><span>顯示尺規</span></label><label class="toggle-row"><input id="preferencesGuides" type="checkbox"><span>顯示參考線</span></label>');
    document.querySelector('#preferencesRulers').addEventListener('change', () => document.querySelector('[data-shell-action="toggle-rulers"]').click());
    document.querySelector('#preferencesGuides').addEventListener('change', () => document.querySelector('[data-ui-b-command="guides:toggle"]').click());
    // Remove technical English eyebrow duplicates in the normal settings chrome.
    content.querySelectorAll('.subpanel-title > span:not([id])').forEach(node => node.remove());
    canvas.hidden = true;
    settingsMounted = true;
    showCategory();
  }

  function openDialog(event) {
    mountSettings();
    returnFocus = document.activeElement;
    showCategory(event?.detail?.category || 'interface');
    els.dialog.hidden = false;
    syncDialogFields(activeBranding);
    setStatus('變更會即時預覽並自動保存');
    requestAnimationFrame(() => document.querySelector('[data-preference-category="' + els.dialog.dataset.category + '"]').focus());
  }

  function closeDialog() {
    els.dialog.hidden = true;
    returnFocus?.focus?.();
  }

  function bind() {
    els.dialog = document.getElementById('brandingSettingsDialog');
    els.close = document.getElementById('closeBrandingSettings');
    els.nameInput = document.getElementById('brandingAppName');
    els.titleInput = document.getElementById('brandingAppTitle');
    els.previewLogo = document.getElementById('brandingPreviewLogo');
    els.previewName = document.getElementById('brandingPreviewName');
    els.previewTitle = document.getElementById('brandingPreviewTitle');
    els.logoChoose = document.getElementById('brandingLogoChoose');
    els.logoInput = document.getElementById('brandingLogoInput');
    els.faviconChoose = document.getElementById('brandingFaviconChoose');
    els.faviconInput = document.getElementById('brandingFaviconInput');
    els.reset = document.getElementById('brandingReset');
    els.promote = document.getElementById('brandingPromoteDefault');
    els.restoreFactory = document.getElementById('brandingRestoreFactory');
    els.status = document.getElementById('brandingSettingsStatus');

    const favicon = document.querySelector('link[rel~="icon"]');
    factoryBranding = bootstrapFactoryBranding || {
      name: document.querySelector('[data-brand-app-name]')?.textContent?.trim() || 'INK',
      title: document.title || 'INK',
      logo: document.querySelector('[data-brand-logo]')?.getAttribute('src') || 'assets/INK_MARK_SOURCE_W-300.jpg?v=0.1',
      favicon: favicon?.getAttribute('href') || 'assets/favicon.svg?v=0.1'
    };
    const initial = normalize(bootstrapBranding || readStored(ACTIVE_KEY) || getProductDefault(), factoryBranding);
    applyBranding(initial);
    document.getElementById(BOOTSTRAP_STYLE_ID)?.remove();
    globalThis.INK_BRANDING_SETTINGS = Object.freeze({
      version:1,
      current:()=>clone(activeBranding),
      reapply:()=>applyBranding(activeBranding),
      apply:value=>applyBranding({...activeBranding,...value},{persist:true,status:'已保存'}),
      asset:(kind,file)=>handleAsset(kind,file),
      reset:()=>applyBranding(getProductDefault(),{persist:true,status:'已重設為產品預設'}),
      promote:()=>{const promoted=normalize(activeBranding,factoryBranding);writeStored(PRODUCT_DEFAULT_KEY,promoted);writeStored(ACTIVE_KEY,promoted);return clone(promoted);},
      restoreFactory:()=>{removeStored(PRODUCT_DEFAULT_KEY);removeStored(ACTIVE_KEY);return applyBranding(factoryBranding,{persist:true,status:'已恢復原廠 INK 品牌'});}
    });
    if (!els.dialog || !els.nameInput || !els.titleInput) return;
    els.close?.removeAttribute('title');

    globalThis.addEventListener('ink:branding-open', openDialog);
    globalThis.addEventListener('ink:runtime-ready', mountSettings, { once: true });
    mountSettings();
    els.close.addEventListener('click', closeDialog);
    els.dialog.addEventListener('click', event => {
      if (event.target === els.dialog) closeDialog();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Tab' && !els.dialog.hidden) {
        const focusable = [...els.dialog.querySelectorAll('button,input,select,textarea,[tabindex]')].filter(node => !node.disabled && node.getClientRects().length && node.tabIndex >= 0);
        const first = focusable[0], last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.key === 'Escape' && !els.dialog.hidden) {
        event.preventDefault();
        closeDialog();
      }
    });

    els.nameInput.addEventListener('input', applyDraftFromInputs);
    els.titleInput.addEventListener('input', applyDraftFromInputs);

    els.logoChoose.addEventListener('click', () => els.logoInput.click());
    els.faviconChoose.addEventListener('click', () => els.faviconInput.click());
    els.logoInput.addEventListener('change', () => handleAsset('logo', els.logoInput.files?.[0]));
    els.faviconInput.addEventListener('change', () => handleAsset('favicon', els.faviconInput.files?.[0]));

    els.reset.addEventListener('click', () => {
      applyBranding(getProductDefault(), { persist: true, status: '已重設為產品預設' });
    });

    els.promote.addEventListener('click', () => {
      const promoted = normalize(activeBranding, factoryBranding);
      if (writeStored(PRODUCT_DEFAULT_KEY, promoted)) {
        writeStored(ACTIVE_KEY, promoted);
        setStatus('目前品牌已設為產品預設');
      }
    });

    els.restoreFactory.addEventListener('click', () => {
      removeStored(PRODUCT_DEFAULT_KEY);
      removeStored(ACTIVE_KEY);
      applyBranding(factoryBranding, { persist: true, status: '已恢復原廠 INK 品牌' });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();
