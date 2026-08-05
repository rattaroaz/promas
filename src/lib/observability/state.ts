import { getActiveSpanCount } from "./tracing";
import type { AppInternalState } from "./types";

let currentScreen = "main";
let lastScreenChangeAt: number | null = null;
let lastApiError: string | null = null;
let lastApiErrorAt: number | null = null;
let lastUpdateOutcome: string | null = null;
let lastUpdateAt: number | null = null;
const sessionStartedAt = Date.now();

type Listener = () => void;
const listeners = new Set<Listener>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribeAppState(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setCurrentScreen(screen: string): void {
  if (screen === currentScreen) return;
  currentScreen = screen;
  lastScreenChangeAt = Date.now();
  emit();
}

export function noteApiError(message: string): void {
  lastApiError = message;
  lastApiErrorAt = Date.now();
  emit();
}

export function noteUpdateOutcome(outcome: string): void {
  lastUpdateOutcome = outcome;
  lastUpdateAt = Date.now();
  emit();
}

export function getAppState(): AppInternalState {
  return {
    sessionStartedAt,
    currentScreen,
    lastScreenChangeAt,
    lastApiError,
    lastApiErrorAt,
    lastUpdateOutcome,
    lastUpdateAt,
    pendingSpans: getActiveSpanCount(),
  };
}

export function resetAppStateForTests(): void {
  currentScreen = "main";
  lastScreenChangeAt = null;
  lastApiError = null;
  lastApiErrorAt = null;
  lastUpdateOutcome = null;
  lastUpdateAt = null;
  listeners.clear();
}
