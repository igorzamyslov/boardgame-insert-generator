// Injected by Vite `define` from package.json (see vite.config.ts).
declare const __APP_VERSION__: string;
// Short git commit SHA of the build, or "unknown" (see build-id.config.ts). Display only.
declare const __BUILD_ID__: string;
// Set by the screenshot harness in shots mode only (src/app/shotsHold.ts): a promise per point
// that the app waits on there. Absent in every real run.
// eslint-disable-next-line no-var
declare var __shotsHold: Partial<Record<"export" | "search", Promise<void>>> | undefined;
// Set by the 3D scene in shots mode only (src/viewer/shotsScene.ts): what the screenshot harness may
// read of it. Absent in every real run.
// eslint-disable-next-line no-var
declare var __shotsScene: import("./viewer/shotsScene").ShotsScene | undefined;

// The feedback form (src/feedback/config.ts): set from the repository's variables when the site
// is built; both are absent in dev and in forks, and the form then opens GitHub instead.
interface ImportMetaEnv {
  readonly VITE_FEEDBACK_URL?: string;
  readonly VITE_TURNSTILE_SITEKEY?: string;
}
