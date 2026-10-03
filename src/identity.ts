const STORAGE_KEY = "liveslides:name";

const FALLBACK = "Guest";

/** The display name is a device-level convenience, so it outlives the tab. */
export function suggestName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY)?.trim() || FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function rememberName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Private-mode storage refusals must not block joining.
  }
}
