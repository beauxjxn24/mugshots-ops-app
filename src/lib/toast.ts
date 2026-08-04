// Lightweight, app-wide toast. Any code can call toast(...) to pop an
// unmistakable banner on screen; the <Toaster/> mounted in the app shell
// listens for the event and renders it. No provider/context wiring needed.
export type ToastKind = 'success' | 'error' | 'info'

export function toast(message: string, kind: ToastKind = 'success'): void {
  try {
    window.dispatchEvent(new CustomEvent('mugops:toast', { detail: { message, kind } }))
  } catch {
    /* no window (SSR) — nothing to show */
  }
}
