import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { ask, message } from '@tauri-apps/plugin-dialog';

const TITLE = 'Edukids Screenshot';

let inProgress = false;

/**
 * Check GitHub Releases for a newer version.
 * silent=true  → startup check: only prompts when an update exists, swallows errors (offline…).
 * silent=false → user-triggered: also reports "up to date" and errors.
 *
 * Uses native dialogs so it works even while the main window is hidden (tray-only app).
 */
export async function checkForUpdates({ silent }: { silent: boolean }): Promise<void> {
  if (inProgress) return;
  inProgress = true;
  try {
    const update = await check();

    if (!update) {
      if (!silent) {
        await message('Bạn đang dùng phiên bản mới nhất.', { title: TITLE, kind: 'info' });
      }
      return;
    }

    const notes = update.body?.trim() ? `\n\n${update.body.trim()}` : '';
    const accepted = await ask(
      `Đã có phiên bản ${update.version} (hiện tại: ${update.currentVersion}).\nCập nhật ngay?${notes}`,
      { title: TITLE, kind: 'info', okLabel: 'Cập nhật', cancelLabel: 'Để sau' },
    );
    if (!accepted) return;

    await update.downloadAndInstall();
    // On Windows the NSIS installer exits the app itself; relaunch covers macOS.
    await relaunch();
  } catch (err) {
    console.error('Update check failed:', err);
    if (!silent) {
      await message(`Không thể kiểm tra cập nhật:\n${String(err)}`, {
        title: TITLE,
        kind: 'error',
      }).catch(() => {});
    }
  } finally {
    inProgress = false;
  }
}
