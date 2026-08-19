# comp-skill

Vue 组件依赖分析系统：识别组件引用状态、依赖关系、循环依赖、无用组件，
评估组件化设计是否合理。架构参考 `git-skill`，三层 mono-repo。

## 能力

- **依赖关系分析** 构建组件间的引用图（模板标签 / script setup import）
- **循环依赖检测** Tarjan 强连通分量，找出相互引用的环
- **无用组件检测** 从入口出发的可达性分析，找出孤儿组件
- **扇入/扇出统计** 每个组件被引用数（扇入）与引用数（扇出），评估复用度与耦合度
- **分层/越层检查** 按目录约定分层，标记违反依赖方向的引用
- **动态引用处理** 识别 `<component :is>` / defineAsyncComponent / import()，避免误判
- **可视化** webview（vue+vite）依赖图 + 统计面板

## 包（pnpm workspace）

| 包 | 说明 |
|----|------|
| `packages/core` | `@shaohui_jin/comp-core` 纯分析引擎 + CLI |
| `packages/extension` | `comp-insight` Cursor/VS Code 扩展（含 webview + skill） |
| `packages/mcp` | `@shaohui_jin/comp-insight-mcp-server` MCP server（含 HTTP UI 页） |

## 快速开始

### 1. 分析引擎（core CLI）

```bash
pnpm install
pnpm --filter @shaohui_jin/comp-core build

# 分析一个 Vue 项目
pnpm analyze <project-root> [--src src] [--entry a.js,b.js] [--out report.md] [--json]
```

### 2. MCP server（任意 MCP 宿主可调用）

```bash
pnpm --filter @shaohui_jin/comp-core build
pnpm --filter @comp-insight/webview build
pnpm --filter @shaohui_jin/comp-insight-mcp-server build

# 以 stdio 模式作为 MCP server 运行
node packages/mcp/dist/index.js

# 或在浏览器打开分析 UI（serve 与扩展一致的 webview 产物）
node packages/mcp/dist/index.js --http
# 打开 http://127.0.0.1:8931/?project=<项目绝对路径>
```

### 3. Cursor / VS Code 扩展

```bash
pnpm --filter @shaohui_jin/comp-core build
pnpm --filter @comp-insight/webview build
pnpm --filter comp-insight build:ext
pnpm package:vsix   # 生成 comp-insight.vsix
```

安装扩展后：
- 命令面板运行 `Comp Insight: 打开组件分析面板`
- 启动时自动把 `/comp-vue-insight` Skill 同步到全局（`~/.cursor/skills`、`~/.agents/skills`、`~/.meituan-catpaw/*/skills`）
- 相关命令见 commands

## UI 复用一个构建产物

webview（vue+vite）产物被**同一份**在两种环境加载：
- **扩展 webview**：`createWebviewPanel` 加载 `dist/webview/assets`
- **MCP 起页**：MCP 内置 HTTP server serve 同一份产物 + `GET /api/analyze`

前端 `api.ts` 靠运行时检测宿主（`window.acquireVsCodeApi`）自动切换数据源（postMessage / fetch），保证 Cursor 面板与浏览器页完全一致。

## 发布

- **扩展** → `.github/workflows/release-on-version.yml`（Open VSX，Secret `OVSX_PAT`）
- **MCP server** → `.github/workflows/release-mcp-server.yml`（npm，Secret `NPM_TOKEN`）
- 包名：`@shaohui_jin/comp-insight-mcp-server`（npm，access public）

详见 [docs/design.md](docs/design.md)。
