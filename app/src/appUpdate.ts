import * as Updates from "expo-updates";

/**
 * Looks for a newer build of the app's code as it opens and switches to it straight away.
 * Without this an update only applies on the launch after it finished downloading, which is easy to miss.
 * Never throws: a failed check just leaves the current version running.
 */
async function applyUpdateIfAny(safeToRestart: () => boolean, timeoutMs = 12_000): Promise<void> {
  if (__DEV__ || !Updates.isEnabled) return;
  try {
    const work = (async () => {
      const check = await Updates.checkForUpdateAsync();
      if (!check.isAvailable) return false;
      const fetched = await Updates.fetchUpdateAsync();
      return fetched.isNew;
    })();
    const timeout = new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs));
    // Restarting in the middle of a payment would be worse than waiting: if anything is in progress, the new version simply loads on the next open.
    if ((await Promise.race([work, timeout])) && safeToRestart()) await Updates.reloadAsync();
  } catch {
    // Offline or the update server is unreachable: keep going with what is installed.
  }
}

/** A short label for the running version, so it is always clear which build is on the phone. */
function versionLabel(appVersion: string): string {
  const id = Updates.updateId;
  const when = Updates.createdAt;
  const stamp = when ? `${when.getUTCFullYear()}.${String(when.getUTCMonth() + 1).padStart(2, "0")}.${String(when.getUTCDate()).padStart(2, "0")} ${String(when.getUTCHours()).padStart(2, "0")}:${String(when.getUTCMinutes()).padStart(2, "0")}` : "";
  return id ? `Version ${appVersion} · ${stamp} · ${id.slice(0, 8)}` : `Version ${appVersion}`;
}

export { applyUpdateIfAny, versionLabel };
