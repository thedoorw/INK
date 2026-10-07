import { installMaterialTemplates } from './material-library.js';

const c = (op, ...args) => ({ $calc: { op, args } });
const p = name => ({ $param: name });
const mul = (a, b) => c('multiply', a, b);
const sub = (a, b) => c('subtract', a, b);
const neg = a => c('negate', a);

const materialMeta = (templateId, templateVersion, materialType, semanticRole, geometry, defaults, editable, constraints = []) => ({
  templateId, templateVersion, materialType, semanticRole, geometry,
  defaultParameters: defaults, editableParameters: editable, constraints,
  sourceBenchmark: { batchId: 'INK_Flower_Benchmark_Batch_01', cases: ['CASE-02', 'CASE-03', 'CASE-04', 'CASE-05'] },
  validationState: { status: 'VALIDATED_BY_BATCH_01_AND_V1.6.2_REGRESSION', evidence: 'Validation/flower-batch-v1.6.2' }
});

function petal(templateId, materialType, defaults, semanticRole = 'petal') {
  return materialMeta(templateId, '1.0.0', materialType, semanticRole, {
    id: 'shape', type: 'path', name: materialType, matrix: [1,0,0,1,0,0], opacity: 1,
    fill: p('fill'), stroke: p('stroke'), strokeWidth: p('strokeWidth'), fillRule: 'evenodd',
    subpaths: [{ id: 'outline', closed: true, role: 'outer', anchors: [
      { id: 'root', x: 0, y: 0, in: { x: mul(p('width'), .38), y: neg(mul(p('length'), .08)) }, out: { x: neg(mul(p('width'), .38)), y: neg(mul(p('length'), .08)) }, mode: 'smooth' },
      { id: 'left', x: neg(mul(p('width'), .5)), y: neg(mul(p('length'), .48)), in: { x: 0, y: mul(p('length'), .16) }, out: { x: neg(mul(p('width'), .02)), y: neg(mul(p('length'), .22)) }, mode: 'smooth' },
      { id: 'tip', x: p('bend'), y: neg(p('length')), in: { x: neg(p('tipHandle')), y: mul(p('length'), .14) }, out: { x: p('tipHandle'), y: mul(p('length'), .14) }, mode: p('tipMode') },
      { id: 'right', x: mul(p('width'), .5), y: neg(mul(p('length'), .48)), in: { x: mul(p('width'), .02), y: neg(mul(p('length'), .22)) }, out: { x: 0, y: mul(p('length'), .16) }, mode: 'smooth' }
    ] }]
  }, defaults, {
    length: { type: 'number', default: defaults.length, min: 20, max: 400 }, width: { type: 'number', default: defaults.width, min: 8, max: 240 },
    bend: { type: 'number', default: defaults.bend, min: -160, max: 160 }, fill: { type: 'color', default: defaults.fill }, stroke: { type: 'color', default: defaults.stroke },
    strokeWidth: { type: 'number', default: defaults.strokeWidth, min: 0, max: 20 }, tipHandle: { type: 'number', default: defaults.tipHandle, min: 0, max: 100 },
    tipMode: { type: 'string', default: defaults.tipMode, enum: ['corner','smooth','symmetric'] }
  }, ['closed-path', 'minimum-four-anchors']);
}

function leaf(templateId, materialType, defaults) {
  return materialMeta(templateId, '1.0.0', materialType, 'leaf', {
    id: 'shape', type: 'path', name: materialType, matrix: [1,0,0,1,0,0], opacity: 1,
    fill: p('fill'), stroke: p('stroke'), strokeWidth: p('strokeWidth'), fillRule: 'evenodd',
    subpaths: [{ id: 'outline', closed: true, role: 'outer', anchors: [
      { id: 'base', x: 0, y: 0, in: { x: 0, y: mul(p('width'), .15) }, out: { x: 0, y: neg(mul(p('width'), .15)) }, mode: 'smooth' },
      { id: 'upper', x: mul(p('length'), .45), y: neg(mul(p('width'), .5)), in: { x: neg(mul(p('length'), .16)), y: 0 }, out: { x: mul(p('length'), .18), y: neg(mul(p('width'), .04)) }, mode: 'smooth' },
      { id: 'tip', x: p('length'), y: neg(p('bend')), in: { x: neg(mul(p('length'), .18)), y: neg(mul(p('width'), .02)) }, out: { x: neg(mul(p('length'), .18)), y: mul(p('width'), .02) }, mode: 'corner' },
      { id: 'lower', x: mul(p('length'), .45), y: mul(p('width'), .5), in: { x: mul(p('length'), .18), y: mul(p('width'), .04) }, out: { x: neg(mul(p('length'), .16)), y: 0 }, mode: 'smooth' }
    ] }]
  }, defaults, {
    length: { type: 'number', default: defaults.length, min: 20, max: 400 }, width: { type: 'number', default: defaults.width, min: 8, max: 220 },
    bend: { type: 'number', default: defaults.bend, min: -150, max: 150 }, fill: { type: 'color', default: defaults.fill }, stroke: { type: 'color', default: defaults.stroke },
    strokeWidth: { type: 'number', default: defaults.strokeWidth, min: 0, max: 20 }
  }, ['closed-path', 'single-tip']);
}

const pointed = petal('material:flower:petal-pointed', 'pointed-petal', { length: 172, width: 58, bend: 0, tipHandle: 0, tipMode: 'corner', fill: '#df8199', stroke: '#6b3648', strokeWidth: 1.5 });
const rounded = petal('material:flower:petal-rounded', 'rounded-petal', { length: 132, width: 52, bend: 0, tipHandle: 12, tipMode: 'smooth', fill: '#db7892', stroke: '#6b3648', strokeWidth: 1.5 });
const outerBroad = petal('material:flower:petal-outer-broad', 'outer-broad-petal', { length: 150, width: 82, bend: 4, tipHandle: 18, tipMode: 'smooth', fill: '#d16d88', stroke: '#70364c', strokeWidth: 1.3 }, 'petals.outer');
const innerTight = petal('material:flower:petal-inner-tight', 'inner-tight-petal', { length: 76, width: 36, bend: -2, tipHandle: 7, tipMode: 'smooth', fill: '#ed9aae', stroke: '#70364c', strokeWidth: 1.1 }, 'petals.inner');
const leafLanceolate = leaf('material:flower:leaf-lanceolate', 'lanceolate-leaf', { length: 165, width: 48, bend: 22, fill: '#629966', stroke: '#315d3b', strokeWidth: 1.5 });
const leafBroad = leaf('material:flower:leaf-broad', 'broad-leaf', { length: 125, width: 62, bend: 12, fill: '#6d9f65', stroke: '#315d3b', strokeWidth: 1.5 });

const center = materialMeta('material:flower:center-disk', '1.0.0', 'flower-center', 'flower-center', {
  id: 'shape', type: 'path', name: 'flower-center', matrix: [1,0,0,1,0,0], opacity: 1, fill: p('fill'), stroke: p('stroke'), strokeWidth: p('strokeWidth'), fillRule: 'evenodd',
  subpaths: [{ id: 'outline', closed: true, role: 'outer', anchors: [
    { id: 'top', x: 0, y: neg(p('radius')), in: { x: neg(mul(p('radius'), .5522847498)), y: 0 }, out: { x: mul(p('radius'), .5522847498), y: 0 }, mode: 'smooth' },
    { id: 'right', x: p('radius'), y: 0, in: { x: 0, y: neg(mul(p('radius'), .5522847498)) }, out: { x: 0, y: mul(p('radius'), .5522847498) }, mode: 'smooth' },
    { id: 'bottom', x: 0, y: p('radius'), in: { x: mul(p('radius'), .5522847498), y: 0 }, out: { x: neg(mul(p('radius'), .5522847498)), y: 0 }, mode: 'smooth' },
    { id: 'left', x: neg(p('radius')), y: 0, in: { x: 0, y: mul(p('radius'), .5522847498) }, out: { x: 0, y: neg(mul(p('radius'), .5522847498)) }, mode: 'smooth' }
  ] }]
}, { radius: 42, fill: '#d6a638', stroke: '#79501f', strokeWidth: 1.2 }, { radius: { type: 'number', default: 42, min: 3, max: 200 }, fill: { type: 'color', default: '#d6a638' }, stroke: { type: 'color', default: '#79501f' }, strokeWidth: { type: 'number', default: 1.2, min: 0, max: 20 } }, ['closed-path']);

const stem = materialMeta('material:flower:stem-curved', '1.0.0', 'curved-stem', 'stem', {
  id: 'shape', type: 'path', name: 'curved-stem', matrix: [1,0,0,1,0,0], opacity: 1, fill: 'none', stroke: p('stroke'), strokeWidth: p('strokeWidth'), lineCap: 'round',
  subpaths: [{ id: 'curve', closed: false, role: 'outer', anchors: [
    { id: 'base', x: 0, y: 0, in: {x:0,y:0}, out: { x: mul(p('bend'), .4), y: neg(mul(p('length'), .28)) }, mode: 'smooth' },
    { id: 'middle', x: p('bend'), y: neg(mul(p('length'), .52)), in: { x: neg(mul(p('bend'), .35)), y: mul(p('length'), .18) }, out: { x: mul(p('bend'), .2), y: neg(mul(p('length'), .18)) }, mode: 'smooth' },
    { id: 'top', x: 0, y: neg(p('length')), in: { x: mul(p('bend'), .25), y: mul(p('length'), .24) }, out: {x:0,y:0}, mode: 'smooth' }
  ] }]
}, { length: 325, bend: 35, stroke: '#47744a', strokeWidth: 10 }, { length: { type: 'number', default: 325, min: 40, max: 700 }, bend: { type: 'number', default: 35, min: -200, max: 200 }, stroke: { type: 'color', default: '#47744a' }, strokeWidth: { type: 'number', default: 10, min: 1, max: 80 } }, ['open-path']);

const bud = materialMeta('material:flower:bud', '1.0.0', 'flower-bud', 'bud', {
  id: 'shape', type: 'path', name: 'flower-bud', matrix:[1,0,0,1,0,0], opacity:1, fill:p('fill'), stroke:p('stroke'), strokeWidth:p('strokeWidth'),
  subpaths:[{id:'outline',closed:true,role:'outer',anchors:[
    {id:'base',x:0,y:0,in:{x:mul(p('width'),.35),y:neg(mul(p('height'),.08))},out:{x:neg(mul(p('width'),.35)),y:neg(mul(p('height'),.08))},mode:'smooth'},
    {id:'left',x:neg(mul(p('width'),.5)),y:neg(mul(p('height'),.48)),in:{x:0,y:mul(p('height'),.18)},out:{x:0,y:neg(mul(p('height'),.18))},mode:'smooth'},
    {id:'tip',x:0,y:neg(p('height')),in:{x:neg(mul(p('width'),.25)),y:mul(p('height'),.18)},out:{x:mul(p('width'),.25),y:mul(p('height'),.18)},mode:'smooth'},
    {id:'right',x:mul(p('width'),.5),y:neg(mul(p('height'),.48)),in:{x:0,y:neg(mul(p('height'),.18))},out:{x:0,y:mul(p('height'),.18)},mode:'smooth'}
  ]}]
}, {height:82,width:48,fill:'#d67891',stroke:'#6b3648',strokeWidth:1.3}, {height:{type:'number',default:82,min:15,max:240},width:{type:'number',default:48,min:8,max:160},fill:{type:'color',default:'#d67891'},stroke:{type:'color',default:'#6b3648'},strokeWidth:{type:'number',default:1.3,min:0,max:20}}, ['closed-path']);

const calyx = materialMeta('material:flower:calyx', '1.0.0', 'calyx', 'calyx', {
  id:'shape',type:'path',name:'calyx',matrix:[1,0,0,1,0,0],opacity:1,fill:p('fill'),stroke:p('stroke'),strokeWidth:p('strokeWidth'),
  subpaths:[{id:'outline',closed:true,role:'outer',anchors:[
    {id:'left-base',x:neg(mul(p('width'),.5)),y:0,in:{x:0,y:0},out:{x:mul(p('width'),.15),y:neg(mul(p('height'),.15))},mode:'corner'},
    {id:'left-tip',x:neg(mul(p('width'),.28)),y:neg(p('height')),in:{x:0,y:mul(p('height'),.25)},out:{x:0,y:mul(p('height'),.25)},mode:'corner'},
    {id:'center',x:0,y:neg(mul(p('height'),.45)),in:{x:neg(mul(p('width'),.12)),y:0},out:{x:mul(p('width'),.12),y:0},mode:'corner'},
    {id:'right-tip',x:mul(p('width'),.28),y:neg(p('height')),in:{x:0,y:mul(p('height'),.25)},out:{x:0,y:mul(p('height'),.25)},mode:'corner'},
    {id:'right-base',x:mul(p('width'),.5),y:0,in:{x:neg(mul(p('width'),.15)),y:neg(mul(p('height'),.15))},out:{x:0,y:0},mode:'corner'}
  ]}]
}, {height:34,width:58,fill:'#47744a',stroke:'#315d3b',strokeWidth:1.2}, {height:{type:'number',default:34,min:8,max:120},width:{type:'number',default:58,min:12,max:180},fill:{type:'color',default:'#47744a'},stroke:{type:'color',default:'#315d3b'},strokeWidth:{type:'number',default:1.2,min:0,max:20}}, ['closed-path']);

export const FLOWER_BATCH_01_TEMPLATES = Object.freeze([pointed, rounded, outerBroad, innerTight, leafLanceolate, leafBroad, center, stem, bud, calyx]);

export function installFlowerBatch01Templates(document, options = {}) {
  return installMaterialTemplates(document, FLOWER_BATCH_01_TEMPLATES, options);
}
