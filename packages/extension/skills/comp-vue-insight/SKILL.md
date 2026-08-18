---
name: comp-vue-insight
description: >-
  Analyze a Vue project's component dependencies: build the component dependency
  graph, detect circular dependencies, find unused (orphan) components, report
  fan-in/fan-out statistics, and check layer/architecture violations. Invoke
  with /comp-vue-insight then state the project path or intent.
disable-model-invocation: true
metadata:
  short-description: Vue 组件依赖分析：循环依赖、无用组件、扇入扇出、分层检查
---

# Comp Vue Insight

分析一个 Vue 项目的组件依赖关系，评估组件化设计是否合理。

## 用法（用户侧）

1. Agent 聊天输入 `/comp-vue-insight`（斜杠菜单选本 Skill）
2. 同一条消息或下一条写清项目路径或需求，例如：
   - `分析 D:/my-app 的组件依赖`
   - `看看 src/components 有没有循环依赖`
   - `找出没有使用到的组件`
3. 由本 Skill 编排分析（不要自己拼 CLI 参数）。

## CLI

CLI 绝对路径在安装扩展时已写入（见下方 `__COMP_INSIGHT_CLI__`）。

基本用法：

```bash
__COMP_INSIGHT_CLI__ <project-root> [--src src] [--entry a.js,b.js] [--out report.md] [--json]
```

其中 `__COMP_INSIGHT_CLI__` 是扩展安装时被替换成的实际 CLI 绝对路径。

## 分析流程

```
收集组件 → 构建依赖图 → 检测循环(SCC) → 找无用组件(可达性) → 统计扇入扇出 → 分层/越层检查
```

## 输出结构

```markdown
## 概览  （组件数 / 循环数 / 无用组件数 / 越层数）
## 循环依赖（相互引用的组件环，需重点排查）
## 无用组件（未使用的遗留组件，可考虑删除）
## 扇入扇出 Top（高扇入=复用点/上帝组件；高扇出=耦合重）
## 越层引用（低层依赖更高层）
## 未解析动态引用（<component :is> 等，需人工确认）
## Mermaid 依赖图（可选，供可视化）
```

## 硬性规则

1. 默认源码目录 `src`，可用 `--src` 覆盖。
2. 默认入口 `src/main.ts`，可多个用逗号分隔。
3. `--out` 生成的报告是 Markdown，可直接贴给用户。
4. `--json` 输出结构化结果，供进一步处理或图纸化。
5. 项目路径必须是本地绝对路径。

## 评估建议（供设计评审参考）

- 扇入过高（如被 >10 个组件引用）→ 可能是复用核心，也可是上帝组件，评估是否拆解。
- 扇出过高（>8）→ 容器组件耦合过重，评估是否用插槽/组合式 API 收敛。
- 循环依赖 → 通常应打破：用接口注入、状态提升、或移到公共层。
- 无用组件 → 确认后删除，可通过本工具判定的孤儿组件列表定位。
- 越层引用 → 基础组件不应依赖业务/页面组件，调整目录归属或解耦。
