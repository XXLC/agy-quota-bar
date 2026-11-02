English | [Tiếng Việt](README.vi.md)

# agy-quota-bar (Quota agy)

A VS Code extension that shows your remaining Antigravity quota in the status bar. The numbers come from the `agy` CLI, so Antigravity IDE does not need to be open.

The user interface, the log, and the code comments are currently in Vietnamese only (section 4.10).

## 1. Purpose

The extension shows the remaining quota of each model group (Gemini; Claude/GPT) for the 5-hour limit and the weekly limit, warns you when it gets low, and tells you when the quota resets.

How it differs from the older extension `clhome.antigravity-quota-yufeng`:

| | Older extension | agy-quota-bar |
|---|---|---|
| Data source | Antigravity IDE language server | `agy` CLI command |
| When Antigravity IDE is closed | Breaks, no data | Keeps working |
| Depends on | A running Antigravity IDE | Only an installed, logged-in `agy` |
| Installs into | Antigravity IDE | VS Code or Antigravity IDE |

`agy -p` does not start the Antigravity IDE language server, so the extension does not depend on that IDE.

## 2. How it works

On every refresh, the extension runs:

```
agy --output-format json -p "/usage"
```

The command is spawned directly (no shell), with the hidden-window option (`windowsHide`), the home directory as working directory, the environment variable `NO_COLOR=1`, a 256 KiB output limit, and stdin closed immediately. The extension reads the JSON result (field `command.data.groups`, which carries the remaining fraction as a floating-point number); if that field is missing, it falls back to the TAB-separated text table in the `response` field, but only when `conversation_id` is present and is exactly the empty string. Stdout must contain one JSON object; surrounding whitespace or blank lines are accepted, but other content outside the JSON is treated as an error.

`/usage` is a built-in agy command, not a prompt sent to a model. Measured on the author's machine, Windows 11, agy 1.4.12:

| Check | Measured result |
|---|---|
| Exit code, output stream | Always 0; result on stdout, stderr empty |
| Run time | About 4 seconds per run (3,907 ms when run from Node; 2.6-3.5 seconds over more than 15 other runs) |
| Model call | None: `num_turns` = 0, `conversation_id` empty, every token field in `usage` is 0 |
| Quota consumption | None: the Gemini group's `remaining_fraction` stayed identical to the 16th decimal place over 7 consecutive calls |
| Conversation created | None: the `conversations` directory and `last_conversations.json` did not change |
| Depends on working directory | No: running in `C:\Windows\Temp` gives the same result |

> [!WARNING]
> The extension never passes the `--disable-slash-commands` flag. With that flag, agy sends the string `/usage` to the model as an ordinary prompt: in a measurement on the author's machine, the run took 33.4 seconds, created a new conversation, consumed model tokens, and returned prose instead of the quota table. In case a future agy release drops the `/usage` command (which would also send that string to the model), the extension only accepts a result when `command.name` is `usage`, `num_turns` is 0, `conversation_id` has no truthy value (an empty string, an absent field, `null`, `false`, and `0` all pass this check), and `status` (if present) is `SUCCESS`. Otherwise it reports an "unexpected result" error and progressively lengthens the refresh interval (section 5) so it does not keep burning quota. If you run the command yourself in a terminal, do not add this flag.

## 3. Guarantees and limits

The extension:

- Does not open network connections itself.
- Does not read any credentials (tokens, passwords) belonging to agy or to you.
- Sends no telemetry.
- Writes only to the storage directory VS Code allocates to the extension (`globalStorageUri`): the state file `state.json`, the lock file `state.lock`, and temporary files while writing (section 4.7).

However `agy`, the program the extension calls:

- Does access the network: it fetches quota numbers from the Antigravity servers.
- Always starts every MCP server you have configured for agy, on EVERY refresh. On the test machine, agy's child process tree was `cmd.exe`, 3 `node.exe`, `conhost.exe`, `cmd.exe`, `agy.exe`; all of them had exited when agy exited. The number and kind of processes depend on your MCP configuration.
- Offers no way to disable MCP just for the `/usage` run: agy immediately rejects `--settings '{"mcpServers":{}}'` with the error `Error: --settings: unknown setting "mcpServers"` (exit code 1). That is why the extension does not use `--settings`.
- May write into agy's `~\.gemini` directory (logs, cache). With `/usage`, no new conversation was observed.

So each refresh costs about 4 seconds of agy run time plus short-lived MCP processes. With the default 300 seconds, that is at most about 12 runs per hour (fewer when several windows share results, see section 4.7).

The numbers shown belong to the agy account currently logged in. The extension does not know which account that is; if you switch agy accounts, the numbers change at the next refresh.

## 4. Usage

### 4.1. Requirements

- VS Code 1.90 or later, or Antigravity IDE (the VS Code version Antigravity IDE is based on has not been checked, see section 6).
- The `agy` CLI installed and logged in on the same machine that runs VS Code. Tested with agy 1.4.12.
- On Windows, `agy` must be the file `agy.exe` (section 5.4).
- Tested operating system: Windows 11. macOS and Linux have not been tested.

Quick check in a terminal:

```powershell
agy --version
agy --output-format json -p "/usage"
```

The second command must print a single JSON line containing `"status":"SUCCESS"` and `"num_turns":0`.

### 4.2. Packaging and installation

There is no prebuilt release yet, and the extension is not published on the Visual Studio Marketplace or Open VSX. To install it, package it yourself from source (requires Git, Node.js, and network access so `npx` can download `@vscode/vsce`):

```powershell
git clone https://github.com/XXLC/agy-quota-bar.git
cd agy-quota-bar
npx @vscode/vsce package
```

This produces `agy-quota-bar-0.1.0.vsix`. The project has no npm dependencies, so no `npm install` is needed first. The `.vscodeignore` file excludes internal documents, verification documents, tests, Git data, and VSIX packages from the package.

Install into VS Code:

```powershell
code --install-extension agy-quota-bar-0.1.0.vsix
```

Install into Antigravity IDE (the command script is at `%LOCALAPPDATA%\Programs\Antigravity IDE\bin\antigravity-ide.cmd`; if that `bin` directory is not on your `PATH`, call it by its full path):

```powershell
antigravity-ide --install-extension agy-quota-bar-0.1.0.vsix
```

Or, in either application's UI: Extensions view, `...` menu, "Install from VSIX...", then pick the `.vsix` file.

The extension activates after the window has finished starting up (`onStartupFinished`), so it does not slow down opening. It also runs in Restricted Mode (untrusted folders).

### 4.3. Configuration

Open Settings and search for `agyQuota`. Changes take effect immediately without reloading the window; changing `agyQuota.agyPath` triggers an immediate refresh.

| Key | Default | Range | Meaning |
|---|---|---|---|
| `agyQuota.agyPath` | empty | File path | ABSOLUTE path to the `agy` file (Windows: `.exe` files only). Empty means auto-detect (section 5.1). The key has `scope: machine`: it can only be set in user settings, not in workspace or folder settings, so an untrusted project cannot make the extension run an arbitrary file. |
| `agyQuota.refreshInterval` | 300 | 60-3600 (seconds) | Interval between two automatic refreshes. |
| `agyQuota.timeout` | 45 | 5-300 (seconds) | Maximum time for one agy run. On timeout, agy and all of its child processes are killed. |
| `agyQuota.warningThreshold` | 30 | 0-100 (%) | Remaining at or below this value is the warning level. |
| `agyQuota.criticalThreshold` | 10 | 0-100 (%) | Remaining at or below this value is the critical level. If set higher than the warning threshold, the warning threshold is used instead. |
| `agyQuota.notificationEnabled` | true | true/false | Show notifications when a quota level changes (section 4.6). When off, the extension still tracks and stores levels and just does not show notifications; turning it back on does not replay old notifications. |

Numeric values outside the range are clamped to the nearest bound; non-numeric values fall back to the default.

### 4.4. Commands

Open the Command Palette (`Ctrl+Shift+P`) and type "Quota agy". Command titles are in Vietnamese:

| Command | English meaning | Effect |
|---|---|---|
| Quota agy: Làm mới quota | Refresh quota | Runs agy now, even if the result is still fresh or another window is running it, and resets the consecutive error count to 0 (ending any backoff). If this same window is already running agy, it waits for that run. If it cannot acquire the state file lock after 5 attempts, it does not run and logs a warning. |
| Quota agy: Xem chi tiết | Show details | Opens a detail list of every limit, grouped by model group, ending with two actions `$(refresh) Làm mới ngay` (Refresh now) and `$(output) Mở nhật ký` (Open log). Clicking the status bar item opens the same list. |
| Quota agy: Mở nhật ký | Open log | Opens the "Quota agy" Output channel. |

### 4.5. Reading the status bar and the tooltip

The item sits on the right side of the status bar and is named "Quota Antigravity" (use this name to hide/show it from the status bar's context menu).

Each group shows the LOWEST percentage among its limits, since that is what you can actually use. If the lowest limit is the weekly one, the word ` tuần` ("week") follows it. Percentages are always rounded down (9.9% shows as 9%), and thresholds are compared against the exact number shown. A limit whose reset time has passed is ignored when picking the lowest value, as long as the group still has another limit whose reset time has not passed.

Background color: yellow (the theme's warning color) when a displayed number is at the warning level, red (the theme's error color) when a displayed number is at the critical level.

| Situation | Status bar text (example) | Notes |
|---|---|---|
| Fetching data for the first time | `$(sync~spin) Quota agy` | |
| Normal | `Gemini 91% \| Claude/GPT 85% tuần` | `tuần` = week |
| A limit at the critical level | `Gemini 61% tuần \| Claude/GPT 8% tuần` | red background with default thresholds |
| All limits of a group past their reset time, waiting for refresh | `Gemini ?% \| Claude/GPT 92%` | `?%` is not colored |
| Manual refresh in progress | `$(sync~spin)` added at the start | |
| Stale data | `$(history) Gemini 91% \| Claude/GPT 92%` | |
| Stale data, manual refresh in progress | `$(sync~spin) $(history) Gemini 91% \| Claude/GPT 92%` | |
| Error, no data yet | `$(error) Quota agy: lỗi` | `lỗi` = error |
| agy not found | `$(error) Quota agy: không tìm thấy agy` | "agy not found" |

(`$(...)` is a VS Code codicon; `\|` in the table is the `|` character on the bar.)

Hover over the item to see the tooltip. The example below matches the "critical" row above, at 00:21 on 03/11 (3 November). The block is a plain-text picture of the tooltip AFTER VS Code has rendered the Markdown, with columns aligned for readability; it is not the raw Markdown string the extension produces. In the real tooltip the content is a Markdown table, and the "Quota Antigravity" heading and the critical cell are bold.

```
Quota Antigravity

| Nhóm       | Giới hạn | Còn lại           | Reset lúc      | Còn           |
|------------|----------|-------------------|----------------|---------------|
| Gemini     | 5 giờ    | 91%               | 02:48 T3 03/11 | 2 giờ 27 phút |
| Gemini     | Tuần     | 61%               | 06:24 T7 07/11 | 4 ngày 6 giờ  |
| Claude/GPT | 5 giờ    | 92%               | 05:16 T3 03/11 | 4 giờ 55 phút |
| Claude/GPT | Tuần     | 8% (nghiêm trọng) | 17:05 T2 09/11 | 6 ngày 16 giờ |

Cập nhật lúc 00:21 (vừa xong). Ngưỡng: cảnh báo <= 30%, nghiêm trọng <= 10%.

Bấm để xem chi tiết.
```

Translation of the tooltip text: "Nhóm / Giới hạn / Còn lại / Reset lúc / Còn" = Group / Limit / Remaining / Resets at / Time left; "5 giờ / Tuần" = 5 hours / Week; "ngày, giờ, phút" = days, hours, minutes; "Cập nhật lúc 00:21 (vừa xong)" = Updated at 00:21 (just now); "Ngưỡng: cảnh báo <= 30%, nghiêm trọng <= 10%" = Thresholds: warning <= 30%, critical <= 10%; "Bấm để xem chi tiết." = Click to see details.

- A cell at the warning level gets the suffix "(cảnh báo)" (warning); a cell at the critical level gets "(nghiêm trọng)" (critical) and is bold.
- "Reset lúc" (resets at) is local time in the form `hour:minute weekday day/month`, where the weekday is CN (Sunday), T2 (Monday) ... T7 (Saturday).
- "Còn" (time left) is the time until the reset: `X ngày Y giờ`, `X giờ Y phút`, `Y phút`, `dưới 1 phút` (under 1 minute), or `đã đến giờ reset` (reset time reached). Without a reset time, both columns show "không rõ" (unknown).
- "Cập nhật lúc" (updated at) is followed by `vừa xong` (just now, under 1 minute) or `N phút trước` (N minutes ago).
- With stale data, a line under the heading starts with the `$(history)` icon and the bold text "Dữ liệu cũ." (Stale data.), followed by the reason: the last refresh failed (attempt time and sanitized error message), or "Đã quá thời hạn cập nhật." (Update deadline exceeded.).
- With no data yet, the tooltip shows "Đang đọc quota." (Reading quota.) or a line starting with the `$(error)` icon that holds the error message, followed by the hint `Chạy lệnh "Quota agy: Mở nhật ký" để xem chi tiết.` (Run the command "Quota agy: Mở nhật ký" for details.)
- The bar and tooltip are redrawn every 60 seconds, so the countdown stays correct even between refreshes.

In the detail list (command "Quota agy: Xem chi tiết"), limits at the warning or critical level are prefixed with the `$(warning)` or `$(error)` icon; when there is no data and an error occurred, the list contains a line starting with `$(error)` that holds the error message.

### 4.6. Notifications

The extension remembers the level (normal, warning, critical) of every limit in `state.json`, including across VS Code restarts, and only notifies you when a level changes:

| Previous level | New level | Notification |
|---|---|---|
| (none) | normal | No |
| (none) | warning or critical | Yes, once |
| normal | warning | Yes (warning) |
| normal or warning | critical | Yes (error) |
| critical | warning | No |
| warning or critical | normal | Yes (recovered) |
| unchanged | unchanged | No |

- At most one notification per refresh; several changes are merged and shown with the most severe type. Example: `Quota Antigravity: Claude/GPT (5 giờ) còn 9%, reset 05:16 T3 03/11; Gemini (5 giờ) đã hồi phục, còn 100%.` (Claude/GPT (5 hours) has 9% left, resets 05:16 Tue 03/11; Gemini (5 hours) has recovered, 100% left.)
- Only the window that actually ran agy shows the notification, after it has saved the new levels to the shared file; other windows only update their bar.
- A limit past its reset time (shown as `?%`) does not change level. A limit that disappears from agy's output is forgotten without a notification.
- agy not found (including when `agyQuota.agyPath` is wrong or is not an `.exe` on Windows): one error notification per extension activation in a window, with a "Mở cài đặt" (Open settings) button that jumps to `agyQuota.agyPath`.
- Other errors only appear in the bar, the tooltip, and the log; they do not raise notifications.

### 4.7. Multiple windows

All windows of the same application share the extension's `globalStorageUri` directory, which contains:

- `state.json`: the latest refresh result, the times of the latest attempt and latest success, the latest error, the consecutive error count, the notified levels, and the "running" marker (`runningSince`).
- `state.lock`: a lock for every read-modify-write of `state.json`, created exclusively and held for only a few milliseconds (not while agy runs). If the lock is busy, the extension tries at most 5 times, waiting 50, 100, 200, 400 milliseconds between attempts. A lock older than 30 seconds (for example, an extension host that died midway) is treated as orphaned and reclaimed: renamed to a unique name and then deleted.
- Temporary files `state.json.<pid>.<random string>.tmp`: on every write, the extension writes a temporary file, renames it to `state.json`, then cleans up the temporary file.

How the windows coordinate:

- Every 60 seconds, a window takes the lock and reads `state.json`. If a run has a valid lease (a marker newer than `timeout` + 5 seconds), the window uses the result in the file. Otherwise it refreshes if there has been no attempt yet, the current refresh interval (including error backoff) has elapsed, a reset time has passed since the previous attempt, or the clock has moved back before the latest attempt. To refresh, it writes the "running" marker, releases the lock, runs agy, then takes the lock again to write the result.
- Because the decision and the marker happen within the same lock hold, opening many windows still yields only one automatic agy run per cycle (the manual refresh command always runs in addition).
- An error from a slow run does not overwrite a newer successful result from another window.
- If the result cannot be written after 5 lock attempts, the window still shows the result it just got and logs a warning.
- Closing or reloading a window while it is running agy: the extension cancels the run, kills the whole agy process tree (waiting at most 2.5 seconds), removes the "running" marker, and restores the previous attempt time. A cancelled run writes no error to the shared file and does not count as a consecutive error, so another window can run as soon as it is due.

VS Code and Antigravity IDE give the extension two separate storage directories, so they do not share results. If you install the extension in both, agy runs twice per cycle (once per application), and level-change notifications appear in both.

With Remote SSH, WSL, or Dev Containers, the extension is declared to run on the local machine (`extensionKind: ui`, where agy is), not on the remote.

### 4.8. After sleep or hibernation

- Every 60 seconds the extension checks whether a refresh is due, so within about 60 seconds after the machine wakes there is a refresh if one is overdue.
- It also refreshes when a limit has just passed its reset time and the latest attempt happened before that time. Each reset time triggers exactly one attempt, even during error backoff.
- Data older than 2 times `refreshInterval` (common right after waking) is marked as stale; it is still shown, not cleared.
- The first refresh after waking may fail if the network is not up yet; the bar keeps the old numbers with the stale marker, and the next refresh tries again.
- A system clock moved back before the latest attempt also triggers a refresh.

### 4.9. Log

The "Quota agy" Output channel records every agy run: success (run time, number of limits read, exit code, `nguồn: agy` (source: agy)) or error (error type and message). When a window uses a new result fetched by another window, it writes one line `nguồn: bộ nhớ đệm (cửa sổ khác, N giây trước)` (source: cache (another window, N seconds ago)), only once per new result. Warnings about a busy lock, a result that could not be written, or a process tree that could not be killed are also logged here.

Log entries for successful runs do not contain agy's raw output. Error messages keep only the first non-empty line of the output, at most 200 characters, after stripping color codes and control characters and masking email addresses, token-like strings (`eyJ...`, `ya29.`, `Bearer ...`, `Basic ...`), values of sensitive URL parameters (`token`, `key`, `secret`, `password`, `code`, and similar), and every run of 24 or more consecutive letters, digits, and `_-./+=` characters.

### 4.10. Language

The status bar text, tooltip, detail list, notifications, Command Palette command titles, setting descriptions, log messages, and code comments are currently in Vietnamese only. There is no English localization yet. This README gives English translations next to the Vietnamese strings it quotes.

## 5. Troubleshooting

First step for any error: run "Quota agy: Mở nhật ký" (Open log), then try `agy --output-format json -p "/usage"` in a terminal.

Backoff on repeated errors: from the 3rd consecutive error, the refresh interval doubles after each error (for example, with the default 300 seconds: 600, 1,200, 2,400 seconds), capped at 3600 seconds. Each reset time that has passed still triggers exactly one attempt. One successful refresh, or the "Quota agy: Làm mới quota" (Refresh quota) command, restores the normal interval.

### 5.1. agy not found

Symptoms: the bar shows `$(error) Quota agy: không tìm thấy agy` (agy not found), and an error notification with a "Mở cài đặt" (Open settings) button appears.

If `agyQuota.agyPath` is set, the extension uses only that path and requires it to be absolute, to exist, and to be a file; on Windows it must end in `.exe`. No other location is tried.

If `agyQuota.agyPath` is empty, the extension searches in this order: each directory on `PATH` (`agy.exe` on Windows, `agy` elsewhere; `PATH` entries that are not absolute paths are skipped), then `%LOCALAPPDATA%\agy\bin\agy.exe` (Windows only). The result is cached and looked up again when `agyQuota.agyPath` changes or when the cached file disappears.

How to fix:

1. Check whether agy is installed: `agy --version` in a terminal. On Windows, find its location with `Get-Command agy`.
2. Set `agyQuota.agyPath` in user settings to the absolute path of that file (for example `C:\Users\<name>\AppData\Local\agy\bin\agy.exe`).
3. If you just installed agy, restart VS Code so it picks up the new `PATH`.

If agy is updating itself at the moment of a refresh, a "file not found" error while the cached file still exists is classified as a launch error ("Không khởi chạy được agy; tệp vẫn tồn tại." - Could not launch agy; the file still exists.), not as "agy not found", and usually clears on the next refresh.

### 5.2. Not logged in, or login session expired

Expected symptoms: the bar shows `$(error) Quota agy: lỗi` (error) (or old numbers with the stale marker), and the tooltip shows the first line of agy's error message.

The related error strings found in the `agy.exe` 1.4.12 binary (extracted by static string scanning):

- `Error: authentication required. Run 'agy' to log in.`
- `You are not logged into Antigravity.`
- `Failed to retrieve user quota summary: <error details>`
- `no quota summary is available for this account`

> [!IMPORTANT]
> These strings have NOT been verified by an actual run. It is unknown whether, when not logged in, `agy -p "/usage"` writes to stdout or stderr, what the exit code is, and whether agy opens a browser or waits for input. If agy waits for input, the run ends with a timeout error.

How to fix: open a terminal, run `agy` (interactive mode) to log in, then run "Quota agy: Làm mới quota" (Refresh quota).

### 5.3. Stale data

Symptoms: the `$(history)` icon before the numbers on the bar, and a "Dữ liệu cũ." (Stale data.) line with a reason in the tooltip.

Cause: the latest refresh failed, or the data is older than 2 times `refreshInterval` (typically after sleep). The old numbers stay visible for reference.

How to fix:

- Check the reason in the tooltip or the log.
- Timeout (`Hết thời gian chờ (45 giây).` - Timed out (45 seconds).): agy usually takes about 4 seconds, so the 45-second default is generous; if it still times out, check the network and try the agy command in a terminal. You can increase `agyQuota.timeout`.
- Error "Kết quả không phải lệnh usage thành công không có lượt gọi model." (The result is not a successful usage command without model turns.): agy returned something other than the `/usage` command result (for example, a conversation turn with the model, or a `status` other than `SUCCESS`). A newer agy may have changed or removed the `/usage` command. Check `agy --version` and try the command in a terminal; the extension automatically backs off to avoid consuming quota.
- After fixing the problem, run "Quota agy: Làm mới quota" (Refresh quota).

### 5.4. .cmd and .bat files are not supported (Windows)

If `agyQuota.agyPath` points to something without an `.exe` extension (for example `.cmd`, `.bat`, or a directory), the extension reports the error "Trên Windows chỉ hỗ trợ tệp .exe, không hỗ trợ thư mục hoặc đuôi khác." (On Windows only .exe files are supported, not directories or other extensions.), classified as "agy not found". Reason: the extension spawns agy directly without a shell (to avoid command injection and console windows), and Node.js cannot run `.cmd`/`.bat` files that way. When auto-detecting on `PATH`, the extension likewise looks only for `agy.exe`.

How to fix: point `agyQuota.agyPath` at `agy.exe` itself (usually `%LOCALAPPDATA%\agy\bin\agy.exe`), not at a shim or wrapper script.

## 6. Verification status

The code was written with the help of AI assistants (Claude Code, Codex, Gemini), coordinated and reviewed by the author. Nobody other than the author has tested the extension on another machine yet.

Tested environment: Windows 11, agy 1.4.12, Node 26, the author's machine.

Automated tests:

```powershell
npm test
```

This runs `node --test test/*.test.js`; latest run: 165 tests, 165 passed, 0 failed. All tests use fake processes and never call the real agy; tests that write real files write only to the operating system's temporary directory (`os.tmpdir()`).

Measured by running the real agy on the author's machine, from a plain Node script (not the extension host; details in [docs/SPIKE.md](docs/SPIKE.md)):

- One valid refresh took 3,907 ms, exit code 0, empty stderr, no hang with stdin closed immediately.
- agy's child process tree: `cmd.exe`, 3 `node.exe`, `conhost.exe`, `cmd.exe`, `agy.exe`. None had a visible window (`MainWindowHandle` = 0). None were left behind after agy exited.
- `--settings '{"mcpServers":{}}'` (inline or as a file path) was rejected by agy after 165 ms, exit code 1. There is no flag to disable MCP for a single run.
- Timeout (500 ms in the test) followed by `taskkill /PID <pid> /T /F`: the whole tree was killed after about 0.7 seconds, with no orphaned processes.
- The `--disable-slash-commands` flag is forbidden in the extension because it causes `/usage` to be sent to the model, consuming quota and creating a conversation (section 2).

Packaged and installed in VS Code:

- `@vscode/vsce` 3.6.0 packaged the extension successfully: a 25.6 KB package with 11 files, including `LICENSE`, `package.json`, the readme, and 6 files under `src`.
- The package was installed into a real VS Code. In a running VS Code window, the extension activated on its own (`onStartupFinished`) and its first refresh succeeded (3,332 ms, 4 valid limits, exit code 0); `state.json` was written correctly, and no lock file or temporary file was left behind.

NOT yet verified:

1. Visual observation in VS Code: the bar, background colors, the table tooltip, the detail list, notifications, and whether a console window flashes (the window measurement above ran from plain Node, not the extension host). Not yet run in Antigravity IDE.
2. The VS Code version Antigravity IDE is based on, i.e. whether the extension (which requires VS Code 1.90 or later) installs and runs in Antigravity IDE; the `antigravity-ide --install-extension` command has not been tried.
3. macOS and Linux (including agy's default install location and killing the process group with signals on those systems; there the extension only looks for `agy` on `PATH` or via `agyQuota.agyPath`).
4. Output and exit code when not logged in or when the token has expired (section 5.2).
5. Several independent OS processes contending for `state.lock` at the same time (the tests only simulate two windows inside one Node process, on a real file system).
6. Antivirus software or indexers holding files while the temporary file is renamed to `state.json`; the extension does not retry the rename step separately.
7. Output when a model group reaches 0%, when the account has a third model group, or while agy is updating itself.
8. Whether agy prints extra non-JSON lines to stdout in some situations (if it does, the extension reports an error because parsing is strict).
9. CPU and battery usage per refresh.
10. Behavior with Remote SSH, WSL, and Dev Containers.

## 7. License

MIT. See the `LICENSE` file.
