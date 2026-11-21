export const FOCUS_MINUTES = Object.freeze([5, 10, 25, 45]);
export const DEFAULT_FOCUS_MINUTES = 25;
export const BREAK_MINUTES = Object.freeze([5, 10]);

export function transitionTimer(session, {type, minutes}, now) {
  if (session?.status === 'running' && now >= session.endsAt) {
    session = {phase:session.phase, durationMs:session.durationMs, status:'complete'};
  }
  if (type === 'start-test' && !session) {
    const durationMs = 5000;
    return {phase:'test', status:'running', durationMs, endsAt:now + durationMs};
  }
  const canStartFocus = type === 'start-focus' && !session && FOCUS_MINUTES.includes(minutes);
  const canStartBreak = type === 'start-break' && session?.phase === 'focus' &&
    session.status === 'complete' && BREAK_MINUTES.includes(minutes);
  if (canStartFocus || canStartBreak) {
    const durationMs = minutes * 60000;
    return {phase:canStartFocus ? 'focus' : 'break', status:'running', durationMs, endsAt:now + durationMs};
  }
  if (!session) return null;
  const {phase, status, durationMs} = session;
  if (type === 'reset' || (type === 'skip-break' && phase === 'focus' && status === 'complete')) return null;
  if (type === 'pause' && status === 'running') {
    return {phase, durationMs, status:'paused', remainingMs:Math.min(durationMs, session.endsAt - now)};
  }
  if (type === 'resume' && status === 'paused') {
    return {phase, durationMs, status:'running', endsAt:now + session.remainingMs};
  }
  return session;
}

export function getTimerDisplay(session, now) {
  if (!session) return {phase:'focus', status:'idle', remainingMs:0, durationMs:0};
  const {phase, status, durationMs} = session;
  const remainingMs = status === 'running' ? Math.max(0, Math.min(durationMs, session.endsAt - now))
    : status === 'paused' ? session.remainingMs : 0;
  return {phase, status, durationMs, remainingMs};
}

function validSession(value) {
  if (!value || !['focus', 'break'].includes(value.phase)) return false;
  const presets = value.phase === 'focus' ? FOCUS_MINUTES : BREAK_MINUTES;
  if (!presets.includes(value.durationMs / 60000) || !Number.isInteger(value.durationMs)) return false;
  if (value.status === 'running') return Number.isSafeInteger(value.endsAt) && value.endsAt >= 0;
  if (value.status === 'paused') {
    return Number.isSafeInteger(value.remainingMs) && value.remainingMs > 0 && value.remainingMs <= value.durationMs;
  }
  return value.status === 'complete';
}

export function createPomodoroStore(storage, ownerKey) {
  const prefix = `cardboard.pomodoro.v1:${encodeURIComponent(ownerKey)}:`;
  const memory = new Map();
  const keyFor = cardId => prefix + encodeURIComponent(cardId);
  const write = (cardId, session) => {
    memory.set(cardId, session);
    try { storage?.setItem(keyFor(cardId), JSON.stringify(session)); } catch {}
  };
  return {
    read(cardId) {
      if (memory.has(cardId)) return memory.get(cardId);
      try {
        const value = JSON.parse(storage?.getItem(keyFor(cardId)) ?? 'null');
        return validSession(value) ? value : null;
      } catch { return null; }
    },
    write,
    remove(cardId) {
      write(cardId, null);
      try { storage?.removeItem?.(keyFor(cardId)); } catch {}
    },
    clear() {
      for (const cardId of memory.keys()) write(cardId, null);
      try {
        const keys = Array.from({length:storage?.length ?? 0}, (_, index) => storage.key(index));
        for (const key of keys) {
          if (key?.startsWith(prefix)) storage.removeItem(key);
        }
      } catch {}
    },
  };
}
