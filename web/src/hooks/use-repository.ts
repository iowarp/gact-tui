import { useContext, useMemo } from 'react';
import { RepositoryOverride } from '@/providers/repository-override-context';
import { createRepository } from '@/lib/connection';
import { createGalleryRepository } from '@/lib/gallery-repository';
import { useConnectionSettings } from '@/providers/connection-provider';

export function useRepository() {
  const override = useContext(RepositoryOverride);
  const { settings } = useConnectionSettings();
  return useMemo(() => {
    if (override) return override;
    const repository = createRepository(settings);
    return window.location.pathname.endsWith('/widget-preview.html')
      ? createGalleryRepository(repository)
      : repository;
  }, [settings, override]);
}
