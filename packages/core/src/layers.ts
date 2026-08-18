/**
 * 分层约定与越层检查
 */
import type { LayerConfig, LayerViolation } from './types.js';

/** 默认分层规则 */
export const DEFAULT_LAYERS: LayerConfig = {
  rules: [
    { dir: 'components/common', level: 0, name: 'L0 基础组件' },
    { dir: 'components/base', level: 0, name: 'L0 基础组件' },
    { dir: 'ui', level: 0, name: 'L0 基础组件' },
    { dir: 'components', level: 1, name: 'L1 业务组件' },
    { dir: 'views', level: 2, name: 'L2 页面' },
    { dir: 'pages', level: 2, name: 'L2 页面' },
    { dir: 'layouts', level: 2, name: 'L2 布局' },
  ],
  allowHigherToLower: true,
};

/**
 * 判断一个逻辑路径所属层级。返回 { level, name }，未命中返回 -1。
 * 规则是有序的，路径匹配越精确（前缀匹配）优先级越高，因此把更具体的
 * 目录放在前面。这里按 dir 逐一前缀匹配，返回第一个命中。
 */
export function layerOf(
  logicalPath: string,
  config: LayerConfig = DEFAULT_LAYERS,
): { level: number; name: string } {
  // 归一化，并剥离 src/ 前缀，便于按段边界匹配规则目录
  const norm = logicalPath.replace(/\\/g, '/');
  const stripped = norm.replace(/^src\//, '').replace(/^\//, '');
  for (const rule of config.rules) {
    const needle = rule.dir.replace(/\\/g, '/').replace(/^src\//, '');
    // 段边界匹配：完全相等，或 path = 规则 + '/子路径'
    if (stripped === needle || stripped.startsWith(needle + '/')) {
      return { level: rule.level, name: rule.name };
    }
  }
  return { level: -1, name: '未分层' };
}

/**
 * 检查依赖边是否越层。返回越层告警列表。
 * 约定：允许「高 level 引用低 level」（上层依赖下层），禁止「低引用高」（反向）。
 */
export function checkLayerViolations(
  edges: Array<{ from: string; to: string }>,
  config: LayerConfig = DEFAULT_LAYERS,
): LayerViolation[] {
  const violations: LayerViolation[] = [];
  for (const edge of edges) {
    const fromL = layerOf(edge.from, config);
    const toL = layerOf(edge.to, config);
    if (fromL.level === -1 || toL.level === -1) continue;
    if (config.allowHigherToLower !== false && toL.level < fromL.level) continue;
    // 只有「低引用高」且默认不允许时才报
    if (config.allowHigherToLower === false && fromL.level < toL.level) {
      violations.push({
        from: edge.from,
        to: edge.to,
        fromLayer: fromL.level,
        toLayer: toL.level,
        message: `${edge.from}(${fromL.name}) 反向依赖 ${edge.to}(${toL.name})`,
      });
    }
  }
  return violations;
}
