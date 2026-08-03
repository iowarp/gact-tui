import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Unmount between tests so focus assertions never read a previous render's DOM.
afterEach(() => cleanup());
