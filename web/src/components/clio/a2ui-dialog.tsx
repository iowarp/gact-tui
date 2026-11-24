import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas, componentId } from '@a2ui/web_core/v0_9';
import {
  CircleAlertIcon,
  CircleCheckIcon,
  PlugIcon,
  TriangleAlertIcon,
  type LucideIcon,
} from 'lucide-react';
import { createElement, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { kernelIconGlyph } from '@/lib/a2ui/kernel-icon-map';
import { fireRawAction, type RawActionContext } from '@/lib/a2ui/raw-action';
import { InfoIcon } from '@/lib/icon-vocabulary';
import { cn } from '@/lib/utils';
import { DialogFrame } from './primitives/dialog-frame';
import { ShortcutKeys } from './primitives/key-chip';
import { RingSpinner } from './primitives/ring-spinner';
import { isBoundToPath } from './selection-state';
import { t } from '@lingui/core/macro';

/*
 * `clio.dialog.v1`: a server's dialog, drawn as CLIO's one dialog frame. Its
 * trigger sits in place in the page; the dialog itself is always a modal over
 * it, with optional tabs, a step rail, one status line and the footer's Test,
 * Cancel and confirm. Generic: any server's surface can send one.
 */

const footerAction = z
  .object({
    label: z.string().min(1),
    action: CommonSchemas.Action,
    enabled: z.boolean().optional(),
  })
  .strict();

const dialogSchema = z
  .object({
    title: z.string().min(1),
    description: z.string().optional(),
    open: CommonSchemas.DataBinding,
    trigger: componentId().optional(),
    content: componentId().optional(),
    tabs: z
      .array(
        z
          .object({
            id: z.string().min(1),
            title: z.string().min(1),
            icon: z.string().optional(),
            child: componentId(),
          })
          .strict(),
      )
      .min(1)
      .max(6)
      .optional(),
    activeTab: CommonSchemas.DataBinding.optional(),
    rail: z
      .object({
        steps: z.array(z.string().min(1)).min(2).max(6),
        step: z.number().int().min(0),
        tabs: z.array(z.string().min(1)).optional(),
      })
      .strict()
      .optional(),
    status: z
      .object({
        tone: z.enum(['neutral', 'positive', 'warning', 'negative', 'busy']),
        text: z.string().min(1),
        detail: z.string().optional(),
        action: footerAction.optional(),
      })
      .strict()
      .optional(),
    test: footerAction.extend({ keyboard: z.string().optional() }).strict().optional(),
    cancel: z
      .object({ label: z.string().min(1), action: CommonSchemas.Action.optional() })
      .strict()
      .optional(),
    confirm: footerAction
      .extend({ tone: z.enum(['default', 'destructive']).optional() })
      .strict()
      .optional(),
    onClose: CommonSchemas.Action.optional(),
    width: z.enum(['narrow', 'default']).optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict();

/** The bindings arrive resolved: `open` a boolean, `activeTab` a tab id. */
type Props = Omit<z.infer<typeof dialogSchema>, 'open' | 'activeTab'> & {
  open?: unknown;
  activeTab?: unknown;
};
type Status = NonNullable<Props['status']>;

/** The raw actions, read from the surface so a press can be awaited and its context resolved then. */
interface RawDialog {
  open?: unknown;
  activeTab?: unknown;
  test?: { action?: unknown };
  cancel?: { action?: unknown };
  confirm?: { action?: unknown };
  status?: { action?: { action?: unknown } };
  onClose?: unknown;
}

const STATUS_GLYPH: Record<Exclude<Status['tone'], 'busy'>, [LucideIcon, string]> = {
  neutral: [InfoIcon, 'text-muted-foreground'],
  positive: [CircleCheckIcon, 'text-success'],
  warning: [TriangleAlertIcon, 'text-warning'],
  negative: [CircleAlertIcon, 'text-destructive'],
};

/** Ctrl+Shift+Enter presses Test, as in the SSH host dialog. */
const TEST_KEYS = ['Ctrl+Shift+Enter'] as const;

/** The numbered steps: done ones in the success colour, the current one bold. */
function StepRail({ steps, step }: { steps: readonly string[]; step: number }) {
  return (
    <ol
      aria-label={t`Steps`}
      className="flex min-w-0 flex-wrap gap-x-4 gap-y-1 pb-1 text-label text-faint"
      data-slot="dialog-step-rail"
    >
      {steps.map((name, index) => (
        <li
          aria-current={index === step ? 'step' : undefined}
          className={cn(
            'whitespace-nowrap',
            index < step && 'text-success',
            index === step && 'font-semibold text-foreground',
          )}
          key={`${index}-${name}`}
        >
          {index + 1} {name}
          {index < step ? <span className="sr-only">{t`, done`}</span> : null}
        </li>
      ))}
    </ol>
  );
}

/** One line above the footer: a test's progress or result, with at most one action. */
function StatusLine({ status, onAction }: { status: Status; onAction?: () => void }) {
  const [Icon, tone] = status.tone === 'busy' ? [undefined, ''] : STATUS_GLYPH[status.tone];
  return (
    <div
      aria-live="polite"
      className="flex min-h-8 min-w-0 items-center gap-2.5 rounded-md bg-muted px-2.5 py-1.5 text-menu"
      data-slot="dialog-status"
      data-tone={status.tone}
      role={status.tone === 'negative' ? 'alert' : 'status'}
    >
      {Icon ? (
        <Icon aria-hidden="true" className={cn('size-4 shrink-0', tone)} />
      ) : (
        <RingSpinner className="shrink-0" />
      )}
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className="text-pretty break-words">{status.text}</span>
        {status.detail ? (
          <span className="text-meta text-pretty break-words text-muted-foreground">
            {status.detail}
          </span>
        ) : null}
      </span>
      {status.action ? (
        <Button
          className="shrink-0"
          disabled={status.action.enabled === false || !onAction}
          onClick={onAction}
          size="xs"
          type="button"
          variant="outline"
        >
          {status.action.label}
        </Button>
      ) : null}
    </div>
  );
}

function TabTitle({
  title,
  icon,
  iconsOnly,
}: {
  title: string;
  icon?: string;
  iconsOnly: boolean;
}) {
  const glyph = icon ? kernelIconGlyph(icon) : undefined;
  return (
    <>
      {glyph ? createElement(glyph, { 'aria-hidden': true, className: 'size-3.5' }) : null}
      <span
        className={cn(
          // A narrow dialog shows only the tabs' icons; a narrow window keeps the open tab's name.
          glyph && 'group-data-[state=inactive]/tab:@max-[26rem]/dialog:sr-only',
          glyph && iconsOnly && 'sr-only',
        )}
      >
        {title}
      </span>
    </>
  );
}

export function ClioDialog({
  props,
  context,
  buildChild,
}: {
  props: Props & { setOpen?: (value: boolean) => void; setActiveTab?: (value: string) => void };
  context: RawActionContext & { componentModel: { properties: Record<string, unknown> } };
  buildChild: (id: string) => ReactNode;
}) {
  const raw = context.componentModel.properties as RawDialog;
  const open = props.open === true;
  const [busy, setBusy] = useState<'test' | 'confirm' | 'cancel' | undefined>();
  const press = useCallback(
    (which: 'test' | 'confirm' | 'cancel', action: unknown) => {
      if (!action) return;
      setBusy(which);
      void fireRawAction(context, action).finally(() =>
        setBusy((current) => (current === which ? undefined : current)),
      );
    },
    [context],
  );
  const close = useCallback(() => {
    props.setOpen?.(false);
    if (raw.onClose) void fireRawAction(context, raw.onClose);
  }, [context, props, raw.onClose]);

  const tabs = props.tabs;
  const [localTab, setLocalTab] = useState<string>();
  const bound = isBoundToPath(raw.activeTab);
  const sent = typeof props.activeTab === 'string' ? props.activeTab : undefined;
  const wanted = bound ? sent : (localTab ?? sent);
  const activeTab = tabs?.some((tab) => tab.id === wanted) ? wanted : tabs?.[0]?.id;
  const chooseTab = (id: string) => {
    if (bound) props.setActiveTab?.(id);
    else setLocalTab(id);
  };
  const railShown =
    props.rail && (!props.rail.tabs || !tabs || props.rail.tabs.includes(activeTab ?? ''));

  const testEnabled = Boolean(props.test && props.test.enabled !== false && busy !== 'test');
  const testRef = useRef(() => {});
  useEffect(() => {
    testRef.current = () => press('test', raw.test?.action);
  });
  useEffect(() => {
    if (!open || !testEnabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' || !event.shiftKey || !(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      testRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, testEnabled]);

  const testing = busy === 'test';
  const testButton = props.test ? (
    <Button
      aria-keyshortcuts="Control+Shift+Enter"
      className="gap-[7px] text-foreground"
      data-footer-action=""
      disabled={!testing && !testEnabled}
      // Stop is Test's busy state: it lets go of the wait, not the call.
      onClick={() => (testing ? setBusy(undefined) : press('test', raw.test?.action))}
      title={testing ? t`Stop` : props.test.label}
      type="button"
      variant="outline"
    >
      {testing ? <RingSpinner /> : <PlugIcon aria-hidden="true" />}
      <span className="@max-[22rem]:sr-only">{testing ? t`Stop` : props.test.label}</span>
      {testing ? null : (
        <span aria-hidden="true" className="inline-flex @max-[28.5rem]:hidden max-[599px]:hidden">
          <ShortcutKeys
            className="border-muted-foreground/45 text-muted-foreground"
            keys={TEST_KEYS}
            variant="inline"
          />
        </span>
      )}
    </Button>
  ) : undefined;

  const backAction = raw.cancel?.action;
  const body = tabs ? (
    <Tabs onValueChange={chooseTab} value={activeTab}>
      <TabsList
        className="no-scrollbar h-9 w-full shrink-0 justify-start gap-0 overflow-x-auto overflow-y-hidden rounded-none border-b px-0 py-0 group-data-horizontal/tabs:h-9"
        variant="line"
      >
        {tabs.map((tab) => (
          <TabsTrigger
            className="group/tab h-8 flex-none gap-1.5 px-2.5 text-menu"
            key={tab.id}
            title={tab.title}
            value={tab.id}
          >
            <TabTitle icon={tab.icon} iconsOnly={props.width === 'narrow'} title={tab.title} />
          </TabsTrigger>
        ))}
      </TabsList>
      {railShown ? <StepRail step={props.rail!.step} steps={props.rail!.steps} /> : null}
      {tabs.map((tab) => (
        <TabsContent className="grid min-w-0 gap-3 pt-1" key={tab.id} value={tab.id}>
          {buildChild(tab.child)}
        </TabsContent>
      ))}
    </Tabs>
  ) : (
    <div className="grid min-w-0 gap-3">
      {railShown ? <StepRail step={props.rail!.step} steps={props.rail!.steps} /> : null}
      {props.content ? buildChild(props.content) : null}
    </div>
  );

  return (
    <>
      {props.trigger ? (
        // Pressing the trigger opens the dialog here and still sends the trigger's own action.
        <span
          className="contents"
          data-slot="dialog-trigger"
          onClickCapture={() => props.setOpen?.(true)}
        >
          {buildChild(props.trigger)}
        </span>
      ) : null}
      <DialogFrame
        bodyInset="edge"
        cancelLabel={backAction ? null : props.cancel?.label}
        className={cn(
          '@container/dialog',
          props.width === 'narrow' && 'w-[clamp(320px,30vw,440px)]',
        )}
        confirm={
          props.confirm
            ? {
                label: props.confirm.label,
                tone: props.confirm.tone,
                disabled: props.confirm.enabled === false || busy === 'confirm',
                onConfirm: () => press('confirm', raw.confirm?.action),
              }
            : undefined
        }
        description={props.description}
        footerStart={testButton}
        narrow={tabs ? 'window' : 'sheet'}
        onOpenChange={(next) => {
          if (!next) close();
        }}
        open={open}
        secondary={
          backAction && props.cancel ? (
            <Button
              disabled={busy === 'cancel'}
              onClick={() => press('cancel', backAction)}
              type="button"
              variant="ghost"
            >
              {props.cancel.label}
            </Button>
          ) : undefined
        }
        title={props.title}
      >
        <div
          className="clio-scrollbar grid max-h-[min(36rem,calc(100dvh-12rem))] min-w-0 gap-3 overflow-y-auto pb-1"
          data-slot="dialog-body"
        >
          {body}
          {props.status ? (
            <StatusLine
              onAction={
                raw.status?.action?.action
                  ? () => void fireRawAction(context, raw.status?.action?.action)
                  : undefined
              }
              status={props.status}
            />
          ) : null}
        </div>
      </DialogFrame>
    </>
  );
}

// oxlint-disable-next-line react/only-export-components
export const ClioDialogCatalogComponent = createComponentImplementation(
  { name: 'clio.dialog.v1', schema: dialogSchema },
  ({ props, context, buildChild }) => (
    <ClioDialog
      buildChild={buildChild}
      context={context as unknown as Parameters<typeof ClioDialog>[0]['context']}
      props={props as unknown as Parameters<typeof ClioDialog>[0]['props']}
    />
  ),
);
