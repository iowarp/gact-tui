import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SaveIcon } from '@/lib/icon-vocabulary';

/** Keep the editor scrollable while its save and cancel controls stay in view. */
export function PluginSourceEditor({
  path,
  text,
  name,
  saving,
  error,
  onText,
  onName,
  onSave,
  onCancel,
}: {
  path: string;
  text: string;
  name: string;
  saving: boolean;
  error: string;
  onText: (text: string) => void;
  onName: (name: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b p-3">
        <Label htmlFor={`${id}-name`}>New local copy name</Label>
        <Input
          id={`${id}-name`}
          className="mt-2"
          value={name}
          disabled={saving}
          onChange={(event) => onName(event.target.value)}
        />
        <p className="mt-2 text-xs text-muted-foreground">
          Saves to your Private local marketplace on this agent host. The source repository and
          current agent stay unchanged.
        </p>
      </div>
      <Label htmlFor={`${id}-text`} className="sr-only">
        Edit {path}
      </Label>
      <Textarea
        id={`${id}-text`}
        className="clio-scrollbar min-h-0 flex-1 resize-none field-sizing-fixed rounded-none border-0 font-mono text-sm shadow-none focus-visible:ring-inset"
        spellCheck={false}
        value={text}
        disabled={saving}
        onChange={(event) => onText(event.target.value)}
      />
      <div className="grid shrink-0 gap-2 border-t bg-background p-3">
        {error ? (
          <p role="alert" className="max-h-20 overflow-y-auto text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap justify-end gap-2">
          <Button size="sm" variant="outline" disabled={saving} onClick={onCancel}>
            Cancel editing
          </Button>
          <Button size="sm" disabled={saving || !name.trim()} onClick={onSave}>
            <SaveIcon aria-hidden="true" />
            {saving ? 'Saving…' : 'Save local copy'}
          </Button>
        </div>
      </div>
    </div>
  );
}
