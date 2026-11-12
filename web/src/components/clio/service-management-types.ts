import type { ServiceActionInput } from '@clio/core/v3';

export type ServiceAction = ServiceActionInput['action'];
export type ServiceActionFeedback = {
  action: ServiceAction;
  error?: boolean;
  text: string;
  /** The finished operation, whose steps, reuse notes and log stay viewable. */
  operationId?: string;
};
export type ServiceActionOptions = {
  /** Bypass every reuse check for this install (`install.from_scratch`). */
  fromScratch?: boolean;
};
