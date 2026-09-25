import type {
  LanguageModelPreset,
  ProviderAuthStart,
  ProviderHandshake,
  ProviderModelRefreshResult,
} from '@clio/core/v3';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';
import { useRepository } from '@/hooks/use-repository';
import { translateKnownProviderErrorReason } from '@/lib/provider-availability';
import { queryKeys } from '@/lib/query-keys';
import { useConnectionSettings } from '@/providers/connection-provider';
import { openExternalUrl } from '@/tauri/external-url';
import { storeProviderCredential } from '@/tauri/secure-credentials';

/** The visible progress text of a running provider action. */
export type ProviderActionStage =
  | 'Verifying…'
  | 'Discovering models…'
  | 'Installing…'
  | 'Saving key…'
  | 'Removing key…'
  | 'Opening sign-in…'
  | 'Waiting for sign-in…'
  | 'Signing in…'
  | 'Signing out…';

/**
 * Poll interval while a sign-in flow is pending (SPEC generic auth API).
 * Backs off from the floor to the ceiling as consecutive polls stay
 * pending -- a flow left open for minutes (a person reading the
 * verification page) should not keep hammering the status endpoint at the
 * fastest rate the whole time.
 */
const AUTH_STATUS_POLL_FLOOR_MS = 1500;
const AUTH_STATUS_POLL_CEILING_MS = 2000;
const AUTH_STATUS_POLL_BACKOFF_STEP_MS = 100;

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
  // What the running action is doing RIGHT NOW ("Verifying…", "Discovering
  // models…", "Saving key…"): the picker turns the provider's heartbeat
  // yellow and shows this text in its action strip and bottom bar until the
  // action settles. Cleared by every mutation's `onSettled`.
  const [stage, setStage] = useState<ProviderActionStage>();
  const settle = { onSettled: () => setStage(undefined) };

  const invalidate = (...keys: ReadonlyArray<readonly unknown[]>) =>
    Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
  const configurationKey = queryKeys.key('language-model-configuration', settings.endpoint);
  const modelsKey = queryKeys.key('provider-models', settings.endpoint, presetId);
  const reloadCatalogEntry = async () => {
    const catalog = await repository.providerCatalog(true, undefined, presetId);
    queryClient.setQueryData(queryKeys.providerCatalog(settings.endpoint), catalog);
  };
  const checkProvider = async () => {
    setStage('Verifying…');
    const result = await repository.providerHandshake(presetId, { apiBase, refresh: true });
    setStage('Discovering models…');
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
    setStage('Discovering models…');
    setHandshakeResult(result);
    if (catalog) {
      queryClient.setQueryData(modelsKey, catalog);
      if (catalog.default_model) onDefaultModel(catalog.default_model);
    }
    await Promise.all([invalidate(configurationKey, modelsKey), reloadCatalogEntry()]);
  };
  const signInComplete = async (instructions: string) => {
    setStage('Discovering models…');
    setAuthInstructions(instructions);
    setAuthFlow(undefined);
    setAuthPaste('');
    await Promise.all([invalidate(configurationKey, modelsKey), reloadCatalogEntry()]);
    setStage(undefined);
  };

  const refreshModels = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      setStage('Discovering models…');
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
    ...settle,
  });
  const handshake = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      return checkProvider();
    },
    onSuccess: adoptCheck,
    ...settle,
  });
  const installProvider = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      setStage('Installing…');
      await repository.installProviderSupport(presetId);
      return checkProvider();
    },
    onSuccess: adoptCheck,
    ...settle,
  });
  const authenticate = useMutation({
    mutationFn: async (method: 'browser' | 'device' = 'browser') => {
      if (!presetId) throw new Error('Choose a provider first.');
      setStage('Opening sign-in…');
      return repository.authenticateProvider(presetId, { force: true, method });
    },
    onError: () => setStage(undefined),
    onSuccess: (result) => {
      setAuthInstructions(result.instructions);
      setAuthFailedReason('');
      setAuthFlow(result);
      setAuthLaunchError('');
      setStage('Waiting for sign-in…');
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
      setStage('Signing in…');
      return repository.completeProviderAuthentication(presetId, {
        flowId: authFlow.flow_id,
        paste: authPaste.trim(),
      });
    },
    onSuccess: (result) => signInComplete(result.instructions),
    // A rejected paste leaves the flow open (paste again): back to waiting.
    onError: () => setStage(authFlow ? 'Waiting for sign-in…' : undefined),
  });
  const logout = useMutation({
    mutationFn: async () => {
      if (!presetId) throw new Error('Choose a provider first.');
      setStage('Signing out…');
      return repository.logoutProvider(presetId);
    },
    onSuccess: (result) => signInComplete(result.instructions),
    ...settle,
  });

  /**
   * The minimal apply for an API-key provider that is not yet the active
   * configuration (e.g. the model picker's inline key field): saves the key
   * to the desktop credential vault AND the backend's own credential store
   * (`POST .../auth {action: save_api_key}`), then verifies it with a real
   * handshake. Deliberately never calls `updateLanguageModelConfiguration`
   * (PUT /v1/providers/lm): that endpoint also BINDS the provider as the
   * active default, which saving OpenRouter's key, say, must not do to
   * whatever provider the agent is currently running. A person who wants a
   * different model or reasoning level, or to make this provider the active
   * one, still visits Settings for the full form/Apply; this only needs to
   * make the provider CHECKABLE.
   *
   * Throws (surfacing through `saveApiKey.error`, visible even in the
   * picker's compact field) on an invalid/rejected key instead of silently
   * leaving the caller to notice nothing happened -- and always resolves
   * (success or throw), so the "Saving..." state can never hang.
   */
  const saveApiKey = useMutation({
    mutationFn: async (apiKey: string) => {
      if (!presetId || !preset) throw new Error('Choose a provider first.');
      const trimmed = apiKey.trim();
      if (!trimmed) throw new Error('Enter an API key.');
      const resolvedApiBase = apiBase || preset.api_base || '';
      setStage('Saving key…');
      await storeProviderCredential(presetId, resolvedApiBase, trimmed);
      await repository.saveProviderApiKey(presetId, trimmed);
      const checked = await checkProvider();
      const verified =
        checked.result.connectivity === 'ok' &&
        ['ok', 'not_required', 'deferred'].includes(checked.result.auth);
      if (!verified) {
        throw new Error(
          checked.result.error
            ? translateKnownProviderErrorReason(checked.result.error, preset.label)
            : `Couldn't verify the ${preset.label} API key.`,
        );
      }
      return checked;
    },
    onSuccess: adoptCheck,
    // A rejected key still changed what the service reports for this
    // provider: re-read it so the row settles red with the real reason.
    onError: () => Promise.all([invalidate(configurationKey, modelsKey), reloadCatalogEntry()]),
    ...settle,
  });

  /**
   * The ready-state counterpart to `saveApiKey`: clears the stored key so the
   * provider goes back to needing one. Clears the desktop vault entry, and
   * either blanks the ACTIVE configuration's key (when this preset is bound
   * as the default -- PUT is correct here, since it stays bound to the same
   * provider) or clears the backend's own credential store for it via the
   * same non-binding `clear_api_key` action `saveApiKey` uses, so a key
   * saved for a provider that was never made active can be removed too.
   */
  const removeApiKey = useMutation({
    mutationFn: async () => {
      if (!presetId || !preset) throw new Error('Choose a provider first.');
      const resolvedApiBase = apiBase || preset.api_base || '';
      setStage('Removing key…');
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
      await repository.clearProviderApiKey(presetId);
      return undefined;
    },
    onSuccess: async (next) => {
      if (next) queryClient.setQueryData(configurationKey, next);
      await Promise.all([invalidate(modelsKey, configurationKey), reloadCatalogEntry()]);
    },
    ...settle,
  });

  /** Poll a started flow until the loopback callback (or device code) resolves it. */
  const authStatus = useQuery({
    queryKey: queryKeys.key('provider-auth-status', settings.endpoint, presetId, authFlow?.flow_id),
    queryFn: async ({ signal }) => {
      if (!authFlow) throw new Error('No sign-in flow in progress.');
      return repository.providerAuthStatus(presetId, authFlow.flow_id, signal);
    },
    enabled: Boolean(authFlow?.flow_id),
    refetchInterval: (query) => {
      if (query.state.data?.state !== 'pending') return false;
      const consecutivePending = query.state.dataUpdateCount;
      return Math.min(
        AUTH_STATUS_POLL_FLOOR_MS + consecutivePending * AUTH_STATUS_POLL_BACKOFF_STEP_MS,
        AUTH_STATUS_POLL_CEILING_MS,
      );
    },
  });
  const authStatusState = authStatus.data?.state;
  useEffect(() => {
    if (!authFlow) return;
    if (authStatusState === 'complete') {
      void signInComplete('Signed in.');
    } else if (authStatusState === 'failed') {
      setStage(undefined);
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
    setStage(undefined);
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
    stage,
  };
}
