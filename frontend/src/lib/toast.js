// Minimal toast store (no extra dependency) - a module-level pub/sub that
// <Toaster/> (rendered once in Layout) subscribes to. Replaces alert()/silent
// success across the app with consistent, dismissible feedback.
let toasts = [];
let nextId = 1;
const listeners = new Set();

function emit() {
  listeners.forEach((l) => l([...toasts]));
}

function push(variant, message) {
  const id = nextId++;
  toasts = [...toasts, { id, variant, message }];
  emit();
  setTimeout(() => dismiss(id), 4000);
}

function dismiss(id) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function subscribeToasts(listener) {
  listeners.add(listener);
  listener([...toasts]);
  return () => listeners.delete(listener);
}

export const toast = {
  success: (message) => push('success', message),
  error: (message) => push('error', message),
  dismiss,
};
