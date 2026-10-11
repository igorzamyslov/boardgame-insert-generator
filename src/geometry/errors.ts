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
