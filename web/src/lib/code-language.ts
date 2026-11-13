import type { BundledLanguage } from 'shiki';

const LANGUAGE_BY_EXTENSION: Record<string, BundledLanguage> = {
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
