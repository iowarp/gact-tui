import type { ModelRegistryDetails } from '@clio/core/v3';
import { MessageResponse } from '@/components/ai-elements/message';
import { ExternalLink } from '@/components/ui/external-link';
import { defaultRemarkPlugins } from 'streamdown';
import { registryCardBody, registryCardLinks } from '@/lib/registry-model-markdown';
import { t, ph } from '@lingui/core/macro';

/** Read the pinned card at a bounded reading width, keeping its actual source and completeness visible. */
export function RegistryModelCard({ model }: { model: ModelRegistryDetails }) {
  const repository = model.card_repository || model.metadata_repository;
  const revision = model.card_revision || model.revision;
  const status = model.card_status;
  const messages: Record<string, string> = {
    truncated: t`Only part of the model card was retrieved. Open the pinned source to read the remainder.`,
    missing: t`No README was found at this revision.`,
    access_required: t`This model card requires access on Hugging Face.`,
    unavailable: t`The model card could not be retrieved.`,
    unknown: t`This service did not report whether the model card is complete.`,
  };
  return (
    <div className="min-h-0 flex-1 overflow-y-auto" data-slot="registry-model-card">
      <div className="mx-auto max-w-[80ch] space-y-5 px-2 pb-6 text-base leading-7">
        {status !== 'complete' && messages[status] ? (
          <p role="status" className="text-sm text-muted-foreground">
            {messages[status]}{' '}
            <ExternalLink className="underline underline-offset-4" href={model.card_url}>
              {t`Pinned source`}
            </ExternalLink>
          </p>
        ) : null}
        {model.card_markdown ? (
          <MessageResponse
            loadingFallback={
              <p role="status" className="text-sm text-muted-foreground">
                {t`Rendering model card…`}
              </p>
            }
            className="text-base leading-7"
            remarkPlugins={[
              ...Object.values(defaultRemarkPlugins),
              registryCardLinks(repository, revision),
            ]}
            components={{
              a: ({ href, children }) =>
                href?.startsWith('#') ? (
                  <a href={href}>{children}</a>
                ) : href ? (
                  <ExternalLink href={href}>{children}</ExternalLink>
                ) : (
                  <span>{children}</span>
                ),
            }}
          >
            {registryCardBody(model.card_markdown)}
          </MessageResponse>
        ) : status === 'complete' ? (
          <p className="text-sm text-muted-foreground">{t`This model card is empty.`}</p>
        ) : null}
        <p className="border-t pt-4 text-xs text-muted-foreground" title={revision}>
          {model.metadata_repository !== repository
            ? t`Card: ${repository}, revision ${ph({ revision: revision.slice(0, 12) })}. Capability metadata: ${ph({ metadata: model.metadata_repository })}`
            : t`Card: ${repository}, revision ${ph({ revision: revision.slice(0, 12) })}`}
        </p>
      </div>
    </div>
  );
}
