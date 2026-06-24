import type { SessionTask, UserQuestion } from '../wire/types.js';
import type { HttpTransport } from './transport.js';
import type {
  AnswerSessionQuestionInput,
  CreateScheduleInput,
  CreateScheduleResult,
  CreateSessionTaskInput,
  PatchSessionTaskInput,
  SessionQuestionsResult,
  SessionSchedulesResult,
  SessionTasksResult,
} from './session_interaction_types.js';

export * from './session_interaction_types.js';

type SessionInteractionTransport = Pick<
  HttpTransport,
  'del' | 'get' | 'post' | 'request'
>;

export function fetchSessionSchedules(
  client: SessionInteractionTransport,
  sessionId: string,
): Promise<SessionSchedulesResult> {
  return client.get(
    `/v1/sessions/${encodeURIComponent(sessionId)}/schedules`,
  );
}

export function createSessionSchedule(
  client: SessionInteractionTransport,
  sessionId: string,
  body: CreateScheduleInput,
): Promise<CreateScheduleResult> {
  const { prompt, ...rest } = body;
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/schedules`,
    { ...rest, question: prompt },
  );
}

export function removeSchedule(
  client: SessionInteractionTransport,
  scheduleId: string,
): Promise<void> {
  return client.del(`/v1/schedules/${encodeURIComponent(scheduleId)}`);
}

export function answerSessionUserQuestion(
  client: SessionInteractionTransport,
  sessionId: string,
  questionId: string,
  body: AnswerSessionQuestionInput,
): Promise<UserQuestion> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/answer`,
    body,
  );
}

export function cancelSessionUserQuestion(
  client: SessionInteractionTransport,
  sessionId: string,
  questionId: string,
): Promise<UserQuestion> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/questions/${encodeURIComponent(questionId)}/cancel`,
    {},
  );
}

export function fetchSessionQuestions(
  client: SessionInteractionTransport,
  sessionId: string,
  status?: UserQuestion['status'],
): Promise<SessionQuestionsResult> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return client.get(
    `/v1/sessions/${encodeURIComponent(sessionId)}/questions${qs}`,
  );
}

export function fetchSessionTasks(
  client: SessionInteractionTransport,
  sessionId: string,
): Promise<SessionTasksResult> {
  return client.get(
    `/v1/sessions/${encodeURIComponent(sessionId)}/tasks`,
  );
}

export function createTask(
  client: SessionInteractionTransport,
  sessionId: string,
  body: CreateSessionTaskInput,
): Promise<SessionTask> {
  return client.post(
    `/v1/sessions/${encodeURIComponent(sessionId)}/tasks`,
    body,
  );
}

export function patchTask(
  client: SessionInteractionTransport,
  taskId: string,
  patch: PatchSessionTaskInput,
): Promise<SessionTask> {
  return client.request(
    `/v1/tasks/${encodeURIComponent(taskId)}`,
    'PATCH',
    patch,
  );
}

export function removeTask(
  client: SessionInteractionTransport,
  taskId: string,
): Promise<void> {
  return client.request(
    `/v1/tasks/${encodeURIComponent(taskId)}`,
    'DELETE',
    undefined,
  );
}
