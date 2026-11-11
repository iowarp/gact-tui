// The gallery entry stays tiny. Everything it imported statically counted as an
// initial module of the build and joined the app's boot vendor chunk.
import './index.css';
import './widget-gallery.css';

void import('./widget-preview-app');
