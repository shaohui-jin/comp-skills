# MCP 包更名 + 旧包下架指南

从 `@shaohui_jin/comp-mcp-server` 更名为 `@shaohui_jin/comp-insight-mcp-server`，
与 git-skill 的 `@shaohui_jin/git-insight-mcp-server` 命名风格对齐。

## 为什么需要"下架"旧包

**npm 不允许删除已经发布的包**（`npm unpublish` 只有发布后 72 小时内可用，且会拉黑作用域）。
所以正确的"下架"方式是 **deprecate（标记废弃）**：旧包保留，但 npm 会在安装/查询时给出
明确废弃提示，引导用户切换到新包。这是官方推荐的、不可逆性最低的做法。

## 代码侧改动（已完成）

以下文件已把包名从 `comp-mcp-server` 改为 `comp-insight-mcp-server`：

| 文件 | 改动 |
|------|------|
| `packages/mcp/package.json` | `name` → `@shaohui_jin/comp-insight-mcp-server`（**bin 保留 `comp-mcp-server`**，CLI 命令名不变） |
| `package.json`（根） | `build:mcp` / `publish:mcp` 的 filter 改新名 |
| `.github/workflows/release-mcp-server.yml` | filter 与发布注释改新名 |
| `README.md` / `docs/design.md` | 涉及包名的 7 处改新名 |

> **为什么 bin 保留 `comp-mcp-server`**：bin 是可执行命令名，不是 npm 包名。保留它，
> 老用户的 MCP 配置里 `command: comp-mcp-server` 无需更改，只是包来源换成新包名。

## 操作步骤（需要你本机 npm 登录）

> 当前本机 npm 未登录，以下命令需先 `npm login`（或 `npm adduser`）一次。

### 第 1 步：确认旧包已发布、未废弃

```bash
npm view @shaohui_jin/comp-mcp-server version deprecated
# 期望看到 version=0.1.0、deprecated 为空（= 已发布、未废弃）
```

### 第 2 步：deprecate 旧包（把用户引导到新包）

```bash
npm deprecate @shaohui_jin/comp-mcp-server "包已更名，请改用 @shaohui_jin/comp-insight-mcp-server"
```

执行后旧包仍然存在，但 `npm install @shaohui_jin/comp-mcp-server` 会提示废弃信息。

### 第 3 步：发布新包

```bash
# 从项目根（或 mcp 包目录）构建并发布新包
pnpm --filter @shaohui_jin/comp-insight-mcp-server build

cd packages/mcp
npm publish --access public
```

或者在 GitHub 上触发 `Release MCP server` workflow（push 到 main 且 version bump）自动发布。

### 第 4 步：验证

```bash
# 新包可见、正常
npm view @shaohui_jin/comp-insight-mcp-server version
# 旧包已废弃
npm view @shaohui_jin/comp-mcp-server deprecated
```

## 注意事项

1. **deprecate 只能做一次**，且设置后会覆盖之前的内容；如需撤销可再 deprecate 成空字符串。
2. 新包首次发布用 **0.1.0** 即可；之后保持 workflow 的 tag 判据（`mcp-server-v{version}`）。
3. 若未来确定不用旧包且清除痕迹，只能联系 npm 支持移除，但 scope 下一般不建议（可能封号）。
4. **baseUrl 别名**：如果你的 MCP 配置用的是 `npx -y @shaohui_jin/comp-mcp-server@latest`，
   需同步改成 `@shaohui_jin/comp-insight-mcp-server@latest`。
