import { fireEvent } from '@testing-library/react';

/**
 * Open every finished run that folded into its counted row ("Called 3 tools"),
 * so a test can read the calls inside.
 */
export function openActivityRuns(root: ParentNode = document) {
  root
    .querySelectorAll<HTMLElement>(
      '[data-run-summary] [data-slot="activity-disclosure"][aria-expanded="false"]',
    )
    .forEach((button) => fireEvent.click(button));
}
