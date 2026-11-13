import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { NDPRecord } from './ndp-endpoint-data';
import { t } from '@lingui/core/macro';

/** FDSN station services use familiar station/network fields rather than API parameter names. */
export function NDPStationFilters({
  value,
  onChange,
}: {
  value: NDPRecord;
  onChange: (value: NDPRecord) => void;
}) {
  const filters = { format: 'text', level: 'station', ...value };
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="mb-2 text-sm font-medium">{t`Find stations`}</legend>
      {[
        ['net', t`Network`, 'IU'],
        ['sta', t`Station`, 'ANMO'],
        ['cha', t`Channel`, 'BHZ'],
        ['loc', t`Location`, '00'],
        ['starttime', t`Start time`, '2024-01-01'],
        ['endtime', t`End time`, '2024-01-02'],
      ].map(([key, label, placeholder]) => (
        <div className="space-y-1" key={key}>
          <Label htmlFor={`ndp-station-${key}`}>{label}</Label>
          <Input
            id={`ndp-station-${key}`}
            placeholder={placeholder}
            value={String(value[key] ?? '')}
            onChange={(event) => {
              const next: NDPRecord = { ...filters, [key]: event.target.value };
              if (!event.target.value) delete next[key];
              onChange(next);
            }}
          />
        </div>
      ))}
    </fieldset>
  );
}
