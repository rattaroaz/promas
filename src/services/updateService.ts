import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { APP_NAME, APP_VERSION } from "../lib/constants";
import { isVersionNewer } from "../lib/semver";
import {
  log,
  metrics,
  noteUpdateOutcome,
  startSpan,
} from "../lib/observability";
import {
  closeUpdateDialog,
  openUpdateDialog,
  setUpdateDialog,
} from "../stores/uiStore";

const UPDATE_FEED_UNAVAILABLE_MESSAGE =
  `No update feed is published yet for ${APP_NAME}.\n\n` +
  `Publish a GitHub Release with latest.json (tag e.g. v${APP_VERSION}), ` +
  `and ensure TAURI_SIGNING_PRIVATE_KEY secrets are configured.`;

function upToDateMessage(): string {
  return `${APP_NAME} ${APP_VERSION} is up to date.`;
}

function isFeedUnavailable(err: unknown): boolean {
  const msg = String(err).toLowerCase();
  return (
    msg.includes("could not fetch a valid release json") ||
    msg.includes("failed to fetch") ||
    msg.includes("404") ||
    msg.includes("not found")
  );
}

/** Manual update check — never called automatically on startup. */
export async function checkForUpdatesAndApply(): Promise<void> {
  const span = startSpan("update", "checkForUpdatesAndApply", {
    installedVersion: APP_VERSION,
    userAction: "check_for_updates",
  });
  metrics.inc("update.check");

  if (import.meta.env.VITE_E2E) {
    openUpdateDialog();
    setUpdateDialog({ phase: "up_to_date", message: upToDateMessage() });
    noteUpdateOutcome("up_to_date_e2e");
    log.info("update", "E2E short-circuit up_to_date", {
      installedVersion: APP_VERSION,
    });
    span.end({ ok: true, meta: { outcome: "up_to_date_e2e" } });
    return;
  }

  openUpdateDialog();
  log.info("update", "check started", {
    installedVersion: APP_VERSION,
    userAction: "check_for_updates",
  });

  try {
    const update = await check({ allowDowngrades: false });

    if (!update || !isVersionNewer(update.version, APP_VERSION)) {
      setUpdateDialog({ phase: "up_to_date", message: upToDateMessage() });
      noteUpdateOutcome("up_to_date");
      metrics.inc("update.up_to_date");
      log.info("update", "up_to_date", {
        installedVersion: APP_VERSION,
        remoteVersion: update?.version ?? null,
      });
      span.end({ ok: true, meta: { outcome: "up_to_date" } });
      return;
    }

    log.info("update", "update_available", {
      installedVersion: APP_VERSION,
      remoteVersion: update.version,
      userAction: "download_update",
    });
    metrics.inc("update.available");

    setUpdateDialog({
      phase: "downloading",
      message: `Downloading version ${update.version}…`,
    });

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        log.info("update", "download started", {
          remoteVersion: update.version,
        });
        setUpdateDialog({
          phase: "downloading",
          message: `Downloading version ${update.version}…`,
        });
      } else if (event.event === "Finished") {
        log.info("update", "download finished", {
          remoteVersion: update.version,
          userAction: "install_update",
        });
        setUpdateDialog({
          phase: "installing",
          message: "Installing update… the app will restart.",
        });
      }
    });

    setUpdateDialog({
      phase: "installing",
      message: "Restarting…",
    });
    noteUpdateOutcome(`installing:${update.version}`);
    metrics.inc("update.install");
    log.info("update", "install + relaunch", {
      remoteVersion: update.version,
    });
    span.end({ ok: true, meta: { outcome: "relaunch", version: update.version } });
    await relaunch();
  } catch (err) {
    const message = String(err);
    if (isFeedUnavailable(err)) {
      const ev = log.warn("update", "feed not published", {
        installedVersion: APP_VERSION,
        error: message,
      });
      metrics.inc("update.feed_unavailable");
      noteUpdateOutcome("feed_unavailable");
      setUpdateDialog({
        phase: "error",
        message: UPDATE_FEED_UNAVAILABLE_MESSAGE,
      });
      span.end({
        ok: false,
        error: message,
        meta: { outcome: "feed_unavailable", errorId: ev?.errorId },
      });
    } else {
      const ev = log.error("update", "check/apply failed", {
        installedVersion: APP_VERSION,
        error: message,
      });
      metrics.inc("update.error");
      noteUpdateOutcome(`error:${message.slice(0, 120)}`);
      setUpdateDialog({
        phase: "error",
        message: String(err),
      });
      span.end({
        ok: false,
        error: message,
        meta: { outcome: "error", errorId: ev?.errorId },
      });
    }
  }
}

export { closeUpdateDialog };
