import { clamp } from '../core/index.js';

export const WORKSPACE_SPACES = Object.freeze(['creation', 'layout']);
export const VIEW_ZOOM_MIN = 0.03;
export const VIEW_ZOOM_MAX = 24;
export const VIEW_ZOOM_CONTRACT = Object.freeze({ minScale: VIEW_ZOOM_MIN, maxScale: VIEW_ZOOM_MAX });
export const clampViewScale = value => clamp(Number(value), VIEW_ZOOM_MIN, VIEW_ZOOM_MAX);
export const DEFAULT_CREATION_CAMERA = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });
export const DEFAULT_LAYOUT_CAMERA = Object.freeze({ x: 0, y: 0, scale: 0.65, rotation: 0 });
export const DEFAULT_LAYOUT_VIEWPORT = Object.freeze({ x: 0, y: 0, scale: 1, rotation: 0 });

export function normalizeCamera(raw = {}, fallback = DEFAULT_CREATION_CAMERA) {
  return {
    x: Number.isFinite(+raw?.x) ? +raw.x : fallback.x,
    y: Number.isFinite(+raw?.y) ? +raw.y : fallback.y,
    scale: clampViewScale(Number.isFinite(+raw?.scale) ? +raw.scale : fallback.scale),
    rotation: Number.isFinite(+raw?.rotation) ? +raw.rotation : fallback.rotation
  };
}

export function normalizeLayoutViewport(raw = {}) {
  return {
    x: Number.isFinite(+raw?.x) ? +raw.x : DEFAULT_LAYOUT_VIEWPORT.x,
    y: Number.isFinite(+raw?.y) ? +raw.y : DEFAULT_LAYOUT_VIEWPORT.y,
    scale: clamp(Number.isFinite(+raw?.scale) ? +raw.scale : DEFAULT_LAYOUT_VIEWPORT.scale, 0.01, 100),
    rotation: Number.isFinite(+raw?.rotation) ? +raw.rotation : DEFAULT_LAYOUT_VIEWPORT.rotation
  };
}

export function normalizeWorkspace(raw = {}, {
  legacyArtboardMode = null,
  activeCamera = null,
  defaultSpace = 'creation'
} = {}) {
  const hasLegacyMode = legacyArtboardMode === 'fixed' || legacyArtboardMode === 'infinite';
  const legacySpace = legacyArtboardMode === 'fixed' ? 'layout' : 'creation';
  const requested = raw?.activeSpace || raw?.mode;
  const activeSpace = WORKSPACE_SPACES.includes(requested)
    ? requested
    : (hasLegacyMode ? legacySpace : defaultSpace);
  const sourceCamera = normalizeCamera(activeCamera || {}, activeSpace === 'layout' ? DEFAULT_LAYOUT_CAMERA : DEFAULT_CREATION_CAMERA);
  const creation = normalizeCamera(
    raw?.cameras?.creation || raw?.creationCamera || (activeSpace === 'creation' ? sourceCamera : {}),
    DEFAULT_CREATION_CAMERA
  );
  const layout = normalizeCamera(
    raw?.cameras?.layout || raw?.layoutCamera || (activeSpace === 'layout' ? sourceCamera : {}),
    DEFAULT_LAYOUT_CAMERA
  );
  return {
    activeSpace,
    // Kept for Format Version 4 compatibility. The creation-space artboard overlay is disabled.
    showLayoutFrameInCreation: false,
    layoutViewport: normalizeLayoutViewport(raw?.layoutViewport || raw?.viewport || {}),
    cameras: { creation, layout },
    visited: {
      creation: raw?.visited?.creation === true || activeSpace === 'creation',
      layout: raw?.visited?.layout === true || activeSpace === 'layout'
    }
  };
}

export function createWorkspace(overrides = {}) {
  return normalizeWorkspace(overrides, { legacyArtboardMode: null, defaultSpace: overrides.activeSpace || 'creation' });
}

export function workspaceSpace(page) {
  return WORKSPACE_SPACES.includes(page?.workspace?.activeSpace) ? page.workspace.activeSpace : 'creation';
}

export function ensureWorkspace(page, options = {}) {
  const legacyMode = options.legacyArtboardMode ?? null;
  page.workspace = normalizeWorkspace(page.workspace || {}, {
    legacyArtboardMode: legacyMode,
    activeCamera: page.camera,
    defaultSpace: options.defaultSpace || 'creation'
  });
  page.camera = page.workspace.cameras[page.workspace.activeSpace];
  return page.workspace;
}

export function activateWorkspace(page, nextSpace) {
  if (!WORKSPACE_SPACES.includes(nextSpace)) return { changed: false, firstVisit: false, activeSpace: workspaceSpace(page) };
  const workspace = ensureWorkspace(page);
  const current = workspace.activeSpace;
  workspace.cameras[current] = normalizeCamera(page.camera, current === 'layout' ? DEFAULT_LAYOUT_CAMERA : DEFAULT_CREATION_CAMERA);
  const firstVisit = workspace.visited[nextSpace] !== true;
  workspace.activeSpace = nextSpace;
  workspace.visited[nextSpace] = true;
  page.camera = workspace.cameras[nextSpace];
  return { changed: current !== nextSpace, firstVisit, activeSpace: nextSpace };
}

export function workspaceDiagnostics(page) {
  const workspace = ensureWorkspace(page);
  return {
    activeSpace: workspace.activeSpace,
    showLayoutFrameInCreation: false,
    layoutViewport: { ...workspace.layoutViewport },
    cameras: {
      creation: { ...workspace.cameras.creation },
      layout: { ...workspace.cameras.layout }
    },
    visited: { ...workspace.visited }
  };
}
