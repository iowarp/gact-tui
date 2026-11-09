import { MEMORY_CATEGORIES, type Workspace } from '@clio/core/v3';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createElement, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useRepository } from '@/hooks/use-repository';
import { memoryCategoryIcon, memoryErrorText } from './memory-document-helpers';
import { MEMORY_CATEGORY_LABELS } from './memory-presentation';
import { MemoryPicker, MemoryScopePicker } from './memory-scope-picker';
import { RuntimeSettingsPanel } from './settings-runtime';
import { SettingsGroupLabel, SettingsRow } from './settings-row';

type Category = (typeof MEMORY_CATEGORIES)[number];

const CATEGORY_OPTIONS = MEMORY_CATEGORIES.map((value) => ({
  value,
  label: MEMORY_CATEGORY_LABELS[value] ?? value,
  icon: createElement(memoryCategoryIcon(value)),
}));

/** Save a memory explicitly supplied by the user, without a background model call. */
function MemoryWrite({
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
  const [category, setCategory] = useState<Category>('preferences');
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
    <form aria-label="Write a memory" className="grid" onSubmit={submit}>
      <SettingsGroupLabel>Write a memory</SettingsGroupLabel>
      <SettingsRow
        htmlFor="memory-scope"
        info="Saves exactly what you enter. No model is called."
        title="Remember in"
      >
        <MemoryScopePicker
          disabled={create.isPending}
          id="memory-scope"
          onChange={setScope}
          onRetryWorkspaces={onRetryWorkspaces}
          value={scope}
          workspaces={workspaces}
          workspacesError={workspacesError}
          workspacesLoading={workspacesLoading}
        />
      </SettingsRow>
      <SettingsRow htmlFor="memory-category" title="Category">
        <MemoryPicker
          disabled={create.isPending}
          id="memory-category"
          label="Category"
          onChange={(next) => setCategory(next as Category)}
          options={CATEGORY_OPTIONS}
          searchPlaceholder="Search categories…"
          value={category}
        />
      </SettingsRow>
      {!singleton ? (
        <SettingsRow htmlFor="memory-title" title="Subject">
          <Input
            className="h-[1.875rem] text-[12.5px]"
            disabled={create.isPending}
            id="memory-title"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="For example, field sensors"
            required
            value={title}
          />
        </SettingsRow>
      ) : null}
      <SettingsRow htmlFor="memory-facts" title="What to remember">
        <Textarea
          className="min-h-20 text-[12.5px]"
          disabled={create.isPending}
          id="memory-facts"
          onChange={(event) => setFacts(event.target.value)}
          placeholder="One fact or preference per line"
          required
          rows={4}
          value={facts}
        />
      </SettingsRow>
      {create.error ? (
        <p className="pt-2 text-[12.5px] text-destructive" role="alert">
          {memoryErrorText(create.error)}
        </p>
      ) : null}
      <div className="pt-3">
        <Button disabled={!slug || !lines.length || create.isPending} size="sm" type="submit">
          {create.isPending ? 'Saving…' : 'Save memory'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Create memories: write one directly, and choose how the background pass
 * creates and reviews them.
 */
export function MemoryCreate(props: {
  workspaces: Workspace[];
  onCreated: (name: string) => void;
  workspacesLoading?: boolean;
  workspacesError?: string;
  onRetryWorkspaces?: () => void;
}) {
  return (
    <div className="grid gap-8">
      <MemoryWrite {...props} />
      <RuntimeSettingsPanel
        description=""
        headingLevel={2}
        only="Memory"
        title="Background creation"
      />
    </div>
  );
}
