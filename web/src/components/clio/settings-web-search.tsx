import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  TransportError,
  type SearchSettings,
  type SearchSettingsUpdate,
  type SearchSource,
  type WebSearchSource,
} from '@clio/core/v3';
import { Sortable } from '@/components/reui/sortable';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useRepository } from '@/hooks/use-repository';
import { connectionScope } from '@/lib/connection-scope';
import { queryKeys } from '@/lib/query-keys';
import { moveSourceId, orderChanged, searchSourceState } from '@/lib/search-source-status';
import { useConnectionSettings } from '@/providers/connection-provider';
import { OpenAlexKeyRequest } from './openalex-key-request';
import { StateView } from './primitives/state-view';
import { SearchSourceKeyDialog } from './search-source-key-dialog';
import { SearchSourceRow } from './search-source-row';
import { SearchContactEmail } from './search-contact-email';
import { useProfileContactEmail } from './search-contact-email-sync';
import { SearchTextSetting } from './search-text-setting';
import { SegmentedControl } from './primitives/segmented-control';
import { useLocalProfile } from './settings-profile-store';
import { SettingsGroupLabel, SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';

const INFO =
  'Web searches try the sources below in order and use the first one that answers. Searches for papers and datasets ask every scholarly source that is on at once.';

/** The hosted source a site runs; always tried first while its address is set. */
const SERVICE = 'service';

/** Refresh the rows while open so a resting source's "until" time stays true. */
const REFRESH_MS = 30_000;

/** Where a failed change is reported, so its message sits beside the control that made it. */
type Area = 'enabled' | 'web' | 'auto' | 'literature' | 'service_url' | 'contact_email';

const unsupported = (error: unknown) =>
  error instanceof TransportError && [404, 405, 501].includes(error.status ?? 0);

const errorText = (error: unknown) =>
  error instanceof Error && error.message ? error.message : 'The change could not be saved.';

const ErrorLine = ({ message }: { message?: string }) =>
  message ? (
    <p className="mt-1 text-xs text-destructive" role="alert">
      {message}
    </p>
  ) : null;

const reorder = (settings: SearchSettings, order: readonly string[]): SearchSettings => {
  const rows = new Map(settings.web.map((row) => [row.id, row]));
  const service = settings.web.filter((row) => row.id === SERVICE);
  const moved = order.flatMap((id) => rows.get(id) ?? []);
  return {
    ...settings,
    web: [...service, ...moved].map((row, position) => ({ ...row, position })),
  };
};

type SearchTab = 'web' | 'literature';

const TABS = [
  { value: 'web', label: 'Web' },
  { value: 'literature', label: 'Literature' },
] as const;

/** Saved after a key moved its source to the front, so the person can put it back. */
interface KeyNotice {
  name: string;
  /** The order before the key was saved, or null when nothing moved. */
  previous: string[] | null;
}

/** Settings → Web search: the sources web and literature searches go to, in order. */
export function WebSearchSettings() {
  const repository = useRepository();
  const client = useQueryClient();
  const { settings: connection } = useConnectionSettings();
  const key = queryKeys.key('search-settings', connectionScope(connection));
  const [errors, setErrors] = useState<Partial<Record<Area, string>>>({});
  const [keyFor, setKeyFor] = useState<SearchSource>();
  const [notice, setNotice] = useState<KeyNotice>();
  const [keyError, setKeyError] = useState('');
  const [tab, setTab] = useState<SearchTab>('web');
  const profileEmail = useLocalProfile().profile.email.trim();

  const view = useQuery({
    queryKey: key,
    queryFn: ({ signal }) => repository.searchSettings(signal),
    refetchInterval: (query) => (unsupported(query.state.error) ? false : REFRESH_MS),
    retry: false,
  });

  const update = useMutation({
    mutationFn: ({
      change,
    }: {
      change: SearchSettingsUpdate;
      area: Area;
      optimistic?: SearchSettings;
    }) => repository.updateSearchSettings(change),
    onMutate: ({ area, optimistic }) => {
      setErrors((current) => ({ ...current, [area]: undefined }));
      const previous = client.getQueryData<SearchSettings>(key);
      if (optimistic) client.setQueryData(key, optimistic);
      return { previous };
    },
    onSuccess: (next) => client.setQueryData(key, next),
    onError: (error, { area }, context) => {
      if (context?.previous) client.setQueryData(key, context.previous);
      setErrors((current) => ({ ...current, [area]: errorText(error) }));
    },
  });
  const saveKey = useMutation({
    mutationFn: ({
      source,
      apiKey,
    }: {
      source: SearchSource;
      apiKey: string;
      previous: string[];
    }) => repository.saveSearchSourceKey(source.id, apiKey),
    onMutate: () => setKeyError(''),
    onSuccess: (result, { source, previous }) => {
      client.setQueryData(key, result.settings);
      const next = result.settings.web.map((row) => row.id).filter((id) => id !== SERVICE);
      const web = 'approved' in source;
      setNotice({
        name: source.name,
        previous: web && orderChanged(previous, next) ? previous : null,
      });
      setKeyFor(undefined);
    },
    onError: (error) => setKeyError(errorText(error)),
  });
  const removeKey = useMutation({
    mutationFn: ({ source }: { source: SearchSource; area: Area }) =>
      repository.removeSearchSourceKey(source.id),
    onMutate: ({ area }) => setErrors((current) => ({ ...current, [area]: undefined })),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
    onError: (error, { area }) =>
      setErrors((current) => ({ ...current, [area]: errorText(error) })),
  });

  const tabs = (
    <SegmentedControl label="Web search pages" onValueChange={setTab} options={TABS} value={tab} />
  );
  const saveContact = (value: string) =>
    update.mutate({
      change: { contact_email: value },
      area: 'contact_email',
      optimistic: view.data ? { ...view.data, contact_email: value } : undefined,
    });
  useProfileContactEmail({
    value: view.data?.contact_email,
    profileEmail,
    saving: update.isPending,
    error: errors.contact_email,
    onSave: saveContact,
  });
  const heading = (
    <SettingsSectionHeading actions={view.data ? tabs : undefined} info={INFO} title="Web search" />
  );
  if (view.isPending)
    return (
      <div className="min-w-0">
        {heading}
        <StateView kind="loading" size="row" title="Loading search sources…" />
      </div>
    );
  if (view.error || !view.data)
    return (
      <div className="min-w-0">
        {heading}
        {unsupported(view.error) ? (
          <StateView
            kind="unavailable"
            size="row"
            title="This service doesn’t offer web search settings."
          />
        ) : (
          <div title={view.error?.message}>
            <StateView
              action={{ label: 'Retry', onClick: () => void view.refetch() }}
              kind="error"
              size="row"
              title="Search sources couldn’t be loaded."
            />
          </div>
        )}
      </div>
    );

  const data = view.data;
  // The rows say "until 14:32" against when they were read; the 30 s refresh keeps that true.
  const now = view.dataUpdatedAt / 1000;
  const busy = update.isPending || saveKey.isPending || removeKey.isPending;
  const service = data.web.find((row) => row.id === SERVICE);
  const ordered = data.web.filter((row) => row.id !== SERVICE);
  const order = ordered.map((row) => row.id);
  const patch = (change: SearchSettingsUpdate, area: Area, optimistic?: SearchSettings) =>
    update.mutate({ change, area, optimistic });
  const setOrder = (next: string[]) => {
    if (!orderChanged(order, next)) return;
    patch({ web_order: next }, 'web', reorder(data, next));
  };
  const toggleWeb = (id: string, on: boolean) => {
    const disabled = data.web
      .filter((row) => (row.id === id ? !on : !row.enabled))
      .map((row) => row.id);
    patch({ web_disabled: disabled }, 'web', {
      ...data,
      web: data.web.map((row) => (row.id === id ? { ...row, enabled: on } : row)),
    });
  };
  const toggleLiterature = (id: string, on: boolean) => {
    const disabled = data.literature
      .filter((row) => (row.id === id ? !on : !row.enabled))
      .map((row) => row.id);
    patch({ literature_disabled: disabled }, 'literature', {
      ...data,
      literature: data.literature.map((row) => (row.id === id ? { ...row, enabled: on } : row)),
    });
  };
  const setPaid = (id: string, on: boolean) => {
    const rows = [...data.web, ...data.literature];
    const paid = rows.filter((row) => (row.id === id ? on : row.paid)).map((row) => row.id);
    const mark = <T extends SearchSource>(row: T): T =>
      row.id === id ? { ...row, paid: on, tier: on ? 'paid' : 'key' } : row;
    const area: Area = data.web.some((row) => row.id === id) ? 'web' : 'literature';
    patch({ paid }, area, {
      ...data,
      web: data.web.map(mark),
      literature: data.literature.map(mark),
    });
  };
  const addKey = (source: SearchSource) => {
    saveKey.reset();
    setKeyError('');
    setKeyFor(source);
  };

  const webRow = (row: WebSearchSource, index: number) => (
    <SearchSourceRow
      busy={busy}
      key={row.id}
      onAddKey={() => addKey(row)}
      onPaidChange={row.id === SERVICE ? undefined : (on) => setPaid(row.id, on)}
      onRemoveKey={() => removeKey.mutate({ source: row, area: 'web' })}
      onToggle={(on) => toggleWeb(row.id, on)}
      ordering={
        row.id === SERVICE
          ? undefined
          : {
              first: index === 0,
              last: index === ordered.length - 1,
              onMove: (step) => setOrder(moveSourceId(order, row.id, step)),
            }
      }
      source={row}
      state={searchSourceState(row, row.approved, now)}
    />
  );

  return (
    <div className="min-w-0">
      {heading}
      <div aria-label={tab === 'web' ? 'Web' : 'Literature'} role="region">
        {tab === 'web' ? (
          <>
            <SettingsRow htmlFor="web-search-enabled" inlineControl title="Web search">
              <Switch
                checked={data.enabled}
                disabled={update.isPending}
                id="web-search-enabled"
                onCheckedChange={(on) =>
                  patch({ enabled: on }, 'enabled', { ...data, enabled: on })
                }
              />
            </SettingsRow>
            <p className="mt-2 text-xs text-muted-foreground">
              Searches are sent to the services below. Each one asks for your approval the first
              time.
            </p>
            <ErrorLine message={errors.enabled} />

            <section aria-label="Web sources" className="min-w-0">
              <SettingsGroupLabel info="Tried from the top. Drag a source, or use Move up and Move down, to change the order.">
                Web sources
              </SettingsGroupLabel>
              {notice ? (
                <div
                  className="mb-1 flex flex-wrap items-center gap-2 rounded-md bg-muted/60 px-3 py-1.5 text-xs"
                  role="status"
                >
                  <span className="min-w-0 flex-1">
                    {notice.previous
                      ? `${notice.name} is now tried first.`
                      : `${notice.name} key saved.`}
                  </span>
                  {notice.previous ? (
                    <Button
                      className="h-6 px-2 text-xs"
                      disabled={update.isPending}
                      onClick={() => {
                        if (notice.previous) setOrder(notice.previous);
                        setNotice(undefined);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      Undo
                    </Button>
                  ) : null}
                  <Button
                    className="h-6 px-2 text-xs"
                    onClick={() => setNotice(undefined)}
                    size="sm"
                    variant="ghost"
                  >
                    Dismiss
                  </Button>
                </div>
              ) : null}
              <ErrorLine message={errors.web} />
              {data.web.length ? (
                <>
                  {service ? (
                    <div aria-label="Your site's search service, always tried first" role="list">
                      {webRow(service, -1)}
                    </div>
                  ) : null}
                  <Sortable
                    aria-label="Web sources, in the order they are tried"
                    getItemValue={(row: WebSearchSource) => row.id}
                    onValueChange={(rows) => setOrder(rows.map((row) => row.id))}
                    role="list"
                    strategy="vertical"
                    value={ordered}
                  >
                    {ordered.map(webRow)}
                  </Sortable>
                </>
              ) : (
                <StateView
                  kind="empty"
                  size="row"
                  title="No web sources are available on this service."
                />
              )}
              <SettingsRow
                htmlFor="web-search-auto-switch"
                inlineControl
                title="Switch sources automatically"
                description="When a source's free allowance runs out, use the next one without asking."
              >
                <Switch
                  checked={data.auto_switch}
                  disabled={update.isPending}
                  id="web-search-auto-switch"
                  onCheckedChange={(on) =>
                    patch({ auto_switch: on }, 'auto', { ...data, auto_switch: on })
                  }
                />
              </SettingsRow>
              <ErrorLine message={errors.auto} />
            </section>

            <section aria-label="Advanced" className="min-w-0">
              <SettingsGroupLabel>Advanced</SettingsGroupLabel>
              <SearchTextSetting
                error={errors.service_url}
                id="web-search-service-url"
                onSave={(value) => patch({ service_url: value }, 'service_url')}
                placeholder="https://search.example.org"
                saving={update.isPending && update.variables?.area === 'service_url'}
                title="Search service address"
                inputMode="url"
                value={data.service_url}
              />
            </section>
          </>
        ) : (
          <>
            <section aria-label="Papers & datasets" className="min-w-0">
              <SettingsGroupLabel>Papers &amp; datasets</SettingsGroupLabel>
              <p className="mb-1 text-xs text-muted-foreground">
                Every source that is on is searched together, so there is no order to set.
              </p>
              <ErrorLine message={errors.literature} />
              {data.literature.length ? (
                <div aria-label="Papers & datasets sources" role="list">
                  {data.literature.map((row) => (
                    <SearchSourceRow
                      busy={busy}
                      key={row.id}
                      onAddKey={
                        row.key_required || row.has_key || row.key_page
                          ? () => addKey(row)
                          : undefined
                      }
                      onPaidChange={(on) => setPaid(row.id, on)}
                      onRemoveKey={() => removeKey.mutate({ source: row, area: 'literature' })}
                      onToggle={(on) => toggleLiterature(row.id, on)}
                      source={row}
                      state={searchSourceState(row, data.literature_approved, now)}
                    >
                      {row.id === 'openalex' && !row.has_key ? (
                        <OpenAlexKeyRequest
                          defaultEmail={profileEmail || data.contact_email}
                          onRequested={() => void client.invalidateQueries({ queryKey: key })}
                        />
                      ) : null}
                    </SearchSourceRow>
                  ))}
                </div>
              ) : (
                <StateView
                  kind="empty"
                  size="row"
                  title="No paper or dataset sources are available on this service."
                />
              )}
            </section>

            <section aria-label="Contact email" className="min-w-0">
              <SettingsGroupLabel>Contact email</SettingsGroupLabel>
              <SearchContactEmail
                error={errors.contact_email}
                onSave={saveContact}
                profileEmail={profileEmail}
                saving={update.isPending && update.variables?.area === 'contact_email'}
                value={data.contact_email}
              />
            </section>
          </>
        )}
      </div>

      <SearchSourceKeyDialog
        error={keyError}
        key={keyFor?.id ?? 'closed'}
        onClose={() => setKeyFor(undefined)}
        onSave={(apiKey) => {
          if (keyFor) saveKey.mutate({ source: keyFor, apiKey, previous: order });
        }}
        saving={saveKey.isPending}
        source={keyFor}
      />
    </div>
  );
}
