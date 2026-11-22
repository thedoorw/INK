import { clamp } from '../core/index.js';
import { sourceOverCoverage } from './natural-media-utils.js';
import { buildPaperField, normalizePaperProfile } from './paper-profile.js';

const indexOf = (x, y, width) => y * width + x;

export class MultiChannelInkSurface {
  constructor(width, height, { paper = {}, originX = 0, originY = 0, scale = 1 } = {}) {
    this.width = Math.max(1, Math.trunc(width));
    this.height = Math.max(1, Math.trunc(height));
    this.size = this.width * this.height;
    this.originX = originX;
    this.originY = originY;
    this.scale = Math.max(.0001, scale);
    this.paperProfile = normalizePaperProfile(paper);
    this.paper = buildPaperField(this.width, this.height, { paper: this.paperProfile, originX, originY, scale: this.scale });
    this.pigmentR = new Float32Array(this.size);
    this.pigmentG = new Float32Array(this.size);
    this.pigmentB = new Float32Array(this.size);
    this.pigment = new Float32Array(this.size);
    this.water = new Float32Array(this.size);
    this.deposit = new Float32Array(this.size);
    this.tmpWater = new Float32Array(this.size);
    this.tmpPigment = new Float32Array(this.size);
    this.tmpR = new Float32Array(this.size);
    this.tmpG = new Float32Array(this.size);
    this.tmpB = new Float32Array(this.size);
    this.stats = { stamps: 0, mixerStamps: 0, transportOperations: 0, transportedPigment: 0, simulationSteps: 0, depositedPigment: 0, depositedWater: 0, maxWater: 0, maxPigment: 0 };
  }

  clear() {
    for (const channel of [this.pigmentR, this.pigmentG, this.pigmentB, this.pigment, this.water, this.deposit,
      this.tmpWater, this.tmpPigment, this.tmpR, this.tmpG, this.tmpB]) channel.fill(0);
    this.stats = { stamps: 0, mixerStamps: 0, transportOperations: 0, transportedPigment: 0, simulationSteps: 0, depositedPigment: 0, depositedWater: 0, maxWater: 0, maxPigment: 0 };
  }

  depositStamp(stamp, rgba, { flow = .8, wetness = .4, granulation = .25, opacity = 1 } = {}) {
    const cx = (stamp.x - this.originX) * this.scale;
    const cy = (stamp.y - this.originY) * this.scale;
    const rx = Math.max(.35, stamp.radiusX * this.scale);
    const ry = Math.max(.35, stamp.radiusY * this.scale);
    const angle = stamp.angle || 0, ca = Math.cos(angle), sa = Math.sin(angle);
    const minX = Math.max(0, Math.floor(cx - rx - 2)), maxX = Math.min(this.width - 1, Math.ceil(cx + rx + 2));
    const minY = Math.max(0, Math.floor(cy - ry - 2)), maxY = Math.min(this.height - 1, Math.ceil(cy + ry + 2));
    const pressure = clamp(stamp.pressure ?? .5, .02, 1);
    const pigmentBase = clamp(flow * opacity * pressure, 0, 1.5);
    const waterBase = clamp(wetness * (.45 + pressure * .75), 0, 1.5);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x + .5 - cx, dy = y + .5 - cy;
        const ux = (dx * ca + dy * sa) / rx;
        const uy = (-dx * sa + dy * ca) / ry;
        const d = Math.hypot(ux, uy);
        if (d >= 1.08) continue;
        const index = indexOf(x, y, this.width);
        const feather = 1 - clamp((d - .62) / .46, 0, 1);
        const grainAmount = clamp(granulation, 0, 1) * (.24 + (stamp.grain ?? 0) * .56);
        const paperGrain = this.paper.grain[index], paperFiber = this.paper.fiber[index];
        // Canvas-coordinate paper fields remain continuous across adjacent stamps. Bristle contact
        // follows clustered paper fibers instead of restarting a sine pattern per stamp.
        const clusteredContact = clamp(.66 + paperFiber * (.18 + (stamp.bristle ?? 0) * .24) + (paperGrain - .5) * .12, .28, 1);
        const texture = clamp(1 - paperGrain * grainAmount * (1 - clusteredContact * .55), .18, 1);
        const mask = feather * texture * clamp(stamp.opacity ?? 1, .05, 1) * clamp(stamp.coverage ?? 1, .1, 1);
        if (mask <= .001) continue;
        const previous = this.pigment[index];
        const previousCoverage = clamp(1 - Math.exp(-previous * .9), 0, 1);
        const rawPigment = clamp(pigmentBase * mask * .27, 0, .72);
        const coverage = sourceOverCoverage(previousCoverage, rawPigment);
        const pigmentAdded = Math.max(0, -Math.log(Math.max(.0001, 1 - coverage)) / .9 - previous);
        const waterAdded = waterBase * mask * .22 * (1 - previousCoverage * .28);
        this.pigment[index] = clamp(previous + pigmentAdded, 0, 4);
        this.pigmentR[index] = clamp(this.pigmentR[index] + rgba[0] * pigmentAdded, 0, 4);
        this.pigmentG[index] = clamp(this.pigmentG[index] + rgba[1] * pigmentAdded, 0, 4);
        this.pigmentB[index] = clamp(this.pigmentB[index] + rgba[2] * pigmentAdded, 0, 4);
        this.water[index] = clamp(this.water[index] + waterAdded, 0, 3);
        this.stats.depositedPigment += pigmentAdded;
        this.stats.depositedWater += waterAdded;
      }
    }
    this.stats.stamps++;
  }

  transportStamp(stamp, { mode = 'smudge', strength = .6, drag = .6, opacity = 1 } = {}) {
    const cx = (stamp.x - this.originX) * this.scale;
    const cy = (stamp.y - this.originY) * this.scale;
    const rx = Math.max(.35, stamp.radiusX * this.scale);
    const ry = Math.max(.35, stamp.radiusY * this.scale);
    const angle = stamp.angle || 0, ca = Math.cos(angle), sa = Math.sin(angle);
    const minX = Math.max(0, Math.floor(cx - rx - 2)), maxX = Math.min(this.width - 1, Math.ceil(cx + rx + 2));
    const minY = Math.max(0, Math.floor(cy - ry - 2)), maxY = Math.min(this.height - 1, Math.ceil(cy + ry + 2));
    const pressure = clamp(stamp.pressure ?? .5, .02, 1);
    const base = clamp(strength * opacity * (.35 + pressure * .65), 0, 1);
    if (base <= .0001) return false;
    let moved = 0;
    if (mode === 'blender') {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const dx = x + .5 - cx, dy = y + .5 - cy;
          const ux = (dx * ca + dy * sa) / rx, uy = (-dx * sa + dy * ca) / ry;
          const d = Math.hypot(ux, uy);if (d >= 1.06) continue;
          const index = indexOf(x, y, this.width), pigment = this.pigment[index];
          if (pigment <= .00001) continue;
          const feather = 1 - clamp((d - .45) / .61, 0, 1), mixAmount = base * feather * .42;
          let weight = 0, sumPigment = 0, sumR = 0, sumG = 0, sumB = 0, sumWater = 0;
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const sx = Math.max(0, Math.min(this.width - 1, x + ox)), sy = Math.max(0, Math.min(this.height - 1, y + oy));
            const source = indexOf(sx, sy, this.width), w = ox === 0 && oy === 0 ? 2 : 1;
            weight += w;sumPigment += this.pigment[source] * w;sumR += this.pigmentR[source] * w;sumG += this.pigmentG[source] * w;sumB += this.pigmentB[source] * w;sumWater += this.water[source] * w;
          }
          const avgPigment = sumPigment / weight;
          if (avgPigment <= .00001) continue;
          const avgR = sumR / weight, avgG = sumG / weight, avgB = sumB / weight;
          const currentR = this.pigmentR[index] / pigment, currentG = this.pigmentG[index] / pigment, currentB = this.pigmentB[index] / pigment;
          const averageR = avgR / avgPigment, averageG = avgG / avgPigment, averageB = avgB / avgPigment;
          this.pigmentR[index] = pigment * (currentR + (averageR - currentR) * mixAmount);
          this.pigmentG[index] = pigment * (currentG + (averageG - currentG) * mixAmount);
          this.pigmentB[index] = pigment * (currentB + (averageB - currentB) * mixAmount);
          this.water[index] += (sumWater / weight - this.water[index]) * mixAmount * .35;
          moved += pigment * mixAmount;
        }
      }
    } else {
      const distance = Math.max(1, Math.max(rx, ry) * (.18 + clamp(drag, 0, 1) * .72));
      const stepX = ca * distance, stepY = sa * distance;
      const xStart = stepX >= 0 ? maxX : minX, xEnd = stepX >= 0 ? minX : maxX, xStep = stepX >= 0 ? -1 : 1;
      const yStart = stepY >= 0 ? maxY : minY, yEnd = stepY >= 0 ? minY : maxY, yStep = stepY >= 0 ? -1 : 1;
      for (let y = yStart; yStep > 0 ? y <= yEnd : y >= yEnd; y += yStep) {
        for (let x = xStart; xStep > 0 ? x <= xEnd : x >= xEnd; x += xStep) {
          const dx = x + .5 - cx, dy = y + .5 - cy;
          const ux = (dx * ca + dy * sa) / rx, uy = (-dx * sa + dy * ca) / ry;
          const d = Math.hypot(ux, uy);if (d >= 1.06) continue;
          const sx = Math.max(0, Math.min(this.width - 1, Math.round(x - stepX)));
          const sy = Math.max(0, Math.min(this.height - 1, Math.round(y - stepY)));
          const source = indexOf(sx, sy, this.width), target = indexOf(x, y, this.width);
          if (source === target || this.pigment[source] <= .00001) continue;
          const feather = 1 - clamp((d - .38) / .68, 0, 1);
          const fraction = clamp(base * feather * .34, 0, .42);
          const amount = this.pigment[source] * fraction;
          if (amount <= .000001) continue;
          const sourcePigment = this.pigment[source], ratio = amount / Math.max(.00001, sourcePigment);
          const r = this.pigmentR[source] * ratio, g = this.pigmentG[source] * ratio, b = this.pigmentB[source] * ratio;
          this.pigment[source] = Math.max(0, sourcePigment - amount);
          this.pigmentR[source] = Math.max(0, this.pigmentR[source] - r);this.pigmentG[source] = Math.max(0, this.pigmentG[source] - g);this.pigmentB[source] = Math.max(0, this.pigmentB[source] - b);
          this.pigment[target] = clamp(this.pigment[target] + amount, 0, 4);
          this.pigmentR[target] = clamp(this.pigmentR[target] + r, 0, 4);this.pigmentG[target] = clamp(this.pigmentG[target] + g, 0, 4);this.pigmentB[target] = clamp(this.pigmentB[target] + b, 0, 4);
          const waterMove = this.water[source] * fraction * .55;this.water[source] = Math.max(0, this.water[source] - waterMove);this.water[target] = clamp(this.water[target] + waterMove, 0, 3);
          const depositMove = this.deposit[source] * fraction * .16;this.deposit[source] = Math.max(0, this.deposit[source] - depositMove);this.deposit[target] = clamp(this.deposit[target] + depositMove, 0, 4);
          moved += amount;
        }
      }
    }
    this.stats.mixerStamps++;this.stats.transportOperations++;this.stats.transportedPigment += moved;
    return moved > .000001;
  }

  simulate({ steps = 3, diffusion = .19, evaporation = .035, deposition = .11 } = {}) {
    const width = this.width, height = this.height;
    const profile = this.paperProfile;
    const angle = profile.fiberAngle * Math.PI / 180;
    const horizontalWeight = .5 + Math.abs(Math.cos(angle)) * profile.fiberStrength * .32;
    const verticalWeight = .5 + Math.abs(Math.sin(angle)) * profile.fiberStrength * .32;
    for (let step = 0; step < steps; step++) {
      this.tmpWater.fill(0);this.tmpPigment.fill(0);this.tmpR.fill(0);this.tmpG.fill(0);this.tmpB.fill(0);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const index = indexOf(x, y, width);
          const water = this.water[index], pigment = this.pigment[index];
          const left = x > 0 ? index - 1 : index, right = x + 1 < width ? index + 1 : index;
          const up = y > 0 ? index - width : index, down = y + 1 < height ? index + width : index;
          const neighborWater = (this.water[left] + this.water[right]) * horizontalWeight + (this.water[up] + this.water[down]) * verticalWeight;
          const norm = horizontalWeight * 2 + verticalWeight * 2;
          const avgWater = neighborWater / norm;
          const resistance = this.paper.resistance[index];
          const localDiffusion = diffusion * (1 - resistance * .72) * (.45 + water * .55);
          let nextWater = water + (avgWater - water) * localDiffusion;
          const absorbed = Math.min(nextWater, nextWater * this.paper.absorbency[index] * deposition);
          nextWater = Math.max(0, nextWater - absorbed - evaporation * (.35 + resistance * .65));
          const wetMobility = clamp(water * .48, 0, .34) * (1 - resistance * .6);
          const neighborPigment = (this.pigment[left] + this.pigment[right] + this.pigment[up] + this.pigment[down]) * .25;
          let nextPigment = pigment + (neighborPigment - pigment) * wetMobility;
          const settled = Math.min(nextPigment, absorbed * (1.1 + this.paper.grain[index] * profile.granulation));
          nextPigment = Math.max(0, nextPigment - settled * .35);
          this.deposit[index] = clamp(this.deposit[index] + settled, 0, 4);
          const ratio = pigment > .00001 ? nextPigment / pigment : 0;
          this.tmpWater[index] = nextWater;
          this.tmpPigment[index] = nextPigment;
          this.tmpR[index] = this.pigmentR[index] * ratio;
          this.tmpG[index] = this.pigmentG[index] * ratio;
          this.tmpB[index] = this.pigmentB[index] * ratio;
        }
      }
      [this.water, this.tmpWater] = [this.tmpWater, this.water];
      [this.pigment, this.tmpPigment] = [this.tmpPigment, this.pigment];
      [this.pigmentR, this.tmpR] = [this.tmpR, this.pigmentR];
      [this.pigmentG, this.tmpG] = [this.tmpG, this.pigmentG];
      [this.pigmentB, this.tmpB] = [this.tmpB, this.pigmentB];
      this.stats.simulationSteps++;
    }
    let maxWater = 0, maxPigment = 0;
    for (let index = 0; index < this.size; index++) {
      maxWater = Math.max(maxWater, this.water[index]);
      maxPigment = Math.max(maxPigment, this.pigment[index] + this.deposit[index]);
    }
    this.stats.maxWater = maxWater;this.stats.maxPigment = maxPigment;
  }

  compositeRGBA({ opacity = 1, wetEdge = .22 } = {}) {
    const output = new Uint8ClampedArray(this.size * 4);
    const width = this.width, height = this.height;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = indexOf(x, y, width), offset = index * 4;
        const amount = this.pigment[index] + this.deposit[index] * 1.25;
        const denom = Math.max(.0001, this.pigment[index]);
        let r = this.pigmentR[index] / denom, g = this.pigmentG[index] / denom, b = this.pigmentB[index] / denom;
        if (!Number.isFinite(r)) r = 0;if (!Number.isFinite(g)) g = 0;if (!Number.isFinite(b)) b = 0;
        const left = x > 0 ? index - 1 : index, right = x + 1 < width ? index + 1 : index;
        const up = y > 0 ? index - width : index, down = y + 1 < height ? index + width : index;
        const waterEdge = Math.max(0, this.water[index] - (this.water[left] + this.water[right] + this.water[up] + this.water[down]) * .25);
        const edgeDarken = clamp(this.deposit[index] * .105 + waterEdge * wetEdge * .62, 0, .2);
        r *= 1 - edgeDarken;g *= 1 - edgeDarken;b *= 1 - edgeDarken;
        const alpha = clamp((1 - Math.exp(-amount * 1.75)) * opacity, 0, 1);
        output[offset] = Math.round(clamp(r, 0, 1) * 255);
        output[offset + 1] = Math.round(clamp(g, 0, 1) * 255);
        output[offset + 2] = Math.round(clamp(b, 0, 1) * 255);
        output[offset + 3] = Math.round(alpha * 255);
      }
    }
    return output;
  }

  diagnostics() {
    return { width: this.width, height: this.height, pixels: this.size, scale: this.scale, ...this.stats, paper: this.paper.stats };
  }
}
