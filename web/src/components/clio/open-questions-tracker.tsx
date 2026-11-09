import type { PendingInteraction } from '@clio/core/v3';
import { Popover } from '@base-ui/react/popover';
import { MessageCircleQuestionIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useOverlayContainer } from '@/components/ui/overlay-container';
import { useQuestionAnswer } from './question-answer-context';
import { openHumanQuestions } from '@/lib/inline-question';
import { OpenQuestionList } from './open-question-list';
import { TRANSCRIPT_CONTROL_LANE_PX } from './transcript-inline-states';

const CHIP_HEIGHT_PX = 28;

/**
 * The open-questions chip, at the right of the transcript's control lane above
 * the composer, so it never sits over transcript text.
 */
export function OpenQuestionsTracker({
  interactions,
  bottomInset,
}: {
  interactions: readonly PendingInteraction[];
  bottomInset: number;
}) {
  const answer = useQuestionAnswer();
  const container = useOverlayContainer();
  const [open, setOpen] = useState(false);
  const focusDestination = useRef(false);
  const questions = openHumanQuestions(interactions);
  if (!questions.length || !answer?.openQuestion) return null;
  return (
    <aside
      aria-label="Open questions tracker"
      className="pointer-events-auto absolute right-3 z-30"
      style={{ bottom: bottomInset + (TRANSCRIPT_CONTROL_LANE_PX - CHIP_HEIGHT_PX) / 2 }}
    >
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          if (next) focusDestination.current = false;
          setOpen(next);
        }}
      >
        <Popover.Trigger
          openOnHover
          delay={180}
          closeDelay={200}
          render={<Button size="sm" variant="outline" className="rounded-full bg-background" />}
          aria-label={`${questions.length} open question${questions.length === 1 ? '' : 's'}`}
        >
          <MessageCircleQuestionIcon aria-hidden="true" />
          {questions.length} {questions.length === 1 ? 'question' : 'questions'}
        </Popover.Trigger>
        <Popover.Portal container={container}>
          <Popover.Positioner
            side="top"
            align="end"
            sideOffset={8}
            collisionPadding={12}
            className="z-50"
          >
            <Popover.Popup
              aria-label="Open questions"
              finalFocus={() => !focusDestination.current}
              className="max-h-[min(24rem,var(--available-height))] w-96 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-lg bg-popover p-3 text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-none"
            >
              <Popover.Title className="mb-2 text-sm font-medium">Open questions</Popover.Title>
              <OpenQuestionList
                questions={questions}
                onNavigate={() => {
                  focusDestination.current = true;
                  setOpen(false);
                }}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </aside>
  );
}
