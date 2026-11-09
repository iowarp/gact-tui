import { EyeIcon, FileTextIcon, LoaderCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockFilename,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { promptScopeLabel, type PromptDraft, type PromptEditor } from './settings-prompts-model';
const CONTROL = 'h-[1.875rem] text-[0.78125rem]';

function Field({
  id,
  label,
  note,
  error,
  children,
}: {
  id?: string;
  label: string;
  note?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="grid min-w-0 gap-1">
      <label className="text-xs text-muted-foreground" htmlFor={id}>
        {label}
      </label>
      {children}
      {note ? <p className="text-xs text-faint">{note}</p> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** The editable definition: identity, instructions, save scope and model preferences. */
export function PromptDefinitionForm({ editor }: { editor: PromptEditor }) {
  const { prompt, draft, set } = editor;
  const profiles = prompt ? Object.keys(prompt.profiles) : [];
  return (
    <div className="@container grid gap-3">
      <div className="grid gap-3 @md:grid-cols-2">
        <Field id="prompt-id" label="Prompt ID">
          <Input
            className={CONTROL}
            disabled={Boolean(prompt)}
            id="prompt-id"
            onChange={(event) => set('id', event.target.value)}
            value={draft.id}
            {...(prompt ? {} : { 'data-initial-focus': '' })}
          />
        </Field>
        <Field id="prompt-profile" label="Profile">
          {profiles.length ? (
            <Select onValueChange={editor.chooseProfile} value={draft.profile}>
              <SelectTrigger
                aria-label="Prompt profile"
                className={`${CONTROL} w-full`}
                id="prompt-profile"
                size="sm"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {profiles.map((profile) => (
                  <SelectItem key={profile} value={profile}>
                    {profile}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className={CONTROL}
              id="prompt-profile"
              onChange={(event) => set('profile', event.target.value)}
              value={draft.profile}
            />
          )}
        </Field>
      </div>
      <Field id="prompt-title" label="Title">
        <Input
          className={CONTROL}
          id="prompt-title"
          onChange={(event) => set('title', event.target.value)}
          value={draft.title}
        />
      </Field>
      <Field id="prompt-description" label="Description">
        <Input
          className={CONTROL}
          id="prompt-description"
          onChange={(event) => set('description', event.target.value)}
          value={draft.description}
        />
      </Field>
      <Field
        error={editor.validationErrors.length ? editor.validationErrors.join(', ') : undefined}
        id="prompt-text"
        label="Instructions"
        note="Template placeholders are checked by the service allowlist."
      >
        <Textarea
          className="min-h-48 font-mono text-xs leading-5"
          id="prompt-text"
          onChange={(event) => set('text', event.target.value)}
          value={draft.text}
        />
      </Field>
      <Field
        error={editor.workspaceRequired ? 'Select a workspace above first.' : undefined}
        label="Save for"
      >
        <Select
          onValueChange={(value: PromptDraft['scope']) => editor.setScope(value)}
          value={draft.scope}
        >
          <SelectTrigger aria-label="Prompt save scope" className={`${CONTROL} w-full`} size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="global">Entire service</SelectItem>
            <SelectItem value="workspace">Selected workspace</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid gap-3 @md:grid-cols-2">
        <Field id="prompt-provider" label="Provider preference">
          <Input
            className={CONTROL}
            id="prompt-provider"
            onChange={(event) => set('provider', event.target.value)}
            placeholder="Inherit"
            value={draft.provider}
          />
        </Field>
        <Field id="prompt-model" label="Model preference">
          <Input
            className={CONTROL}
            id="prompt-model"
            onChange={(event) => set('model', event.target.value)}
            placeholder="Inherit"
            value={draft.model}
          />
        </Field>
      </div>
      {editor.resolved ? (
        <div className="grid min-w-0 gap-0.5 border-l border-border pl-3 text-xs text-muted-foreground">
          <p>Effective source: {promptScopeLabel(editor.resolved.scope)}</p>
          {editor.resolved.source_path ? (
            <p className="font-mono break-all">{editor.resolved.source_path}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Render the prompt against the connected service's live context. */
export function PromptPreview({ editor }: { editor: PromptEditor }) {
  const { preview } = editor;
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">
        The preview uses the connected serviceâ€™s current agents, tools, commands, memory,
        permissions, provider, and active pack.
      </p>
      {editor.prompt ? (
        <Button
          className="justify-self-start"
          disabled={preview.isPending}
          onClick={() => preview.mutate()}
          size="sm"
          variant="outline"
        >
          {preview.isPending ? (
            <LoaderCircleIcon className="motion-safe:animate-spin" />
          ) : (
            <EyeIcon />
          )}
          Render effective prompt
        </Button>
      ) : (
        <p className="text-xs text-muted-foreground">
          Save this new prompt before rendering it against live context.
        </p>
      )}
      {editor.renderedText ? (
        <CodeBlock className="max-h-96" code={editor.renderedText} language="markdown">
          <CodeBlockHeader>
            <CodeBlockTitle>
              <FileTextIcon aria-hidden="true" className="size-3.5" />
              <CodeBlockFilename>Effective prompt</CodeBlockFilename>
            </CodeBlockTitle>
            <CodeBlockActions>
              <CodeBlockCopyButton aria-label="Copy effective prompt" />
            </CodeBlockActions>
          </CodeBlockHeader>
        </CodeBlock>
      ) : null}
    </div>
  );
}

/** Validate on the left, save on the right, as a dialog's button row. */
export function PromptEditorActions({ editor }: { editor: PromptEditor }) {
  return (
    <div className="flex min-w-0 items-center justify-end gap-2 pt-3">
      <Button
        disabled={!editor.canValidate}
        onClick={() => editor.validate.mutate()}
        size="sm"
        variant="outline"
      >
        {editor.validate.isPending ? (
          <LoaderCircleIcon className="motion-safe:animate-spin" />
        ) : null}
        Validate
      </Button>
      <Button disabled={!editor.canSave} onClick={() => editor.save.mutate()} size="sm">
        {editor.save.isPending ? <LoaderCircleIcon className="motion-safe:animate-spin" /> : null}
        {editor.saveLabel}
      </Button>
    </div>
  );
}
