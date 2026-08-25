import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { useConnectionSettings } from '@/providers/connection-provider';

export function useWorkspaceCapabilities() {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const capabilities = useQuery({
    queryKey: ['capabilities', settings.endpoint],
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  const modelConfiguration = useQuery({
    queryKey: ['language-model-configuration', settings.endpoint],
    queryFn: ({ signal }) => repository.languageModelConfiguration(signal),
  });

  return { capabilities, modelConfiguration };
}
