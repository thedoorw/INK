import { createVectorMask } from '../mask/vector-mask.js';

function normalize(vector) {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function taperedPetalAxis({ base, tip, width = .28, samples = 34, asymmetry = 0, belly = .72 }) {
  const axis = normalize({ x: tip.x - base.x, y: tip.y - base.y });
  const normal = { x: -axis.y, y: axis.x }, left = [], right = [];
  for (let index = 0; index <= samples; index += 1) {
    const t = index / samples;
    const envelope = Math.sin(Math.PI * t) ** belly;
    const center = {
      x: base.x + (tip.x - base.x) * t + normal.x * asymmetry * Math.sin(Math.PI * t),
      y: base.y + (tip.y - base.y) * t + normal.y * asymmetry * Math.sin(Math.PI * t)
    };
    const wobble = 1 + .045 * Math.sin(t * Math.PI * 3.2);
    left.push({ x: center.x - normal.x * width * .5 * envelope * wobble, y: center.y - normal.y * width * .5 * envelope * wobble });
    right.push({ x: center.x + normal.x * width * .5 * envelope / wobble, y: center.y + normal.y * width * .5 * envelope / wobble });
  }
  return left.concat(right.reverse());
}

export function buildThreePetalBenchmarkStructure({ profileId = 'wp4-three-petal', feather = .012, seed = 404 } = {}) {
  const frontId = `${profileId}:petal:front-center`;
  const leftId = `${profileId}:petal:rear-left`;
  const rightId = `${profileId}:petal:rear-right`;
  const rearLeft = {
    regionId: leftId, kind: 'petal-region', role: 'rear-left', index: 0, z: 40, relation: 'back', visible: true,
    path: taperedPetalAxis({ base: { x: .50, y: .72 }, tip: { x: .27, y: .18 }, width: .285, asymmetry: -.008 }),
    growthAxis: { base: { x: .50, y: .72 }, tip: { x: .27, y: .18 } },
    foldAxis: { base: { x: .48, y: .68 }, tip: { x: .31, y: .23 } },
    overlaps: [{ frontRegionId: frontId, seam: [{ x: .47, y: .61 }, { x: .39, y: .30 }], bandWidth: .048 }],
    mask: { feather }
  };
  const rearRight = {
    regionId: rightId, kind: 'petal-region', role: 'rear-right', index: 1, z: 45, relation: 'back', visible: true,
    path: taperedPetalAxis({ base: { x: .50, y: .72 }, tip: { x: .73, y: .18 }, width: .285, asymmetry: .008 }),
    growthAxis: { base: { x: .50, y: .72 }, tip: { x: .73, y: .18 } },
    foldAxis: { base: { x: .52, y: .68 }, tip: { x: .69, y: .23 } },
    overlaps: [{ frontRegionId: frontId, seam: [{ x: .53, y: .61 }, { x: .61, y: .30 }], bandWidth: .048 }],
    mask: { feather }
  };
  const front = {
    regionId: frontId, kind: 'petal-region', role: 'front-center', index: 2, z: 70, relation: 'front', visible: true,
    path: taperedPetalAxis({ base: { x: .50, y: .74 }, tip: { x: .50, y: .12 }, width: .31, asymmetry: .004 }),
    growthAxis: { base: { x: .50, y: .74 }, tip: { x: .50, y: .12 } },
    foldAxis: { base: { x: .50, y: .70 }, tip: { x: .50, y: .18 } },
    overlaps: [], mask: { feather }
  };
  const regions = [rearLeft, rearRight, front];
  return {
    schemaVersion: '0.2', purpose: 'WP4 Painting Recipe Compiler Benchmark B — three abstract overlapping petals',
    profile: {
      schemaVersion: '0.2', profileId, crownMode: 'Single', leafCount: 'Two', leafWidth: 'Medium', leafTip: 'Pointed', leafCurve: 'Simple Arc',
      crownTop: .02, crownHeight: .50, stemWidthRatio: 1 / 12, seed,
      metadata: { source: 'flora', label: 'Three Abstract Petals Benchmark' }
    },
    coordinateSystem: { page: 'A4 portrait', normalized: true, origin: 'top-left', x: [0, 1], y: [0, 1] },
    regions,
    topology: [
      { regionId: leftId, z: 40, relation: 'back', frontOf: [] },
      { regionId: rightId, z: 45, relation: 'back', frontOf: [] },
      { regionId: frontId, z: 70, relation: 'front', frontOf: [leftId, rightId] }
    ],
    masks: regions.map(region => createVectorMask(region, { feather }))
  };
}
