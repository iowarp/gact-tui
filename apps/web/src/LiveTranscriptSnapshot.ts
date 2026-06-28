/**
 * Point-in-time transcript snapshot (messages + pending permission/question)
 * fetched in parallel, plus apply helpers. Exports
 * {@link fetchLiveTranscriptSnapshot} and the replace/merge/clear setters.
 */
import type { Client, Message, PermissionRequest, UserQuestion } from '@clio/core';

export interface LiveTranscriptSnapshot {
  messages?: Message[];
  pendingPermission?: PermissionRequest | null;
  pendingQuestion?: UserQuestion | null;
}

export interface LiveTranscriptSnapshotSetters {
  setMessages: (messages: Message[]) => void;
  setPendingPermission: (permission: PermissionRequest | null) => void;
  setPendingQuestion: (question: UserQuestion | null) => void;
}

export async function fetchLiveTranscriptSnapshot(
  client: Client,
  sessionId: string,
): Promise<LiveTranscriptSnapshot> {
  const [messagesResult, permissionsResult, questionsResult] = await Promise.allSettled([
    client.messages(sessionId),
    client.permissions(sessionId),
    client.sessionQuestions(sessionId, 'pending'),
  ]);
  return {
    ...(messagesResult.status === 'fulfilled'
      ? { messages: messagesResult.value.messages }
      : {}),
    ...(permissionsResult.status === 'fulfilled'
      ? { pendingPermission: permissionsResult.value.permissions[0] ?? null }
      : {}),
    ...(questionsResult.status === 'fulfilled'
      ? { pendingQuestion: questionsResult.value.questions[0] ?? null }
      : {}),
  };
}

export function replaceLiveTranscriptSnapshot(
  snapshot: LiveTranscriptSnapshot,
  setters: LiveTranscriptSnapshotSetters,
): void {
  setters.setMessages(snapshot.messages ?? []);
  setters.setPendingPermission(snapshot.pendingPermission ?? null);
  setters.setPendingQuestion(snapshot.pendingQuestion ?? null);
}

export function mergeLiveTranscriptSnapshot(
  snapshot: LiveTranscriptSnapshot,
  setters: LiveTranscriptSnapshotSetters,
): void {
  if (snapshot.messages) setters.setMessages(snapshot.messages);
  if ('pendingPermission' in snapshot) {
    setters.setPendingPermission(snapshot.pendingPermission ?? null);
  }
  if ('pendingQuestion' in snapshot) {
    setters.setPendingQuestion(snapshot.pendingQuestion ?? null);
  }
}

export function clearLiveTranscriptSnapshot(setters: LiveTranscriptSnapshotSetters): void {
  replaceLiveTranscriptSnapshot({}, setters);
}
