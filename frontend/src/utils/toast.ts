type ToastFn = (msg: string, type?: 'success' | 'error' | 'info' | 'warning', duration?: number) => void;
let _sink: ToastFn | null = null;

export function registerToastSink(fn: ToastFn) {
  _sink = fn;
}

export function showToast(msg: string, type: 'success' | 'error' | 'info' | 'warning' = 'info', duration?: number) {
  if (_sink) {
    _sink(msg, type, duration);
  } else {
    // Fallback: console if toast component not mounted
    console.warn(`[Toast ${type}] ${msg}`);
  }
}
