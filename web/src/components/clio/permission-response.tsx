import type { PendingInteraction } from '@clio/core/v3';
import { BotIcon, FileCode2Icon, ShieldQuestionIcon, UserRoundIcon } from 'lucide-react';
import { flowTrustRequest } from '@/lib/plugin-review';
import { cn } from '@/lib/utils';
import { AskBody, AskCard, AskDetails, AskError, AskSection, type AskFact } from './ask-card';
import { BinaryAsk, type BinaryAnswer } from './ask-binary';
import { AskCode } from './ask-code';
import { FlowTrustDetails } from './flow-trust-details';
import { pendingInteractionDomId } from './interaction-control';
import type { ClioPendingInteractionsProps } from './pending-interactions';
import { PermissionOperationDetails, PermissionPaths } from './permission-operation-details';
import { legacyToolCallName, permissionTitle } from './permission-operation-labels';
import { unlistedOwnerName } from './workspace-route-state';
import { KeyValueGrid, type KeyValueItem } from './primitives/key-value-grid';
import { t, ph, plural } from '@lingui/core/macro';
import { formatList } from '@/lib/locale-format';

const SCOPES = [
  { action: 'allow', label: t`Allow once`, name: t`Allow once` },
  { action: 'allow_session', label: t`This session`, name: t`Allow for this session` },
  { action: 'allow_workspace', label: t`This workspace`, name: t`Allow for this workspace` },
  // Offered only on a question asked from a run_code script.
  {
    action: 'allow_script',
    label: t`Rest of this script`,
    name: t`Allow for the rest of this script`,
  },
];
const KNOWN_ACTIONS = new Set(['deny', ...SCOPES.map((scope) => scope.action)]);

/**
 * A person acting on a server's surface answers one question for all of that server's
 * view-only tools, so the lasting answer leads: allowing once would ask again at the next
 * control. On a plugin page the page's own context is the session, so it reads as the page.
 */
function surfaceScopes(interaction: PendingInteraction, scopes: typeof SCOPES): typeof SCOPES {
  const consent = interaction.payload?.consent;
  if (consent?.scope !== 'server_surface') return scopes;
  const lasting = scopes.find((scope) => scope.action === 'allow_session');
  if (!lasting) return scopes;
  const first =
    consent.place === 'page'
      ? { ...lasting, label: t`This page`, name: t`Allow on this page` }
      : lasting;
  return [first, ...scopes.filter((scope) => scope !== lasting)];
}

/** The tool's own arguments: CLIO's `_clio_*` annotations ride along but are not for people. */
function agentArguments(input: unknown): unknown {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return input;
  return Object.fromEntries(Object.entries(input).filter(([key]) => !key.startsWith('_clio_')));
}

/**
 * Arguments that carry code (run_code's `code`) read as code with its real lines, and the
 * rest as key-values. Arguments without a multi-line string stay one JSON block. Code the
 * card already shows as its Script is named, not repeated.
 */
function argumentParts(
  input: unknown,
  script: string | undefined,
): { blocks: [string, string][]; facts: KeyValueItem[] } | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const entries = Object.entries(input as Record<string, unknown>);
  const multiline = (value: unknown): value is string =>
    typeof value === 'string' && value.includes('\n');
  const shown = (value: unknown) => script !== undefined && value === script;
  if (!entries.some(([, value]) => multiline(value) || shown(value))) return undefined;
  const blocks = entries.filter(
    (entry): entry is [string, string] => multiline(entry[1]) && !shown(entry[1]),
  );
  const facts = entries
    .filter(([, value]) => !multiline(value) || shown(value))
    .map(
      ([key, value]): KeyValueItem =>
        shown(value)
          ? {
              label: key,
              value: <span className="text-muted-foreground">{t`same as Script above`}</span>,
            }
          : {
              label: key,
              mono: true,
              value: typeof value === 'string' ? value : JSON.stringify(value),
            },
    );
  return { blocks, facts };
}

/**
 * The script the decision is about: the script a tool was called from, or run_code's own code
 * (spec 04, "A whole script"). Only a script already running has a call to open as a tab.
 */
function permissionScript(
  interaction: PendingInteraction,
  toolName: string | undefined,
): { code: string; call_id?: string } | undefined {
  if (interaction.payload?.script) return interaction.payload.script;
  const input = interaction.payload?.tool_call?.input;
  if (toolName !== 'run_code' || !input || typeof input !== 'object') return undefined;
  const code = (input as Record<string, unknown>).code;
  return typeof code === 'string' && code.trim() ? { code } : undefined;
}

/** Who asked, when it is not the conversation on screen. */
function askedBy(
  interaction: PendingInteraction,
  ownerLabel: string | undefined,
  show: boolean,
): AskFact[] {
  if (!show) return [];
  return [
    {
      label: t`Asked by`,
      icon: <UserRoundIcon />,
      title: ownerLabel ?? t`Requested by session ${ph({ session: interaction.owner_session_id })}`,
      // Who asked moves into Technical details at a fifth of the window.
      narrow: false,
      value: (
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <BotIcon aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 truncate text-accent-foreground">
            {ownerLabel ?? unlistedOwnerName()}
          </span>
        </span>
      ),
    },
  ];
}

/** What a screen reader hears after the title: the tool, then its script or arguments. */
function spokenToolCall(
  toolName: string | undefined,
  args: unknown,
  code: string | undefined,
): string | undefined {
  if (!toolName) return undefined;
  const clip = (text: string) => (text.length > 160 ? `${text.slice(0, 159)}…` : text);
  if (code) {
    const lines = code.replace(/\n$/u, '').split('\n');
    const first = lines.find((line) => line.trim())?.trim() ?? '';
    return clip(
      plural(lines.length, {
        one: `${toolName}, # line: ${first}`,
        other: `${toolName}, # lines: ${first}`,
      }),
    );
  }
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    const values = Object.entries(args)
      .filter(([, value]) => ['string', 'number', 'boolean'].includes(typeof value))
      .map(([key, value]) => `${key} ${String(value).replace(/\s+/gu, ' ')}`);
    if (values.length) {
      const list = formatList(values);
      return clip(
        t({
          message: `${toolName}: ${list}`,
          comment: 'Spoken tool call: tool name, then its arguments',
        }),
      );
    }
  }
  return toolName;
}

/** One permission decision: facts, the exact command, then numbered scopes the server offered. */
export function PermissionResponse({
  disabled,
  interaction,
  onOpenScript,
  onResponse,
  ownerLabel,
  responseError,
  showOwner,
}: {
  disabled?: boolean;
  interaction: PendingInteraction;
  onOpenScript?: ClioPendingInteractionsProps['onOpenScript'];
  onResponse: ClioPendingInteractionsProps['onResponse'];
  ownerLabel?: string;
  responseError?: Error;
  showOwner: boolean;
}) {
  // Running a flow from a plugin not trusted yet: the decision is trusting its
  // plugin, which lasts, so it is offered once ("Trust and run") without a duration.
  const flowTrust = flowTrustRequest(interaction);
  const offered = (action: string) => !interaction.actions || interaction.actions.includes(action);
  const scopes = surfaceScopes(
    interaction,
    SCOPES.filter((scope) => offered(scope.action) && (!flowTrust || scope.action === 'allow')),
  );
  const toolCall = interaction.payload?.tool_call;
  const legacyName = legacyToolCallName(interaction.title);
  const toolName = toolCall?.tool_name ?? interaction.source.tool_name ?? legacyName;
  const script = permissionScript(interaction, toolName);
  const scriptCallId = script?.call_id;
  // The script block carries the lines run_code's own title summarises ("Run a Python script
  // (48 lines): readings = …"), so the title is the spec's plain "Run script".
  const title = flowTrust
    ? t`Running flow ${ph({ flow: flowTrust.flow })}`
    : script && !interaction.payload?.script
      ? t`Run script`
      : permissionTitle(interaction, toolName);
  const scriptLines = script ? script.code.replace(/\n$/u, '').split('\n').length : 0;
  const answers = scopes.map(
    (scope): BinaryAnswer => ({
      label: flowTrust ? t`Trust and run` : scope.label,
      name: flowTrust ? t`Trust and run` : scope.name,
      onChoose: () => onResponse(interaction, { action: scope.action }),
    }),
  );
  const owner = askedBy(interaction, ownerLabel, showOwner);
  const cwd = interaction.payload?.execution?.cwd;
  const args = toolCall?.input === undefined ? undefined : agentArguments(toolCall.input);
  const parts = argumentParts(args, script?.code);
  const argsLanguage = (args as { language?: unknown } | undefined)?.language;
  const codeLanguage =
    argsLanguage === 'python' || (toolName === 'run_code' && argsLanguage === undefined)
      ? 'python'
      : undefined;
  const detailFacts: KeyValueItem[] = [
    ...(owner.length
      ? [
          {
            label: t`Asked by`,
            title: owner[0]?.title,
            // Beside the facts while they show it; here once they give it up, at a fifth.
            wide: false as const,
            value: (
              <span className="min-w-0 truncate text-accent-foreground">
                {ownerLabel ?? unlistedOwnerName()}
              </span>
            ),
          },
        ]
      : []),
    ...(toolName && !flowTrust ? [{ label: t`Tool`, value: toolName, mono: true }] : []),
    ...((toolName === 'web_fetch' || toolName === 'web_search') && cwd
      ? [{ label: t`Working folder`, value: cwd, mono: true }]
      : []),
    ...(parts?.facts ?? []),
  ];
  return (
    <AskCard
      data-interaction-kind="permission"
      icon={ShieldQuestionIcon}
      id={pendingInteractionDomId(interaction.id)}
      kind="permission"
      spokenDetail={flowTrust ? undefined : spokenToolCall(toolName, args, script?.code)}
      title={
        // A title CLIO named from the tool keeps the tool's id beside it, faint.
        legacyName && title !== interaction.title && title !== legacyName ? (
          <>
            {title}{' '}
            <span className="font-mono text-caption font-normal text-faint">{legacyName}</span>
          </>
        ) : (
          title
        )
      }
      titleText={title}
    >
      <AskBody>
        {flowTrust ? (
          <AskSection className="mt-1">
            <FlowTrustDetails request={flowTrust} />
          </AskSection>
        ) : (
          <PermissionOperationDetails
            extraFacts={owner}
            interaction={interaction}
            pathsInline={false}
            showCommand={!script}
            title={title}
          />
        )}
      </AskBody>
      {script ? (
        // Under a cap the script gives up height first, so the facts above stay whole. Its floor
        // counts its header and footer (a translated footer wraps to two lines when narrow), so
        // the code itself keeps about three lines. At a card's ceiling it keeps only the whole
        // lines that leave the first option in view (--ask-code-fit). A script of one or two
        // lines keeps its own height: the floor would only pad it. The script stands in for the
        // command line.
        <AskCode
          className={cn(
            'flex flex-col',
            scriptLines > 2 &&
              'min-h-[min(calc(64px+4.5rem),var(--ask-code-fit,100dvh))] shrink-[100] @max-[420px]/ask:min-h-[min(calc(70px+4.5rem),var(--ask-code-fit,100dvh))]',
          )}
          code={script.code}
          copyLabel={t`Copy script`}
          icon={FileCode2Icon}
          label={t`Script`}
          language="python"
          meta={plural(scriptLines, { one: 'Python, # line', other: 'Python, # lines' })}
          name="Script"
          onOpen={
            onOpenScript && scriptCallId ? () => onOpenScript(interaction, scriptCallId) : undefined
          }
          wrapToggle
        />
      ) : null}
      <AskError error={responseError} />
      {/* The first scope accepts (Enter); the lasting scopes are further ways to accept. */}
      <BinaryAsk
        accept={answers[0]}
        alternatives={answers.slice(1)}
        decline={
          offered('deny')
            ? { label: t`Deny`, onChoose: () => onResponse(interaction, { action: 'deny' }) }
            : undefined
        }
        disabled={disabled}
        enterAccepts
        label={t`Decision`}
        unavailable={(interaction.actions ?? [])
          .filter((action) => !KNOWN_ACTIONS.has(action))
          .map((action) => ({
            label: action,
            title: t`This client cannot offer "${action}" yet.`,
          }))}
      />
      {toolName || toolCall?.input !== undefined || interaction.payload?.access?.paths.length ? (
        <AskDetails hint={t`raw arguments, as the agent sent them`}>
          <div className="grid gap-2.5">
            {detailFacts.length ? (
              <div data-slot="ask-details-facts">
                {/* The facts' own 110px label column, so details values share their x;
                    labels stay as words when narrow (details rows carry no icons). */}
                <KeyValueGrid
                  className="@max-[420px]:grid-cols-[110px_minmax(0,1fr)]"
                  items={detailFacts}
                  variant="facts"
                />
              </div>
            ) : null}
            <PermissionPaths paths={interaction.payload?.access?.paths ?? []} />
            {args === undefined ? null : parts ? (
              parts.blocks.map(([key, code]) => {
                const lines = code.replace(/\n$/u, '').split('\n').length;
                return (
                  <AskCode
                    className="mt-1 ml-0"
                    code={code}
                    copyLabel={t`Copy ${key}`}
                    key={key}
                    label={t`Argument ${key}`}
                    language={codeLanguage}
                    meta={
                      codeLanguage === 'python'
                        ? plural(lines, { one: 'Python, # line', other: 'Python, # lines' })
                        : plural(lines, { one: '# line', other: '# lines' })
                    }
                    name={key}
                    previewLines={12}
                  />
                );
              })
            ) : (
              <AskCode
                className="mt-1 ml-0"
                code={JSON.stringify(args, null, 2)}
                copyLabel={t`Copy arguments`}
                label={t`Arguments`}
                language="json"
                name="Arguments"
                previewLines={12}
              />
            )}
          </div>
        </AskDetails>
      ) : null}
    </AskCard>
  );
}
