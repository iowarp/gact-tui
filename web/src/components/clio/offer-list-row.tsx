import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOfferList } from '@/hooks/use-offer-list';
import { vocab } from '@/lib/brand-vocabulary';
import { ConfigureIcon } from '@/lib/icon-vocabulary';
import { OfferListDialog } from './offer-list-dialog';
import { IconButton } from './primitives/icon-button';
import { SettingsRow } from './settings-row';
import { plural, t } from '@lingui/core/macro';

/** "Plugins the agent can offer · N brought in", opening the list to choose from. */
export function OfferListRow() {
  const list = useOfferList();
  const [open, setOpen] = useState(false);
  const { agent } = vocab;
  const count = list.data?.listed_count ?? 0;
  return (
    <div className="mt-3" data-slot="offer-list-row">
      <SettingsRow
        description={t`Which plugins and connectors ${agent} is told about, so it can offer one a conversation does not have.`}
        inlineControl
        note={
          list.error
            ? t`The list couldn’t be loaded.`
            : list.data?.customized
              ? plural(count, {
                  one: '# brought in, chosen by you',
                  other: '# brought in, chosen by you',
                })
              : list.data
                ? plural(count, { one: '# brought in', other: '# brought in' })
                : t`Loading…`
        }
        title={t`Plugins ${agent} can offer`}
      >
        <Button
          disabled={!list.data}
          onClick={() => setOpen(true)}
          size="sm"
          title={list.error?.message}
          variant="outline"
        >
          {t`Choose…`}
        </Button>
      </SettingsRow>
      {open && list.data ? (
        <OfferListDialog list={list.data} onOpenChange={setOpen} open={open} />
      ) : null}
    </div>
  );
}

/** The reminder that carries the list (`clio.reminder.session_facts_plugins`). */
export const OFFER_LIST_REMINDER = 'clio.reminder.session_facts_plugins';

/** On that reminder's row: choose which entries it names. */
export function OfferListReminderAction() {
  const list = useOfferList();
  const [open, setOpen] = useState(false);
  const { agent } = vocab;
  return (
    <>
      <IconButton
        disabled={!list.data}
        icon={<ConfigureIcon />}
        label={t`Choose the plugins ${agent} can offer`}
        onClick={() => setOpen(true)}
      />
      {open && list.data ? (
        <OfferListDialog list={list.data} onOpenChange={setOpen} open={open} />
      ) : null}
    </>
  );
}
