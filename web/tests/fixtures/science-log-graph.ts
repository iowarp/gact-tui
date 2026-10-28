import { scienceLogSchema, type ScienceStudy } from '@clio/core/v3';

// Test data for relationship and browser component review. Not an agent run.
const entry = (
  id: string,
  branch: string,
  type: string,
  fields: Record<string, unknown>,
  links: { to: string; relation: string }[] = [],
  status = '',
) => ({
  id,
  branch,
  session: branch,
  type,
  fields,
  links,
  status,
  created_at: `2026-10-27T10:00:00Z`,
  invocation: `call-${id}`,
});

export const studyGraphFixture = scienceLogSchema.parse({
  session_id: 'root',
  in_study: true,
  study: 'q',
  root_session_id: 'root',
  branches: [
    { session_id: 'root', title: 'Study', relation: 'root' },
    { session_id: 'trial', title: 'Original trial', relation: 'step', parent_session_id: 'root' },
    {
      session_id: 'fork',
      title: 'Alternative trial',
      relation: 'fork',
      fork_of_session_id: 'trial',
    },
  ],
  entries: [
    entry('q', 'root', 'question', { statement: 'Which law predicts the response?' }),
    entry(
      'h',
      'trial',
      'hypothesis',
      { claim: 'Linear temperature law' },
      [{ relation: 'answers', to: 'q' }],
      'supported',
    ),
    entry(
      'h2',
      'fork',
      'hypothesis',
      { claim: 'Square-root temperature law' },
      [{ relation: 'answers', to: 'q' }],
      'open',
    ),
    entry('o', 'trial', 'observation', { result: 'Repeated readings' }),
    entry(
      'e',
      'fork',
      'evidence',
      { interpretation: 'The alternative fit has smaller residuals' },
      [{ relation: 'interprets', to: 'o' }],
    ),
    entry(
      'x',
      'root',
      'conflict',
      { description: 'Functional form remains unresolved' },
      [
        { relation: 'between', to: 'h' },
        { relation: 'between', to: 'h2' },
      ],
      'open',
    ),
    entry(
      'c',
      'root',
      'conclusion',
      { claims: [{ text: 'Additional readings are required', cites: ['e', 'x'] }] },
      [{ relation: 'cites', to: 'e' }],
    ),
  ],
}) as ScienceStudy;
