const extensionOf = name => String(name || '').toLowerCase().match(/\.([^.]+)$/)?.[1] || '';
const ascii = bytes => {
  if (!bytes) return '';
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(source.slice(0, 4096), value => value >= 32 && value < 127 ? String.fromCharCode(value) : ' ').join('');
};

export const FORMAT_DEFINITIONS = Object.freeze([
  { id: 'PHOTOSHOP_ACTION', extensions: ['atn'], binary: true, sourceSoftware: 'Adobe Photoshop' },
  { id: 'PHOTOSHOP_JSX', extensions: ['jsx'], hints: [/photoshop/i, /artLayers|executeAction|ActionDescriptor|app\.activeDocument/i], sourceSoftware: 'Adobe Photoshop' },
  { id: 'ILLUSTRATOR_JSX', extensions: ['jsx', 'js'], hints: [/illustrator/i, /app\.activeDocument|\bactiveDocument\b|\bselection\b|pathItems|pathPoints|anchor|leftDirection|rightDirection|pointType|PathPointSelection|groupItems|artboards|ElementPlacement/i], sourceSoftware: 'Adobe Illustrator' },
  { id: 'SVG_EXTENSION', extensions: ['svg'], hints: [/<svg\b/i], sourceSoftware: 'SVG' },
  { id: 'INKSCAPE_EXTENSION_DESCRIPTOR', extensions: ['inx'], hints: [/<inkscape-extension\b/i], sourceSoftware: 'Inkscape' },
  { id: 'INKSCAPE_PYTHON_EXTENSION', extensions: ['py'], hints: [/\binkex\b|EffectExtension|self\.svg/i], sourceSoftware: 'Inkscape' },
  { id: 'GIMP_SCRIPT_FU', extensions: ['scm'], hints: [/script-fu|gimp-/i], sourceSoftware: 'GIMP' },
  { id: 'GIMP_PYTHON_PLUGIN', extensions: ['py'], hints: [/\bgimpfu\b|Gimp\.Procedure|pdb\./i], sourceSoftware: 'GIMP' },
  { id: 'KRITA_PYTHON_PLUGIN', extensions: ['py'], hints: [/\bkrita\b|Krita\.instance|Extension\b/i], sourceSoftware: 'Krita' },
  { id: 'CORELDRAW_MACRO', extensions: ['gms', 'bas', 'vba'], hints: [/CorelDRAW|ActiveDocument|ActiveLayer|ShapeRange/i], sourceSoftware: 'CorelDRAW' },
  { id: 'PAINTSHOP_PRO_SCRIPT', extensions: ['pspscript', 'py'], hints: [/PaintShop|App\.Do|ScriptProperties/i], sourceSoftware: 'PaintShop Pro' },
  { id: 'CLIP_STUDIO_AUTO_ACTION', extensions: ['sut', 'tos'], binary: true, sourceSoftware: 'Clip Studio Paint' },
  { id: 'COREL_PAINTER_SCRIPT', extensions: ['txt', 'script'], hints: [/Corel Painter|Recorded Script|Painter/i], sourceSoftware: 'Corel Painter' },
  { id: 'JSON_PROGRAM', extensions: ['json'], hints: [/^\s*[\[{]/], sourceSoftware: 'Generic JSON' },
  { id: 'XML_PROGRAM', extensions: ['xml'], hints: [/<\?xml|^\s*<[\w:-]+/], sourceSoftware: 'Generic XML' },
  { id: 'JAVASCRIPT_PROGRAM', extensions: ['js', 'mjs', 'html', 'htm'], hints: [/<script\b|\bfunction\b|=>/i], sourceSoftware: 'Generic JavaScript' },
  { id: 'PYTHON_PROGRAM', extensions: ['py'], sourceSoftware: 'Generic Python' },
  { id: 'TEXT_MACRO', extensions: ['macro', 'txt', 'csv', 'session'], sourceSoftware: 'Text Macro / Recorded Session' }
]);

export function detectFormat({ name = '', mimeType = '', text = '', bytes = null } = {}) {
  const extension = extensionOf(name);
  const sample = String(text || ascii(bytes));
  const candidates = [];
  for (const definition of FORMAT_DEFINITIONS) {
    let score = definition.extensions.includes(extension) ? 0.55 : 0;
    if (definition.binary && bytes) score += 0.15;
    for (const hint of definition.hints || []) if (hint.test(sample)) score += 0.25;
    if (definition.id === 'PHOTOSHOP_ACTION' && extension === 'atn' && bytes?.byteLength > 16) score += 0.2;
    if (definition.id === 'SVG_EXTENSION' && /image\/svg\+xml/i.test(mimeType)) score += 0.2;
    if (score > 0) candidates.push({ ...definition, score: Math.min(1, score) });
  }
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  const best = candidates[0] || { id: 'UNKNOWN', sourceSoftware: 'Unknown', binary: false, score: 0 };
  return {
    format: best.id,
    sourceSoftware: best.sourceSoftware,
    confidence: best.score,
    extension,
    binary: Boolean(best.binary),
    candidates: candidates.slice(0, 5).map(({ id, score, sourceSoftware }) => ({ id, score, sourceSoftware })),
    evidence: (best.hints || []).filter(hint => hint.test(sample)).map(hint => hint.source),
    status: best.score >= 0.5 ? 'DETECTED' : 'UNKNOWN'
  };
}
