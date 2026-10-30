import { useContext, useMemo } from 'react';
import { RepositoryOverride } from '@/providers/repository-override-context';
import { createRepository } from '@/lib/connection';
import { useConnectionSettings } from '@/providers/connection-provider';

export function useRepository() {
  const override = useContext(RepositoryOverride);
  const { settings } = useConnectionSettings();
  return useMemo(() => {
    // The widget gallery supplies its sample-backed repository as an override,
    // so its fixtures stay out of the app bundle.
    return override ?? createRepository(settings);
  }, [settings, override]);
}
