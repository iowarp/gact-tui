// The gallery entry stays tiny. Everything it imported statically counted as an
// initial module of the build and joined the app's boot vendor chunk.
import './index.css';
import './widget-gallery.css';
import { bootstrapLocale } from '@/i18n/runtime';

// Like the app, the gallery activates the interface language before its
// modules load, so copy computed at module load is translated too.
void bootstrapLocale().then(() => import('./widget-preview-app'));
