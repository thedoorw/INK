export const REGION_PAINT_OPERATIONS = Object.freeze([
  'Base Wash', 'Directional Glaze', 'Soft Edge Veil',
  'Root Shadow', 'Fold Shadow', 'Central Light', 'Edge Light',
  'Overlap Shadow', 'Transparent Glaze', 'Directional Brushwork', 'Boundary Dissolve'
]);
export const REGION_DIRECTIONS = Object.freeze(['base-to-tip', 'tip-to-base', 'radial-out', 'contour-follow']);
export const REGION_BLEND_MODES = Object.freeze(['source-over', 'multiply', 'screen', 'overlay', 'soft-light']);

export const REGION_OPERATION_DEFAULTS = Object.freeze({
  'Base Wash': Object.freeze({
    brushPreset: 'brush-round', direction: 'contour-follow', density: 24, spacing: .028,
    widthRange: [18, 34], opacityRange: [.16, .34], jitter: .16, edgeAvoidance: 0,
    blendMode: 'source-over', coverage: .92
  }),
  'Directional Glaze': Object.freeze({
    brushPreset: 'brush-letter', direction: 'base-to-tip', density: 18, spacing: .038,
    widthRange: [5, 12], opacityRange: [.10, .24], jitter: .12, edgeAvoidance: .006,
    blendMode: 'source-over', coverage: .78
  }),
  'Soft Edge Veil': Object.freeze({
    brushPreset: 'air-soft', direction: 'contour-follow', density: 22, spacing: .03,
    widthRange: [18, 38], opacityRange: [.035, .12], jitter: .22, edgeAvoidance: 0,
    blendMode: 'source-over', coverage: .66
  }),
  'Root Shadow': Object.freeze({
    brushPreset: 'brush-round', direction: 'base-to-tip', density: 14, spacing: .038,
    widthRange: [10, 24], opacityRange: [.10, .26], jitter: .14, edgeAvoidance: .004,
    blendMode: 'multiply', coverage: .72
  }),
  'Fold Shadow': Object.freeze({
    brushPreset: 'brush-letter', direction: 'base-to-tip', density: 14, spacing: .036,
    widthRange: [5, 13], opacityRange: [.09, .24], jitter: .10, edgeAvoidance: .006,
    blendMode: 'multiply', coverage: .66
  }),
  'Central Light': Object.freeze({
    brushPreset: 'air-soft', direction: 'base-to-tip', density: 14, spacing: .034,
    widthRange: [14, 34], opacityRange: [.035, .12], jitter: .10, edgeAvoidance: .008,
    blendMode: 'screen', coverage: .68
  }),
  'Edge Light': Object.freeze({
    brushPreset: 'brush-letter', direction: 'contour-follow', density: 16, spacing: .032,
    widthRange: [4, 11], opacityRange: [.06, .18], jitter: .12, edgeAvoidance: 0,
    blendMode: 'screen', coverage: .60
  }),
  'Overlap Shadow': Object.freeze({
    brushPreset: 'brush-round', direction: 'contour-follow', density: 15, spacing: .034,
    widthRange: [8, 20], opacityRange: [.10, .28], jitter: .10, edgeAvoidance: .002,
    blendMode: 'multiply', coverage: .78
  }),
  'Transparent Glaze': Object.freeze({
    brushPreset: 'brush-round', direction: 'base-to-tip', density: 18, spacing: .034,
    widthRange: [12, 30], opacityRange: [.035, .14], jitter: .18, edgeAvoidance: .004,
    blendMode: 'soft-light', coverage: .76
  }),
  'Directional Brushwork': Object.freeze({
    brushPreset: 'brush-letter', direction: 'base-to-tip', density: 20, spacing: .032,
    widthRange: [3, 10], opacityRange: [.07, .22], jitter: .16, edgeAvoidance: .006,
    blendMode: 'source-over', coverage: .74
  }),
  'Boundary Dissolve': Object.freeze({
    brushPreset: 'air-soft', direction: 'contour-follow', density: 18, spacing: .030,
    widthRange: [16, 38], opacityRange: [.025, .10], jitter: .24, edgeAvoidance: 0,
    blendMode: 'source-over', coverage: .58
  })
});

export function operationDefaults(name) {
  const defaults = REGION_OPERATION_DEFAULTS[name];
  if (!defaults) throw new Error(`unsupported region paint operation: ${name}`);
  return structuredClone(defaults);
}
