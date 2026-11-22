import { canonicalProgram } from './canonical-operation.js';

const clone = value => JSON.parse(JSON.stringify(value));
const unique = values => [...new Set(values.filter(Boolean))];
const lineAt = (text, offset) => String(text).slice(0, Math.max(0, offset || 0)).split(/\r?\n/).length;
const evidence = (text, match, label = 'source') => [{ label, line: lineAt(text, match.index), excerpt: match[0].slice(0, 180) }];

const JS_COMMAND_MAP = Object.freeze({
  make: ['Object', 'object.create', 'PARTIAL'],
  set: ['Object', 'object.set', 'PARTIAL'],
  select: ['Selection', 'selection.set', 'EQUIVALENT'],
  inverse: ['Selection', 'selection.invert', 'DIRECT'],
  fill: ['Fill', 'fill.apply', 'DIRECT'],
  duplicate: ['Object', 'object.duplicate', 'EQUIVALENT'],
  move: ['Transform', 'transform.translate', 'EQUIVALENT'],
  rotate: ['Transform', 'transform.rotate', 'DIRECT'],
  transform: ['Transform', 'transform.matrix', 'DIRECT'],
  levels: ['Adjustment', 'adjustment.levels', 'DIRECT'],
  curves: ['Adjustment', 'adjustment.curves', 'DIRECT'],
  hueSaturation: ['Adjustment', 'adjustment.hueSaturation', 'DIRECT'],
  gaussianBlur: ['Filter', 'filter.gaussianBlur', 'DIRECT'],
  sharpen: ['Filter', 'filter.sharpen', 'DIRECT'],
  highPass: ['Filter', 'filter.highPass', 'DIRECT'],
  findEdges: ['Filter', 'filter.edgeDetection', 'EQUIVALENT'],
  addNoise: ['Filter', 'filter.noiseGrain', 'EQUIVALENT'],
  groupEvent: ['Group', 'group.create', 'EQUIVALENT'],
  mergeLayersNew: ['Layer', 'layer.merge', 'PARTIAL'],
  hide: ['Layer', 'layer.visibility', 'DIRECT'],
  show: ['Layer', 'layer.visibility', 'DIRECT'],
  delete: ['Object', 'object.delete', 'PARTIAL'],
  copyEvent: ['Object', 'object.copy', 'PARTIAL'],
  paste: ['Object', 'object.paste', 'PARTIAL'],
  close: ['Document', 'document.close', 'MANUAL STEP REQUIRED'],
  save: ['Export', 'export.file', 'PARTIAL']
});

const directPatterns = [
  [/\.pathItems\.add\s*\(/g, 'Path', 'path.create', 'PARTIAL'],
  [/\.setEntirePath\s*\(/g, 'Path', 'path.setAnchors', 'PARTIAL'],
  [/\.(?:beginPath|moveTo|lineTo|bezierCurveTo|quadraticCurveTo)\s*\(/g, 'Path', 'path.canvasCommand', 'PARTIAL'],
  [/\.(?:closePath)\s*\(/g, 'Path', 'path.close', 'EQUIVALENT'],
  [/\.(?:stroke)\s*\(/g, 'Stroke', 'stroke.apply', 'PARTIAL'],
  [/\.groupItems\.add\s*\(/g, 'Group', 'group.create', 'DIRECT'],
  [/\.layers\.add\s*\(|\.artLayers\.add\s*\(/g, 'Layer', 'layer.create', 'DIRECT'],
  [/\.duplicate\s*\(/g, 'Object', 'object.duplicate', 'EQUIVALENT'],
  [/\.rotate\s*\(/g, 'Transform', 'transform.rotate', 'PARTIAL'],
  [/\.resize\s*\(/g, 'Transform', 'transform.scale', 'PARTIAL'],
  [/\.translate\s*\(/g, 'Transform', 'transform.translate', 'PARTIAL'],
  [/\.opacity\s*=/g, 'Blend', 'blend.opacity', 'DIRECT'],
  [/\.blendMode\s*=/g, 'Blend', 'blend.mode', 'DIRECT'],
  [/\.selection\.selectAll\s*\(/g, 'Selection', 'selection.all', 'DIRECT'],
  [/\.selection\.deselect\s*\(/g, 'Selection', 'selection.clear', 'DIRECT'],
  [/\.selection\.invert\s*\(/g, 'Selection', 'selection.invert', 'DIRECT'],
  [/\.selection\.feather\s*\(/g, 'Selection', 'selection.feather', 'DIRECT'],
  [/\.selection\.expand\s*\(/g, 'Selection', 'selection.expand', 'DIRECT'],
  [/\.selection\.contract\s*\(/g, 'Selection', 'selection.contract', 'DIRECT'],
  [/\.applyGaussianBlur\s*\(/g, 'Filter', 'filter.gaussianBlur', 'DIRECT'],
  [/\.applySharpen\s*\(/g, 'Filter', 'filter.sharpen', 'DIRECT'],
  [/\.adjustLevels\s*\(/g, 'Adjustment', 'adjustment.levels', 'DIRECT'],
  [/\.adjustCurves\s*\(/g, 'Adjustment', 'adjustment.curves', 'DIRECT'],
  [/\.adjustHueSaturation\s*\(/g, 'Adjustment', 'adjustment.hueSaturation', 'DIRECT'],
  [/\.exportDocument\s*\(|\.saveAs\s*\(/g, 'Export', 'export.file', 'PARTIAL'],
  [/\bfor\s*\(|\bwhile\s*\(/g, 'Loop', 'control.loop', 'PARTIAL'],
  [/\bif\s*\(/g, 'Conditional', 'control.conditional', 'PARTIAL'],
  [/\b(prompt|confirm|Window)\s*\(/g, 'User Input', 'input.user', 'MANUAL STEP REQUIRED']
];

function jsOperation({ text, match, category, canonicalOperation, conversionStatus, sourceSoftware, sourceCommand = null, parameters = {} }) {
  const deterministic = !/random|noise/i.test(match[0]);
  return {
    sourceSoftware,
    sourceCommand: sourceCommand || match[0].trim(),
    canonicalOperation,
    category,
    parameters,
    expectedStateChange: { operation: canonicalOperation },
    outputState: {},
    destructive: /delete|remove|merge|flatten|close/i.test(canonicalOperation),
    deterministic,
    inkCapabilityMapping: conversionStatus === 'REJECTED' ? null : canonicalOperation,
    fallbackCandidate: conversionStatus === 'PARTIAL' ? 'manual parameter review' : null,
    confidence: conversionStatus === 'DIRECT' ? 0.94 : conversionStatus === 'EQUIVALENT' ? 0.82 : 0.62,
    evidence: evidence(text, match),
    unsupportedReason: conversionStatus === 'MANUAL STEP REQUIRED' ? 'source requires interactive user input' : null,
    conversionStatus
  };
}

export function parseJavaScript({ text, detection, metadata }) {
  const sourceSoftware = detection.sourceSoftware;
  const operations = [];
  const seen = new Set();
  const append = operation => {
    const key = `${operation.canonicalOperation}:${operation.evidence?.[0]?.line}:${operation.sourceCommand}`;
    if (!seen.has(key)) { seen.add(key); operations.push(operation); }
  };

  const executeAction = /executeAction\s*\(\s*(?:sTID|stringIDToTypeID|cTID|charIDToTypeID)\s*\(\s*['\"]([^'\"]+)['\"]\s*\)/g;
  for (const match of text.matchAll(executeAction)) {
    const command = match[1];
    const mapped = JS_COMMAND_MAP[command] || ['External Dependency', `vendor.${command}`, 'PARTIAL'];
    const parameters = command === 'hide' ? { visible: false } : command === 'show' ? { visible: true } : {};
    append(jsOperation({ text, match, category: mapped[0], canonicalOperation: mapped[1], conversionStatus: mapped[2], sourceSoftware, sourceCommand: command, parameters }));
  }
  for (const match of text.matchAll(/\.(translate|rotate|resize)\s*\(\s*(-?\d+(?:\.\d+)?)\s*(?:,\s*(-?\d+(?:\.\d+)?))?/g)) {
    const command = match[1], canonicalOperation = command === 'translate' ? 'transform.translate' : command === 'rotate' ? 'transform.rotate' : 'transform.scale';
    const parameters = command === 'translate' ? { x: +match[2], y: +(match[3] || 0) } : command === 'rotate' ? { angle: +match[2] } : { scaleX: +match[2] / 100, scaleY: +(match[3] || match[2]) / 100 };
    append(jsOperation({ text, match, category: 'Transform', canonicalOperation, conversionStatus: 'DIRECT', sourceSoftware, parameters }));
  }
  for (const match of text.matchAll(/\.pathItems\.(ellipse|rectangle)\s*\(([^)]*)\)/g)) {
    const shape = match[1], args = match[2].split(',').map(value => value.trim()).filter(Boolean);
    const [top='0', left='0', width='10', height='10'] = args;
    const parameters = shape === 'ellipse'
      ? { cx: { $expr: `(${left}) + (${width}) / 2` }, cy: { $expr: `(${top}) + (${height}) / 2` }, rx: { $expr: `abs(${width}) / 2` }, ry: { $expr: `abs(${height}) / 2` }, illustratorBounds: { top, left, width, height } }
      : { x: { $expr: left }, y: { $expr: top }, width: { $expr: width }, height: { $expr: height }, illustratorBounds: { top, left, width, height } };
    append(jsOperation({ text, match, category: 'Path', canonicalOperation: `path.${shape}`, conversionStatus: 'DIRECT', sourceSoftware, sourceCommand: `pathItems.${shape}`, parameters }));
  }
  for (const match of text.matchAll(/Math\.(sin|cos)\s*\(([^)]*)\)|Math\.PI|Math\.random\s*\(\s*\)/g)) {
    const expression = match[0], deterministic = !/random/.test(expression);
    const operation = jsOperation({ text, match, category: 'Expression', canonicalOperation: 'expression.evaluate', conversionStatus: deterministic ? 'DIRECT' : 'EQUIVALENT', sourceSoftware, sourceCommand: expression, parameters: { expression, seedRequired: !deterministic } });
    operation.deterministic = deterministic; operation.fallbackCandidate = deterministic ? null : 'deterministic seed'; append(operation);
  }
  for (const [pattern, category, canonicalOperation, conversionStatus] of directPatterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) append(jsOperation({ text, match, category, canonicalOperation, conversionStatus, sourceSoftware }));
  }
  for (const match of text.matchAll(/\b([A-Za-z_$][\w$]*)\.fill\s*\(/g)) {
    const receiver = match[1];
    if (receiver === 'brush') continue;
    const prefix = text.slice(Math.max(0, match.index - 1200), match.index), assignments = [...prefix.matchAll(new RegExp(`\\b${receiver}\\.fillStyle\\s*=\\s*["']([^"']+)["']`, 'g'))], color = assignments.at(-1)?.[1] || null;
    append(jsOperation({ text, match, category: 'Fill', canonicalOperation: 'fill.apply', conversionStatus: color ? 'EQUIVALENT' : 'PARTIAL', sourceSoftware, parameters: color ? { color } : {} }));
  }

  if (/function\s+circular\b/i.test(text) && /\.duplicate\s*\(|notCopies/i.test(text) && /\.rotate\s*\(/i.test(text)) {
    const match = /function\s+circular\b/i.exec(text);
    append(jsOperation({ text, match, category: 'Loop', canonicalOperation: 'repeat.radial', conversionStatus: /Math\.random/.test(text) ? 'APPROXIMATED' : 'EQUIVALENT', sourceSoftware, sourceCommand: 'circular()', parameters: { count: 'copies', angleStart: 'angleStart', angleEnd: 'angleEnd', seedRequired: /Math\.random/.test(text) } }));
  }
  if (/\.griddder\s*=\s*function|function\s+griddder/i.test(text)) {
    const match = /(?:\.griddder\s*=\s*function|function\s+griddder)/i.exec(text);
    append(jsOperation({ text, match, category: 'Loop', canonicalOperation: 'repeat.grid', conversionStatus: 'EQUIVALENT', sourceSoftware, sourceCommand: 'griddder()', parameters: { columns: 'columns', rows: 'rows', gutter: 'gutter' } }));
  }
  if (/\bbrush\.(?:line|flowLine|beginStroke|stroke)\s*\(/i.test(text)) {
    for (const match of text.matchAll(/\bbrush\.(line|flowLine|beginStroke|stroke)\s*\(/gi)) append(jsOperation({ text, match, category: 'Brush Stroke', canonicalOperation: 'brush.stroke', conversionStatus: 'EQUIVALENT', sourceSoftware: 'p5.brush', sourceCommand: match[1], parameters: { workflow: 'programmatic stroke' } }));
  }
  if (/\bbrush\.(?:fill|hatch|bleed)\s*\(/i.test(text)) {
    for (const match of text.matchAll(/\bbrush\.(fill|hatch|bleed)\s*\(/gi)) append(jsOperation({ text, match, category: 'Texture', canonicalOperation: 'texture.brushFill', conversionStatus: 'APPROXIMATED', sourceSoftware: 'p5.brush', sourceCommand: match[1], parameters: { workflow: 'procedural media fill' } }));
  }

  if (/function\s+knotHandles\b/i.test(text) && /leftDirection\s*=/.test(text) && /rightDirection\s*=/.test(text) && /function\s+calculatePos\b/i.test(text)) {
    const match = /function\s+knotHandles\b/i.exec(text);
    const promptMatch = text.match(/prompt\s*\(\s*["']([^"']+)["']\s*,\s*["']([^"']+)["']/i);
    append(jsOperation({ text, match, category: 'PathPoint', canonicalOperation: 'illustrator.pathpoint.fleurify', conversionStatus: 'DIRECT', sourceSoftware: 'Adobe Illustrator', sourceCommand: 'knotHandles()', parameters: {
      behaviorId: 'FLEURIFY_OUTLINE_FROM_CLOSED_PATH',
      percentage: { type: 'number', default: Number(promptMatch?.[2] || 100), min: 0, max: 200, unit: 'percent', validation: 'finite-number' },
      anchorInvariant: true, closedPathRequired: true, selectedPointMode: 'ANCHORPOINT',
      controlFlow: ['for', 'if', 'array-index', 'previous-next-cyclic-index', 'function-call', 'math']
    } }));
  }

  const isFleurify = operations.some(operation => operation.canonicalOperation === 'illustrator.pathpoint.fleurify');
  if (isFleurify) operations.splice(0, operations.length, ...operations.filter(operation => operation.canonicalOperation === 'illustrator.pathpoint.fleurify'));

  const dependencies = unique([
    ...Array.from(text.matchAll(/#include\s+['\"]([^'\"]+)['\"]/g), match => match[1]),
    ...Array.from(text.matchAll(/require\s*\(\s*['\"]([^'\"]+)['\"]\s*\)/g), match => match[1]),
    ...Array.from(text.matchAll(/import\s+.*?from\s+['\"]([^'\"]+)['\"]/g), match => match[1]),
    /ActionDescriptor|executeAction/.test(text) ? 'Adobe Action Manager API' : null,
    /pathItems|pathPoints|leftDirection|rightDirection|PathPointSelection|groupItems|artboards/.test(text) ? 'Adobe Illustrator DOM' : null,
    /artLayers|BlendMode|executeAction|ActionDescriptor/.test(text) ? 'Adobe Photoshop DOM' : null
  ]);
  return canonicalProgram({ source: metadata.source, metadata, operations, dependencies, warnings: operations.length ? [] : ['no supported JavaScript operations identified'] });
}

const PY_PATTERNS = [
  [/add_argument\s*\(\s*['\"]--([^'\"]+)/g, 'User Input', 'input.parameter', 'DIRECT'],
  [/\.add\s*\(/g, 'Object', 'object.add', 'PARTIAL'],
  [/\.append\s*\(/g, 'Group', 'group.append', 'PARTIAL'],
  [/\.translate\s*\(|translate_2d/g, 'Transform', 'transform.translate', 'DIRECT'],
  [/\.rotate\s*\(/g, 'Transform', 'transform.rotate', 'DIRECT'],
  [/\.scale\s*\(/g, 'Transform', 'transform.scale', 'DIRECT'],
  [/create_mesh\s*\(/g, 'Path', 'path.createMesh', 'EQUIVALENT'],
  [/\bfor\s+.+\s+in\s+/g, 'Loop', 'control.loop', 'PARTIAL'],
  [/\bif\s+.+:/g, 'Conditional', 'control.conditional', 'PARTIAL'],
  [/pdb\.gimp_selection_invert|\.selection\.invert/g, 'Selection', 'selection.invert', 'DIRECT'],
  [/gaussian|blur/gi, 'Filter', 'filter.gaussianBlur', 'PARTIAL'],
  [/sharpen/gi, 'Filter', 'filter.sharpen', 'PARTIAL'],
  [/paintLine|freehand|brush/gi, 'Brush Stroke', 'brush.stroke', 'PARTIAL']
];

export function parsePython({ text, detection, metadata }) {
  const operations = [];
  const seen = new Set();
  for (const [pattern, category, canonicalOperation, conversionStatus] of PY_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const key = `${canonicalOperation}:${lineAt(text, match.index)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      operations.push({
        sourceSoftware: detection.sourceSoftware,
        sourceCommand: match[0].trim(), canonicalOperation, category,
        parameters: match[1] ? { name: match[1] } : {},
        expectedStateChange: { operation: canonicalOperation }, outputState: {}, destructive: false,
        deterministic: !/random|noise/i.test(match[0]), inkCapabilityMapping: canonicalOperation,
        fallbackCandidate: conversionStatus === 'PARTIAL' ? 'manual parameter review' : null,
        confidence: conversionStatus === 'DIRECT' ? 0.9 : conversionStatus === 'EQUIVALENT' ? 0.8 : 0.58,
        evidence: evidence(text, match), unsupportedReason: null, conversionStatus
      });
    }
  }
  const dependencies = unique([
    ...Array.from(text.matchAll(/^\s*(?:from|import)\s+([\w.]+)/gm), match => match[1]),
    /\binkex\b/.test(text) ? 'Inkscape inkex API' : null,
    /\bgimpfu\b|Gimp\.Procedure/.test(text) ? 'GIMP Python API' : null,
    /Krita\.instance|from krita/.test(text) ? 'Krita Python API' : null
  ]);
  return canonicalProgram({ source: metadata.source, metadata, operations, dependencies, warnings: operations.length ? [] : ['no supported Python operations identified'] });
}

export function parseSVG({ text, detection, metadata }) {
  const operations = [];
  const tagMap = {
    svg: ['Document', 'document.create', 'DIRECT'], g: ['Group', 'group.create', 'DIRECT'],
    path: ['Path', 'path.create', 'DIRECT'], rect: ['Path', 'path.rectangle', 'DIRECT'],
    circle: ['Path', 'path.ellipse', 'DIRECT'], ellipse: ['Path', 'path.ellipse', 'DIRECT'],
    polygon: ['Path', 'path.polygon', 'DIRECT'], polyline: ['Path', 'path.polyline', 'DIRECT'],
    linearGradient: ['Gradient', 'gradient.linear', 'DIRECT'], radialGradient: ['Gradient', 'gradient.radial', 'DIRECT'],
    clipPath: ['Mask', 'mask.clippingPath', 'DIRECT'], mask: ['Mask', 'mask.vector', 'DIRECT'],
    use: ['Object', 'object.instance', 'EQUIVALENT'], image: ['Import', 'import.raster', 'PARTIAL'],
    text: ['Object', 'object.text', 'PARTIAL'], filter: ['Filter', 'filter.svg', 'PARTIAL']
  };
  for (const match of text.matchAll(/<\s*(svg|g|path|rect|circle|ellipse|polygon|polyline|linearGradient|radialGradient|clipPath|mask|use|image|text|filter)\b([^>]*)>/gi)) {
    const tag = Object.keys(tagMap).find(value => value.toLowerCase() === match[1].toLowerCase()) || match[1];
    const [category, canonicalOperation, conversionStatus] = tagMap[tag];
    const attributes = Object.fromEntries(Array.from(match[2].matchAll(/([\w:-]+)\s*=\s*['\"]([^'\"]*)['\"]/g), value => [value[1], value[2]]));
    operations.push({
      sourceSoftware: detection.sourceSoftware, sourceCommand: `<${tag}>`, canonicalOperation, category,
      target: { kind: tag, id: attributes.id || null }, parameters: attributes,
      expectedStateChange: { create: tag }, outputState: { editable: !['image', 'filter'].includes(tag) }, destructive: false,
      deterministic: true, inkCapabilityMapping: canonicalOperation,
      fallbackCandidate: conversionStatus === 'PARTIAL' ? 'preserve source element and warn' : null,
      confidence: conversionStatus === 'DIRECT' ? 0.98 : conversionStatus === 'EQUIVALENT' ? 0.86 : 0.66,
      evidence: evidence(text, match, 'xml element'), unsupportedReason: conversionStatus === 'PARTIAL' ? 'subset of SVG semantics supported' : null, conversionStatus
    });
  }
  const dependencies = unique(Array.from(text.matchAll(/(?:href|xlink:href)\s*=\s*['\"]([^#][^'\"]*)['\"]/g), match => match[1]));
  return canonicalProgram({ source: metadata.source, metadata, operations, dependencies, warnings: operations.length ? [] : ['SVG has no recognized editable elements'] });
}

function operationFromJSON(step, index, sourceSoftware) {
  const command = step?.op || step?.operation || step?.command || step?._obj || step?.action || step?.type || `step-${index}`;
  const widgets = step?.widgets_values || [];
  let semantic = null;
  if (/^LoadImage$/i.test(command)) semantic = ['Import', 'import.raster', 'PARTIAL', { source: widgets[0] }];
  else if (/^SaveImage$/i.test(command)) semantic = ['Export', 'export.file', 'PARTIAL', { destination: widgets[0] }];
  else if (/PreviewImage|MaskPreview/i.test(command)) semantic = ['Export', 'snapshot.create', 'EQUIVALENT', {}];
  else if (/ImageBlend/i.test(command)) semantic = ['Blend', 'blend.mode', 'EQUIVALENT', { enabled: widgets[0] !== false, blendMode: widgets[1] || 'normal', opacity: Number(widgets[2] ?? 100) / 100 }];
  else if (/AutoAdjust/i.test(command)) semantic = ['Adjustment', 'adjustment.apply', 'EQUIVALENT', { type: 'brightnessContrast', amount: Number(widgets[0] ?? 0) }];
  else if (/Hue.?Saturation/i.test(command)) semantic = ['Adjustment', 'adjustment.hueSaturation', 'EQUIVALENT', { hue: Number(widgets[0] ?? 0), saturation: Number(widgets[1] ?? 0) }];
  else if (/Gaussian|Blur/i.test(command)) semantic = ['Filter', 'filter.gaussianBlur', 'EQUIVALENT', { radius: Number(widgets.find(value => typeof value === 'number') ?? 1) }];
  else if (/Sharpen/i.test(command)) semantic = ['Filter', 'filter.sharpen', 'EQUIVALENT', { amount: Number(widgets.find(value => typeof value === 'number') ?? 1) }];
  else if (/MaskGradient|CreateGradientMask/i.test(command)) semantic = ['Mask', 'mask.gradient', 'APPROXIMATED', { direction: widgets.find(value => typeof value === 'string') || 'vertical', feather: Number(widgets.find(value => typeof value === 'number') ?? 0) }];
  else if (/LayerStyle:\s*Stroke/i.test(command)) semantic = ['Stroke', 'stroke.apply', 'EQUIVALENT', { blendMode: widgets[1] || 'normal', opacity: Number(widgets[2] ?? 100) / 100, width: Number(widgets[4] ?? 1), color: widgets.find(value => typeof value === 'string' && /^#/.test(value)) || '#000000' }];
  else if (/RoundedRectangle/i.test(command)) semantic = ['Path', 'path.rectangle', 'EQUIVALENT', { width: Number(widgets[0] ?? 100), height: Number(widgets[0] ?? 100), radius: Number(widgets[1] ?? 0) }];
  else if (/If\s*$|SwitchCase|BooleanOperator/i.test(command)) semantic = ['Conditional', 'control.conditional', 'PARTIAL', { operator: widgets[0] }];
  const mapped = semantic || JS_COMMAND_MAP[command] || ({
    layer: ['Layer', 'layer.create', 'DIRECT'], mask: ['Mask', 'mask.vector', 'DIRECT'],
    style: ['Fill', 'style.apply', 'DIRECT'], adjustment: ['Adjustment', 'adjustment.apply', 'DIRECT'],
    filter: ['Filter', 'filter.apply', 'DIRECT'], texture: ['Texture', 'texture.apply', 'DIRECT'],
    boolean: ['Boolean', 'boolean.apply', 'DIRECT'], repeat: ['Loop', 'repeat.apply', 'DIRECT'],
    paint: ['Brush Stroke', 'brush.stroke', 'DIRECT'], export: ['Export', 'export.file', 'PARTIAL']
  }[command] || ['External Dependency', `external.${command}`, 'PARTIAL']);
  return {
    sourceSoftware, sourceCommand: command, canonicalOperation: mapped[1], category: mapped[0],
    target: clone(step?.target || { nodeId: step?.id || null }), parameters: clone(mapped[3] || step?.params || step?.parameters || step),
    expectedStateChange: { operation: mapped[1] }, outputState: {}, destructive: /delete|merge|flatten/.test(command),
    deterministic: step?.deterministic !== false && !/random|noise/.test(command), inkCapabilityMapping: mapped[1],
    fallbackCandidate: mapped[2] === 'PARTIAL' ? 'manual operation mapping' : null,
    confidence: mapped[2] === 'DIRECT' ? 0.96 : 0.64, evidence: [{ label: 'json', pointer: `/steps/${index}` }],
    unsupportedReason: mapped[2] === 'PARTIAL' ? 'unknown or vendor-specific JSON command' : null, conversionStatus: mapped[2]
  };
}

export function parseJSON({ text, detection, metadata }) {
  let value;
  try { value = JSON.parse(text); } catch (error) { throw Object.assign(new Error(`INK_IMPORT_MALFORMED_JSON:${error.message}`), { code: 'MALFORMED_ASSET' }); }
  const steps = Array.isArray(value) ? value : value.steps || value.operations || value.actions || value.commands || value.nodes || value.workflow?.nodes || [];
  const operations = steps.map((step, index) => operationFromJSON(step, index, detection.sourceSoftware));
  const dependencies = unique([...(value.dependencies || []), value.application, value.host].map(item => typeof item === 'string' ? item : item?.name));
  return canonicalProgram({ source: metadata.source, metadata, operations, dependencies, warnings: operations.length ? [] : ['JSON contained no recognized operation array'] });
}

export function parseXML({ text, detection, metadata }) {
  if (!/^\s*(?:<\?xml[^>]*>\s*)?<[^>]+>/i.test(text)) throw Object.assign(new Error('INK_IMPORT_MALFORMED_XML'), { code: 'MALFORMED_ASSET' });
  if (/<svg\b/i.test(text)) return parseSVG({ text, detection: { ...detection, sourceSoftware: detection.sourceSoftware === 'Generic XML' ? 'SVG' : detection.sourceSoftware }, metadata });
  const operations = [];
  for (const match of text.matchAll(/<\s*(step|command|action|operation)\b([^>]*)>/gi)) {
    const attributes = Object.fromEntries(Array.from(match[2].matchAll(/([\w:-]+)\s*=\s*['\"]([^'\"]*)['\"]/g), value => [value[1], value[2]]));
    operations.push(operationFromJSON({ command: attributes.command || attributes.name || attributes.type, parameters: attributes }, operations.length, detection.sourceSoftware));
  }
  return canonicalProgram({ source: metadata.source, metadata, operations, dependencies: [], warnings: operations.length ? [] : ['XML contained no recognized operation elements'] });
}

export function parseTextMacro({ text, detection, metadata }) {
  const operations = [];
  const commandMap = {
    layer: ['Layer', 'layer.create'], group: ['Group', 'group.create'], path: ['Path', 'path.create'],
    select: ['Selection', 'selection.set'], mask: ['Mask', 'mask.vector'], transform: ['Transform', 'transform.matrix'],
    fill: ['Fill', 'fill.apply'], stroke: ['Stroke', 'stroke.apply'], gradient: ['Gradient', 'gradient.apply'],
    boolean: ['Boolean', 'boolean.apply'], brush: ['Brush Stroke', 'brush.stroke'], adjustment: ['Adjustment', 'adjustment.apply'],
    filter: ['Filter', 'filter.apply'], blend: ['Blend', 'blend.mode'], texture: ['Texture', 'texture.apply'],
    import: ['Import', 'import.file'], export: ['Export', 'export.file'], if: ['Conditional', 'control.conditional'],
    loop: ['Loop', 'control.loop'], input: ['User Input', 'input.user']
  };
  for (const [index, line] of String(text).split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || /^#|^\/\//.test(trimmed)) continue;
    const command = trimmed.match(/^([\w-]+)/)?.[1]?.toLowerCase();
    const mapped = commandMap[command];
    operations.push({
      sourceSoftware: detection.sourceSoftware, sourceCommand: trimmed, canonicalOperation: mapped?.[1] || `external.${command || 'unknown'}`,
      category: mapped?.[0] || 'External Dependency', parameters: { sourceLine: trimmed }, expectedStateChange: {}, outputState: {},
      destructive: /delete|merge|flatten/.test(trimmed), deterministic: !/random|noise/.test(trimmed), inkCapabilityMapping: mapped?.[1] || null,
      fallbackCandidate: mapped ? null : 'manual operation mapping', confidence: mapped ? 0.82 : 0.4,
      evidence: [{ label: 'text line', line: index + 1, excerpt: trimmed.slice(0, 180) }], unsupportedReason: mapped ? null : 'unknown macro command', conversionStatus: mapped ? 'EQUIVALENT' : 'PARTIAL'
    });
  }
  return canonicalProgram({ source: metadata.source, metadata, operations, dependencies: [], warnings: [] });
}

export function parseBinaryMetadata({ bytes, detection, metadata }) {
  const source = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const strings = Array.from(new TextDecoder('latin1').decode(source).matchAll(/[ -~]{4,80}/g), match => match[0].trim()).filter(Boolean).slice(0, 200);
  const operations = strings.filter(value => /layer|mask|select|filter|blur|curve|level|paint|stroke|fill|gradient|transform|duplicate|merge/i.test(value)).slice(0, 80).map((value, index) => ({
    sourceSoftware: detection.sourceSoftware, sourceCommand: value, canonicalOperation: 'external.binaryOperation', category: 'External Dependency',
    parameters: { extractedToken: value }, expectedStateChange: {}, outputState: {}, destructive: false, deterministic: false,
    inkCapabilityMapping: null, fallbackCandidate: 'vendor export to JSON/JSX or structured step transcript', confidence: 0.22,
    evidence: [{ label: 'binary token', index, excerpt: value }], unsupportedReason: 'binary container parser is metadata-only', conversionStatus: 'REJECTED'
  }));
  return canonicalProgram({ source: metadata.source, metadata: { ...metadata, binaryStrings: strings.slice(0, 40) }, operations, dependencies: [detection.sourceSoftware], warnings: ['opaque binary payload was not executed', 'translation requires vendor-readable export'] });
}

export function parseDetectedAsset(input) {
  const { text = '', bytes = null, detection, metadata } = input;
  if (detection.binary) return parseBinaryMetadata({ bytes, detection, metadata });
  if (['PHOTOSHOP_JSX', 'ILLUSTRATOR_JSX', 'JAVASCRIPT_PROGRAM'].includes(detection.format)) return parseJavaScript({ text, detection, metadata });
  if (['INKSCAPE_PYTHON_EXTENSION', 'GIMP_PYTHON_PLUGIN', 'KRITA_PYTHON_PLUGIN', 'PAINTSHOP_PRO_SCRIPT', 'PYTHON_PROGRAM'].includes(detection.format)) return parsePython({ text, detection, metadata });
  if (detection.format === 'SVG_EXTENSION') return parseSVG({ text, detection, metadata });
  if (detection.format === 'JSON_PROGRAM') return parseJSON({ text, detection, metadata });
  if (['XML_PROGRAM', 'INKSCAPE_EXTENSION_DESCRIPTOR'].includes(detection.format)) return parseXML({ text, detection, metadata });
  if (['GIMP_SCRIPT_FU', 'CORELDRAW_MACRO', 'COREL_PAINTER_SCRIPT', 'TEXT_MACRO'].includes(detection.format)) return parseTextMacro({ text, detection, metadata });
  throw Object.assign(new Error(`INK_IMPORT_FORMAT_UNSUPPORTED:${detection.format}`), { code: 'UNSUPPORTED_FORMAT' });
}
