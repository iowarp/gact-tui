import type { ProviderHandshake, ProviderModelRefreshResult } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { openExternalUrl } from '@/tauri/external-url';

interface ProviderSettingsActionsInput {
  presetId: string;
  apiBase: string;
  /** Adopt the catalog's default model after a successful check. */
  onDefaultModel: (modelId: string) => void;
}

/**
 * The provider actions of the Models settings panel — catalog refresh, provider
 * check, Claude Code install and ALCF sign-in — and the results they report.
 *
 * A check or a completed sign-in changes what the service knows about the
 * provider, and the service retires that provider's catalog entry. The panel
 * then re-reads the catalog for exactly that provider with `refresh=true`, so
 * every open model picker shows the new truth instead of the boot snapshot.
 */
export function useProviderSettingsActions({
  presetId,
  apiBase,
  onDefaultModel,
}: ProviderSettingsActionsInput) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [refreshResult, setRefreshResult] = useState<ProviderModelRefreshResult>();
  const [handshakeResult, setHandshakeResult] = useState<ProviderHandshake>();
  const [authInstructions, setAuthInstructions] = useState('');
  const [authFlow, setAuthFlow] = useState<{ authorizationUrl: string; flowId: string }>();
  const [authorizationCode, setAuthorizationCode] = useState('');
  const [authLaunchError, setAuthLaunchError] = useState('');

  const invalidate = (...keys: ReadonlyArray<readonly unknown[]>) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const configurationKey = queryKeys.key('language-model-configuration', settings.endpoint);
  const modelsKey = queryKeys.key('provider-models', settings.endpoint, presetId);
  const reloadCatalogEntry = async () => {
    const catalog = await repository.providerCatalog(true, undefined, presetId);
    queryClient.setQueryData(queryKeys.providerCatalog(settings.endpoint), catalog);
  };
  const checkProvider = async () => {
    const result = await repository.providerHandshake(presetId, { apiBase, refresh: true });
    const catalog =
      result.connectivity === 'ok' && result.auth === 'ok'
        ? await repository.providerModels(presetId)
        : undefined;
    return { result, catalog };
  };
  const adoptCheck = async ({
    result,
    catalog,
  }: Awaited<ReturnType<typeof checkProvider>>): Promise<void> => {
    setHandshakeResult(result);
    if (catalog) {
      queryClient.setQueryData(modelsKey, catalog);
      if (catalog.default_model) onDefaultModel(catalog.default_model);
    }
    await Promise.all([invalidate(configurationKey, modelsKey), reloadCatalogEntry()]);
  };

  const refreshModels = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      const results = await repository.refreshProviderModels([presetId]);
      const result = results[0];
      if (!result) throw new Error('The service returned no catalog result for this provider.');
      return result;
    },
    onSuccess: async (result) => {
      setRefreshResult(result);
      await invalidate(
        modelsKey,
        configurationKey,
        queryKeys.key('capabilities', settings.endpoint),
        queryKeys.providerCatalog(settings.endpoint),
      );
    },
  });
  const handshake = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      return checkProvider();
    },
    onSuccess: adoptCheck,
  });
  const installProvider = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      await repository.installProviderSupport(presetId);
      return checkProvider();
    },
    onSuccess: adoptCheck,
  });
  const authenticate = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      return repository.authenticateProvider(presetId, { force: true });
    },
    onSuccess: (result) => {
      setAuthInstructions(result.instructions);
      if (result.authorization_url && result.flow_id) {
        setAuthFlow({ authorizationUrl: result.authorization_url, flowId: result.flow_id });
        setAuthLaunchError('');
        openExternalUrl(result.authorization_url).catch((error: unknown) =>
          setAuthLaunchError(
            error instanceof Error ? error.message : 'Could not open Globus sign-in.',
          ),
        );
      }
    },
  });
  const completeAuthentication = useMutation({
    mutationFn: async () => {
      if (!presetId || !authFlow) throw new Error('Start ALCF sign-in first.');
      if (!authorizationCode.trim()) throw new Error('Paste the authorization code from Globus.');
      return repository.completeProviderAuthentication(presetId, {
        flowId: authFlow.flowId,
        authorizationCode: authorizationCode.trim(),
      });
    },
    onSuccess: async (result) => {
      setAuthInstructions(result.instructions);
      setAuthFlow(undefined);
      setAuthorizationCode('');
      await Promise.all([invalidate(configurationKey, modelsKey), reloadCatalogEntry()]);
    },
  });

  /** Forget every result when the person switches provider. */
  const reset = () => {
    setRefreshResult(undefined);
    setHandshakeResult(undefined);
    setAuthInstructions('');
    setAuthFlow(undefined);
    setAuthorizationCode('');
    setAuthLaunchError('');
  };

  return {
    authFlow,
    authInstructions,
    authLaunchError,
    authenticate,
    authorizationCode,
    completeAuthentication,
    handshake,
    handshakeResult,
    installProvider,
    refreshModels,
    refreshResult,
    reset,
    setAuthLaunchError,
    setAuthorizationCode,
  };
}
