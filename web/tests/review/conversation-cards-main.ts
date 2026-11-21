import { bootstrapLocale } from '../../src/i18n/runtime';

// As in the app: the language (`?locale=es`) is active before the cards load, so
// copy computed at module load is translated too.
void bootstrapLocale().then(() => import('./conversation-cards'));
