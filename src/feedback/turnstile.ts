// src/feedback/turnstile.ts
// Cloudflare Turnstile, loaded only when the feedback dialog opens and a site key is set.

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      theme: "auto";
      appearance: "interaction-only";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  reset(id?: string): void;
  remove(id?: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi> | null = null;

/** Adds the script once and resolves with its API; rejects when it can't be loaded. */
export function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile !== undefined) {
    return Promise.resolve(window.turnstile);
  }
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT;
    s.async = true;
    s.onload = () => {
      if (window.turnstile !== undefined) {
        resolve(window.turnstile);
      } else {
        loading = null;
        reject(new Error("turnstile missing"));
      }
    };
    s.onerror = () => {
      loading = null;
      s.remove();
      reject(new Error("turnstile blocked"));
    };
    document.head.appendChild(s);
  });
  return loading;
}
