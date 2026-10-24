import { flowRunSchema } from '@clio/core/v3';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { FlowDiagram } from '../../src/components/clio/flow-diagram';
import {
  flowMembers,
  flowVerdict,
  workflowSteps,
} from '../../src/components/clio/flow-run-presentation';
import { flowDiagrams } from '../../src/hooks/use-flow-presentation';
import { AppProviders } from '../../src/providers/app-providers';

// A workflow railroad with a step in each state the railroad colors, drawn in
// the stored theme so the theme review can read every state token.
const run = flowRunSchema.parse({
  flow: 'workflow',
  status: 'running',
  view: {
    kind: 'workflow',
    steps: [
      { id: 'collect', target: 'clio/standard', status: 'completed', handle: 't1' },
      {
        id: 'clean',
        target: 'clio/standard',
        after: ['collect'],
        status: 'completed',
        handle: 't2',
      },
      { id: 'fit', target: 'clio/standard', after: ['clean'], status: 'running', handle: 't3' },
      { id: 'plot', target: 'clio/standard', after: ['clean'], status: 'failed', handle: 't4' },
      { id: 'draft', target: 'reviewer', after: ['clean'], status: 'cancelled', handle: 't5' },
      { id: 'publish', target: 'self', after: ['fit', 'plot', 'draft'], status: 'pending' },
    ],
  },
});
const model = {
  steps: workflowSteps(run, 'clio/standard'),
  members: flowMembers(run, 'clio/standard'),
  verdict: flowVerdict(run),
};
const diagram = flowDiagrams(run, model, new Map(), 'clio/standard').diagram;

function Review() {
  return (
    <main className="min-h-dvh space-y-4 bg-background p-5 text-foreground">
      <h1 className="font-heading text-lg">Workflow railroad states</h1>
      <p className="text-sm text-muted-foreground">
        collect and clean done, fit running, plot failed, draft cancelled, publish waiting.
      </p>
      {diagram ? <FlowDiagram spec={diagram} /> : <p>No diagram</p>}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <AppProviders>
    <Review />
  </AppProviders>,
);
