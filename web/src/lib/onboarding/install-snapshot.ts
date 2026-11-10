import { snapshotPriorInstall } from './first-run';

// Imported first by main.tsx, so it reads storage before any other module or
// this launch's first render can write to it.
snapshotPriorInstall();
