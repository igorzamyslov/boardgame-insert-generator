import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleProject } from "../test-support/sample";

// The build id is for display. Two builds of the same source that differ only in it must write
// the same project files and compute the same inputs hash.
async function underBuildId(buildId: string): Promise<{ file: string; hash: string }> {
  vi.resetModules();
  vi.doMock("./version", async (orig) => ({
    ...(await orig<typeof import("./version")>()),
    BUILD_ID: buildId,
  }));
  const { noForeign, serializeProject } = await import("./schema");
  const { inputsHash } = await import("./hash");
  const p = sampleProject();
  return { file: serializeProject(p, noForeign()), hash: inputsHash(p) };
}

afterEach(() => {
  vi.doUnmock("./version");
});

describe("the build id", () => {
  it("never changes the written project or the inputs hash", async () => {
    const a = await underBuildId("aaaaaaa");
    const b = await underBuildId("bbbbbbb-dirty");
    expect(b).toEqual(a);
    expect(a.file).not.toContain("aaaaaaa");
  });

  it("leaves createdWith as the semver version alone", async () => {
    const { file } = await underBuildId("aaaaaaa");
    const { APP_VERSION, parseSemver } = await import("./version");
    const written = JSON.parse(file) as { createdWith: string };
    expect(written.createdWith).toBe(APP_VERSION);
    expect(parseSemver(written.createdWith)).not.toBeNull();
  });
});
