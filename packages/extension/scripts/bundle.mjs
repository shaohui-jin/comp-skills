import * as esbuild from "esbuild";
import { readFile, readdir, rm, mkdir, copyFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");
const dist = resolve(root, "dist");
const coreDist = resolve(root, "../core/dist");
const webviewDist = resolve(root, "webview/dist");

async function exists(p) {
  try {
    await readFile(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dest, { recursive: true });
  for (const entry of entries) {
    const s = join(src, entry.name);
    const d = join(dest, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await copyFile(s, d);
  }
}

// 清空 dist（保留 webview）
try {
  for (const name of await readdir(dist)) {
    if (name !== "webview") {
      await rm(join(dist, name), { recursive: true, force: true });
    }
  }
} catch {
  // dist 尚未创建
}

// @vue/compiler-sfc 的可选模板引擎（consolidate 类）。我们的分析只解析 SFC 结构，
// 不会触达这些运行时懒加载的 require，因此 external 掉是安全且标准的做法。
const VUE_OPTIONAL = [
  "atpl", "babel-core", "coffee-script", "dot", "dustjs-linkedin", "ejs", "eco", "ect",
  "haml", "haml-coffee", "hamlet", "hamljs", "handlebars", "hogan.js", "htmling",
  "jade", "jazz", "jqtpl", "just", "liquor", "marko", "mote", "mustache", "plates",
  "ractive", "react", "react-dom/server", "slm", "squirrelly", "swig", "teacup/lib/express",
  "templayed", "toffee", "twig", "twing", "underscore", "vash", "velocityjs", "walrus",
  "whiskers", "bracket-template",
];

// 打包扩展主文件（core 与 @vue/compiler-sfc 内联进 bundle，确保 VSIX 自包含；仅 vscode 与可选引擎为 external）
await esbuild.build({
  entryPoints: [resolve(root, "src/extension.ts")],
  outfile: resolve(dist, "extension.js"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  external: ["vscode", ...VUE_OPTIONAL],
  sourcemap: true,
  logLevel: "warning",
});

// 拷贝 core 的 CLI（skill 用绝对路径调用）
await mkdir(dist, { recursive: true });
if (await exists(resolve(coreDist, "cli.js"))) {
  await copyFile(resolve(coreDist, "cli.js"), resolve(dist, "cli.js"));
}

// 拷贝 webview 产物（供面板加载）
if (await exists(join(webviewDist, "index.html"))) {
  await mkdir(join(dist, "webview"), { recursive: true });
  await copyDir(webviewDist, join(dist, "webview"));
}

const ext = await readFile(resolve(dist, "extension.js"), "utf8");
if (/require\(["']ws["']\)/.test(ext)) {
  console.error("extension.js 不能引用 ws（VSIX 无 node_modules）");
  process.exit(1);
}

console.log("bundled dist/extension.js + dist/cli.js + dist/webview");
