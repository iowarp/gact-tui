import { describe, expect, it } from 'vitest';
import { ReleaseFeedRateLimited } from '@/lib/github-releases';
import { agentCheckIssue, desktopCheckIssue, versionCheckIssueDetail } from './version-check-issue';

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

describe("this app's own release is not published", () => {
  const message =
    "This app's release v0.9.6-beta.0 is not published, so the runtime (0.9.5.1) cannot be restored to match it.";

  it('reads as a check that could not finish, not as a release being published', () => {
    const issue = desktopCheckIssue({ status: 'error', reason: 'release_not_published', message });
    expect(issue).toEqual({
      state: 'unavailable',
      text: `Could not check for updates: t${message.slice(1)}`,
    });
    expect(issue?.text).not.toMatch(/being published/);
  });

  it('gives the bare reason for a row already titled "Couldn\'t check for updates"', () => {
    expect(versionCheckIssueDetail(`Could not check for updates: t${message.slice(1)}`)).toBe(
      message,
    );
  });
});
