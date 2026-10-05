// Small lifecycle contract used by both render modes. It makes teardown
// explicit so switching generators never leaves listeners or GPU objects alive.
export function createLifecycle(factory) {
  let active = null;
  return {
    init(ctx) { if (active) active.dispose(); active = factory(ctx); return active; },
    update(dt) { if (active && active.update) active.update(dt); },
    dispose() { if (active) active.dispose(); active = null; },
    get active() { return active; },
  };
}
