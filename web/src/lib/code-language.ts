import type { BundledLanguage } from 'shiki';

const LANGUAGE_BY_EXTENSION: Record<string, BundledLanguage> = {
  c: 'c',
  cc: 'cpp',
  cpp: 'cpp',
  css: 'css',
  go: 'go',
  h: 'c',
  hpp: 'cpp',
  html: 'html',
  java: 'java',
  js: 'javascript',
  json: 'json',
  jsx: 'jsx',
  md: 'markdown',
  mjs: 'javascript',
  php: 'php',
  ps1: 'powershell',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shellscript',
  sql: 'sql',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  vue: 'vue',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
};

const LANGUAGE_BY_FILENAME: Record<string, BundledLanguage> = {
  dockerfile: 'dockerfile',
  makefile: 'make',
};

/** Use one language contract for transcript previews and full file views. */
export function languageForPath(path: string): BundledLanguage {
  const name =
    path
      .split(/[\\/]+/u)
      .at(-1)
      ?.toLowerCase() ?? '';
  const extension = name.split('.').at(-1) ?? '';
  return LANGUAGE_BY_FILENAME[name] ?? LANGUAGE_BY_EXTENSION[extension] ?? 'text';
}
