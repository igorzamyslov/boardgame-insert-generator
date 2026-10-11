import { APP_VERSION, isPreview } from "../model/version";

/** Placeholder shell; plan 5 replaces the body with the real UI. */
export function App() {
  return (
    <>
      {isPreview(APP_VERSION) && (
        <p class="preview-banner" role="note">
          Preview: saved projects and shared links may break between versions.
        </p>
      )}
      <main>
        <h1>Board Game Insert Generator</h1>
        <p>Measure your box and components; get a 3D-printable insert.</p>
      </main>
      <footer>
        Insert Generator v{APP_VERSION} · <a href="../">All apps</a>
      </footer>
    </>
  );
}
