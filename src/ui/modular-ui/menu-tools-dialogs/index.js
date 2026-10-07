export { createUiB002MenuModule } from './menu.js';
export { createUiB002ToolsModule } from './tools.js';
export { createUiB002OptionsModule } from './options.js';
export {
  createImportImageDialogModule, createImageAdjustmentDialogModule, createImageCropDialogModule,
  createImageFilterDialogModule, createImageSizeDialogModule, createNewDocumentDialogModule,
  createExportDialogModule, createImportSvgDialogModule, createReferenceImportDialogModule, createPreferencesDialogModule, createDiagnosticsDialogModule
} from './dialogs.js';
export { normalizeNewDocumentRequest, UI_B_002_NEW_DOCUMENT_PRESETS, UI_B_002_NEW_DOCUMENT_PPI } from './new-document.js';
export {
  UI_B_002_CONTROL_REPORT, UI_B_002_FIXED_TOOLS, UI_B_002_MENU_ITEMS, UI_B_002_MENU_LABELS,
  UI_B_002_RASTER_OPTIONS, UI_B_002_SOURCE_PINNED_DISPOSITION, UI_B_002_TOOL_GROUPS, UI_B_002_TOOL_LAYOUT
} from './control-matrix.js';
export { UI_B_002_CSS } from './styles.js';

export const UI_B_002_INSTALL_MANIFEST=Object.freeze({
  package:'B',version:2,
  slots:Object.freeze(['menu','tools','options','dialogs.content']),
  topLevelFactories:Object.freeze(['createUiB002MenuModule','createUiB002ToolsModule','createUiB002OptionsModule']),
  boundedServices:Object.freeze(['uiBTools','uiBImage','uiBNative']),
  siblingContracts:Object.freeze(['panelOpen(panelId,detail) staged by MR and consumed by C optional-panel composition','D-owned view/guide controls remain command/integration dependencies']),
  sharedIntegration:Object.freeze(['modular-ui/index.js composition + package CSS/services','document.new.v1 args/receipt','native-service-ports documentIO pass-through']),
  defaultSwitch:false,deployment:false
});
