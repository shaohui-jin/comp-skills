# comp-skill 设计文档

Vue 组件依赖分析系统：识别组件引用状态、依赖关系、循环依赖、无用组件，
评估组件化设计合理性。架构完全参考 `git-skill`，三层 mono-repo。

## 1. 目标能力

| 能力 | 说明 |
|------|------|
| 依赖关系分析 | 还原组件间的引用关系（模板标签 / script setup import） |
| 循环依赖检测 | Tarjan 强连通分量，找出相互引用的环 |
| 无用组件检测 | 从入口出发的可达性分析，找出孤儿组件 |
| 扇入/扇出统计 | 每个组件被引用数（扇入）与引用数（扇出），评估复用度与耦合度 |
| 分层/越层检查 | 按目录约定分层，标记违反依赖方向的引用 |
| 动态引用处理 | 识别 `<component :is>` / defineAsyncComponent / import() / 字符串注册，避免误判，无法解析的标记为 dynamic |
| 可视化 | webview（vue+vite）依赖图 + 统计面板，复用同一构建产物 |

## 2. 架构分层（mono-repo，pnpm workspace）

```
component-skills/
├── packages/
│   ├── core/                    # @shaohui_jin/comp-core —— 纯分析引擎，无 UI 依赖
│   │   └── src/
│   │       ├── parser.ts        # SFC 解析：import / template 标签 / 动态引用
│   │       ├── graph.ts         # 有向图 + Tarjan SCC + 可达性
│   │       ├── analyzer.ts      # 主分析器：依赖图、扇入扇出、无用组件
│   │       ├── layers.ts        # 分层约定与越层检查
│   │       ├── types.ts         # 领域类型（AnalysisReport 等）
│   │       ├── index.ts         # 统一导出
│   │       └── cli.ts           # CLI 入口
│   ├── extension/               # comp-insight Cursor/VS Code 扩展
│   │   ├── src/                 # 扩展宿主：命令、面板、skill 同步、webview 加载
│   │   ├── skills/comp-vue-insight/SKILL.md
│   │   ├── webview/             # vue + vite 构建的 UI
│   │   └── package.json
│   └── mcp/                     # @shaohui_jin/comp-insight-mcp-server —— npm 包
│       └── src/index.ts         # MCP server + 内嵌 HTTP 页面
├── .github/workflows/           # release-on-version（扩展）+ release-mcp-server（npm）
├── docs/design.md
└── pnpm-workspace.yaml
```

## 3. 复用与发布机制

### core 是唯一计算源

`index.ts` 导出 `analyze(project)` 纯函数。UI（webview）、MCP、CLI 三者共用。

### UI 复用一个构建产物（方案 A：MCP 内置 HTTP fallback）

webview 用 vue+vite 构建，产物 `dist/webview/assets/{index.js,index.css}`。
同一份产物被两处加载：

- **扩展内**：`createWebviewPanel` 加载 assets 入口，走 `postMessage` 协议。
- **MCP 起页**：MCP 内置本地 HTTP server，serve 同一份 html/assets +
  `GET /api/analyze?project=<path>`，webview 用 `fetch` 拉数据。
  `__isWebview__` 环境标记（vite define）让同一源码自动切换数据源。

### skill 注入全局

extension 启动时把内置 `skills/comp-vue-insight/SKILL.md` 同步到
`~/.cursor/skills/`、`~/.agents/skills/`、`~/.meituan-catpaw/9248539234/skills/`，
并把 CLI 绝对路径写入占位符。安装扩展即全局可用 `/comp-vue-insight`。

### 发布

- 扩展 → Open VSX，tag `v{version}`
- MCP server → npm，package `@shaohui_jin/comp-insight-mcp-server`，tag `mcp-server-v{version}`
- 判据「这个版本发布过没」，tag 在发布成功后打

## 4. 分层约定（默认）

按目录前缀映射层级，依赖只能「上层→同层→下层」，禁止反向：

| 层级 | 目录前缀 | 说明 |
|------|---------|------|
| L0 基础组件 | `components/common`, `components/base`, `ui` | 最底层 |
| L1 业务组件 | `components`（其余按模块） | 依赖 common |
| L2 页面级 | `views`, `pages`, `layouts` | 依赖 components |
| L3 顶层容器 | `App.vue`, 入口 | 依赖所有层 |

config 允许自定义 `layerByDir`。越层报告反向引用。

## 5. 动态引用

- 指令 `:<tag>` 静态可解析的字面量 → 建边
- 字符串字面量 import / defineAsyncComponent 字面量 → 建边
- 其余 → 标记 dynamic，不参与「无用组件」判定

## 6. 包命名与发布配置

| 包 | name | publisher | npm |
|----|------|-----------|-----|
| core | `@shaohui_jin/comp-core` | - | public |
| extension | `comp-insight` | `jinshaohui` | 非 npm（vsix/ovsx） |
| mcp | `@shaohui_jin/comp-insight-mcp-server` | - | npm，public |

MCP npm 接入参考：`git-skill` 的 `@shaohui_jin/git-insight-mcp-server`。

## 7. 参考来源

- git-skill（D:\_myproject\git-skill）：mono-repo、skill 全局同步、MCP fallback 页面、GitHub Actions。
- package 命名参考 `@shaohui_jin/comp-insight-mcp-server`（对齐 git-skill 的 `git-insight-mcp-server`）。旧名 `@shaohui_jin/comp-mcp-server` 若已发布则 deprecate，见 docs/deprecate-old-mcp.md。
