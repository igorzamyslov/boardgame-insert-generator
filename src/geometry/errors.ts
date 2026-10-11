// Thrown when a TraySpec (usually from a newer-minor project file) uses a
// part or feature this geometry version does not know. Such trays are shown
// but cannot be built or exported (spec §9).
export class UnsupportedFeatureError extends Error {
  readonly feature: string;

  constructor(feature: string) {
    super(`Unsupported tray feature "${feature}": this tray was made with a newer app version`);
    this.name = "UnsupportedFeatureError";
    this.feature = feature;
  }
}

// Thrown when a TraySpec cannot be built safely: non-positive sizes, a floor
// outside the tray, overlapping compartments, a slot into the outer wall and
// so on. A RangeError of its own name, so a runtime RangeError (the WASM heap
// running out, say) is not mistaken for a verdict on the spec.
export class TraySpecError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "TraySpecError";
  }
}
