import { createReadStream, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

/** Serve the built archive renderer in contributor dev servers as well as releases. */
export function offlineReviewPlugin(): Plugin {
  return {
    name: 'offline-review-dev-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const name = request.url?.split('?')[0]?.slice(1);
        if (name !== 'offline-review.js' && name !== 'offline-review.css') return next();
        const file = resolve(server.config.root, 'dist', name);
        if (!existsSync(file)) {
          response.statusCode = 503;
          response.end(
            'Build the offline renderer with pnpm --filter @clio/workspace build:offline.',
          );
          return;
        }
        response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/css');
        createReadStream(file).pipe(response);
      });
    },
  };
}
