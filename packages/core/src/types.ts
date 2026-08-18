/**
 * comp-core 领域类型
 */

/** 单个依赖边：from -> to */
export interface DependencyEdge {
  from: string; // 逻辑路径（相对项目根，如 src/components/A.vue）
  to: string;
  kind: 'template' | 'import' | 'script-setup' | 'async' | 'dynamic';
  line?: number;
}

/** 一个组件节点的统计与属性 */
export interface ComponentNode {
  /** 逻辑路径，如 src/components/Foo.vue */
  path: string;
  /** 组件别名（basename 去 .vue） */
  name: string;
  /** 引用它的组件数 */
  fanIn: number;
  /** 它引用的组件数 */
  fanOut: number;
  /** 被入口引用或可达 */
  used: boolean;
  /** 是否疑似无用 */
  dead: boolean;
  /** 所属层级，0 未分层 */
  layer: number;
  /** 层名，如 L0 / 基础组件 */
  layerName: string;
  /** 文件行数（粗略反映组件大小/复杂度） */
  lineCount: number;
}

/** 一个强连通分量（循环依赖环） */
export interface Cycle {
  /** 环内组件路径，已排序 */
  components: string[];
}

/** 越层引用告警 */
export interface LayerViolation {
  from: string;
  to: string;
  fromLayer: number;
  toLayer: number;
  message: string;
}

/** 无法解析的动态引用 */
export interface UnresolvedRef {
  file: string;
  /** 触发它的语法，如 `<component :is="x">` */
  syntax: string;
  detail: string;
}

/** 完整分析报告 */
export interface AnalysisResult {
  /** 项目根 */
  projectRoot: string;
  /** 扫描到的 .vue 文件数 */
  fileCount: number;
  /** 全部组件逻辑路径 */
  components: string[];
  /** 依赖边 */
  edges: DependencyEdge[];
  /** 循环依赖环列表 */
  cycles: Cycle[];
  /** 无用组件路径 */
  deadComponents: string[];
  /** 疑似孤立（无入边）组件（可能被入口引用） */
  orphans: string[];
  /** 入口组件路径 */
  entries: string[];
  /** 每个组件的统计 */
  nodeStats: ComponentNode[];
  /** 越层引用 */
  layerViolations: LayerViolation[];
  /** 无法解析的动态引用 */
  unresolved: UnresolvedRef[];
  /** 自定义诊断 */
  diagnostics: string[];
}

/** 分析配置 */
export interface AnalyzeOptions {
  /** 源码目录，相对项目根，默认 src */
  srcDir?: string;
  /** 入口文件（非 .vue），如 src/main.ts，用于识别入口组件 */
  entryFiles?: string[];
  /** 忽略路径片段 */
  ignore?: string[];
  /** 分层配置 */
  layers?: LayerConfig;
}

export interface LayerRule {
  /** 目录前缀，如 src/views */
  dir: string;
  /** 层级序号，越大越顶层 */
  level: number;
  /** 层名 */
  name: string;
}

export interface LayerConfig {
  rules: LayerRule[];
  /** 是否允许上层引用下层（默认 true，允许） */
  allowHigherToLower?: boolean;
}

/** 目录树/脑图节点元数据 */
export interface TreeNodeMeta {
  /** 扇入 */
  fanIn?: number;
  /** 扇出 */
  fanOut?: number;
  /** 文件行数（仅组件） */
  lineCount?: number;
  /** 是否在循环依赖环上 */
  inCycle?: boolean;
  /** 是否无用组件 */
  dead?: boolean;
  /** 是否被引用/在用 */
  used?: boolean;
  /** 目录下子项数（含子目录与组件，仅目录节点） */
  subCount?: number;
  /** 目录下组件总数（仅目录节点） */
  compCount?: number;
}

/** 目录树/脑图中的一个节点 */
export interface TreeNode {
  /** 唯一 id（逻辑路径或路径+名字） */
  id: string;
  /** 显示名（目录名或组件文件名去掉 .vue） */
  name: string;
  /** 逻辑路径 */
  path: string;
  /** 节点类型：目录 or 组件 */
  type: 'dir' | 'comp';
  info: TreeNodeMeta;
  /** 子节点（目录才有） */
  children: TreeNode[];
}

/** 目录脑图聚合结果 */
export interface TreeResult {
  /** 根节点（配置的目录起点） */
  root: TreeNode;
  /** 展开到叶子后出现过的所有路径（用于前端定位） */
  nodeCount: number;
}

