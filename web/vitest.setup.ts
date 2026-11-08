import '@testing-library/jest-dom/vitest';

// Logic and contract tests run in the node environment; only DOM files need the
// browser shims.
if (typeof window !== 'undefined') await import('./src/test/setup');
