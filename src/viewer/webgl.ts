// src/viewer/webgl.ts

/** The browser can't give the 3D view a WebGL context (as opposed to any other scene failure). */
export class WebGLUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebGLUnavailableError";
  }
}

let known = false;

/**
 * Whether a WebGL context can be created. A positive answer is remembered, and the probe context
 * is released at once: browsers allow only a handful of live contexts, and the renderer needs one.
 * A negative answer is not remembered (it may come from too many live contexts, which passes).
 */
export function hasWebGL(): boolean {
  if (known) {
    return true;
  }
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    if (!gl) {
      return false;
    }
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    known = true;
    return true;
  } catch {
    return false;
  }
}
