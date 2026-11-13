// Fails when interface copy in web/src is written as a bare string instead of
// going through the translation macros (`t`, `plural`, `<Trans>`; see
// docs/i18n.md), beyond each file's recorded baseline.
//
// The baseline (scripts/unlocalized_copy_baseline.json) only ratchets down:
// a file may not gain unlocalized copy, and `--update` rewrites it with the
// current counts but refuses to record an increase. A string that is not
// interface copy (a protocol name, a unit symbol, a format token) is marked
// with an `i18n-ignore` comment on its line or the line above, with a reason.
//
// What counts as copy is decided from the TypeScript syntax tree, not from
// regular expressions over lines:
//   - JSX text containing a letter;
//   - a string in a JSX attribute that carries words a person reads
//     (`aria-label`, `title`, `placeholder`, `label`, `description`, …);
//   - any other string or template literal that reads as prose: two or more
//     words starting with a capital, or ending a sentence, or a single
//     capitalized word assigned to a copy-shaped property (`label: 'Save'`).
// Class lists, comparisons, object keys, imports, types, console output and
// thrown errors are not copy.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const COPY_ATTRIBUTES = new Set([
  'aria-label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'aria-valuetext',
  'alt',
  'title',
  'placeholder',
  'label',
  'description',
  'heading',
  'subtitle',
  'caption',
  'hint',
  'info',
  'note',
  'tooltip',
  'message',
  'summary',
  'emptyLabel',
  'emptyText',
  'emptyMessage',
  'confirmLabel',
  'cancelLabel',
  'actionLabel',
  'ariaLabel',
  'text',
]);

const NON_COPY_ATTRIBUTES = new Set([
  'className',
  'class',
  'id',
  'key',
  'type',
  'href',
  'src',
  'srcSet',
  'role',
  'name',
  'htmlFor',
  'rel',
  'target',
  'method',
  'inputMode',
  'autoComplete',
  'lang',
  'dir',
  'form',
  'slot',
  'variant',
  'size',
  'side',
  'align',
  'mode',
  'tone',
  'kind',
  'state',
  'status',
  'value',
  'defaultValue',
  'd',
  'viewBox',
  'fill',
  'stroke',
  'transform',
  'accept',
  'pattern',
  'path',
  'language',
  'icon',
  'testId',
]);

/** Properties whose single capitalized word is still a label (`label: 'Save'`). */
const COPY_PROPERTY =
  /(?:label|title|text|heading|caption|description|placeholder|message|summary|hint|tooltip|verb|noun|empty|subtitle|prompt|question|answer|reason|detail|note|action)s?$/iu;

/** Properties whose value is always words a person reads, whatever their case. */
const LABEL_PROPERTIES =
  /^(?:label|title|heading|caption|placeholder|description|summary|hint|tooltip|ariaLabel)$/u;

/** Calls whose arguments are not interface copy. */
const NON_COPY_CALLEES = new Set([
  'cn',
  'clsx',
  'cva',
  'twMerge',
  'require',
  'querySelector',
  'querySelectorAll',
  'closest',
  'matches',
  'getElementById',
  'getAttribute',
  'setAttribute',
  'hasAttribute',
  'removeAttribute',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'matchMedia',
  'getItem',
  'setItem',
  'removeItem',
  'startsWith',
  'endsWith',
  'includes',
  'indexOf',
  'split',
  'replace',
  'replaceAll',
  'join',
  'invoke',
  'fetch',
  'get',
  'has',
  'set',
  'delete',
  'test',
  'match',
  'mark',
  'measure',
]);

const NON_COPY_OBJECTS = new Set(['console', 'JSON', 'Object', 'Reflect', 'performance']);

const IGNORE_MARK = 'i18n-ignore';

/** Directories under web/src whose files are not interface copy. */
const EXCLUDED_PREFIXES = [
  'web/src/test/',
  'web/src/test-fixtures/',
  'web/src/locales/',
  // Bundled into the pre-paint boot script, which has no translation runtime;
  // the theme names are translated where they are shown.
  'web/src/theme/',
];

const EXCLUDED_FILES = new Set([
  // Language names are written in their own language and never translated.
  'web/src/i18n/locales.ts',
]);

function letters(text) {
  return /\p{L}/u.test(text);
}

/** Words of two or more letters. */
function words(text) {
  return text.match(/\p{L}[\p{L}'’]+/gu) ?? [];
}

function looksLikeClassList(text) {
  // Tailwind-style tokens: `flex`, `items-center`, `px-2`, `md:grid`, `[&_svg]:size-3`.
  return text
    .trim()
    .split(/\s+/u)
    .every((token) => /^[!a-z0-9@&[\]():.%/_*>+~=,#'"-]+$/u.test(token) && !/^[A-Z]/u.test(token));
}

function looksLikeIdentifier(text) {
  return /^[\w.:/@#$%-]+$/u.test(text);
}

/** Prose a person reads: capitalized multi-word text or a finished sentence. */
function readsAsProse(text) {
  const value = text.trim();
  if (!letters(value)) return false;
  if (/^(?:https?:|mailto:|data:|\/|\.\/|#|\$)/u.test(value)) return false;
  const wordList = words(value);
  if (wordList.length === 0) return false;
  if (wordList.length >= 2 && /\s/u.test(value)) {
    if (looksLikeClassList(value)) return false;
    if (/^\p{Lu}/u.test(value)) return true;
    if (/[.?!…:]$/u.test(value)) return true;
    // Lowercase phrases (`no results`, `files selected`) are copy when they are
    // plain words; code-shaped strings carry punctuation instead.
    return /^[\p{L}\d'’ ,()–-]+$/u.test(value) && wordList.length >= 2;
  }
  return false;
}

function singleCapitalizedWord(text) {
  const value = text.trim();
  return /^\p{Lu}\p{Ll}+[.…?!]?$/u.test(value) || /^\p{Lu}\p{Ll}+(?: \p{L}+)?[.…]?$/u.test(value);
}

function templateText(node) {
  if (ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join(' ');
}

function calleeName(expression) {
  if (ts.isIdentifier(expression)) return expression.text;
  if (ts.isPropertyAccessExpression(expression)) return expression.name.text;
  return undefined;
}

function calleeObject(expression) {
  if (ts.isPropertyAccessExpression(expression)) {
    const target = expression.expression;
    if (ts.isIdentifier(target)) return target.text;
  }
  return undefined;
}

function propertyName(name) {
  if (!name) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isPrivateIdentifier(name)) {
    return name.text;
  }
  return undefined;
}

/** Why a literal is not copy, judged from where it sits; undefined when it may be copy. */
function nonCopyContext(node) {
  let child = node;
  let parent = node.parent;
  while (parent) {
    if (
      ts.isImportDeclaration(parent) ||
      ts.isExportDeclaration(parent) ||
      ts.isImportTypeNode(parent) ||
      ts.isLiteralTypeNode(parent) ||
      ts.isExternalModuleReference(parent)
    ) {
      return 'module or type';
    }
    if (ts.isTaggedTemplateExpression(parent)) return 'tagged template';
    if (ts.isCaseClause(parent) && parent.expression === child) return 'comparison';
    if (ts.isBinaryExpression(parent)) {
      const operator = parent.operatorToken.kind;
      if (
        operator === ts.SyntaxKind.EqualsEqualsEqualsToken ||
        operator === ts.SyntaxKind.ExclamationEqualsEqualsToken ||
        operator === ts.SyntaxKind.EqualsEqualsToken ||
        operator === ts.SyntaxKind.ExclamationEqualsToken ||
        operator === ts.SyntaxKind.InKeyword
      ) {
        return 'comparison';
      }
    }
    if (ts.isPropertyAssignment(parent) && parent.name === child) return 'property name';
    if (ts.isElementAccessExpression(parent) && parent.argumentExpression === child) {
      return 'property name';
    }
    if (ts.isNewExpression(parent) && calleeName(parent.expression)?.endsWith('Error')) {
      return 'thrown error';
    }
    if (ts.isCallExpression(parent) && parent.expression !== child) {
      const name = calleeName(parent.expression);
      const object = calleeObject(parent.expression);
      if (object && NON_COPY_OBJECTS.has(object)) return 'developer output';
      if (name && NON_COPY_CALLEES.has(name)) return 'not copy';
      // Already translated: `i18n._(…)` and macro calls.
      if (name === '_' || name === 't' || name === 'msg' || name === 'plural') return 'translated';
    }
    if (ts.isJsxAttribute(parent)) {
      const name = parent.name.getText();
      if (NON_COPY_ATTRIBUTES.has(name) || name.startsWith('data-')) return 'not copy';
      return undefined;
    }
    if (ts.isVariableDeclaration(parent) && ts.isIdentifier(parent.name)) {
      if (
        /class(?:name)?s?$|style|css|selector|pattern|regex|mime|key$|keys$|^[A-Z0-9_]*(?:ID|KEY|PATH|URL)S?$/iu.test(
          parent.name.text,
        )
      ) {
        return 'not copy';
      }
    }
    if (ts.isPropertyAssignment(parent)) {
      const name = propertyName(parent.name);
      if (
        name &&
        /^(?:class(?:Name)?|style|css|id|key|type|kind|href|src|url|path|pattern|selector|mime|format|icon|tone|variant|status|state|role|lang|locale|mode|slot|tag|value)$/iu.test(
          name,
        )
      ) {
        return 'not copy';
      }
      return undefined;
    }
    if (
      ts.isStatement(parent) ||
      ts.isFunctionLike(parent) ||
      ts.isJsxElement(parent) ||
      ts.isJsxSelfClosingElement(parent)
    ) {
      return undefined;
    }
    child = parent;
    parent = parent.parent;
  }
  return undefined;
}

/** The property a literal is the value of (`label: 'Save'`), if any. */
function owningProperty(node) {
  let current = node;
  while (current.parent && ts.isConditionalExpression(current.parent)) current = current.parent;
  const parent = current.parent;
  if (parent && ts.isPropertyAssignment(parent) && parent.initializer === current) {
    return propertyName(parent.name);
  }
  return undefined;
}

function attributeName(node) {
  // Through any nesting of conditionals and `??`/`||` to the attribute it lands in.
  const site = valueSite(node);
  let current = site.parent;
  if (current && ts.isJsxExpression(current)) current = current.parent;
  return current && ts.isJsxAttribute(current) ? current.name.getText() : undefined;
}

function ignoredLines(source) {
  const lines = source.split('\n');
  const ignored = new Set();
  lines.forEach((line, index) => {
    if (!line.includes(IGNORE_MARK)) return;
    ignored.add(index + 1);
    // A comment on its own line covers the next line.
    if (/^\s*(?:\/\/|\/\*|\{\/\*|\*)/u.test(line)) ignored.add(index + 2);
  });
  return ignored;
}

const TRANSLATION_CALLS = new Set([
  't',
  'tx',
  'msg',
  'defineMessage',
  'plural',
  'select',
  'selectOrdinal',
  'ph',
  '_',
]);
const TRANSLATION_ELEMENTS = new Set(['Trans', 'Plural', 'Select', 'SelectOrdinal']);

/** Inside a macro or `<Trans>` already: the text is a message, not bare copy. */
function insideTranslation(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (ts.isCallExpression(parent)) {
      const name = calleeName(parent.expression);
      if (name && TRANSLATION_CALLS.has(name)) return true;
    }
    if (ts.isTaggedTemplateExpression(parent)) return true;
    if (
      ts.isJsxElement(parent) &&
      TRANSLATION_ELEMENTS.has(parent.openingElement.tagName.getText())
    ) {
      return true;
    }
    if (ts.isJsxSelfClosingElement(parent) && TRANSLATION_ELEMENTS.has(parent.tagName.getText())) {
      return true;
    }
    if (ts.isSourceFile(parent)) break;
  }
  return false;
}

/** JSX text a person reads: anything with a word in it. */
export function isCopyText(node) {
  const text = node.text.trim();
  return letters(text) && words(text).length > 0 && !insideTranslation(node);
}

/** A string or template literal that is interface copy, judged from its text and position. */
export function isCopyLiteral(node) {
  const text = ts.isStringLiteral(node) ? node.text : templateText(node);
  if (!letters(text) || nonCopyContext(node) || insideTranslation(node)) return false;
  const attribute = attributeName(node);
  if (attribute !== undefined) {
    const copyAttribute =
      COPY_ATTRIBUTES.has(attribute) ||
      /label|title|text|description|placeholder|message|heading/iu.test(attribute);
    return copyAttribute
      ? !looksLikeIdentifier(text) || singleCapitalizedWord(text)
      : readsAsProse(text);
  }
  if (readsAsProse(text)) return true;
  if (ts.isTemplateExpression(node) && templateReadsAsCopy(node)) return true;
  // Any one word under a property that only ever holds words (`label: 'move'`).
  const owner = owningProperty(node);
  if (englishPluralBranch(node)) return true;
  if (owner && LABEL_PROPERTIES.test(owner) && /^(?=.*\p{Ll})\p{L}{3,}[.…]?$/u.test(text.trim()))
    return true;
  if (!singleCapitalizedWord(text)) return false;
  const property = owningProperty(node);
  if (property && COPY_PROPERTY.test(property)) return true;
  return (
    shownAsJsxChild(node) ||
    returnedAsLabel(node) ||
    passedAsLabel(node) ||
    inLabelMap(node) ||
    boundToLabelName(node)
  );
}

/** `count === 1 ? 'change' : 'changes'`: an English plural built by hand. */
function englishPluralBranch(node) {
  const parent = node.parent;
  if (!parent || !ts.isConditionalExpression(parent) || parent.condition === node) return false;
  const condition = parent.condition;
  if (!ts.isBinaryExpression(condition)) return false;
  const one = [condition.left, condition.right].some(
    (side) => ts.isNumericLiteral(side) && side.text === '1',
  );
  const branches = [parent.whenTrue, parent.whenFalse];
  return (
    one &&
    branches.every((branch) => ts.isStringLiteral(branch) && /^\p{L}[\p{L} ]*$/u.test(branch.text))
  );
}

/** `const cancelLabel = … 'Cancel'`, `closeLabel = 'Close'`: a word bound to a label name. */
function boundToLabelName(node) {
  const site = valueSite(node);
  const parent = site.parent;
  if (!parent) return false;
  const bound =
    (ts.isVariableDeclaration(parent) || ts.isParameter(parent) || ts.isBindingElement(parent)) &&
    parent.initializer === site &&
    ts.isIdentifier(parent.name)
      ? parent.name.text
      : undefined;
  return Boolean(
    bound &&
      /(?:label|title|text|word|heading|caption|message|noun|verb|placeholder|hint|tooltip)s?$/iu.test(
        bound,
      ),
  );
}

/**
 * A template whose fixed text has words (`${n} lines added`, `Removed ${name}`),
 * unless it reads as code: a path, URL, selector, CSS value or class list.
 */
function templateReadsAsCopy(node) {
  const parts = [node.head.text, ...node.templateSpans.map((span) => span.literal.text)];
  const fixed = parts.join('');
  // One capitalized word and a value: `Removed ${name}`, `Version ${version}`.
  if (/^\s*\p{Lu}\p{Ll}{2,}[,:]?\s*$/u.test(fixed)) return true;
  if (!/\b\p{L}{3,}\b/u.test(parts.join(' '))) return false;
  if (/[/=?&#:.[\]{}<>@_\\]|--|\bvar\(|\b(?:px|rem|em|deg|ms)\b/u.test(fixed)) return false;
  // Joined identifiers (`clio-${id}`) and class lists (`text-sm ${tone}`).
  // A word set apart by a space (`${count} files`) is prose; one glued to a value is an id.
  if (!/\s/u.test(fixed) || looksLikeUtilityClasses(fixed)) return false;
  return true;
}

/** Single-word utility classes; any other lowercase word is read as prose. */
const UTILITY_WORDS = new Set(
  (
    'flex grid block inline hidden relative absolute fixed sticky static truncate italic ' +
    'underline uppercase lowercase capitalize border rounded shadow outline ring container ' +
    'contents invisible visible grow shrink transition transform antialiased isolate group ' +
    'peer prose dark selected active disabled open'
  ).split(' '),
);

function looksLikeUtilityClasses(text) {
  const tokens = text.trim().split(/\s+/u).filter(Boolean);
  return (
    tokens.length > 0 &&
    tokens.every((token) => /[-:[\]\d/!]/u.test(token) || UTILITY_WORDS.has(token))
  );
}

/**
 * One of several capitalized words mapped by key, `{ succeeded: 'Done', failed: 'Failed' }`:
 * a table of labels, whatever its keys are called.
 */
function inLabelMap(node) {
  const site = valueSite(node);
  const property = site.parent;
  if (!property || !ts.isPropertyAssignment(property) || property.initializer !== site)
    return false;
  const object = property.parent;
  if (!ts.isObjectLiteralExpression(object) || object.properties.length < 2) return false;
  let words = 0;
  for (const member of object.properties) {
    if (!ts.isPropertyAssignment(member)) return false;
    const value = member.initializer;
    if (ts.isStringLiteral(value) && singleCapitalizedWord(value.text)) words += 1;
    else if (!(ts.isTaggedTemplateExpression(value) || ts.isCallExpression(value))) return false;
  }
  return words >= 2;
}

/** Parameter names of functions declared in a file, by function name. */
const parameterNames = new WeakMap();
function fileParameters(sourceFile) {
  let names = parameterNames.get(sourceFile);
  if (names) return names;
  names = new Map();
  const visit = (node) => {
    let name;
    let fn;
    if (ts.isFunctionDeclaration(node) && node.name) {
      name = node.name.text;
      fn = node;
    } else if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))
    ) {
      name = node.name.text;
      fn = node.initializer;
    }
    if (name && fn) {
      names.set(
        name,
        fn.parameters.map((parameter) =>
          ts.isIdentifier(parameter.name) ? parameter.name.text : '',
        ),
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  parameterNames.set(sourceFile, names);
  return names;
}

/** `fact('Why', …)` where the file's own `fact(label, …)` takes words a person reads. */
function passedAsLabel(node) {
  const site = valueSite(node);
  const call = site.parent;
  if (!call || !ts.isCallExpression(call) || !ts.isIdentifier(call.expression)) return false;
  const index = call.arguments.indexOf(site);
  if (index < 0) return false;
  const parameters = fileParameters(node.getSourceFile()).get(call.expression.text);
  const parameter = parameters?.[index];
  return Boolean(parameter && COPY_PROPERTY.test(parameter));
}

/** Climb through conditionals, `??`/`||` and parentheses to where a value lands. */
function valueSite(node) {
  let current = node;
  for (;;) {
    const parent = current.parent;
    if (!parent) return current;
    if (
      (ts.isConditionalExpression(parent) && parent.condition !== current) ||
      ts.isParenthesizedExpression(parent) ||
      (ts.isBinaryExpression(parent) &&
        [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(
          parent.operatorToken.kind,
        ) &&
        parent.right === current)
    ) {
      current = parent;
      continue;
    }
    return current;
  }
}

/** `{ready ? 'Ready' : 'Waiting'}` rendered as a JSX child. */
function shownAsJsxChild(node) {
  const site = valueSite(node);
  return Boolean(
    site.parent && ts.isJsxExpression(site.parent) && !ts.isJsxAttribute(site.parent.parent),
  );
}

/** `return 'Output'` from a function named for the words it gives (`…Label`, `…Title`). */
function returnedAsLabel(node) {
  const site = valueSite(node);
  let owner;
  if (site.parent && ts.isReturnStatement(site.parent)) owner = site.parent;
  else if (site.parent && ts.isArrowFunction(site.parent) && site.parent.body === site)
    owner = site;
  if (!owner) return false;
  for (let parent = owner.parent; parent; parent = parent.parent) {
    if (ts.isFunctionLike(parent)) {
      let name = parent.name && ts.isIdentifier(parent.name) ? parent.name.text : undefined;
      if (!name && ts.isVariableDeclaration(parent.parent) && ts.isIdentifier(parent.parent.name)) {
        name = parent.parent.name.text;
      }
      return Boolean(
        name &&
          /(?:label|title|text|word|heading|caption|summary|message|noun|verb)s?$/iu.test(name),
      );
    }
  }
  return false;
}

export function isLiteral(node) {
  return (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateExpression(node)
  );
}

/**
 * Unlocalized copy in one source file.
 * @returns {Array<{ line: number; text: string }>}
 */
export function findUnlocalizedCopy(source, fileName = 'file.tsx') {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind);
  const ignored = ignoredLines(source);
  const found = [];
  const report = (node, text) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    if (ignored.has(line)) return;
    found.push({ line, text: text.trim().replace(/\s+/gu, ' ').slice(0, 100) });
  };

  const visit = (node) => {
    if (ts.isJsxText(node)) {
      if (isCopyText(node)) report(node, node.text);
      return;
    }
    if (isLiteral(node)) {
      if (isCopyLiteral(node)) {
        report(node, ts.isStringLiteral(node) ? node.text : templateText(node));
      }
      if (ts.isTemplateExpression(node))
        node.templateSpans.forEach((span) => visit(span.expression));
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

/** Whether a repository-relative path is outside the checked interface code. */
export function isExcludedFile(file) {
  return EXCLUDED_FILES.has(file) || EXCLUDED_PREFIXES.some((prefix) => file.startsWith(prefix));
}

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return ['.ts', '.tsx'].includes(extname(entry.name)) &&
      !/\.(?:test|spec)[.-]|\.d\.ts$/u.test(entry.name)
      ? [path]
      : [];
  });
}

/** Unlocalized copy per file, relative to the repository root. */
export function scanTree(root) {
  const results = new Map();
  for (const path of sourceFiles(resolve(root, 'web/src'))) {
    const file = relative(root, path).replaceAll('\\', '/');
    if (isExcludedFile(file)) continue;
    const found = findUnlocalizedCopy(readFileSync(path, 'utf8'), path);
    if (found.length) results.set(file, found);
  }
  return results;
}

function main() {
  const root = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
  const baselinePath = resolve(root, 'scripts/unlocalized_copy_baseline.json');
  const args = new Set(process.argv.slice(2));
  /** @type {Record<string, number>} */
  let baseline = {};
  try {
    baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  } catch {
    baseline = {};
  }
  const results = scanTree(root);

  if (args.has('--list')) {
    const only = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
    for (const [file, found] of results) {
      if (only.length && !only.some((prefix) => file.startsWith(prefix))) continue;
      for (const { line, text } of found) console.log(`${file}:${line}: ${text}`);
    }
    return;
  }
  if (args.has('--summary')) {
    const byDirectory = new Map();
    for (const [file, found] of results) {
      const directory = file.split('/').slice(0, 4).join('/');
      byDirectory.set(directory, (byDirectory.get(directory) ?? 0) + found.length);
    }
    const total = [...results.values()].reduce((sum, found) => sum + found.length, 0);
    for (const [directory, count] of [...byDirectory].sort((a, b) => b[1] - a[1])) {
      console.log(`${String(count).padStart(6)}  ${directory}`);
    }
    console.log(`${String(total).padStart(6)}  total in ${results.size} files`);
    return;
  }

  const failures = [];
  for (const [file, found] of results) {
    const allowed = baseline[file] ?? 0;
    if (found.length > allowed) {
      failures.push(
        `${file}: ${found.length} unlocalized strings (baseline ${allowed})\n` +
          found.map(({ line, text }) => `    ${file}:${line}: ${text}`).join('\n'),
      );
    }
  }

  if (args.has('--update')) {
    if (failures.length && !args.has('--allow-increase')) {
      console.error(failures.join('\n'));
      console.error(
        '\ncheck_unlocalized_copy: refusing to record an increase. Translate the new copy (docs/i18n.md).',
      );
      process.exit(1);
    }
    const next = Object.fromEntries(
      [...results]
        .map(([file, found]) => [file, found.length])
        .sort(([a], [b]) => a.localeCompare(b)),
    );
    writeFileSync(baselinePath, `${JSON.stringify(next, null, 2)}\n`);
    const total = Object.values(next).reduce((sum, count) => sum + count, 0);
    console.log(
      `check_unlocalized_copy: baseline is ${total} strings in ${Object.keys(next).length} files.`,
    );
    return;
  }

  const shrunk = Object.entries(baseline).filter(
    ([file, count]) => (results.get(file)?.length ?? 0) < count,
  );
  if (failures.length) {
    console.error(failures.join('\n'));
    console.error(
      '\ncheck_unlocalized_copy: interface copy must go through the translation macros (docs/i18n.md).' +
        '\nMark a string that is not copy with an `i18n-ignore` comment and a reason.',
    );
    process.exit(1);
  }
  if (shrunk.length) {
    console.log(
      `check_unlocalized_copy: ${shrunk.length} files have less unlocalized copy than recorded; ` +
        'run `node scripts/check_unlocalized_copy.mjs --update` to lower the baseline.',
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();

export { readsAsProse, templateText };
