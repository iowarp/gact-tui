import type { BundledLanguage, LanguageRegistration } from 'shiki';
import { bundledLanguages } from 'shiki/langs';

/** Languages CLIO adds to Shiki's bundle, each loaded with its highlighter. */
const CUSTOM_LANGUAGES = {
  openqasm: () => import('./grammars/openqasm').then((module) => module.default),
} satisfies Record<string, () => Promise<LanguageRegistration>>;

export type CustomLanguage = keyof typeof CUSTOM_LANGUAGES;

/** A language CLIO can colour: one of Shiki's, one of CLIO's, or plain `text`. */
export type CodeLanguage = BundledLanguage | CustomLanguage;

const CUSTOM_ALIASES: Record<string, CustomLanguage> = {
  openqasm: 'openqasm',
  openqasm2: 'openqasm',
  openqasm3: 'openqasm',
  qasm: 'openqasm',
  qasm2: 'openqasm',
  qasm3: 'openqasm',
};

/** The grammar loader for one of CLIO's own languages, or undefined for Shiki's. */
export function customLanguageLoader(
  language: string,
): (() => Promise<LanguageRegistration>) | undefined {
  return language in CUSTOM_LANGUAGES ? CUSTOM_LANGUAGES[language as CustomLanguage] : undefined;
}

/**
 * The language a fence, tool block or component names, when CLIO can colour it. Shiki's
 * names and aliases (`py`, `sh`) resolve to themselves; CLIO's aliases (`qasm`) to theirs.
 */
export function resolveCodeLanguage(name: string | undefined): CodeLanguage | undefined {
  const key = name?.trim().toLowerCase();
  if (!key) return undefined;
  return CUSTOM_ALIASES[key] ?? (key in bundledLanguages ? (key as BundledLanguage) : undefined);
}

const LANGUAGE_BY_EXTENSION: Record<string, CodeLanguage> = {
  bash: 'shellscript',
  c: 'c',
  cc: 'cpp',
  cfg: 'ini',
  cjs: 'javascript',
  cmake: 'cmake',
  cpp: 'cpp',
  cs: 'csharp',
  css: 'css',
  cts: 'typescript',
  cxx: 'cpp',
  go: 'go',
  h: 'c',
  hpp: 'cpp',
  html: 'html',
  ini: 'ini',
  java: 'java',
  jl: 'julia',
  js: 'javascript',
  json: 'json',
  jsonc: 'jsonc',
  jsx: 'jsx',
  kt: 'kotlin',
  lua: 'lua',
  md: 'markdown',
  mjs: 'javascript',
  mts: 'typescript',
  php: 'php',
  qasm: 'openqasm',
  ps1: 'powershell',
  py: 'python',
  pyi: 'python',
  r: 'r',
  rb: 'ruby',
  rs: 'rust',
  scala: 'scala',
  scss: 'scss',
  sh: 'shellscript',
  sql: 'sql',
  swift: 'swift',
  tex: 'latex',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'shellscript',
};

const LANGUAGE_BY_FILENAME: Record<string, CodeLanguage> = {
  dockerfile: 'dockerfile',
  makefile: 'make',
};

/** Use one language contract for transcript previews and full file views. */
export function languageForPath(path: string): CodeLanguage {
  const name =
    path
      .split(/[\\/]+/u)
      .at(-1)
      ?.toLowerCase() ?? '';
  const extension = name.split('.').at(-1) ?? '';
  return LANGUAGE_BY_FILENAME[name] ?? LANGUAGE_BY_EXTENSION[extension] ?? 'text';
}
