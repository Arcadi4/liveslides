const STORAGE_KEY = "liveslides:name";

const FALLBACK = "Guest";

/** The display name is a convenience only, so it stays in sessionStorage. */
export function suggestName(): string {
  try {
    return sessionStorage.getItem(STORAGE_KEY) ?? FALLBACK;
  } catch {
    return FALLBACK;
  }
}

export function rememberName(name: string): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, name);
  } catch {
    // Private-mode storage refusals must not block joining.
  }
}
