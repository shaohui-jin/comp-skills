/**
 * @shaohui_jin/comp-core —— Vue 组件依赖分析引擎统一导出
 * UI（webview）、MCP server、CLI 三者复用此入口，保证结果一致。
 */
export { analyze, collectVueFiles } from './analyzer.js';
export { parseSFC, toPascalCase, isComponentName } from './parser.js';
export { findSCC, extractCycles, reachableNodes } from './graph.js';
export { DEFAULT_LAYERS, layerOf, checkLayerViolations } from './layers.js';
export { renderText, renderMermaid } from './report.js';
export { buildTree } from './buildTree.js';

export type * from './types.js';
