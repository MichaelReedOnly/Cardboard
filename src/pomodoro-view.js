import {BREAK_MINUTES, FOCUS_MINUTES} from './pomodoro.js';

export function createPomodoroView({defaultMinutes, onAction, onToggleChime}) {
  const element = document.createElement('section');
  element.className = 'pomodoro-timer';
  element.setAttribute('aria-label', 'Pomodoro timer');
  const phaseLabel = document.createElement('div');
  phaseLabel.setAttribute('role', 'status');
  const time = document.createElement('div');
  time.className = 'pomodoro-time';
  time.setAttribute('role', 'timer');
  const progress = document.createElement('progress');
  progress.max = 1;
  progress.setAttribute('aria-label', 'Session progress');
  const actions = document.createElement('div');
  actions.className = 'pomodoro-actions';
  const selection = document.createElement('select');
  selection.setAttribute('aria-label', 'Focus duration');
  for (const minutes of FOCUS_MINUTES) selection.add(new Option(`${minutes} min`, minutes));
  selection.value = defaultMinutes;

  function control(label, onClick, primary = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = primary ? 'primary' : 'secondary';
    button.textContent = label;
    button.onclick = onClick;
    return button;
  }
  const action = (label, type, primary, minutes) => control(label, () => onAction({type, minutes}), primary);
  const chime = control('Chime', onToggleChime);
  chime.className = 'pomodoro-chime';
  element.append(phaseLabel, time, progress, actions, chime);
  let previousPhase, previousStatus;
  let display;

  function update(nextDisplay, chimeEnabled) {
    display = nextDisplay;
    const {phase, status, remainingMs, durationMs} = display;
    const label = phase === 'break' ? 'Break' : phase === 'test' ? 'Timer test' : 'Focus';
    const testComplete = phase === 'test' && status === 'complete';
    const idle = status === 'idle' || testComplete;
    const seconds = idle ? Number(selection.value) * 60 : Math.ceil(remainingMs / 1000);
    const clock = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
    if (time.textContent !== clock) time.textContent = clock;
    progress.value = !idle && durationMs ? 1 - remainingMs / durationMs : 0;
    chime.setAttribute('aria-pressed', String(chimeEnabled));
    if (previousPhase === phase && previousStatus === status) return;
    previousPhase = phase;
    previousStatus = status;
    element.dataset.phase = idle ? 'focus' : phase;
    const restoreFocus = actions.contains(document.activeElement);
    phaseLabel.textContent = testComplete ? 'Test complete' : status === 'complete' ? `${label} complete`
      : status === 'paused' ? `${label} paused` : label;
    if (idle) {
      actions.replaceChildren(selection, control('Start focus', () => {
        onAction({type:'start-focus', minutes:Number(selection.value)});
      }, true), action('Test timer', 'start-test'));
    } else if (phase === 'test') {
      actions.replaceChildren(action('Cancel test', 'reset', true));
    } else if (status === 'complete' && phase === 'focus') {
      actions.replaceChildren(
        ...BREAK_MINUTES.map((minutes, index) => action(`${minutes} min break`, 'start-break', index === 0, minutes)),
        action('Skip', 'skip-break'),
      );
    } else if (status === 'complete') {
      actions.replaceChildren(action('New focus session', 'reset', true));
    } else {
      const paused = status === 'paused';
      actions.replaceChildren(action(paused ? 'Resume' : 'Pause', paused ? 'resume' : 'pause', true), action('Reset', 'reset'));
    }
    if (restoreFocus) actions.querySelector('.primary')?.focus();
  }
  selection.onchange = () => update(display, chime.getAttribute('aria-pressed') === 'true');
  return {element, update};
}

export function playPomodoroChime(context) {
  if (context?.state !== 'running') return;
  const now = context.currentTime;
  const toneLength = 0.35;
  const gap = 0.5;
  for (let index = 0; index < 5; index++) {
    const start = now + index * (toneLength + gap);
    const end = start + toneLength;
    const note = context.createOscillator();
    const volume = context.createGain();
    note.frequency.value = 660;
    volume.gain.setValueAtTime(0.12, start);
    volume.gain.exponentialRampToValueAtTime(0.001, end);
    note.connect(volume).connect(context.destination);
    note.start(start);
    note.stop(end);
  }
}
