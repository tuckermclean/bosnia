/** Thrown when a feature needs settings (API keys) that are not configured. */
export class FeatureUnavailableError extends Error {
  constructor(
    public readonly feature: string,
    public readonly missingKeys: string[],
  ) {
    super(`${feature} is unavailable`);
    this.name = "FeatureUnavailableError";
  }
}

/** Names, in order, of the settings whose values are empty after trim. */
export function missingSettings(settings: Record<string, string | undefined>): string[] {
  return Object.entries(settings)
    .filter(([, value]) => !value || value.trim() === "")
    .map(([name]) => name);
}
