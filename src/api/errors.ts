/** errors: plain-language messages for screens. No app imports, so tests run it. */

/** The phone couldn't reach the server (no answer came back), as opposed to the server saying no. */
export function isNetworkError(e: unknown) {
  const text = String((e as Error)?.message ?? e);
  return /network|fetch failed|failed to fetch|connection was lost|internet connection|offline|timed out/i.test(text);
}

/** What to tell people when something didn't load or save. */
export function errorText(e: unknown) {
  if (isNetworkError(e)) return "Couldn't reach the school's server. Check your connection and try again.";
  return String((e as Error)?.message ?? e);
}
