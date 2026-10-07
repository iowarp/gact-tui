import { createContext } from 'react';
import type { ClioRepository } from '@clio/core/v3';

export const RepositoryOverride = createContext<ClioRepository | undefined>(undefined);
