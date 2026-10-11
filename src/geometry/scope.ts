// manifold-3d objects live in WASM memory and are never garbage-collected.
// Every Manifold created during a build is registered with a Scope and freed
// in one place, even when the build throws.

interface Deletable {
  delete(): void;
}

export class Scope {
  private readonly items: Deletable[] = [];

  track<T extends Deletable>(item: T): T {
    this.items.push(item);
    return item;
  }

  dispose(): void {
    while (this.items.length > 0) {
      this.items.pop()?.delete();
    }
  }
}

export function withScope<T>(fn: (scope: Scope) => T): T {
  const scope = new Scope();
  try {
    return fn(scope);
  } finally {
    scope.dispose();
  }
}
