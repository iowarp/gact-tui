import type { LanguageModelPreset } from '@clio/core/v3';
import { useEffect, useRef, type ReactNode } from 'react';
import type { CascaderColumnSection } from '@/components/reui/cascader/cascader-columns';
import type { CascaderNode } from '@/components/reui/cascader/cascader-types';
import { providerUsableModelCount, type PickerNodeData, type ProviderGroup } from './model-picker-model';
import { ProviderConnectState } from './provider-connect-state';
import { useProviderActions } from './provider-actions';
import { ProviderPanelFooter, type ProviderLogOut } from './provider-panel-footer';
import { providerActionError } from './provider-setup-state';
import { OrSeparator, TransportLabel, TransportLogin } from './provider-transport-parts';
import {
  isMultiTransport,
  transportSections,
  visibleTransportSections,
} from './provider-transport-state';

export interface ProviderPanelColumn {
  /** Split groups for the model column (a provider reachable more than one way). */
  sections?: (items: readonly CascaderNode[]) => CascaderColumnSection[];
  /** The column's content when it has no rows (setup, or a log in). */
  empty?: ReactNode;
  footer?: ReactNode;
}

/**
 * The models a provider's column lists, as tree children: nothing until the
 * provider is usable; for a provider reachable more than one way, the models
 * of each ready transport in the service's order (the sections partition
 * exactly these rows).
 */
export function providerColumnModels(group: ProviderGroup) {
  if (isMultiTransport(group)) {
    return transportSections(group).flatMap((section) => section.models);
  }
  return providerUsableModelCount(group) > 0 ? group.availableChoices : [];
}

interface UseProviderPanelInput {
  group: ProviderGroup | undefined;
  preset: LanguageModelPreset | undefined;
  /** Whether the picker is open: an unchecked transport is checked once per opening. */
  open: boolean;
  /** A sentence the action row shows over the latest failure (e.g. why a model can't be picked). */
  notice?: string;
}

/**
 * The picker's right-hand panel for the provider in view, driven by the
 * shared action hook -- ONE instance for the provider (Refresh / Reload
 * models act on all of it) and, for a provider with a transport CLIO signs in
 * itself, a SEPARATE instance scoped to that transport, so its log-in steps
 * render in its own section and nowhere else.
 */
export function useProviderPanel({ group, preset, open, notice }: UseProviderPanelInput) {
  const multi = isMultiTransport(group);
  const sections = group && multi ? transportSections(group) : [];
  const signInTransport = sections.find((section) => section.transport.auth);
  const providerActions = useProviderActions({
    presetId: group?.id ?? '',
    apiBase: group?.endpoint ?? preset?.api_base ?? '',
    preset,
    probeCatalog: multi,
  });
  const transportActions = useProviderActions({
    presetId: signInTransport ? (group?.id ?? '') : '',
    apiBase: group?.endpoint ?? preset?.api_base ?? '',
    preset,
    scope: signInTransport?.transport.id,
  });
  const stage = providerActions.stage ?? transportActions.stage;

  // A transport the service has never asked is asked when it comes into view,
  // once per opening: the person sees it being checked, never a request to.
  const autoChecked = useRef(new Set<string>());
  const needsCheck = sections.some((section) => section.state === 'unchecked');
  const providerBusy = Boolean(providerActions.stage);
  const groupId = group?.id;
  useEffect(() => {
    if (!open) {
      autoChecked.current.clear();
      return;
    }
    if (!groupId || !needsCheck || providerBusy || autoChecked.current.has(groupId)) return;
    autoChecked.current.add(groupId);
    providerActions.handshake.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a mutation handle is not a trigger
  }, [open, groupId, needsCheck, providerBusy]);

  if (!group) return { column: {} satisfies ProviderPanelColumn, stage };

  if (!multi) {
    const usable = providerUsableModelCount(group) > 0;
    const logOut: ProviderLogOut | undefined = !preset?.is_authenticated
      ? undefined
      : preset.supports_logout
        ? { label: 'Log out', run: () => providerActions.logout.mutate(), busy: false }
        : preset.requires_api_key
          ? { label: 'Remove key', run: () => providerActions.removeApiKey.mutate(), busy: false }
          : undefined;
    const column: ProviderPanelColumn = usable
      ? {
          footer: (
            <ProviderPanelFooter
              actions={providerActions}
              error={notice ?? providerActionError(providerActions, group.name)}
              logOut={logOut}
            />
          ),
        }
      : { empty: <ProviderConnectState actions={providerActions} group={group} preset={preset} /> };
    return { column, stage };
  }

  const visible = visibleTransportSections(sections, providerBusy);
  const listed = visible.filter((section) => section.state !== 'signed_out');
  const signedOut = visible.filter((section) => section.state === 'signed_out');
  const signedInTransport = sections.find((section) => section.canLogOut);
  const logOut: ProviderLogOut | undefined = signedInTransport
    ? {
        label: 'Log out',
        run: () => transportActions.logout.mutate(),
        busy: Boolean(transportActions.stage),
      }
    : undefined;

  const loginBlocks = signedOut.map((section, index) => (
    <div className="flex flex-col" key={section.transport.id}>
      {listed.length || index > 0 ? <OrSeparator /> : null}
      <div
        className="flex flex-col gap-1 pb-3"
        data-slot="transport-login"
        data-transport={section.transport.id}
      >
        <TransportLabel focusable section={section} />
        <TransportLogin actions={transportActions} group={group} preset={preset} section={section} />
      </div>
    </div>
  ));
  const footer = (
    <>
      {listed.length ? loginBlocks : null}
      <ProviderPanelFooter
        actions={providerActions}
        error={notice ?? providerActionError(providerActions, group.name)}
        logOut={logOut}
      />
    </>
  );
  const column: ProviderPanelColumn = listed.length
    ? {
        sections: (items) =>
          listed.map((section, index) => ({
            key: section.transport.id,
            ariaLabel: `${section.label}: ${section.info}`,
            label: (
              <TransportLabel
                section={section}
                stage={
                  section.state === 'unchecked'
                    ? providerActions.stage
                    : section === signInTransport
                      ? transportActions.stage
                      : undefined
                }
              />
            ),
            items: items.filter((node) => {
              const data = node.data as PickerNodeData | undefined;
              return data?.kind === 'model' && data.choice.transport === section.transport.id;
            }),
            separator: index > 0 ? <OrSeparator /> : undefined,
          })),
        footer,
      }
    : { empty: <div className="flex flex-col">{loginBlocks}</div>, footer };
  return { column, stage };
}
