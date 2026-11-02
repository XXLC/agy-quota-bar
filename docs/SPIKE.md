English | [Tiếng Việt](SPIKE.vi.md)

# Spike results (measured on the author's machine, 2026-11-03)

Environment: Windows 11, agy 1.4.12, Node 26. The measurements ran the real agy from a Node script plus a PowerShell script that observed processes, not from the VS Code extension host.

| Test | Result |
|---|---|
| Baseline (the extension's invocation: `--output-format json -p /usage`, windowsHide, cwd = home directory, stdin.end()) | 3,907 ms, exit code 0, stdout 2,134 bytes, stderr 0, valid usage result (`command.name=usage`, `num_turns=0`), 2 groups x (weekly, 5h) |
| agy's child process tree | cmd.exe, node.exe (x3), conhost.exe, cmd.exe, agy.exe; no process had a visible window (MainWindowHandle = 0); no process was left behind after agy exited |
| `--settings '{"mcpServers":{}}'` (inline or as a file path) | agy rejects it immediately (165 ms, exit code 1): `Error: --settings: unknown setting "mcpServers"`. There is NO flag to disable MCP for a single run; on every refresh agy always starts the configured MCP servers |
| 500 ms timeout + `taskkill /PID <pid> /T /F` | 705 ms, taskkill exit code 0; afterwards no new cmd/node/conhost/agy process was left behind compared with before the run |

Not measured: visual observation of window flashing when running from a real VS Code extension host (the measurement script ran from plain Node, not the extension host); CPU/battery usage per refresh; running while not logged in or with an expired token.

Conclusion: do not use `--settings`; keep the invocation from the "Baseline" row; each refresh costs about 4 seconds, plus the short-lived processes listed in the table.
