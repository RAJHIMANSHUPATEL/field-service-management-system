// A simulated clock for replaying history. Installed before the app is imported, it replaces the
// global Date so every `new Date()` / `Date.now()` in the API, Prisma defaults and JWTs reads the
// simulated time. Each read advances it by 1 ms so rows keep a stable creation order.
const RealDate = Date;
let simulated: number | null = null;
const listeners: ((offsetMs: number) => void)[] = [];

function current() {
  if (simulated === null) {
    return RealDate.now();
  }
  simulated += 1;
  return simulated;
}

class SimulatedDate extends RealDate {
  constructor(...args: unknown[]) {
    if (args.length === 0) {
      super(current());
    } else {
      // @ts-expect-error forwarding the original Date constructor overloads
      super(...args);
    }
  }
  static override now() {
    return current();
  }
}

export function installClock() {
  globalThis.Date = SimulatedDate as unknown as DateConstructor;
}

export function realNow() {
  return RealDate.now();
}

export function simulatedNow() {
  return simulated ?? RealDate.now();
}

// Move the clock forward to `at` (never backwards); `null` returns to real time.
export function setClock(at: number | null) {
  simulated = at === null ? null : Math.max(at, simulated ?? at);
  const offset = simulated === null ? 0 : RealDate.now() - simulated;
  for (const listener of listeners) listener(offset);
}

export function onClockChange(listener: (offsetMs: number) => void) {
  listeners.push(listener);
}
