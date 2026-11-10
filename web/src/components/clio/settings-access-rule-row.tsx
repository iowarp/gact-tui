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
      aria-label="Remove this rule?"
    >
      <span className="min-w-0 truncate text-[12.5px] text-destructive" role="alert">
        Remove this rule?
      </span>
      <Button
        className={CONFIRM_BUTTON}
        onClick={onKeep}
        ref={keep}
        size="sm"
        type="button"
        variant="ghost"
      >
        Keep
      </Button>
      <Button
        className={CONFIRM_BUTTON}
        onClick={onRemove}
        size="sm"
        type="button"
        variant="destructive"
      >
        Remove
      </Button>
    </span>
  );
}

export function AccessRuleRow({
  policy,
  position,
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
  const parts = [
    kindLabels[kind],
    ...details,
    ...(showScope ? [scope.label] : []),
    ...(policy.priority === undefined ? [] : [`Priority ${policy.priority}`]),
  ];
  const editable = !BROWSER_KINDS.has(kind);
  const meta = (
    <span
      title={[...parts, scope.missingId ? `Identifier ${scope.missingId}` : '']
        .filter(Boolean)
        .join(', ')}
    >
      {parts.map((part, index) => (
        <span
          aria-label={
            part === scope.label && scope.missingId
              ? `${scope.label}. Identifier ${scope.missingId}`
              : undefined
          }
          className={index ? 'ml-2.5' : undefined}
          key={`${index}:${part}`}
        >
          {part}
        </span>
      ))}
      {dirty ? <span className="ml-2.5 text-primary">Not saved</span> : null}
    </span>
  );
  const title = (
    <span className="font-mono text-[0.78125rem] font-normal" title={target}>
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
            <IconButton icon={<EditIcon />} label={`Edit rule ${position}`} onClick={onEdit} />
          ) : null}
          <IconButton
            icon={<DeleteIcon />}
            label={`Remove rule ${position}`}
            onClick={onAskRemove}
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton icon={<MoreIcon />} label={`More for rule ${position}`} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {editable ? (
                <DropdownMenuItem onSelect={onDuplicate}>
                  <CopyPlusIcon aria-hidden="true" />
                  Duplicate rule
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => void navigator.clipboard?.writeText(target)}>
                <CopyIcon aria-hidden="true" />
                Copy pattern
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
