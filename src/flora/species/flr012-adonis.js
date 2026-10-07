import { resolveReferenceMapping } from '../reference/reference-mapping.js';

export const FLR012_EXCEL_IDENTITY = Object.freeze({
  profileId: 'FLR-012', date: '01-12', month: 1, day: 12, slot: 12, dCode: 'D012',
  chineseName: '福壽草', englishName: 'Adonis', scientificName: 'Adonis amurensis'
});

export const FLR012_REFERENCE_MANIFEST = Object.freeze({
  schemaVersion: '0.1', sheets: [{ fileName: '1-A.png', month: 1, range: '1–16', entries: [{
    day: 12, slot: 12, dCode: 'D012', chineseName: '福壽草', englishName: 'Adonis', scientificName: 'Adonis amurensis',
    sourceCrop: { x: 780, y: 720, width: 275, height: 400, sourceWidth: 1055, sourceHeight: 1491 }
  }] }]
});

const flr012Brushes = Object.freeze({ wash: 'brush-round', shadow: 'brush-round', light: 'air-soft', glaze: 'brush-round', detail: 'brush-letter', soft: 'air-soft' });
const flr012Metadata = (label, extra = {}) => ({ source: 'ai', label, ...extra });

export function verifyFLR012ReferenceMapping(options = {}) {
  return resolveReferenceMapping(FLR012_EXCEL_IDENTITY, FLR012_REFERENCE_MANIFEST, options);
}

export function createFLR012HeroProfile() {
  const mapping = verifyFLR012ReferenceMapping({ requestedFiles: ['1-A.png'] });
  if (!mapping.ok) throw new Error(`FLR-012 reference mapping failed: ${JSON.stringify(mapping.errors)}`);
  return {
    schemaVersion: '0.1', profileId: 'FLR-012', status: 'COMPATIBLE',
    botanicalIdentity: { ...FLR012_EXCEL_IDENTITY }, verifiedSource: mapping,
    morphology: {
      petalCountNatural: [10, 20], heroPetalCount: 14, petalShape: 'narrow-spoon',
      center: 'dense golden stamens and pistils', leaf: 'finely divided pinnate basal foliage',
      inflorescence: 'low solitary flower', symmetry: 'radial', stem: 'short peduncle from basal foliage'
    },
    pattern: { mainFocus: 'golden multi-petal bowl flower with finely divided foliage', silhouette: 'near-circle crown over separated filigree leaves' },
    fpl: ['MultiPetalCup', 'FiligreeLeaf', 'BasalClump'],
    preserve: [
      'single golden-yellow bowl-shaped crown', '12–16 readable narrow spoon-shaped petals', 'petals radiate outward and slightly upward',
      'dense golden center continuous with petal roots', 'four separated narrow pointed strongly waved Hero leaves', 'one centered straight stem'
    ],
    simplify: ['natural 10–20 tepals to 14 readable petals', 'finely divided foliage to four leaves with filigree edge rhythm', 'low basal habit to centered Hero stem', 'minute reproductive structures to irregular short strokes and color points'],
    remove: ['natural basal leaf clump', 'extra blooms', 'buds', 'natural branching', 'literal count of all leaf divisions', 'non-identifying micro-detail'],
    heroSkeleton: { page: 'A4 portrait', crownMode: 'Single', leafCount: 'Four', leafWidth: 'Narrow', leafTip: 'Pointed', leafCurve: 'Strong Wave', stemMode: 'Centered Straight', stemWidthRatio: 1 / 12 },
    knownRisks: ['generic yellow daisy or gerbera appearance', 'dark composite-flower disk', 'mechanical equal-angle radiation', 'generic ribbon leaves'],
    compilerDecisions: { petalGeometryFamily: 'narrow-spoon', petalRhythm: 'one-to-two-layer', centerMode: 'dense-irregular-gold', leafEdgeMode: 'filigree-wave', traceReferencePixels: false }
  };
}

export function createFLR012HeroPaintingPlan(seed = 12012) {
  const profile = createFLR012HeroProfile(), heroId = 'flr012-adonis-candidate-a', planId = 'flr012-adonis-candidate-a-plan';
  const leaf = (slot, palette, opacityScale, edgeSoftness, offset) => ({
    regionId: `${heroId}:leaf:${slot}`, palette, brushPresets: { ...flr012Brushes }, opacityScale, edgeSoftness, seed: seed + offset,
    leafEdgeMode: profile.compilerDecisions.leafEdgeMode === 'filigree-wave' ? 'filigree-pinnate-impression' : profile.compilerDecisions.leafEdgeMode,
    metadata: flr012Metadata(`FLR-012 ${slot} filigree Hero leaf`, { side: slot.startsWith('left') ? 'left' : 'right', slot, leafWidth: 'Narrow', leafTip: 'Pointed', leafCurve: 'Strong Wave', filigreeEdge: true })
  });
  return {
    planId, schemaVersion: '0.1', heroId,
    composition: { page: 'A4 portrait', normalized: true, crownMode: 'Single', leafCount: 'Four', crownTop: .02, crownHeight: .50, stemAxisX: .5, stemWidthRatio: 1 / 12, leafWidth: 'Narrow', leafTip: 'Pointed', leafCurve: 'Strong Wave', singleFocalPoint: true },
    crownPlan: {
      planId: `${planId}:crown`, schemaVersion: '0.1', crownId: `${heroId}:crown`, petalCount: 14,
      crownBasePalette: ['#F4D330', '#E7B51B', '#FFD94A', '#C99012'],
      petalPaletteVariation: { lightnessRange: [-.075, .095], saturationRange: [-.035, .055] },
      centerPalette: ['#A96508', '#CF8710', '#F0B91D', '#FFE36A'], globalLightDirection: { x: -.38, y: -.92 },
      depthOrder: 'topology-z', focalRegion: { petalIndex: 1 }, edgeHierarchy: { focal: 'crisp', front: 'mixed', rear: 'soft' },
      shadowStrategy: { root: .86, fold: .70, overlap: .82 }, glazeStrategy: { strength: .68, passes: 2 },
      backgroundExclusionMask: { enabled: true, mode: 'crown-envelope' }, brushPresets: { ...flr012Brushes }, seed,
      bowlBias: .76, petalRhythm: profile.compilerDecisions.petalRhythm,
      petalGeometryFamily: profile.compilerDecisions.petalGeometryFamily, centerMode: profile.compilerDecisions.centerMode,
      metadata: flr012Metadata('FLR-012 Adonis Single Crown · 14 narrow spoon petals', { speciesProfileId: profile.profileId, petalGeometryFamily: 'narrow-spoon', centerRadius: .078, bowlBias: .76 })
    },
    stemPlan: { regionId: `${heroId}:stem`, palette: ['#627F45', '#91A768', '#3F5F35'], brushPresets: { ...flr012Brushes }, opacityScale: .62, edgeSoftness: .009, seed: seed + 11, metadata: flr012Metadata('FLR-012 centered straight stem', { stemMode: 'Centered Straight' }) },
    leafPlans: [
      leaf('left-outer', ['#4E7438', '#789750', '#2D512B'], .82, .010, 21),
      leaf('left-inner', ['#567D3D', '#86A45B', '#31572E'], .80, .010, 22),
      leaf('right-inner', ['#52783A', '#7F9E54', '#2E542C'], .81, .010, 23),
      leaf('right-outer', ['#486E35', '#75944D', '#294D29'], .79, .010, 24)
    ],
    backgroundPlan: { regionId: `${heroId}:background`, palette: ['#D9DDE4', '#ECE8EE', '#CBD4DE'], brushPresets: { ...flr012Brushes }, contrast: .18, textureStrength: .05, edgeSoftness: .024, seed: seed + 31, metadata: flr012Metadata('FLR-012 quiet cool blue-violet gray background', { relation: 'cool-complementary support' }) },
    globalPalette: ['#F4D330', '#E7B51B', '#FFD94A', '#C99012', '#52783A', '#86A45B', '#D9DDE4', '#ECE8EE'],
    globalLightDirection: { x: -.38, y: -.92 }, focalHierarchy: { primary: 'crown', secondary: ['stem', 'leaves', 'background'] },
    edgeHierarchy: { crown: 'mixed', stem: 'mixed', leaves: 'mixed', background: 'soft' },
    depthStrategy: { mode: 'topology-z', background: 'behind-subject', stem: 'front-of-leaves-behind-crown' },
    colorContinuity: { sharedWarmCool: true, subjectBackgroundRelation: .74 }, backgroundContrast: .13,
    smallViewRequirements: { crown: true, stem: true, fourLeaves: true }, seed,
    metadata: flr012Metadata('WP-9A FLR-012 Adonis Candidate A', { speciesProfileId: profile.profileId, candidate: 'A', referenceMappingId: profile.verifiedSource.mappingId, imageModelUsed: false })
  };
}

export class FLR012AdonisRuntime {
  constructor(completeHeroRuntime) { this.completeHero = completeHeroRuntime; }
  sourceMapping() { return verifyFLR012ReferenceMapping({ requestedFiles: ['1-A.png'] }); }
  profile() { return createFLR012HeroProfile(); }
  plan(seed = 12012) { return createFLR012HeroPaintingPlan(seed); }
  validate(seed = 12012) { return this.completeHero.validate(this.plan(seed)); }
  compile(seed = 12012, options = {}) { return this.completeHero.compile(this.plan(seed), options); }
  execute(seed = 12012, options = {}) { return this.completeHero.execute(this.plan(seed), options); }
}
