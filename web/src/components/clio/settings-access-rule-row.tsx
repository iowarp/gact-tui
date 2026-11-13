import type { PermissionPolicy, Workspace } from '@clio/core/v3';
import { CopyIcon, CopyPlusIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DeleteIcon, EditIcon, MoreIcon } from '@/lib/icon-vocabulary';
import { IconButton } from './primitives/icon-button';
import { ItemRow } from './primitives/item-row';
import { JumpLabel, menuAcceleratorKeyDown } from './primitives/menu-row';
import { StatusIndicator } from './primitives/status-indicator';
import { RuleKindIcon } from './settings-access-rule-dialog';
import {
  BROWSER_KINDS,
  inferredKind,
  kindLabels,
  RULE_COLUMNS,
  ruleDetails,
  ruleScope,
  ruleStatus,
  ruleTarget,
} from './settings-access-rule-model';
import { t, ph } from '@lingui/core/macro';

/** 26px row buttons, the slot height every Settings list shares. */
const CONFIRM_BUTTON = 'h-[1.625rem] px-2.5 text-xs';

/** The ItemRow `confirm` cell: the question, then Keep and Remove. */
function RemoveConfirm({ onKeep, onRemove }: { onKeep: () => void; onRemove: () => void }) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <span
      className="flex min-w-0 items-center justify-end gap-2"
      data-escape-scope=""
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.stopPropagation();
        onKeep();
      }}
      role="group"
      aria-label={t`Remove this rule?`}
    >
      <span className="min-w-0 truncate text-menu text-destructive" role="alert">
        {t`Remove this rule?`}
      </span>
      <Button
        className={CONFIRM_BUTTON}
        onClick={onKeep}
        ref={keep}
        size="sm"
        type="button"
        variant="ghost"
      >
        {t`Keep`}
      </Button>
      <Button
        className={CONFIRM_BUTTON}
        onClick={onRemove}
        size="sm"
        type="button"
        variant="destructive"
      >
        {t`Remove`}
      </Button>
    </span>
  );
}

export function AccessRuleRow({
  policy,
  position,
  rank,
  workspaces,
  confirming,
  dirty,
  onEdit,
  onDuplicate,
  onAskRemove,
  onKeep,
  onRemove,
}: {
  policy: PermissionPolicy;
  /** 1-based, names the row's actions ("Edit rule 2"). */
  position: number;
  /** The rule's priority rank (`priorityRanks`), lowest 1. */
  rank?: number;
  workspaces?: readonly Workspace[];
  confirming: boolean;
  /** Added or changed and waiting in the save bar. */
  dirty: boolean;
  onEdit: () => void;
  onDuplicate: () => void;
  onAskRemove: () => void;
  onKeep: () => void;
  onRemove: () => void;
}) {
  const kind = inferredKind(policy);
  const target = ruleTarget(policy);
  const scope = ruleScope(policy, workspaces);
  const status = ruleStatus(policy.action);
  const details = ruleDetails(policy);
  // Planning and hook rules name their modes or events; an unscoped rule need not repeat "Any".
  const showScope = !details.length || policy.scope_id || kind === 'domain' || kind === 'fs_root';
  // A path or key runs long, so it goes last, where truncation leaves the scope and priority readable.
  const parts = [
    kindLabels[kind],
    ...details.filter((detail) => !detail.long).map((detail) => detail.text),
    ...(showScope ? [scope.label] : []),
    ...(rank === undefined ? [] : [t`Priority ${rank}`]),
    ...details.filter((detail) => detail.long).map((detail) => detail.text),
  ];
  const editable = !BROWSER_KINDS.has(kind);
  const meta = (
    <span
      title={[...parts, scope.missingId ? t`Identifier ${ph({ missingId: scope.missingId })}` : '']
        .filter(Boolean)
        .join(', ')}
    >
      {parts.map((part, index) => (
        <span
          aria-label={
            part === scope.label && scope.missingId
              ? t`${ph({ label: scope.label })}. Identifier ${ph({ missingId: scope.missingId })}`
              : undefined
          }
          className={index ? 'ml-2.5' : undefined}
          key={`${index}:${part}`}
        >
          {part}
        </span>
      ))}
      {dirty ? <span className="ml-2.5 text-primary">{t`Not saved`}</span> : null}
    </span>
  );
  const title = (
    <span className="font-mono text-menu font-normal" title={target}>
      {target}
    </span>
  );
  return (
    <ItemRow
      {...RULE_COLUMNS}
      confirm={confirming ? <RemoveConfirm onKeep={onKeep} onRemove={onRemove} /> : undefined}
      actions={
        <>
          {editable ? (
            <IconButton icon={<EditIcon />} label={t`Edit rule ${position}`} onClick={onEdit} />
          ) : null}
          <IconButton
            icon={<DeleteIcon />}
            label={t`Remove rule ${position}`}
            onClick={onAskRemove}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<MoreIcon />} label={t`More for rule ${position}`} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" onKeyDown={menuAcceleratorKeyDown}>
              {editable ? (
                <DropdownMenuItem data-accelerator="D" onSelect={onDuplicate}>
                  <CopyPlusIcon aria-hidden="true" />
                  <JumpLabel label={t`Duplicate rule`} letter="D" />
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                data-accelerator="C"
                onSelect={() => void navigator.clipboard?.writeText(target)}
              >
                <CopyIcon aria-hidden="true" />
                <JumpLabel label={t`Copy pattern`} letter="C" />
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      }
      icon={<RuleKindIcon kind={kind} />}
      meta={meta}
      onDoubleClick={editable && !confirming ? onEdit : undefined}
      status={<StatusIndicator label={status.label} tone={status.tone} />}
      title={title}
    />
  );
}
