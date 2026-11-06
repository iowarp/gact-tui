import { useQuery } from '@tanstack/react-query';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { connectionScope } from '@/lib/connection-scope';
import { useConnectionSettings } from '@/providers/connection-provider';

/**
 * Whether the connected service serves HDF5 slices to the file viewer
 * (`x_clio_hdf5_viewer`). Without it an HDF5 file opens as a binary file, so a
 * service that has no data route never gets a viewer that cannot load.
 */
export function useHdf5ViewerSupported(): boolean {
  const repository = useRepository();
  const { settings } = useConnectionSettings();
  const capabilities = useQuery({
    queryKey: queryKeys.key('capabilities', settings.endpoint, connectionScope(settings)),
    queryFn: ({ signal }) => repository.capabilities(signal),
  });
  return capabilities.data?.capabilities.x_clio_hdf5_viewer === true;
}
