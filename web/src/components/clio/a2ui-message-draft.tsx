import { createComponentImplementation } from '@a2ui/react/v0_9';
import { CommonSchemas } from '@a2ui/web_core/v0_9';
import { CopyIcon, MailIcon, PenLineIcon } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { copyText } from '@/lib/clipboard';

const versionSchema = z
  .object({
    label: z.string().min(1),
    body: z.string(),
    subject: z.string().optional(),
    to: z.array(z.string()).optional(),
    cc: z.array(z.string()).optional(),
  })
  .strict();

// oxlint-disable-next-line react/only-export-components
export const messageDraftSchema = z
  .object({
    kind: z.enum(['email', 'slack', 'text']),
    versions: z.array(versionSchema).min(1).max(8),
    title: z.string().optional(),
    accessibility: CommonSchemas.AccessibilityAttributes.optional(),
    weight: z.number().optional(),
  })
  .strict();

type MessageDraftProps = z.infer<typeof messageDraftSchema>;
type Version = MessageDraftProps['versions'][number];
type EditableDraft = {
  label: string;
  to: string;
  cc: string;
  subject: string;
  body: string;
};

function editableVersion(version: Version): EditableDraft {
  return {
    label: version.label,
    to: (version.to ?? []).join(', '),
    cc: (version.cc ?? []).join(', '),
    subject: version.subject ?? '',
    body: version.body,
  };
}

function recipientList(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

function currentVersion(draft: EditableDraft): Version {
  return {
    label: draft.label,
    to: recipientList(draft.to),
    cc: recipientList(draft.cc),
    subject: draft.subject,
    body: draft.body,
  };
}

function draftText(version: Version, kind: MessageDraftProps['kind']): string {
  if (kind !== 'email') return version.body;
  const headers = [
    ...(version.to?.length ? [`To: ${version.to.join(', ')}`] : []),
    ...(version.cc?.length ? [`Cc: ${version.cc.join(', ')}`] : []),
    ...(version.subject ? [`Subject: ${version.subject}`] : []),
  ];
  return headers.length ? `${headers.join('\n')}\n\n${version.body}` : version.body;
}

function mailtoHref(version: Version): string {
  const query = new URLSearchParams();
  if (version.cc?.length) query.set('cc', version.cc.join(','));
  if (version.subject) query.set('subject', version.subject);
  query.set('body', version.body);
  return `mailto:${(version.to ?? []).map(encodeURIComponent).join(',')}?${query.toString()}`;
}

/** Show one labelled draft at a time, preserving every alternative. */
export function ClioMessageDraft({ kind, title, versions }: MessageDraftProps) {
  const [active, setActive] = useState('0');
  const sourceKey = JSON.stringify({ kind, versions });
  const [editing, setEditing] = useState(() => ({ sourceKey, drafts: versions.map(editableVersion) }));
  if (editing.sourceKey !== sourceKey) {
    setEditing({ sourceKey, drafts: versions.map(editableVersion) });
  }
  const drafts = editing.sourceKey === sourceKey ? editing.drafts : versions.map(editableVersion);
  const index = Math.min(Number(active), drafts.length - 1);
  const draft = drafts[index]!;
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    const measure = () => {
      const maxHeight = Math.min(640, window.innerHeight * 0.7);
      body.style.height = 'auto';
      body.style.height = `${Math.min(body.scrollHeight, maxHeight)}px`;
      body.style.overflowY = body.scrollHeight > maxHeight ? 'auto' : 'hidden';
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [active, draft.body]);
  const version = currentVersion(draft);
  const text = draftText(version, kind);
  const update = (field: keyof Pick<EditableDraft, 'to' | 'cc' | 'subject' | 'body'>, value: string) => {
    setEditing((current) => ({
      sourceKey,
      drafts: current.drafts.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  };
  const copy = async () => {
    try {
      await copyText(text);
      toast.success('Draft copied');
    } catch (error) {
      toast.error('Could not copy the draft', {
        description: error instanceof Error ? error.message : String(error),
      });
    }
  };
  return (
    <section
      aria-label={title ?? `${kind} draft`}
      className="overflow-hidden rounded-xl border border-border/70 bg-card/40"
      data-slot="a2ui-message-draft"
    >
      {title ? <h3 className="px-4 pt-4 text-sm font-semibold">{title}</h3> : null}
      {versions.length > 1 ? (
        <Tabs onValueChange={setActive} value={active}>
          <TabsList
            aria-label="Draft versions"
            className="max-w-full flex-wrap justify-start px-3 pt-3"
            variant="line"
          >
            {versions.map((option, index) => (
              <TabsTrigger key={`${option.label}-${index}`} value={String(index)}>
                {option.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      ) : null}
      {kind === 'email' ? (
        <div className="space-y-1 border-y border-border/60 px-4 py-2 text-sm">
          {([['To', 'to'], ['Cc', 'cc'], ['Subject', 'subject']] as const).map(([label, field]) => (
            <label className="flex min-w-0 items-center gap-2" key={field}>
              <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
              <input
                aria-label={`${label} for ${draft.label} draft`}
                className="min-w-0 flex-1 rounded px-1 py-1.5 text-foreground outline-none hover:bg-muted/30 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-primary/60"
                onChange={(event) => update(field, event.target.value)}
                placeholder={label === 'Cc' ? 'Add Cc' : label === 'To' ? 'Add recipient' : 'Add subject'}
                type="text"
                value={draft[field]}
              />
            </label>
          ))}
        </div>
      ) : null}
      <div className="px-4 py-4">
        <textarea
          aria-label={`Body for ${draft.label} draft`}
          className="min-h-24 w-full resize-none rounded-md bg-transparent p-1 text-sm leading-relaxed outline-none hover:bg-muted/20 focus-visible:bg-muted/30 focus-visible:ring-2 focus-visible:ring-primary/60"
          onChange={(event) => update('body', event.target.value)}
          ref={bodyRef}
          value={draft.body}
        />
      </div>
      <div className="flex flex-wrap justify-end gap-2 px-4 pb-4">
        <Button onClick={() => void copy()} size="sm" type="button" variant="secondary">
          <CopyIcon aria-hidden="true" />
          Copy
        </Button>
        {kind === 'email' ? (
          <Button asChild size="sm" variant="secondary">
            <a href={mailtoHref(version)}>
              <MailIcon aria-hidden="true" />
              Open in Mail
            </a>
          </Button>
        ) : null}
        <Button
          onClick={() =>
            window.dispatchEvent(new CustomEvent('clio:use-message-draft', { detail: { text } }))
          }
          size="sm"
          type="button"
        >
          <PenLineIcon aria-hidden="true" />
          Use this version
        </Button>
      </div>
    </section>
  );
}

// oxlint-disable-next-line react/only-export-components
export const ClioMessageDraftCatalogComponent = createComponentImplementation(
  { name: 'clio.message-draft.v1', schema: messageDraftSchema },
  ({ props }) => <ClioMessageDraft {...props} />,
);
