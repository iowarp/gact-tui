import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const profile = process.argv[2] || 'clio';
const appRoot = resolve(import.meta.dirname, '..', '..', '..');
const externalClioRoot = resolve(appRoot, '..', '..', '..', 'clio-agent', 'branding');
const generatedRoot = resolve(appRoot, '.generated-branding');

function ensureGeneratedClioBrand() {
  const profileDir = resolve(generatedRoot, 'clio');
  mkdirSync(profileDir, { recursive: true });
  writeFileSync(
    resolve(profileDir, 'brand.json'),
    `${JSON.stringify(
      {
        name: 'CLIO',
        wordmark: 'CLIO',
        tagline: 'by the Gnosis Research Center',
        taglineAccent: 'Gnosis Research Center',
        homeUrl: 'https://iowarp.ai',
        taglineAccentUrl: 'https://grc.iit.edu',
        markGlyph: 'C',
        logoSvg: 'logo.svg',
        accent: '#ea7b2a',
        themeTokens: { '--color-accent': '#ea7b2a' },
        backendRepository: {
          label: 'github.com/iowarp/clio-agent',
          url: 'https://github.com/iowarp/clio-agent',
          detail: 'CLIO backend',
        },
        backend: {
          mode: 'managed',
          sidecarName: 'clio-agent',
          attachPort: 17800,
          attachPortEnv: 'CLIO_PORT',
          attachUrlEnv: 'CLIO_GACT_URL',
          install: {
            ref: 'develop',
            refEnv: 'CLIO_REF',
            forceEnv: 'CLIO_FORCE',
            windowsUrl: 'https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.ps1',
            unixUrl: 'https://raw.githubusercontent.com/iowarp/clio-agent/main/install/install.sh',
            repoLabel: 'github.com/iowarp/clio-agent',
          },
        },
      },
      null,
      2,
    )}\n`,
  );
  writeFileSync(
    resolve(profileDir, 'logo.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#000"/><text x="32" y="40" text-anchor="middle" font-family="monospace" font-size="28" font-weight="700" fill="#ea7b2a">C</text></svg>\n',
  );
  return generatedRoot;
}

const brandingRoot =
  profile === 'clio'
    ? existsSync(resolve(externalClioRoot, 'clio', 'brand.json'))
      ? externalClioRoot
      : ensureGeneratedClioBrand()
    : 'branding';
writeFileSync(
  resolve(appRoot, 'brand.config.local.json'),
  JSON.stringify({ profile, brandingRoot }, null, 2) + '\n',
);
