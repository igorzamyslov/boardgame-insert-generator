// Injected by Vite `define` from package.json (see vite.config.ts).
declare const __APP_VERSION__: string;
// Short git commit SHA of the build, or "unknown" (see build-id.config.ts). Display only.
declare const __BUILD_ID__: string;
// Set by the screenshot harness in shots mode only (src/app/shotsHold.ts): a promise per point
// that the app waits on there. Absent in every real run.
// eslint-disable-next-line no-var
declare var __shotsHold: Partial<Record<"export" | "search", Promise<void>>> | undefined;
