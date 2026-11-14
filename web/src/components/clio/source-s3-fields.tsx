import { t, ph } from '@lingui/core/macro';
import { Input } from '@/components/ui/input';
import { vocab } from '@/lib/brand-vocabulary';
import { SegmentedControl } from './primitives/segmented-control';
import { InfoTip } from './info-tip';
import { SourceField, sourceInputClass } from './source-form-parts';
import type { SourceFieldsState } from './use-source-fields';

type S3Access = 'anonymous' | 'keys' | 'profile';

const accessOptions: ReadonlyArray<{ value: S3Access; label: string }> = [
  { value: 'anonymous', label: t`Public` },
  { value: 'keys', label: t`Access key` },
  { value: 'profile', label: t`Profile` },
];

/**
 * An S3 source's settings after its bucket and prefix: the region, an endpoint for
 * S3-compatible stores, and how the bucket is reached. Keys are sent once to the
 * connected service, kept there, and never shown again.
 */
export function SourceS3Fields({
  fields,
  formId,
  disabled,
}: {
  fields: SourceFieldsState;
  formId: string;
  disabled: boolean;
}) {
  const { configuration, setConfiguration, s3Credentials, setS3Credentials } = fields;
  const access = (configuration.s3_access ?? 'anonymous') as S3Access;
  const set = (patch: Partial<typeof configuration>) =>
    setConfiguration((previous) => ({ ...previous, ...patch }));
  return (
    <>
      <SourceField label={t`Region`} htmlFor={`${formId}-s3-region`}>
        <Input
          id={`${formId}-s3-region`}
          form={formId}
          className={sourceInputClass}
          value={configuration.s3_region ?? ''}
          disabled={disabled}
          placeholder="us-west-2"
          onChange={(event) => set({ s3_region: event.target.value.trim() })}
        />
      </SourceField>
      <SourceField
        label={t`Endpoint`}
        htmlFor={`${formId}-s3-endpoint`}
        aside={
          <>
            {t`Optional`}
            <InfoTip label={t`When to set an endpoint`}>
              {t`Leave it empty for Amazon S3. For an S3-compatible store such as MinIO, Ceph or the Open Storage Network, enter its address.`}
            </InfoTip>
          </>
        }
      >
        <Input
          id={`${formId}-s3-endpoint`}
          form={formId}
          className={sourceInputClass}
          value={configuration.s3_endpoint_url ?? ''}
          disabled={disabled}
          placeholder="https://s3.example.org"
          onChange={(event) => set({ s3_endpoint_url: event.target.value.trim() })}
        />
      </SourceField>
      <SourceField label={t`Access`}>
        <SegmentedControl
          label={t`Access`}
          value={access}
          onValueChange={(value) => {
            set({ s3_access: value as S3Access });
            if (value !== 'keys') setS3Credentials(undefined);
          }}
          options={accessOptions.map((option) => ({ ...option, disabled }))}
        />
      </SourceField>
      {access === 'keys' ? (
        <>
          <SourceField label={t`Access key ID`} htmlFor={`${formId}-s3-key`}>
            <Input
              id={`${formId}-s3-key`}
              form={formId}
              className={sourceInputClass}
              autoComplete="off"
              spellCheck={false}
              value={s3Credentials?.access_key_id ?? ''}
              disabled={disabled}
              onChange={(event) =>
                setS3Credentials({
                  access_key_id: event.target.value.trim(),
                  secret_access_key: s3Credentials?.secret_access_key ?? '',
                })
              }
            />
          </SourceField>
          <SourceField
            label={t`Secret access key`}
            htmlFor={`${formId}-s3-secret`}
            hint={t`Kept by ${ph({ agent: vocab.agent })} on the computer it runs on, for this source only; scripts and tools never see it.`}
          >
            <Input
              id={`${formId}-s3-secret`}
              form={formId}
              type="password"
              autoComplete="off"
              className={sourceInputClass}
              value={s3Credentials?.secret_access_key ?? ''}
              disabled={disabled}
              onChange={(event) =>
                setS3Credentials({
                  access_key_id: s3Credentials?.access_key_id ?? '',
                  secret_access_key: event.target.value,
                })
              }
            />
          </SourceField>
        </>
      ) : access === 'profile' ? (
        <SourceField
          label={t`Profile name`}
          htmlFor={`${formId}-s3-profile`}
          hint={t`A profile in the AWS configuration of the computer ${ph({ agent: vocab.agent })} runs on.`}
        >
          <Input
            id={`${formId}-s3-profile`}
            form={formId}
            className={sourceInputClass}
            value={configuration.s3_profile ?? ''}
            disabled={disabled}
            placeholder="default"
            onChange={(event) => set({ s3_profile: event.target.value.trim() })}
          />
        </SourceField>
      ) : null}
    </>
  );
}
