import { describe, expect, it } from 'vitest';
import { ReleaseFeedRateLimited } from '@/lib/github-releases';
import { agentCheckIssue, desktopCheckIssue } from './version-check-issue';

describe('a rate-limited release feed', () => {
  const limited = new ReleaseFeedRateLimited(Date.now() + 10 * 60 * 1000);

  it('says the limit is used up, and until when, instead of "could not be reached"', () => {
    const issue = agentCheckIssue(undefined, true, limited);
    expect(issue?.state).toBe('unavailable');
    expect(issue?.text).toBe(`Could not check for updates: ${limited.message}`);
    expect(issue?.text).toMatch(/until \d/);
  });

  it('reads the same in the desktop row', () => {
    expect(
      desktopCheckIssue({ status: 'error', reason: 'rate_limited', message: limited.message }),
    ).toEqual({ state: 'unavailable', text: `Could not check for updates: ${limited.message}` });
  });

  it('leaves other failed requests as unreachable', () => {
    expect(agentCheckIssue(undefined, true, new Error('HTTP 500'))?.text).toMatch(
      /could not be reached/,
    );
  });
});
