// localStorage-backed conversation history, exposed as an external store so
// components can read it with useSyncExternalStore (SSR-safe, no
// setState-in-effect hydration dance).

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type QuizRecord = {
  score: number;
  total: number;
  takenAt: number;
};

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  quizzes: QuizRecord[];
  createdAt: number;
  updatedAt: number;
};

const STORAGE_KEY = 'recalldeck_history';
const EMPTY: Conversation[] = [];

let cache: Conversation[] = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getHistorySnapshot(): Conversation[] {
  if (!loaded && typeof window !== 'undefined') {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? (JSON.parse(raw) as Conversation[]) : [];
      cache = Array.isArray(parsed) ? parsed : [];
    } catch {
      cache = [];
    }
    loaded = true;
  }
  return cache;
}

export function getHistoryServerSnapshot(): Conversation[] {
  return EMPTY;
}

export function mutateHistory(updater: (prev: Conversation[]) => Conversation[]) {
  cache = updater(getHistorySnapshot());
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or unavailable — history stays in memory for the session.
  }
  emit();
}

export function newConversationId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function conversationTitle(firstMessage: string): string {
  const firstLine = firstMessage.trim().split('\n')[0];
  return firstLine.length > 80 ? `${firstLine.slice(0, 80)}…` : firstLine;
}

/** Insert or replace a conversation, keeping the list sorted by recency. */
export function upsertConversation(conversation: Conversation) {
  mutateHistory((prev) => [
    conversation,
    ...prev.filter((c) => c.id !== conversation.id),
  ]);
}

export function updateConversation(
  id: string,
  patch: (conv: Conversation) => Conversation,
) {
  mutateHistory((prev) => {
    const existing = prev.find((c) => c.id === id);
    if (!existing) return prev;
    const updated = patch(existing);
    return [updated, ...prev.filter((c) => c.id !== id)];
  });
}

export function deleteConversation(id: string) {
  mutateHistory((prev) => prev.filter((c) => c.id !== id));
}
