// src/feedback/FeedbackDialog.tsx
// "Send feedback": a dialog on the kit's Dialog, opened from the project menu. With a Worker set
// it posts there (Turnstile checks the sender); without one Send opens GitHub's new-issue page
// with the same words filled in.
import { useEffect, useId, useRef, useState } from "preact/hooks";
import { Button, ChoiceChips, CloseButton, Dialog, Icon, Notice, Segmented } from "../kit";
import {
  FEEDBACK_KINDS,
  KIND_LABELS,
  MESSAGE_LIMIT,
  buildPayload,
  fallbackUrl,
  hasWorker,
  sendFeedback,
} from "./feedback";
import type { FeedbackConfig, FeedbackDraft, FeedbackKind, SendResult } from "./feedback";
import { loadTurnstile } from "./turnstile";
import type { TurnstileApi } from "./turnstile";
import "./feedback.css";

export interface FeedbackDialogProps {
  config: FeedbackConfig;
  appVersion: string;
  userAgent: string;
  /** The insert's file as text; read only when "Attach my insert design" is on. */
  getProject: () => string;
  onClose: () => void;
  titleId?: string;
  /** Test seams: the network, the Turnstile script and the new tab. */
  send?: (url: string, payload: ReturnType<typeof buildPayload>) => Promise<SendResult>;
  loadCheck?: () => Promise<TurnstileApi>;
  openPage?: (url: string) => void;
}

type Phase = "write" | "sending" | "sent" | "opened";

export const PUBLIC_NOTE = "Feedback is posted publicly on GitHub, so leave out anything private.";
export const ATTACH_NOTE = "Your insert's file goes with it, and anyone can read it.";
export const GITHUB_NOTE =
  "This opens GitHub with your words filled in. You need a GitHub account to send it from there.";
export const MISSING_MESSAGE = "Write a message first.";
export const CHECKING = "Checking that you are a person…";

const KIND_OPTIONS = FEEDBACK_KINDS.map((value) => ({ value, label: KIND_LABELS[value] }));

export function FeedbackDialog(p: FeedbackDialogProps) {
  const ownTitleId = useId();
  const titleId = p.titleId ?? ownTitleId;
  const messageId = useId();
  const contactId = useId();
  const noteId = useId();
  const title = useRef<HTMLHeadingElement>(null);
  const message = useRef<HTMLTextAreaElement>(null);
  const checkBox = useRef<HTMLDivElement>(null);
  const check = useRef<{ api: TurnstileApi; id: string } | null>(null);
  const alive = useRef(true);

  const [kind, setKind] = useState<FeedbackKind>("idea");
  const [text, setText] = useState("");
  const [contact, setContact] = useState("");
  const [attach, setAttach] = useState(false);
  const [phase, setPhase] = useState<Phase>("write");
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [issue, setIssue] = useState<{ url: string | null; number: number | null } | null>(null);

  const viaWorker = hasWorker(p.config) && !checkFailed;
  const draft: FeedbackDraft = { kind, message: text, contact, includeProject: attach };
  const context = { appVersion: p.appVersion, userAgent: p.userAgent };

  useEffect(() => {
    title.current?.focus();
    return () => {
      alive.current = false;
    };
  }, []);

  // The Turnstile script loads only now, and only when a Worker is set.
  useEffect(() => {
    if (!hasWorker(p.config)) {
      return;
    }
    let gone = false;
    (p.loadCheck ?? loadTurnstile)().then(
      (api) => {
        if (gone || checkBox.current === null) {
          return;
        }
        const id = api.render(checkBox.current, {
          sitekey: p.config.siteKey,
          theme: "auto",
          appearance: "interaction-only",
          callback: (t) => setToken(t),
          "expired-callback": () => setToken(null),
          "error-callback": () => setToken(null),
        });
        check.current = { api, id };
      },
      () => {
        if (!gone) {
          setCheckFailed(true);
        }
      },
    );
    return () => {
      gone = true;
      check.current?.api.remove(check.current.id);
      check.current = null;
    };
    // The widget is set up once per dialog.
  }, []);

  // The answer takes the focus, so a keyboard user hears it.
  useEffect(() => {
    if (phase === "sent" || phase === "opened") {
      title.current?.focus();
    }
  }, [phase]);

  const blockedReason =
    text.trim() === "" ? MISSING_MESSAGE : viaWorker && token === null ? CHECKING : undefined;

  const submit = async (): Promise<void> => {
    if (phase === "sending" || blockedReason !== undefined) {
      return;
    }
    setError(null);
    if (!viaWorker) {
      (p.openPage ?? ((u) => void window.open(u, "_blank", "noopener")))(
        fallbackUrl(draft, context),
      );
      setPhase("opened");
      return;
    }
    setPhase("sending");
    const payload = buildPayload(draft, context, token ?? "", p.getProject);
    const res = await (p.send ?? ((u, b) => sendFeedback(u, b)))(p.config.url, payload);
    if (!alive.current) {
      return;
    }
    if (res.ok) {
      setIssue({ url: res.issueUrl, number: res.number });
      setPhase("sent");
      return;
    }
    // A token works once: ask the check for a new one, and keep every word.
    setToken(null);
    if (check.current !== null) {
      check.current.api.reset(check.current.id);
    }
    setError(res.message);
    setPhase("write");
    message.current?.focus();
  };

  const done = phase === "sent" || phase === "opened";
  const heading =
    phase === "sent" ? "Thank you" : phase === "opened" ? "One more step" : "Send feedback";
  const retry = error !== null;

  return (
    <Dialog labelledBy={titleId} onClose={p.onClose} region="dialog" class="fb-dialog">
      <div class="fb-body" data-phase={phase}>
        <div class="fb-head">
          <div class="fb-head__text">
            <h1 class="fb-h1" id={titleId} tabIndex={-1} ref={title}>
              {heading}
            </h1>
            {done ? null : <span class="fb-sub">Ideas and problems both help.</span>}
          </div>
          <CloseButton onClick={p.onClose} />
        </div>

        {phase === "sent" ? (
          <>
            <p class="fb-line">
              {issue?.number !== undefined && issue.number !== null
                ? `Your feedback is on GitHub as issue ${issue.number}.`
                : "Your feedback is on GitHub."}
            </p>
            <div class="fb-actions">
              {issue?.url !== undefined && issue.url !== null ? (
                <a class="fb-link" href={issue.url} target="_blank" rel="noopener noreferrer">
                  See it on GitHub
                  <span class="visually-hidden"> (opens in a new tab)</span>
                </a>
              ) : null}
              <Button variant="primary" size="dialog" onClick={p.onClose}>
                Done
              </Button>
            </div>
          </>
        ) : phase === "opened" ? (
          <>
            <p class="fb-line">
              GitHub is open in a new tab with your words filled in. Press "Submit new issue" there
              to send them.
            </p>
            <div class="fb-actions">
              <Button variant="primary" size="dialog" onClick={p.onClose}>
                Done
              </Button>
            </div>
          </>
        ) : (
          <>
            <Segmented
              label="What is it about?"
              tone="quiet"
              options={KIND_OPTIONS}
              value={kind}
              onChange={setKind}
              stretch
            />

            <div class="fb-field">
              <label class="fb-label" for={messageId}>
                Your message
              </label>
              <span class="k-field__box field-box fb-box">
                <textarea
                  id={messageId}
                  ref={message}
                  class="fb-input"
                  rows={6}
                  maxLength={MESSAGE_LIMIT}
                  value={text}
                  placeholder="What would you like to say?"
                  aria-describedby={noteId}
                  onInput={(e) => setText(e.currentTarget.value)}
                />
              </span>
            </div>

            <div class="fb-field">
              <label class="fb-label" for={contactId}>
                How to reach you (optional)
              </label>
              <span class="k-field__box field-box">
                <input
                  id={contactId}
                  class="fb-input fb-input--line"
                  type="text"
                  autoComplete="off"
                  maxLength={200}
                  value={contact}
                  placeholder="An email or a GitHub name"
                  onInput={(e) => setContact(e.currentTarget.value)}
                />
              </span>
            </div>

            {viaWorker ? (
              <ChoiceChips
                label="Extras"
                options={[{ value: "attach", label: "Attach my insert design" }]}
                value={attach ? ["attach"] : []}
                onChange={() => setAttach(!attach)}
              />
            ) : null}

            <p class="fb-note" id={noteId}>
              {PUBLIC_NOTE}
              {attach && viaWorker ? ` ${ATTACH_NOTE}` : ""}
              {viaWorker ? "" : ` ${GITHUB_NOTE}`}
            </p>

            {/* Turnstile draws here, and only when it needs the person (it checks quietly first) */}
            <div ref={checkBox} class="fb-check" />

            {error !== null ? (
              <Notice tone="warn" title="Not sent.">
                {error}
              </Notice>
            ) : null}

            <div class="fb-actions">
              <Button
                variant="primary"
                size="dialog"
                icon={<Icon name="send" size={18} />}
                blockedReason={blockedReason}
                aria-disabled={phase === "sending" ? "true" : undefined}
                onClick={() => void submit()}
              >
                {phase === "sending"
                  ? "Sending…"
                  : !viaWorker
                    ? "Open GitHub"
                    : retry
                      ? "Try again"
                      : "Send"}
              </Button>
            </div>
          </>
        )}
      </div>
      {/* always mounted, so it speaks when its words change */}
      <div class="visually-hidden" role="status" data-live="feedback">
        {phase === "sending"
          ? "Sending."
          : phase === "sent"
            ? "Sent. Thank you."
            : error !== null
              ? `Not sent. ${error}`
              : ""}
      </div>
    </Dialog>
  );
}
