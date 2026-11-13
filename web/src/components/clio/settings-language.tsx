import { t } from '@lingui/core/macro';
import { LanguagesIcon } from 'lucide-react';
import { useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { i18n } from '@/i18n/instance';
import {
  availableLanguages,
  interfaceLanguage,
  systemLocale,
  type LocalePreference,
} from '@/i18n/locales';
import { changeLocalePreference, currentLocalePreference } from '@/i18n/runtime';
import { SettingsSelectField } from './model-select-field';
import { SettingsRow } from './settings-row';

const displayNames = (() => {
  try {
    return new Intl.DisplayNames([i18n.locale], { type: 'language' });
  } catch {
    return undefined;
  }
})();

/** A language's name in the language the interface is shown in now (`Spanish`, `Español`). */
function localName(locale: string): string | undefined {
  if (locale === 'pseudo') return t`Long accented test copy`;
  const name = displayNames?.of(locale);
  return name && name !== interfaceLanguage(locale).nativeName ? name : undefined;
}

function deviceLanguages(): readonly string[] {
  return navigator.languages?.length ? navigator.languages : [navigator.language];
}

/**
 * Interface language. Each language is listed by its own name, so it can be
 * found by someone who cannot read the current one; choosing one reloads the
 * window in that language.
 */
export function LanguageSetting() {
  const [preference] = useState<LocalePreference>(currentLocalePreference);
  const active = interfaceLanguage(i18n.locale);
  const systemName = interfaceLanguage(systemLocale(deviceLanguages())).nativeName;
  const value =
    preference === 'system' ? t`System (${systemName})` : interfaceLanguage(preference).nativeName;
  return (
    <SettingsRow
      htmlFor="interface-language"
      title={t`Language`}
      info={t`The language of menus, settings and messages from this app. Conversations stay in the language you and the agent write in. Changing it reloads the window.`}
      note={
        active.machineTranslated ? t`Machine translated; some wording may be inexact.` : undefined
      }
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SettingsSelectField icon={<LanguagesIcon />} id="interface-language" value={value} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-w-80">
          <DropdownMenuRadioGroup
            value={preference}
            onValueChange={(next) => {
              if (next !== preference) changeLocalePreference(next);
            }}
          >
            <DropdownMenuRadioItem value="system">
              <span className="truncate">{t`System (${systemName})`}</span>
            </DropdownMenuRadioItem>
            {availableLanguages().map((language) => {
              const name = localName(language.locale);
              return (
                <DropdownMenuRadioItem
                  key={language.locale}
                  value={language.locale}
                  lang={language.locale === 'pseudo' ? undefined : language.locale}
                >
                  <span className="truncate">{language.nativeName}</span>
                  {name ? (
                    <span
                      className="ml-auto truncate pl-3 text-muted-foreground"
                      lang={i18n.locale}
                    >
                      {name}
                    </span>
                  ) : null}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </SettingsRow>
  );
}
