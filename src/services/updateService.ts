import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { APP_NAME, APP_VERSION } from "../lib/constants";
import { isVersionNewer } from "../lib/semver";
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
  if (import.meta.env.VITE_E2E) {
    openUpdateDialog();
    setUpdateDialog({ phase: "up_to_date", message: upToDateMessage() });
    return;
  }

  openUpdateDialog();

  try {
    const update = await check({ allowDowngrades: false });

    if (!update || !isVersionNewer(update.version, APP_VERSION)) {
      setUpdateDialog({ phase: "up_to_date", message: upToDateMessage() });
      return;
    }

    setUpdateDialog({
      phase: "downloading",
      message: `Downloading version ${update.version}…`,
    });

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        setUpdateDialog({
          phase: "downloading",
          message: `Downloading version ${update.version}…`,
        });
      } else if (event.event === "Finished") {
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
    await relaunch();
  } catch (err) {
    if (isFeedUnavailable(err)) {
      setUpdateDialog({
        phase: "error",
        message: UPDATE_FEED_UNAVAILABLE_MESSAGE,
      });
    } else {
      setUpdateDialog({
        phase: "error",
        message: String(err),
      });
    }
  }
}

export { closeUpdateDialog };
