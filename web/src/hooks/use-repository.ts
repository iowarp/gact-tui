import { useMemo } from 'react'
import { createRepository } from '@/lib/connection'
import { useConnectionSettings } from '@/providers/connection-provider'

export function useRepository() {
  const { settings } = useConnectionSettings()
  return useMemo(() => createRepository(settings), [settings])
}
