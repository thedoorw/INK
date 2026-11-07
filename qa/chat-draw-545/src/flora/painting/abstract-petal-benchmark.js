import { createVectorMask } from '../mask/vector-mask.js';

function taperedPetalPath({ cx = .5, baseY = .70, tipY = .16, width = .28, samples = 28 } = {}) {
  const left = [], right = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples, y = baseY + (tipY - baseY) * t;
    const envelope = Math.sin(Math.PI * t) ** .72;
    const asymmetry = 1 + .035 * Math.sin(t * Math.PI * 3);
    left.push({ x: cx - width * .5 * envelope * asymmetry, y });
    right.push({ x: cx + width * .5 * envelope / asymmetry, y });
  }
  return left.concat(right.reverse());
}

export function buildAbstractPetalBenchmarkStructure({ profileId = 'wp3-benchmark', feather = 0, seed = 73 } = {}) {
  const petal = {
    regionId: `${profileId}:petal-region:0`, kind: 'petal-region', index: 0, z: 60, relation: 'front', visible: true,
    path: taperedPetalPath(), growthAxis: { base: { x: .5, y: .70 }, tip: { x: .5, y: .16 } }, mask: { feather }
  };
  const control = {
    regionId: `${profileId}:control-region:0`, kind: 'control-region', index: 0, z: 20, relation: 'back', visible: true,
    path: [{ cx: .77, cy: .75, rx: .08, ry: .06 }], growthAxis: { base: { x: .77, y: .81 }, tip: { x: .77, y: .69 } }, mask: { feather: 0 }
  };
  const regions = [control, petal];
  return {
    schemaVersion: '0.2', purpose: 'WP3 Region Painting Engine Benchmark', profile: {
      schemaVersion: '0.2', profileId, crownMode: 'Single', leafCount: 'Two', leafWidth: 'Medium', leafTip: 'Pointed', leafCurve: 'Simple Arc',
      crownTop: .02, crownHeight: .50, stemWidthRatio: 1 / 12, seed, metadata: { source: 'flora', label: 'Abstract Petal Benchmark' }
    },
    coordinateSystem: { page: 'A4 portrait', normalized: true, origin: 'top-left', x: [0, 1], y: [0, 1] },
    regions,
    topology: [
      { regionId: control.regionId, z: control.z, relation: 'back', frontOf: [] },
      { regionId: petal.regionId, z: petal.z, relation: 'front', frontOf: [control.regionId] }
    ],
    masks: regions.map(region => createVectorMask(region, { feather: region.regionId === petal.regionId ? feather : 0 }))
  };
}
