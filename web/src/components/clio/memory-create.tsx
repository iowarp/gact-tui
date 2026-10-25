import { MEMORY_CATEGORIES, type Workspace } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';

import { MEMORY_CATEGORY_LABELS } from './memory-presentation';
import { MemoryScopePicker } from './memory-scope-picker';

/** Save a memory explicitly supplied by the user, without a background model call. */
export function MemoryCreate({
  workspaces,
  onCreated,
  workspacesLoading = false,
  workspacesError,
  onRetryWorkspaces,
}: {
  workspaces: Workspace[];
  onCreated: (name: string) => void;
  workspacesLoading?: boolean;
  workspacesError?: string;
  onRetryWorkspaces?: () => void;
}) {
  const repository = useRepository();
  const client = useQueryClient();
  const [title, setTitle] = useState('');
  const [facts, setFacts] = useState('');
  const [scope, setScope] = useState('user');
  const [category, setCategory] = useState<(typeof MEMORY_CATEGORIES)[number]>('preferences');
  const singleton = category === 'profile' || category === 'preferences';
  const slug = singleton
    ? category
    : title
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/gu, '-')
        .replace(/^-|-$/gu, '');
  const lines = facts
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const create = useMutation({
    mutationFn: () =>
      repository.createMemoryDocument({
        scope,
        category,
        slug,
        description: singleton ? MEMORY_CATEGORY_LABELS[category] : title.trim(),
        facts: lines,
      }),
    onSuccess: (document) => {
      void client.invalidateQueries({ queryKey: ['memory'] });
      setTitle('');
      setFacts('');
      onCreated(document.name);
    },
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (slug && lines.length && !create.isPending) create.mutate();
  };
  return (
    <form className="grid max-w-2xl gap-4" onSubmit={submit}>
      <p className="text-sm text-muted-foreground">
        Write what the agent should remember. This saves exactly what you enter and uses no model
        calls.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <MemoryScopePicker
          id="memory-scope"
          value={scope}
          onChange={setScope}
          disabled={create.isPending}
          workspaces={workspaces}
          workspacesLoading={workspacesLoading}
          workspacesError={workspacesError}
          onRetryWorkspaces={onRetryWorkspaces}
        />
        <div className="grid gap-1.5">
          <Label htmlFor="memory-category">Category</Label>
          <Select
            value={category}
            onValueChange={(next) => setCategory(next as typeof category)}
            disabled={create.isPending}
          >
            <SelectTrigger id="memory-category" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MEMORY_CATEGORIES.map((value) => (
                <SelectItem key={value} value={value}>
                  {MEMORY_CATEGORY_LABELS[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {!singleton ? (
        <div className="grid gap-1.5">
          <Label htmlFor="memory-title">Subject</Label>
          <Input
            id="memory-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="For example, field sensors"
            required
            disabled={create.isPending}
          />
        </div>
      ) : null}
      <div className="grid gap-1.5">
        <Label htmlFor="memory-facts">What to remember</Label>
        <Textarea
          id="memory-facts"
          value={facts}
          onChange={(event) => setFacts(event.target.value)}
          rows={5}
          placeholder="One fact or preference per line"
          required
          disabled={create.isPending}
        />
      </div>
      {create.error ? (
        <p role="alert" className="text-sm text-destructive">
          {create.error.message}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={!slug || !lines.length || create.isPending}>
          {create.isPending ? 'Saving…' : 'Save memory'}
        </Button>
      </div>
    </form>
  );
}
