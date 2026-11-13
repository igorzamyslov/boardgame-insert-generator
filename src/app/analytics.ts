// src/app/analytics.ts
// Anonymous counts of visits and a few events, sent to GoatCounter (cookieless, no consent banner).
// Off unless the build was given a site code (`VITE_GOATCOUNTER_CODE`), so dev, tests, CI and forks
// send nothing. Also off on localhost and for a visitor whose browser says Do Not Track or Global
// Privacy Control. We send the beacon ourselves, a plain image request to the count endpoint, rather
// than load GoatCounter's script: no third-party code runs here, and this is ~60 lines against its
// 300. DESIGN §2 Hosting and its decision log row 2026-11-13 allow this one request, from this file.
//
// What leaves, and nothing else: the page path ("/") or the event's name, the page's referrer
// (page views only) and the screen size (page views only). Never a project, a name, a size or
// anything typed. GoatCounter itself keeps no IP address or cookie.

// Every name is a fixed word. Nothing a person typed or chose in a field ever becomes part of one.
export const COUNT_EVENTS = [
  "start-example",
  "add-cards",
  "add-bulk",
  "add-tiles",
  "add-minis",
  "add-custom",
  "plan",
  "plan-nofit",
  "view-3d",
  "settings-open",
  "build-failed",
  "file-open-failed",
  "download-3mf",
  "download-zip",
  "download-stl",
  "guide",
  "file-save",
  "file-open",
] as const;
export type CountEvent = (typeof COUNT_EVENTS)[number];

/** What the counter reads from its surroundings, so a test can give it others. */
export interface CountEnv {
  /** The GoatCounter site code, or undefined. */
  code: string | undefined;
  hostname: string;
  protocol: string;
  doNotTrack: boolean;
  globalPrivacyControl: boolean;
  /** The page's referrer and screen, for the page view. */
  referrer: string;
  screen: string;
  /** Sends one GET request, and nothing is read back. */
  send: (url: string) => void;
}

export interface Counter {
  /** True when counting happens at all in this browser: the page may say so. */
  enabled: boolean;
  /** One event. */
  count: (event: CountEvent) => void;
  /** The visit itself, once per page load. */
  pageview: () => void;
}

const CODE = /^[a-z0-9][a-z0-9-]*$/i;

function isLocal(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "[::1]" ||
    hostname.endsWith(".localhost")
  );
}

export function createCounter(env: CountEnv): Counter {
  const code = env.code?.trim() ?? "";
  const enabled =
    CODE.test(code) &&
    !env.doNotTrack &&
    !env.globalPrivacyControl &&
    !isLocal(env.hostname) &&
    (env.protocol === "https:" || env.protocol === "http:");
  const endpoint = `https://${code}.goatcounter.com/count`;
  const beacon = (fields: Record<string, string>): void => {
    if (enabled) {
      env.send(`${endpoint}?${new URLSearchParams(fields).toString()}`);
    }
  };
  return {
    enabled,
    count: (event) => beacon({ p: event, e: "true", t: event }),
    pageview: () => {
      const fields: Record<string, string> = { p: "/" };
      if (env.referrer !== "") {
        fields.r = env.referrer;
      }
      if (env.screen !== "") {
        fields.s = env.screen;
      }
      beacon(fields);
    },
  };
}

/** The browser's own surroundings. */
function browserEnv(): CountEnv {
  const gpc = (navigator as { globalPrivacyControl?: boolean }).globalPrivacyControl === true;
  const referrer = document.referrer.startsWith(window.location.origin) ? "" : document.referrer;
  return {
    code: import.meta.env.VITE_GOATCOUNTER_CODE as string | undefined,
    hostname: window.location.hostname,
    protocol: window.location.protocol,
    doNotTrack: navigator.doNotTrack === "1",
    globalPrivacyControl: gpc,
    referrer,
    screen: `${window.screen.width},${window.screen.height},${window.devicePixelRatio}`,
    send: (url) => {
      const img = new Image();
      img.referrerPolicy = "no-referrer";
      img.src = url;
    },
  };
}

let shared: Counter | null = null;
function current(): Counter {
  shared ??= createCounter(browserEnv());
  return shared;
}

/** Counts one event. Never throws, never waits. */
export function count(event: CountEvent): void {
  try {
    current().count(event);
  } catch {
    // counting is never worth a broken app
  }
}

/** Counts the visit. */
export function countPageview(): void {
  try {
    current().pageview();
  } catch {
    // as above
  }
}

/** Whether this browser is counted: the download dialog says so only then. */
export function countingOn(): boolean {
  try {
    return current().enabled;
  } catch {
    return false;
  }
}
