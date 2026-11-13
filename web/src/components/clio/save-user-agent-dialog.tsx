import type { AgentDelta } from '@clio/core/v3';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { userAgentId } from '@/lib/plugin-presentation';
import { t } from '@lingui/core/macro';

export interface SaveUserAgentInput {
  id: string;
  name: string;
  description: string;
}

/**
 * Save the conversation's composition as the person's own agent: the parent
 * agent plus the plugins added and removed, never a flattened list, so fixes
 * to the parent reach the saved agent's next session.
 */
export function SaveUserAgentDialog({
  open,
  parentName,
  parentRef,
  delta,
  pending,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  parentName: string;
  parentRef: string;
  delta: AgentDelta;
  pending: boolean;
  error?: string;
  onSave: (input: SaveUserAgentInput) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const id = userAgentId(name);
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t`Save as agent`}</DialogTitle>
          <DialogDescription>
            {t`Starts from ${parentName} and keeps your changes. Updates to ${parentName} reach this agent in its next conversation.`}
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (id) onSave({ id, name: name.trim(), description: description.trim() });
          }}
        >
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="user-agent-name">{t`Agent name`}</FieldLabel>
              <Input
                autoFocus
                id="user-agent-name"
                onChange={(event) => setName(event.target.value)}
                placeholder={t`My HDF5 analyst`}
                value={name}
              />
              <FieldDescription>
                {id ? t`Saved as user/${id}.` : t`Use letters or numbers.`}
              </FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="user-agent-description">{t`Description`}</FieldLabel>
              <Input
                id="user-agent-description"
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t`Optional`}
                value={description}
              />
            </Field>
          </FieldGroup>
          <dl className="grid gap-1.5 rounded-lg border p-3 text-sm">
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{t`Starts from`}</dt>
              <dd className="font-medium">
                {parentName}{' '}
                <span className="font-normal text-muted-foreground">({parentRef})</span>
              </dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{t`Adds`}</dt>
              <dd>{delta.add.length ? delta.add.join(', ') : t`Nothing`}</dd>
            </div>
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{t`Removes`}</dt>
              <dd>{delta.remove.length ? delta.remove.join(', ') : t`Nothing`}</dd>
            </div>
          </dl>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button onClick={onClose} type="button" variant="ghost">
              {t`Cancel`}
            </Button>
            <Button disabled={!id || pending} type="submit">
              {pending ? t`Saving…` : t`Save agent`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
