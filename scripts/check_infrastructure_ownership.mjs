import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const forbiddenRoots = ['desktop/src-tauri/src', 'web/src', 'packages'];
const forbidden = [
  /ghcr\.io\/iowarp\/clio-web-search:/u,
  /vllm\/vllm-openai(?::|-)/u,
  /ggml-org\/llama\.cpp:server/u,
  /clio-relay==\d/u,
  /infrastructure_deploy_web_search/u,
  /infrastructure_managed_service_action/u,
  /CLIO_SSH_ASKPASS_CREDENTIAL/u,
  /ssh_password_store/u,
];
const extensions = new Set(['.rs', '.ts', '.tsx']);
const violations = [];

function walk(path) {
  for (const name of readdirSync(path)) {
    if (['node_modules', 'target', 'dist'].includes(name)) continue;
    const child = join(path, name);
    if (statSync(child).isDirectory()) {
      walk(child);
      continue;
    }
    const extension = name.slice(name.lastIndexOf('.'));
    if (!extensions.has(extension) || name.endsWith('.test.ts') || name.endsWith('.test.tsx'))
      continue;
    const contents = readFileSync(child, 'utf8');
    for (const pattern of forbidden) {
      if (pattern.test(contents)) violations.push(`${relative(root, child)} matches ${pattern}`);
    }
  }
}

for (const directory of forbiddenRoots) walk(join(root, directory));
if (violations.length) {
  console.error('Infrastructure ownership guard failed:\n' + violations.join('\n'));
  process.exit(1);
}
console.log('Infrastructure ownership guard passed (drivers and pins live only in CLIO).');
