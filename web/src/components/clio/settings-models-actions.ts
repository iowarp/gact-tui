import type {
  LanguageModelPreset,
  ProviderAuthStart,
  ProviderHandshake,
  ProviderModelRefreshResult,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { openExternalUrl } from '@/tauri/external-url';
import { storeProviderCredential } from '@/tauri/secure-credentials';

/** Poll interval while a sign-in flow is pending (SPEC generic auth API). */
const AUTH_STATUS_POLL_MS = 1500;

interface ProviderSettingsActionsInput {
  presetId: string;
  apiBase: string;
  /** Adopt the catalog's default model after a successful check. */
  onDefaultModel: (modelId: string) => void;
  /**
   * Needed only for `saveApiKey`'s minimal apply (`provider`/`suggested_model`).
   * Every other action only needs `presetId`.
   */
  preset?: LanguageModelPreset;
}

/**
 * The provider actions of the Models settings panel — catalog refresh, provider
 * check, Claude Code install, and the generic subscription/OAuth sign-in flow
 * (ALCF and the direct Codex provider both go through it) — and the results
 * they report.
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
  preset,
}: ProviderSettingsActionsInput) {
  const repository = useRepository();
  const queryClient = useQueryClient();
  const { settings } = useConnectionSettings();
  const [refreshResult, setRefreshResult] = useState<ProviderModelRefreshResult>();
  const [handshakeResult, setHandshakeResult] = useState<ProviderHandshake>();
  const [authInstructions, setAuthInstructions] = useState('');
  const [authFlow, setAuthFlow] = useState<ProviderAuthStart>();
  const [authPaste, setAuthPaste] = useState('');
  const [authLaunchError, setAuthLaunchError] = useState('');
  const [authFailedReason, setAuthFailedReason] = useState('');

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
  const signInComplete = async (instructions: string) => {
    setAuthInstructions(instructions);
    setAuthFlow(undefined);
    setAuthPaste('');
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
    mutationFn: async (method: 'browser' | 'device' = 'browser') => {
      if (!presetId) throw new Error('Choose a provider first.');
      return repository.authenticateProvider(presetId, { force: true, method });
    },
    onSuccess: (result) => {
      setAuthInstructions(result.instructions);
      setAuthFailedReason('');
      setAuthFlow(result);
      setAuthLaunchError('');
      if (result.browser) {
        openExternalUrl(result.browser.authorization_url).catch((error: unknown) =>
          setAuthLaunchError(error instanceof Error ? error.message : 'Could not open the sign-in page.'),
        );
      }
    },
  });
  const completeAuthentication = useMutation({
    mutationFn: async () => {
      if (!presetId || !authFlow) throw new Error('Start sign-in first.');
      if (!authPaste.trim()) throw new Error('Paste the redirect URL or code.');
      return repository.completeProviderAuthentication(presetId, {
        flowId: authFlow.flow_id,
        paste: authPaste.trim(),
      });
    },
    onSuccess: (result) => signInComplete(result.instructions),
  });
  const logout = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      return repository.logoutProvider(presetId);
    },
    onSuccess: (result) => signInComplete(result.instructions),
  });

  /**
   * The minimal apply for an API-key provider that is not yet the active
   * configuration (e.g. the model picker's inline key field): saves the key
   * to the desktop credential vault, then applies it with the provider's own
   * suggested model. A person who wants a different model or reasoning level
   * still visits Settings for the full form; this only needs to make the
   * provider USABLE.
   */
  const saveApiKey = useMutation({
    mutationFn: async (apiKey: string) => {
      if (!presetId || !preset) throw new Error('Choose a provider first.');
      const trimmed = apiKey.trim();
      if (!trimmed) throw new Error('Enter an API key.');
      const resolvedApiBase = apiBase || preset.api_base || '';
      await storeProviderCredential(presetId, resolvedApiBase, trimmed);
      return repository.updateLanguageModelConfiguration({
        provider_id: presetId,
        provider: preset.provider,
        api_base: resolvedApiBase,
        model: preset.suggested_model || '',
        api_key: trimmed,
        provider_options: {},
      });
    },
    onSuccess: async (next) => {
      queryClient.setQueryData(configurationKey, next);
      await Promise.all([invalidate(modelsKey, configurationKey), reloadCatalogEntry()]);
    },
  });

  /**
   * The ready-state counterpart to `saveApiKey`: clears the stored key so the
   * provider goes back to needing one. Clears the desktop vault entry and, if
   * this preset is the currently active configuration, also blanks the
   * backend's stored key for it so the active config stops reporting ready.
   */
  const removeApiKey = useMutation({
    mutationFn: async () => {
      if (!presetId || !preset) throw new Error('Choose a provider first.');
      const resolvedApiBase = apiBase || preset.api_base || '';
      await storeProviderCredential(presetId, resolvedApiBase, '');
      const configuration = queryClient.getQueryData<{ provider_id?: string; model?: string }>(
        configurationKey,
      );
      if (configuration?.provider_id === presetId) {
        return repository.updateLanguageModelConfiguration({
          provider_id: presetId,
          provider: preset.provider,
          api_base: resolvedApiBase,
          model: configuration.model || preset.suggested_model || '',
          api_key: '',
          provider_options: {},
        });
      }
      return undefined;
    },
    onSuccess: async (next) => {
      if (next) queryClient.setQueryData(configurationKey, next);
      await Promise.all([invalidate(modelsKey, configurationKey), reloadCatalogEntry()]);
    },
  });

  /** Poll a started flow until the loopback callback (or device code) resolves it. */
  const authStatus = useQuery({
    queryKey: queryKeys.key('provider-auth-status', settings.endpoint, presetId, authFlow?.flow_id),
    queryFn: async ({ signal }) => {
      if (!authFlow) throw new Error('No sign-in flow in progress.');
      return repository.providerAuthStatus(presetId, authFlow.flow_id, signal);
    },
    enabled: Boolean(authFlow?.flow_id),
    refetchInterval: (query) => (query.state.data?.state === 'pending' ? AUTH_STATUS_POLL_MS : false),
  });
  const authStatusState = authStatus.data?.state;
  useEffect(() => {
    if (!authFlow) return;
    if (authStatusState === 'complete') {
      void signInComplete('Signed in.');
    } else if (authStatusState === 'failed') {
      setAuthFlow(undefined);
      setAuthFailedReason(authStatus.data?.reason || 'Sign-in failed.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- signInComplete closes over authFlow/presetId by design
  }, [authStatusState, authFlow?.flow_id]);

  /**
   * Forget every result when the person switches provider. Stable identity
   * (useCallback): a caller that resets on a dependency-effect (e.g. the model
   * picker resetting when the active provider changes) must not re-fire this
   * on every unrelated state update -- that would wipe a just-started sign-in
   * flow's `authFlow` the instant it was set.
   */
  const reset = useCallback(() => {
    setRefreshResult(undefined);
    setHandshakeResult(undefined);
    setAuthInstructions('');
    setAuthFlow(undefined);
    setAuthPaste('');
    setAuthLaunchError('');
    setAuthFailedReason('');
  }, []);

  return {
    authFailedReason,
    authFlow,
    authInstructions,
    authLaunchError,
    authPaste,
    authStatus,
    authenticate,
    completeAuthentication,
    handshake,
    handshakeResult,
    installProvider,
    logout,
    refreshModels,
    refreshResult,
    removeApiKey,
    reset,
    saveApiKey,
    setAuthLaunchError,
    setAuthPaste,
  };
}
