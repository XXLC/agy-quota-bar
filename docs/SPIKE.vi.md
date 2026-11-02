[English](SPIKE.md) | Tiếng Việt

# Kết quả spike (đo trên máy tác giả, 03/11/2026)

Môi trường: Windows 11, agy 1.4.12, Node 26. Các phép đo chạy agy thật bằng một script Node và một script PowerShell quan sát tiến trình, không phải từ extension host của VS Code.

| Phép thử | Kết quả |
|---|---|
| Cơ sở (cách gọi của tiện ích: `--output-format json -p /usage`, windowsHide, cwd thư mục nhà, stdin.end()) | 3 907 ms, mã thoát 0, stdout 2 134 byte, stderr 0, usage hợp lệ (`command.name=usage`, `num_turns=0`), 2 nhóm x (weekly, 5h) |
| Cây tiến trình con của agy | cmd.exe, node.exe (x3), conhost.exe, cmd.exe, agy.exe; không có tiến trình nào có cửa sổ hữu hình (MainWindowHandle = 0); không còn tiến trình sót sau khi agy thoát |
| `--settings '{"mcpServers":{}}'` (nội tuyến hoặc đường dẫn tệp) | agy từ chối ngay (165 ms, mã 1): `Error: --settings: unknown setting "mcpServers"`. KHÔNG có cờ tắt MCP cho riêng lần chạy; mỗi lần làm mới agy luôn khởi động các MCP server đã cấu hình |
| Timeout 500 ms + `taskkill /PID <pid> /T /F` | 705 ms, taskkill mã 0; sau đó không có tiến trình cmd/node/conhost/agy mới nào còn sót so với trước khi chạy |

Chưa đo: quan sát bằng mắt có nhấp nháy cửa sổ khi chạy từ extension host thật của VS Code (script đo chạy từ Node thường, không phải extension host); mức tiêu thụ CPU/pin mỗi lần làm mới; chạy khi chưa đăng nhập hoặc token hết hạn.

Kết luận: không dùng `--settings`; giữ cách gọi ở dòng "Cơ sở"; chi phí mỗi lần làm mới khoảng 4 giây, kèm các tiến trình ngắn hạn được liệt kê trong bảng.
