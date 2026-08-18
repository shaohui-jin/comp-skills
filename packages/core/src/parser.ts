/**
 * Vue SFC 解析器：从单个 .vue 文件提取组件引用名、import、template 标签、动态引用
 * 依赖 @vue/compiler-sfc 解析 SFC，babel 解析 script 提取 import。
 */
import { parse } from '@vue/compiler-sfc';
import { parse as babelParse } from '@babel/parser';

/** 一个 import 记录 */
export interface ImportSpec {
  source: string; // import 来源
  isDefault: boolean; // 是否 default 导入
}

/** SFC 解析结果 */
export interface ParseResult {
  /** localName -> import 来源列表 */
  imports: Map<string, ImportSpec[]>;
  /** 模板中出现的组件候选标签（PascalCase + 原始形式） */
  templateTags: Set<string>;
  /** 动态引用（<component :is> / import() 等）原始记录 */
  dynamic: Set<string>;
  /** 解析错误 */
  errors: string[];
}

/** 将标签规范化为 PascalCase：my-foo -> MyFoo */
export function toPascalCase(tag: string): string {
  return tag
    .split(/[-_]/)
    .filter((s) => s)
    .map((s) => s[0].toUpperCase() + s.slice(1))
    .join('');
}

/** 判断名字是否像组件名（首字母大写） */
export function isComponentName(name: string): boolean {
  return /^[A-Z][A-Za-z0-9]*$/.test(name);
}

/** 解析单个 SFC 文件内容 */
export function parseSFC(source: string): ParseResult {
  const result: ParseResult = {
    imports: new Map(),
    templateTags: new Set(),
    dynamic: new Set(),
    errors: [],
  };

  let sfc;
  try {
    sfc = parse(source, { filename: 'component.vue' });
  } catch (e) {
    result.errors.push(`SFC parse error: ${(e as Error).message}`);
    return result;
  }

  const template = sfc.descriptor.template;
  if (template && template.ast) {
    walkTemplateAST(template.ast as unknown, result);
  }

  const script = sfc.descriptor.script;
  const scriptSetup = sfc.descriptor.scriptSetup;
  if (script) extractImports(script.content, result);
  if (scriptSetup) extractImports(scriptSetup.content, result);

  return result;
}

function walkTemplateAST(node: unknown, result: ParseResult): void {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) walkTemplateAST(n, result);
    return;
  }
  if (typeof node === 'object' && node !== null) {
    const obj = node as Record<string, unknown>;
    const tag = obj.tag;
    if (typeof tag === 'string' && tag) {
      if (tag.startsWith(':') || tag === 'component') {
        // 动态 <component :is="..."> 或动态标签
        result.dynamic.add(`<${tag}>`);
      } else if (/^[A-Z]/.test(tag) || tag.includes('-')) {
        result.templateTags.add(tag);
        result.templateTags.add(toPascalCase(tag));
      }
    }
    walkTemplateAST(obj.children, result);
    walkTemplateAST(obj.props, result);
  }
}

/**
 * 用 babel 解析 script 内容，提取 import 语句 + 动态 import() / defineAsyncComponent
 */
function extractImports(code: string, result: ParseResult): void {
  let ast;
  try {
    ast = babelParse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      allowReturnOutsideFunction: true,
    });
  } catch (e) {
    result.errors.push(`script parse error: ${(e as Error).message}`);
    return;
  }

  for (const stmt of ast.program.body) {
    if (stmt.type === 'ImportDeclaration') {
      const src = stmt.source.value;
      for (const spec of stmt.specifiers) {
        if (spec.type === 'ImportDefaultSpecifier') {
          addImport(result.imports, spec.local.name, src, true);
        } else if (spec.type === 'ImportSpecifier' || spec.type === 'ImportNamespaceSpecifier') {
          addImport(result.imports, spec.local.name, src, false);
        }
      }
    }
    // 捕获动态 import() 与 defineAsyncComponent 的字面量路径
    walkForDynamicImport(stmt, result);
    // 捕获渲染函数 / h() / JSX 里的组件引用（h(Comp)、<Comp/>）
    walkForHComponents(stmt, result);
  }
}

/**
 * 识别渲染函数 / h() / JSX 中的组件引用，写入 templateTags。
 * 规则（避免误判）：
 *   - h(Comp)：Comp 是本地 import 的变量名（PascalCase）→ 记为组件引用
 *   - h('div') / h('span')：字符串字面量原生标签 → 忽略
 *   - JSX <Comp/>：Comp 是本地 import 的 PascalCase 名 → 记为组件引用
 *   - 无法对应到本文件 import 的标识符 → 忽略（不是组件或不可静态定位）
 */
function walkForHComponents(node: unknown, result: ParseResult): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  const type = (node as { type?: string }).type;

  if (type === 'CallExpression') {
    const callee = obj.callee as Record<string, unknown> | undefined;
    const args = (obj.arguments as unknown[] | undefined) || [];
    // h(Comp) 或 h('div')
    if (
      callee &&
      callee.type === 'Identifier' &&
      callee.name === 'h' &&
      args.length > 0
    ) {
      const first = args[0] as Record<string, unknown> | undefined;
      if (first && first.type === 'Identifier') {
        const name = first.name as string;
        if (result.imports.has(name) && isComponentName(name)) {
          result.templateTags.add(name);
        }
      }
      // h('div') 等字符串原标签忽略
    }
    // defineAsyncComponent 返回的异步组件引用不在此处理（走 dynamic）
  } else if (type === 'JSXElement') {
    // <Comp/> 或 <Comp></Comp>
    const opening = obj.openingElement as Record<string, unknown> | undefined;
    const nameNode = opening?.name as Record<string, unknown> | undefined;
    if (nameNode && nameNode.type === 'JSXIdentifier') {
      const name = nameNode.name as string;
      if (result.imports.has(name) && isComponentName(name)) {
        result.templateTags.add(name);
      }
    }
  } else if (type === 'JSXOpeningElement') {
    const nameNode = obj.name as Record<string, unknown> | undefined;
    if (nameNode && nameNode.type === 'JSXIdentifier') {
      const name = nameNode.name as string;
      if (result.imports.has(name) && isComponentName(name)) {
        result.templateTags.add(name);
      }
    }
  }

  // 递归子节点
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (Array.isArray(v)) {
      for (const item of v) walkForHComponents(item, result);
    } else if (v && typeof v === 'object') {
      walkForHComponents(v, result);
    }
  }
}

/** 递归遍历 AST，找 CallExpression：import('...') 或 defineAsyncComponent(() => import('...')) */
function walkForDynamicImport(node: unknown, result: ParseResult): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;

  if (node as { type: string }) {
    const type = (node as { type: string }).type;
    if (type === 'CallExpression') {
      const callee = obj.callee as Record<string, unknown> | undefined;
      const args = obj.arguments as unknown[] | undefined;
      // import('pkg') 或动态 import 字面量
      if (callee && callee.type === 'Import') {
        const first = args?.[0] as Record<string, unknown> | undefined;
        if (first && first.type === 'StringLiteral' && typeof first.value === 'string') {
          result.dynamic.add(`import('${first.value}')`);
        }
      }
      // defineAsyncComponent(() => import('./X.vue'))
      if (callee && callee.type === 'Identifier' && callee.name === 'defineAsyncComponent') {
        result.dynamic.add('defineAsyncComponent(...)');
      }
    }
  }

  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (Array.isArray(v)) {
      for (const item of v) walkForDynamicImport(item, result);
    } else if (v && typeof v === 'object') {
      walkForDynamicImport(v, result);
    }
  }
}

function addImport(
  map: Map<string, ImportSpec[]>,
  localName: string,
  src: string,
  isDefault: boolean,
): void {
  if (!map.has(localName)) map.set(localName, []);
  const list = map.get(localName)!;
  if (!list.some((x) => x.source === src)) list.push({ source: src, isDefault });
}
