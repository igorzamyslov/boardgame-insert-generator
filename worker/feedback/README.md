# Feedback Worker

A small Cloudflare Worker. The app's "Send feedback" form posts to it, and it opens a GitHub issue
labelled `feedback` (plus `bug` for a problem and `enhancement` for an idea). There is no database:
the issue is the record.

Before it opens anything it checks that the caller is the app's own page, that a Cloudflare
Turnstile check passed, and that the address has not sent more than 5 messages in the last
minute. The GitHub token lives only in the Worker, never on the page.

Nothing here has been set up yet. You do these steps once.

## 1. Cloudflare account and Wrangler

1. Make a free account at <https://dash.cloudflare.com/sign-up>. The free plan is enough.
2. From this folder (`worker/feedback/`), sign in:

   ```bash
   npx wrangler login
   ```

## 2. Turnstile widget

1. In the Cloudflare dashboard open **Turnstile**, then **Add widget**.
2. Name it "Insert Generator feedback". Add these hostnames:
   - `igorzamyslov.github.io`
   - `localhost` (so you can try it from `npx vite`)
3. Widget mode: **Managed**. Create it.
4. Copy two values: the **Site Key** (public) and the **Secret Key** (private).

## 3. GitHub token

1. On GitHub: **Settings, Developer settings, Personal access tokens, Fine-grained tokens,
   Generate new token**.
2. Resource owner: you. Repository access: **Only select repositories**, then
   `igorzamyslov/boardgame-insert-generator`.
3. Repository permissions: **Issues: Read and write**. Nothing else. Choose an expiry you will
   remember (a year is fine) and put it in your calendar: when it ends, feedback stops until you
   make a new token and repeat step 4's first command.
4. Generate it and copy the token.

## 4. Put the secrets in and deploy

Each command asks you to paste the value. Nothing goes into a file.

```bash
npx wrangler secret put TURNSTILE_SECRET
npx wrangler secret put GITHUB_TOKEN
npx wrangler deploy
```

`wrangler deploy` prints the Worker's address, like
`https://insert-generator-feedback.<your-name>.workers.dev`. If the repository is not
`igorzamyslov/boardgame-insert-generator` or the page is not on `igorzamyslov.github.io`, change
`GITHUB_REPO` and `ALLOWED_ORIGINS` in `wrangler.toml` first. Localhost origins are always
allowed, so the form works from `npx vite`.

## 5. Tell the app

In the repository on GitHub: **Settings, Secrets and variables, Actions, Variables tab, New
repository variable** (a variable, not a secret: both values are public in the page anyway):

| Name                     | Value                                  |
| ------------------------ | -------------------------------------- |
| `VITE_FEEDBACK_URL`      | the Worker's address from step 4       |
| `VITE_TURNSTILE_SITEKEY` | the Turnstile **Site Key** from step 2 |

Then run the **Deploy** workflow again (Actions, Deploy, Run workflow). The site is rebuilt with
the form pointed at the Worker. Until both variables exist the form sends people to GitHub's
new-issue page instead, which needs a GitHub account.

To try it from your machine: put the two values in a file called `.env.local` at the repository's
root (it is ignored by git) and run `npx vite`:

```
VITE_FEEDBACK_URL=https://insert-generator-feedback.<your-name>.workers.dev
VITE_TURNSTILE_SITEKEY=<the site key>
```

## What it accepts

`POST` JSON: `message` (up to 5,000 characters), `kind` (`idea`, `problem` or `other`), optional
`contact`, `includeProject` and `project` (the insert's file as text), `appVersion`, `userAgent`
and `turnstileToken`. It answers `{ ok: true, issueUrl, number }` or `{ ok: false, error, message }`.
The whole issue body is kept under GitHub's limit: a big attached design is cut, with a note in
the issue, and goes in a collapsed block.

## Working on it

```bash
npx vitest run worker          # the tests, with the network mocked
npx tsc --noEmit -p worker/feedback
```

Feedback is public: the form says so, and the Worker neutralises `@name` mentions so a message
cannot notify other people.
