import { strokeHash } from './stroke-model.js';

const clamp = value => Math.max(0, Math.min(1, Number(value) || 0));
const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export class NaturalMediaStateMap {
  constructor({ width = 800, height = 1100, cellSize = 24, paperAbsorption = .62, paperRoughness = .55, seed = 1 } = {}) {
    this.width = width; this.height = height; this.cellSize = cellSize; this.columns = Math.ceil(width / cellSize); this.rows = Math.ceil(height / cellSize); this.seed = seed >>> 0;
    const length = this.columns * this.rows;
    this.wetness = new Float32Array(length); this.drying = new Float32Array(length); this.pigmentDensity = new Float32Array(length); this.edgeAccumulation = new Float32Array(length); this.granulation = new Float32Array(length); this.thickness = new Float32Array(length); this.paintLoad = new Float32Array(length); this.canvasReveal = new Float32Array(length).fill(1); this.paperAbsorption = clamp(paperAbsorption); this.paperRoughness = clamp(paperRoughness);
  }
  index(x, y) { return Math.max(0, Math.min(this.columns - 1, Math.floor(x / this.cellSize))) + Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize))) * this.columns; }
  deposit(dab, media = 'watercolor') {
    const index = this.index(dab.x, dab.y), pressure = clamp(dab.opacity ?? .5), load = clamp(dab.pigment ?? dab.paintLoad ?? .5), wet = clamp(dab.wetness ?? 0);
    this.wetness[index] = clamp(this.wetness[index] + wet * .42);
    this.drying[index] = clamp(this.drying[index] + (1 - wet) * .2 + this.paperAbsorption * .08);
    this.pigmentDensity[index] = clamp(this.pigmentDensity[index] + load * pressure * (media === 'watercolor' ? .32 : .18));
    const deterministicGrain = .5 + .5 * Math.sin((index + this.seed) * 12.9898);
    this.granulation[index] = clamp(this.granulation[index] + deterministicGrain * this.paperRoughness * load * .22);
    this.edgeAccumulation[index] = clamp(this.edgeAccumulation[index] + Math.abs(wet - this.wetness[index]) * .7 + (dab.edgeBackrun || 0) * .35);
    if (media === 'oil') { this.thickness[index] = clamp(this.thickness[index] + (dab.thickness || load) * pressure * .35); this.paintLoad[index] = clamp(this.paintLoad[index] + load * .3); this.canvasReveal[index] = clamp(this.canvasReveal[index] - pressure * load * .32); }
    if (dab.mode === 'scrape' || dab.scrape) { this.thickness[index] *= .32; this.paintLoad[index] *= .4; this.canvasReveal[index] = clamp(this.canvasReveal[index] + .25); }
    return index;
  }
  dry(amount = .08) { for (let index = 0; index < this.wetness.length; index += 1) { this.wetness[index] = clamp(this.wetness[index] - amount * (1 + this.paperAbsorption)); this.drying[index] = clamp(this.drying[index] + amount); this.edgeAccumulation[index] = clamp(this.edgeAccumulation[index] + this.wetness[index] * amount * .25); } }
  summary() {
    const values = key => Array.from(this[key]);
    const summary = { dimensions: { width: this.width, height: this.height, cellSize: this.cellSize, columns: this.columns, rows: this.rows }, wetness: mean(values('wetness')), drying: mean(values('drying')), pigmentDensity: mean(values('pigmentDensity')), edgeAccumulation: mean(values('edgeAccumulation')), granulation: mean(values('granulation')), thickness: mean(values('thickness')), paintLoad: mean(values('paintLoad')), canvasReveal: mean(values('canvasReveal')), model: 'APPROXIMATED' };
    summary.hash = strokeHash(summary); return summary;
  }
}

export function classifyWatercolorEdge({ wetness = 0, edgeAccumulation = 0, drying = 0 } = {}) { if (edgeAccumulation > .48 && wetness > .35) return 'BACKRUN_EDGE'; if (drying > .55 || wetness < .25) return 'HARD_EDGE'; return 'SOFT_EDGE'; }
