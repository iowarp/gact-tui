import { useMemo } from 'react'
import { createRepository } from '@/lib/connection'
import { createGalleryRepository } from '@/lib/gallery-repository'
import { useConnectionSettings } from '@/providers/connection-provider'

export function useRepository() {
  const { settings } = useConnectionSettings()
  return useMemo(() => {
    const repository = createRepository(settings)
    return window.location.pathname.endsWith('/widget-preview.html')
      ? createGalleryRepository(repository)
      : repository
  }, [settings])
}
