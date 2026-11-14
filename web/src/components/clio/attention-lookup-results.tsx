import type { AttentionLookup, AttentionLookupResult } from '@clio/core/v3';
import { Button } from '@/components/ui/button';
import { formatSharePercent } from '@/lib/attention-text';
import { InfoTip } from './info-tip';
import { AttentionBreakdown } from './attention-mode-banner';
import {
  attentionEvidenceHash,
  type AttentionEvidenceInspection,
} from '@/lib/attention-evidence-navigation';
import { plural, t, ph } from '@lingui/core/macro';
import { Trans } from '@lingui/react/macro';

function evidence(view: AttentionLookup['views'][number]): AttentionEvidenceInspection | undefined {
  const selections = view.kind === 'generated' ? view.selected_references : view.sources;
  if (!selections?.length || !view.profile) return;
  return {
    schema_version: 1,
    selections,
    profile: view.profile,
    direction: view.kind === 'generated' ? 'generated_to_source' : 'source_to_generation',
    lm_call_id: view.lm_call_id,
    capture_sha256: view.capture_sha256,
    profile_revision: view.profile_revision,
  };
}

const GENERIC_SECTION_LABELS = new Set([
  'tool',
  'tool_result',
  'tool_call_results',
  'user',
  'answer',
]);

/** A block's kind, plus the tool's name when its captured section is labelled with one. */
function blockLabel(
  view: AttentionLookup['views'][number],
  block: { kind: string; section?: number },
) {
  const sections = (view as { sections?: readonly { label?: string }[] }).sections;
  const label = block.section === undefined ? undefined : sections?.[block.section]?.label;
  const kind = block.kind.replaceAll('_', ' ');
  return label && !GENERIC_SECTION_LABELS.has(label) ? `${kind} (${label})` : kind;
}

/** Keep capture identity, profile and missingness inspectable alongside the numerical result. */
export function AttentionLookupResults({
  result,
  heatCall,
  onShowHeat,
}: {
  result: AttentionLookupResult;
  heatCall?: string;
  onShowHeat?: (view: AttentionLookup['views'][number]) => void;
}) {
  if (!('views' in result))
    return <p className="text-sm text-muted-foreground">{result.message}</p>;
  return (
    <div className="space-y-2 py-2">
      {!result.views.length ? (
        <p className="text-sm text-muted-foreground">
          {t`No compatible captured coordinates in the model calls checked.`}
        </p>
      ) : null}
      {result.views.map((view, index) => (
        <details key={view.lm_call_id} className="rounded-md border bg-background p-2">
          <summary className="cursor-pointer text-sm">
            {view.kind === 'source'
              ? t`Later generation: ${ph({ share: formatSharePercent(view.mass) })} retained source mass`
              : plural(view.selected_steps.length, {
                  one: 'Generated selection: # captured token',
                  other: 'Generated selection: # captured tokens',
                })}
          </summary>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {result.views.length > 1
                ? t`Model call ${ph({ call: index + 1 })} of ${ph({ total: result.views.length })}`
                : t`Model call ${ph({ call: index + 1 })}`}
            </span>
            {onShowHeat && (view.kind === 'generated' || view.heat?.blocks.length) ? (
              <Button
                size="sm"
                variant={heatCall === view.lm_call_id ? 'secondary' : 'outline'}
                aria-pressed={heatCall === view.lm_call_id}
                onClick={() => onShowHeat(view)}
              >
                {heatCall === view.lm_call_id
                  ? t`Heat shown in transcript`
                  : t`Show transcript heat`}
              </Button>
            ) : null}
            <InfoTip label={t`About capture and profile identity`}>
              {t`Request ${ph({ request_id: view.request_id })}. Capture SHA-256: ${ph({ capture_sha256: view.capture_sha256 })}. Profile: ${ph({ profile_revision: view.profile_revision })}. These identify the exact bytes and aggregation settings used for this view.`}
            </InfoTip>
            {view.kind === 'source' ? (
              view.generated_references.map((reference) => (
                <a
                  key={`${reference.message_id}:${reference.part_id}:${reference.field}`}
                  href={attentionEvidenceHash(reference, view.profile_revision, evidence(view))}
                  className="text-link underline underline-offset-4"
                >
                  {reference.field === 'thought'
                    ? t`Inspect reasoning`
                    : t`Inspect ${ph({ field: reference.field ?? '' })}`}
                </a>
              ))
            ) : (
              <a
                href={attentionEvidenceHash(
                  { message_id: view.message_id, ...view.selection },
                  view.profile_revision,
                  evidence(view),
                )}
                className="text-link underline underline-offset-4"
              >
                {t`Inspect answer`}
              </a>
            )}
          </div>
          {view.kind === 'source' ? (
            <>
              <p className="my-2 text-xs text-muted-foreground">
                {t`Highest scoring output tokens, showing ${ph({ shown: Math.min(32, view.tokens.length) })} of ${ph({ total: view.step_count })}`}
              </p>
              <div className="flex flex-wrap gap-1">
                {view.tokens.slice(0, 32).map((token) => (
                  <span
                    key={token.step}
                    className={`rounded border px-1 font-mono text-xs ${token.retained_tokens ? (token.intensity > 0.75 ? 'bg-primary/40' : token.intensity > 0.4 ? 'bg-primary/25' : 'bg-primary/10') : ''}`}
                    title={t`Output token ${ph({ step: token.step })}. Retained source mass ${ph({ mass: formatSharePercent(token.mass) })}. Score ${ph({ score: token.score.toPrecision(4) })}. Intensity ${ph({ intensity: token.intensity.toFixed(3) })}.`}
                  >
                    {token.text || '∅'}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <>
              {view.sources?.length ? (
                <div className="mt-2">
                  <AttentionBreakdown data={view} />
                </div>
              ) : null}
              <p className="mt-2 text-xs text-muted-foreground">{t`Transcript content in this call`}</p>
              <ul className="mt-1 space-y-1 text-xs">
                {view.blocks.map((block) => {
                  const label = blockLabel(view, block);
                  const share = formatSharePercent(block.share);
                  return (
                    <li key={`${block.message_id}:${block.part_id}:${block.field}`}>
                      <Trans>
                        <a
                          href={attentionEvidenceHash(block, view.profile_revision, evidence(view))}
                          className="text-link underline underline-offset-4"
                        >
                          Inspect {label}
                        </a>
                        , {share} retained mass
                      </Trans>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </details>
      ))}
      {result.unavailable.length ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            {plural(result.unavailable.length, {
              one: '# unavailable mapping',
              other: '# unavailable mappings',
            })}
          </summary>
          <ul className="mt-1 list-disc pl-4">
            {result.unavailable.map((item, index) => (
              <li key={index}>
                {item.message} {item.detail}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
