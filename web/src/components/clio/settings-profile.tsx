import { LockIcon } from 'lucide-react';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { vocab } from '@/lib/brand-vocabulary';
import { cn } from '@/lib/utils';
import { SaveBar } from './primitives/save-bar';
import { SettingsRow } from './settings-row';
import { SettingsSectionHeading } from './settings-section-heading';
import { type LocalProfile, useLocalProfile } from './settings-profile-store';

const FIELD =
  'h-[1.875rem] rounded-md px-[9px] text-[0.78125rem] placeholder:text-faint md:text-[0.78125rem]';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;

/** Name, email and a few words about the person, saved only on this computer. */
export function ProfileSettings() {
  const { profile, save } = useLocalProfile();
  const [draft, setDraft] = useState<Partial<LocalProfile>>({});
  const value: LocalProfile = { ...profile, ...draft };
  const changed = (Object.keys(draft) as (keyof LocalProfile)[]).filter(
    (field) => (draft[field] ?? '').trim() !== profile[field],
  );
  const emailError =
    value.email.trim() && !EMAIL.test(value.email.trim()) ? 'Enter an email address.' : undefined;
  const edit = (field: keyof LocalProfile) => (next: string) =>
    setDraft((current) => ({ ...current, [field]: next }));

  return (
    <div>
      <SettingsSectionHeading
        info={`Who you are, for ${vocab.agent}. Saved only on this computer.`}
        title="Profile"
      />
      <SettingsRow dirty={changed.includes('name')} htmlFor="profile-name" title="Name">
        <Input
          autoComplete="name"
          className={FIELD}
          id="profile-name"
          onChange={(event) => edit('name')(event.target.value)}
          value={value.name}
        />
      </SettingsRow>
      <SettingsRow
        dirty={changed.includes('email')}
        error={emailError}
        htmlFor="profile-email"
        title="Email"
      >
        <Input
          aria-invalid={Boolean(emailError)}
          autoComplete="email"
          className={FIELD}
          id="profile-email"
          onChange={(event) => edit('email')(event.target.value)}
          placeholder="Optional"
          type="email"
          value={value.email}
        />
      </SettingsRow>
      <SettingsRow
        info={`What you work on and how. Kept on this computer; not sent to ${vocab.agent} yet.`}
        dirty={changed.includes('about')}
        htmlFor="profile-about"
        title="About you"
      >
        <Textarea
          className={cn(
            FIELD,
            'h-[3.875rem] min-h-[3.875rem] resize-none py-1.5 leading-[1.45] field-sizing-fixed',
          )}
          id="profile-about"
          onChange={(event) => edit('about')(event.target.value)}
          value={value.about}
        />
      </SettingsRow>
      <p
        className="flex h-[1.875rem] min-w-0 items-center gap-2 text-xs whitespace-nowrap text-faint"
        data-slot="settings-footnote"
      >
        <LockIcon aria-hidden="true" className="size-[0.8125rem] shrink-0" />
        <span className="min-w-0 truncate">Stays local. Saved only on this computer.</span>
      </p>
      <SaveBar
        count={changed.length}
        invalid={Boolean(emailError)}
        onDiscard={() => setDraft({})}
        onSave={() => {
          save(value);
          setDraft({});
        }}
      />
    </div>
  );
}
