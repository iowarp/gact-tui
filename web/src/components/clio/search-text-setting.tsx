import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingsRow } from './settings-row';

/**
 * One saved text value (an address, an email) with its own Save. The field follows the
 * saved value until the person types, and Save stays off until the text differs.
 */
export function SearchTextSetting({
  id,
  title,
  value,
  placeholder,
  inputMode,
  saving,
  error,
  onSave,
}: {
  id: string;
  title: string;
  value: string;
  placeholder: string;
  /** The keyboard a phone offers; the server, not the browser, judges the value. */
  inputMode: 'url' | 'email';
  saving: boolean;
  error?: string;
  onSave: (value: string) => void;
}) {
  const [draft, setDraft] = useState<string>();
  const text = draft ?? value;
  const changed = text.trim() !== value;
  return (
    <SettingsRow dirty={changed} error={error} fullWidth htmlFor={id} title={title}>
      <form
        className="flex w-full min-w-0 items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (changed && !saving) onSave(text.trim());
        }}
      >
        <Input
          className="min-w-0 flex-1"
          id={id}
          onBlur={() => {
            if (!changed) setDraft(undefined);
          }}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          spellCheck={false}
          autoComplete={inputMode === 'email' ? 'email' : 'off'}
          inputMode={inputMode}
          type="text"
          value={text}
        />
        <Button
          className="h-[1.875rem] px-2.5 text-xs"
          disabled={!changed || saving}
          size="sm"
          type="submit"
          variant="outline"
        >
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </SettingsRow>
  );
}
