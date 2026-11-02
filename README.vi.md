[English](README.md) | Tiếng Việt

# agy-quota-bar (Quota agy)

Tiện ích VS Code hiện quota Antigravity còn lại trên thanh trạng thái. Số liệu lấy từ `agy` CLI, không cần mở Antigravity IDE.

## 1. Mục đích

Tiện ích hiện số quota còn lại của từng nhóm model (Gemini; Claude/GPT) theo giới hạn 5 giờ và giới hạn tuần, cảnh báo khi xuống thấp, và cho biết giờ quota được làm mới (reset).

Khác tiện ích cũ `clhome.antigravity-quota-yufeng`:

| | Tiện ích cũ | agy-quota-bar |
|---|---|---|
| Nguồn dữ liệu | Language server của Antigravity IDE | Lệnh `agy` CLI |
| Khi tắt Antigravity IDE | Hỏng, không còn số liệu | Vẫn chạy bình thường |
| Phụ thuộc | Antigravity IDE đang chạy | Chỉ cần `agy` đã cài và đã đăng nhập |
| Nơi cài | Antigravity IDE | VS Code hoặc Antigravity IDE |

Lệnh `agy -p` không khởi động language server của Antigravity IDE, nên tiện ích không phụ thuộc IDE đó.

## 2. Cách hoạt động

Mỗi lần làm mới, tiện ích chạy:

```
agy --output-format json -p "/usage"
```

Lệnh chạy trực tiếp (không qua shell), với tùy chọn ẩn cửa sổ (`windowsHide`), thư mục làm việc là thư mục nhà, biến môi trường `NO_COLOR=1`, giới hạn đầu ra 256 KiB, và stdin được đóng ngay. Tiện ích đọc kết quả JSON (trường `command.data.groups`, có tỷ lệ còn lại dạng số thực); nếu thiếu trường đó thì dùng bản văn bản dạng bảng TAB trong trường `response`, nhưng chỉ khi `conversation_id` có mặt và đúng bằng chuỗi rỗng. Stdout phải chứa một đối tượng JSON; khoảng trắng hoặc dòng trắng trước và sau được chấp nhận, còn nội dung khác ngoài JSON thì coi là lỗi.

`/usage` là lệnh nội bộ của agy, không phải lời nhắc gửi model. Số liệu đo trên máy tác giả, Windows 11, agy 1.4.12:

| Điều kiểm | Kết quả đo |
|---|---|
| Mã thoát, kênh ghi | Luôn 0; kết quả ở stdout, stderr rỗng |
| Thời gian chạy | Khoảng 4 giây mỗi lần (3 907 ms khi chạy từ Node; 2,6-3,5 giây qua hơn 15 lần chạy khác) |
| Gọi model | Không: `num_turns` = 0, `conversation_id` rỗng, mọi trường token trong `usage` bằng 0 |
| Tiêu hao quota | Không: `remaining_fraction` của nhóm Gemini giữ nguyên tới chữ số thập phân thứ 16 qua 7 lần gọi liên tiếp |
| Tạo hội thoại | Không: thư mục `conversations` và `last_conversations.json` không đổi |
| Phụ thuộc thư mục làm việc | Không: chạy ở `C:\Windows\Temp` cho cùng kết quả |

> [!WARNING]
> Tiện ích không bao giờ truyền cờ `--disable-slash-commands`. Với cờ này, agy gửi chuỗi `/usage` cho model như một lời nhắc thường: trong lần đo trên máy tác giả, lần chạy mất 33,4 giây, tạo một hội thoại mới, tiêu token của model và trả về văn xuôi thay cho bảng quota. Để phòng trường hợp agy bản sau bỏ lệnh `/usage` (cũng dẫn tới việc gửi chuỗi đó cho model), tiện ích chỉ nhận kết quả khi `command.name` là `usage`, `num_turns` bằng 0, `conversation_id` không có giá trị truthy (chuỗi rỗng, vắng mặt, `null`, `false` và `0` đều vượt qua bước kiểm tra này) và `status` (nếu có) là `SUCCESS`. Không thỏa thì báo lỗi loại "kết quả không mong đợi" và giãn dần khoảng làm mới (mục 5) để không tiêu quota đều đặn. Nếu bạn tự chạy lệnh trên trong terminal, đừng thêm cờ này.

## 3. Cam kết và giới hạn

Tiện ích:

- Không tự mở kết nối mạng.
- Không đọc credential (token, mật khẩu) của agy hay của bạn.
- Không gửi telemetry.
- Chỉ ghi vào thư mục lưu trữ VS Code cấp riêng cho tiện ích (`globalStorageUri`): tệp trạng thái `state.json`, tệp khóa `state.lock` và các tệp tạm khi ghi (mục 4.7).

Nhưng `agy`, chương trình tiện ích gọi, thì:

- Có truy cập mạng: nó lấy số liệu quota từ máy chủ Antigravity.
- Luôn khởi động mọi MCP server bạn đã cấu hình cho agy, ở MỖI lần làm mới. Trên máy thử, cây tiến trình con của agy đo được gồm `cmd.exe`, 3 `node.exe`, `conhost.exe`, `cmd.exe`, `agy.exe`; tất cả đã thoát khi agy thoát. Số và loại tiến trình phụ thuộc cấu hình MCP của bạn.
- Không có cách tắt MCP cho riêng lần chạy `/usage`: agy từ chối `--settings '{"mcpServers":{}}'` ngay lập tức với lỗi `Error: --settings: unknown setting "mcpServers"` (mã thoát 1). Vì vậy tiện ích không dùng cờ `--settings`.
- Có thể ghi vào thư mục `~\.gemini` của agy (nhật ký, bộ nhớ đệm). Với `/usage`, không thấy hội thoại mới nào được tạo.

Chi phí mỗi lần làm mới vì thế là khoảng 4 giây chạy agy cùng các tiến trình MCP ngắn hạn. Với mặc định 300 giây, mỗi giờ có tối đa khoảng 12 lần như vậy (ít hơn nếu nhiều cửa sổ dùng chung kết quả, xem mục 4.7).

Số liệu hiển thị là của tài khoản agy đang đăng nhập. Tiện ích không biết đó là tài khoản nào; đổi tài khoản agy thì số liệu đổi theo ở lần làm mới sau.

## 4. Sử dụng

### 4.1. Yêu cầu

- VS Code 1.90 trở lên, hoặc Antigravity IDE (chưa kiểm phiên bản VS Code gốc của Antigravity IDE, xem mục 6).
- `agy` CLI đã cài và đã đăng nhập trên chính máy chạy VS Code. Đã kiểm với agy 1.4.12.
- Trên Windows, `agy` phải là tệp `agy.exe` (mục 5.4).
- Hệ điều hành đã kiểm: Windows 11. macOS và Linux chưa kiểm.

Kiểm tra nhanh trong terminal:

```powershell
agy --version
agy --output-format json -p "/usage"
```

Lệnh thứ hai phải in một dòng JSON có `"status":"SUCCESS"` và `"num_turns":0`.

### 4.2. Đóng gói và cài đặt

Tiện ích chưa được đăng trên Visual Studio Marketplace hay Open VSX. Có hai cách lấy gói `.vsix`.

Cách 1: tải gói dựng sẵn từ GitHub Releases. Ở trang Releases của https://github.com/XXLC/agy-quota-bar, tải tệp `agy-quota-bar-0.1.0.vsix`. Trước khi cài, đối chiếu mã băm SHA-256 của tệp với mã băm được đăng trong ghi chú phát hành:

```powershell
Get-FileHash agy-quota-bar-0.1.0.vsix -Algorithm SHA256
```

Cách 2: tự đóng gói từ mã nguồn (cần Git, Node.js và mạng để `npx` tải `@vscode/vsce`):

```powershell
git clone https://github.com/XXLC/agy-quota-bar.git
cd agy-quota-bar
npx @vscode/vsce package
```

Lệnh tạo tệp `agy-quota-bar-0.1.0.vsix`. Dự án không có phụ thuộc npm nên không cần `npm install` trước. Tệp `.vscodeignore` loại tài liệu nội bộ, tài liệu kiểm chứng, kiểm thử, dữ liệu Git và các gói VSIX khỏi gói.

Cài vào VS Code:

```powershell
code --install-extension agy-quota-bar-0.1.0.vsix
```

Cài vào Antigravity IDE (tệp lệnh nằm ở `%LOCALAPPDATA%\Programs\Antigravity IDE\bin\antigravity-ide.cmd`; nếu thư mục `bin` đó không có trong `PATH` thì gọi bằng đường dẫn đầy đủ):

```powershell
antigravity-ide --install-extension agy-quota-bar-0.1.0.vsix
```

Hoặc trong giao diện của cả hai: khung Extensions, menu `...`, chọn "Install from VSIX...", chọn tệp `.vsix`.

Tiện ích kích hoạt sau khi cửa sổ khởi động xong (`onStartupFinished`), không làm chậm lúc mở. Tiện ích vẫn chạy trong chế độ Restricted Mode (thư mục chưa tin cậy).

### 4.3. Cấu hình

Mở Settings, tìm `agyQuota`. Đổi cấu hình được áp dụng ngay, không cần tải lại cửa sổ; đổi `agyQuota.agyPath` thì làm mới ngay.

| Khóa | Mặc định | Miền giá trị | Ý nghĩa |
|---|---|---|---|
| `agyQuota.agyPath` | rỗng | Đường dẫn tệp | Đường dẫn TUYỆT ĐỐI tới tệp `agy` (Windows: chỉ tệp `.exe`). Rỗng thì tự tìm (mục 5.1). Khóa có `scope: machine`: chỉ đặt được trong cài đặt người dùng, không đặt được từ cài đặt workspace hay thư mục, để dự án lạ không thể bắt tiện ích chạy tệp tùy ý. |
| `agyQuota.refreshInterval` | 300 | 60-3600 (giây) | Khoảng giữa hai lần làm mới tự động. |
| `agyQuota.timeout` | 45 | 5-300 (giây) | Thời gian chờ tối đa một lần chạy agy. Hết giờ thì giết agy cùng mọi tiến trình con của nó. |
| `agyQuota.warningThreshold` | 30 | 0-100 (%) | Còn lại nhỏ hơn hoặc bằng giá trị này là mức cảnh báo. |
| `agyQuota.criticalThreshold` | 10 | 0-100 (%) | Còn lại nhỏ hơn hoặc bằng giá trị này là mức nghiêm trọng. Nếu đặt lớn hơn ngưỡng cảnh báo thì dùng bằng ngưỡng cảnh báo. |
| `agyQuota.notificationEnabled` | true | true/false | Bật thông báo khi quota đổi mức (mục 4.6). Tắt thì tiện ích vẫn theo dõi và lưu mức, chỉ không bật thông báo; bật lại không bị dồn thông báo cũ. |

Giá trị số ngoài miền được kẹp về giới hạn gần nhất; giá trị không phải số thì dùng mặc định.

### 4.4. Lệnh

Mở Command Palette (`Ctrl+Shift+P`), gõ "Quota agy":

| Lệnh | Tác dụng |
|---|---|
| Quota agy: Làm mới quota | Chạy agy ngay, kể cả khi kết quả còn mới hoặc cửa sổ khác đang chạy, và đưa số lỗi liên tiếp về 0 (hết giãn khoảng làm mới). Nếu chính cửa sổ này đang chạy agy thì chờ lượt đó. Nếu không lấy được khóa tệp trạng thái sau 5 lượt thử thì không chạy và ghi cảnh báo vào nhật ký. |
| Quota agy: Xem chi tiết | Mở danh sách chi tiết từng giới hạn theo nhóm, cuối danh sách có hai thao tác `$(refresh) Làm mới ngay` và `$(output) Mở nhật ký`. Bấm vào mục trên thanh trạng thái cũng mở danh sách này. |
| Quota agy: Mở nhật ký | Mở kênh Output "Quota agy". |

### 4.5. Đọc thanh trạng thái và tooltip

Mục nằm bên phải thanh trạng thái, tên "Quota Antigravity" (dùng tên này để ẩn/hiện qua menu chuột phải của thanh).

Mỗi nhóm hiện phần trăm THẤP NHẤT trong các giới hạn của nhóm, vì đó là lượng thực sự dùng được. Nếu giới hạn thấp nhất là giới hạn tuần thì có chữ ` tuần` phía sau. Phần trăm luôn làm tròn xuống (9,9% hiện 9%), và ngưỡng được so với đúng số đang hiện. Giới hạn đã qua giờ reset không tham gia chọn số thấp nhất khi nhóm còn giới hạn khác chưa qua giờ reset.

Màu nền: vàng (màu cảnh báo của theme) khi có số đang hiện ở mức cảnh báo, đỏ (màu lỗi của theme) khi có số ở mức nghiêm trọng.

| Tình huống | Chữ trên thanh (ví dụ) |
|---|---|
| Đang lấy số liệu lần đầu | `$(sync~spin) Quota agy` |
| Bình thường | `Gemini 91% \| Claude/GPT 85% tuần` |
| Có giới hạn ở mức nghiêm trọng | `Gemini 61% tuần \| Claude/GPT 8% tuần` (nền đỏ với ngưỡng mặc định) |
| Mọi giới hạn của nhóm đã qua giờ reset, chờ làm mới | `Gemini ?% \| Claude/GPT 92%` (`?%` không tô màu) |
| Đang làm mới thủ công | thêm `$(sync~spin)` ở đầu |
| Dữ liệu cũ | `$(history) Gemini 91% \| Claude/GPT 92%` |
| Dữ liệu cũ, đang làm mới thủ công | `$(sync~spin) $(history) Gemini 91% \| Claude/GPT 92%` |
| Lỗi, chưa có dữ liệu | `$(error) Quota agy: lỗi` |
| Không tìm thấy agy | `$(error) Quota agy: không tìm thấy agy` |

(`$(...)` là biểu tượng codicon của VS Code; dấu `\|` trong bảng là ký tự `|` trên thanh.)

Di chuột lên mục để xem tooltip. Ví dụ ứng với dòng "nghiêm trọng" ở trên, lúc 00:21 thứ Ba ngày 03/11. Khối dưới đây là hình dung tooltip SAU KHI VS Code đã hiển thị (render) Markdown, căn cột cho dễ đọc; nó không phải chuỗi Markdown thô mà tiện ích tạo ra. Trong tooltip thật, nội dung là một bảng Markdown, dòng tiêu đề "Quota Antigravity" và ô ở mức nghiêm trọng được in đậm.

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

- Ô ở mức cảnh báo có thêm chữ "(cảnh báo)"; ô ở mức nghiêm trọng có "(nghiêm trọng)" và in đậm.
- "Reset lúc" là giờ địa phương dạng `giờ:phút thứ ngày/tháng` (CN, T2 ... T7), ví dụ `02:48 T3 03/11` (mục 4.10).
- "Còn" là thời gian tới lúc reset: `X ngày Y giờ`, `X giờ Y phút`, `Y phút`, `dưới 1 phút`, hoặc `đã đến giờ reset`. Không có giờ reset thì cả hai cột hiện "không rõ".
- "Cập nhật lúc" kèm `vừa xong` (dưới 1 phút) hoặc `N phút trước`.
- Khi dữ liệu cũ, dưới tiêu đề có một dòng bắt đầu bằng biểu tượng `$(history)` và chữ in đậm "Dữ liệu cũ.", kèm lý do: lần làm mới gần nhất thất bại (ví dụ `Lần làm mới lúc 00:21 thất bại: Hết thời gian chờ (45 giây).`, với thông điệp lỗi đã làm sạch), hoặc "Đã quá thời hạn cập nhật.".
- Khi chưa có dữ liệu, tooltip hiện "Đang đọc quota." hoặc một dòng bắt đầu bằng biểu tượng `$(error)` chứa thông điệp lỗi, kèm gợi ý `Chạy lệnh "Quota agy: Mở nhật ký" để xem chi tiết.`
- Thanh và tooltip được vẽ lại mỗi 60 giây nên đếm ngược luôn đúng, kể cả khi chưa tới lượt làm mới.

Trong danh sách chi tiết (lệnh "Quota agy: Xem chi tiết"), mỗi giới hạn là một dòng như `Tuần: 61%` kèm mô tả `reset 06:24 T7 07/11, còn 4 ngày 6 giờ`; giới hạn ở mức cảnh báo hoặc nghiêm trọng có biểu tượng `$(warning)` hoặc `$(error)` đứng trước (ví dụ `$(error) Tuần: 8% (nghiêm trọng)`). Tiêu đề danh sách là `Quota Antigravity - cập nhật 00:21`, thêm ` (dữ liệu cũ)` khi dữ liệu cũ. Khi chưa có dữ liệu và có lỗi, danh sách có một dòng bắt đầu bằng `$(error)` chứa thông điệp lỗi.

### 4.6. Thông báo

Tiện ích nhớ mức (bình thường, cảnh báo, nghiêm trọng) của từng giới hạn trong `state.json`, kể cả qua lần khởi động lại VS Code, và chỉ thông báo khi mức đổi:

| Mức trước | Mức mới | Thông báo |
|---|---|---|
| (chưa có) | bình thường | Không |
| (chưa có) | cảnh báo hoặc nghiêm trọng | Có, một lần |
| bình thường | cảnh báo | Có (cảnh báo) |
| bình thường hoặc cảnh báo | nghiêm trọng | Có (lỗi) |
| nghiêm trọng | cảnh báo | Không |
| cảnh báo hoặc nghiêm trọng | bình thường | Có (đã hồi phục) |
| giữ nguyên | giữ nguyên | Không |

- Một lần làm mới tối đa một thông báo; nhiều thay đổi được gộp, dùng loại nặng nhất. Ví dụ: `Quota Antigravity: Claude/GPT (5 giờ) còn 9%, reset 05:16 T3 03/11; Gemini (5 giờ) đã hồi phục, còn 100%.`
- Chỉ cửa sổ vừa thực sự chạy agy mới bật thông báo, sau khi đã lưu mức mới vào tệp dùng chung; các cửa sổ khác chỉ cập nhật thanh.
- Giới hạn đã qua giờ reset (hiện `?%`) không làm đổi mức. Giới hạn biến mất khỏi kết quả agy thì bị quên, không thông báo.
- Không tìm thấy agy (kể cả khi `agyQuota.agyPath` sai hoặc không phải `.exe` trên Windows): một thông báo lỗi mỗi lần kích hoạt tiện ích trong cửa sổ, có nút "Mở cài đặt" đưa tới `agyQuota.agyPath`.
- Các lỗi khác chỉ hiện trên thanh, tooltip và nhật ký, không bật thông báo.

### 4.7. Nhiều cửa sổ

Mọi cửa sổ của cùng một ứng dụng dùng chung thư mục `globalStorageUri` của tiện ích, gồm:

- `state.json`: kết quả lần làm mới gần nhất, thời điểm thử và thành công gần nhất, lỗi gần nhất, số lỗi liên tiếp, mức đã thông báo, và đánh dấu "đang chạy" (`runningSince`).
- `state.lock`: khóa cho mỗi lần đọc-ghi `state.json`, tạo độc quyền và chỉ giữ vài mili giây (không giữ trong lúc agy chạy). Khóa bận thì thử tối đa 5 lượt, chờ 50, 100, 200, 400 mili giây giữa các lượt. Khóa cũ hơn 30 giây (ví dụ extension host chết giữa chừng) được coi là mồ côi và thu hồi: đổi sang tên duy nhất rồi xóa.
- Tệp tạm `state.json.<pid>.<chuỗi ngẫu nhiên>.tmp`: mỗi lần ghi, tiện ích ghi tệp tạm rồi đổi tên thành `state.json`, sau đó dọn tệp tạm.

Cách các cửa sổ phối hợp:

- Mỗi 60 giây, cửa sổ lấy khóa và đọc `state.json`. Nếu có lượt chạy còn lease hợp lệ (đánh dấu mới hơn `timeout` + 5 giây), cửa sổ dùng kết quả trong tệp. Nếu không, cửa sổ làm mới khi chưa từng thử, đã hết khoảng làm mới hiện tại (kể cả giãn do lỗi), có mốc reset đã qua kể từ lần thử trước, hoặc đồng hồ lùi về trước lần thử gần nhất. Khi làm mới, cửa sổ ghi đánh dấu "đang chạy", nhả khóa, chạy agy, rồi lấy khóa lần nữa để ghi kết quả.
- Vì quyết định và đánh dấu nằm trong cùng một lần giữ khóa, mở nhiều cửa sổ vẫn chỉ có một lần chạy agy tự động mỗi chu kỳ (lệnh làm mới thủ công thì luôn chạy thêm).
- Lỗi của một lượt chạy chậm không ghi đè kết quả thành công mới hơn của cửa sổ khác.
- Nếu không ghi được kết quả sau 5 lượt thử khóa, cửa sổ vẫn hiện kết quả vừa lấy và ghi cảnh báo vào nhật ký.
- Đóng hoặc tải lại cửa sổ lúc nó đang chạy agy: tiện ích hủy lượt chạy, giết cả cây tiến trình agy (chờ tối đa 2,5 giây), gỡ đánh dấu "đang chạy" và khôi phục thời điểm thử trước đó. Lượt bị hủy không ghi lỗi vào tệp dùng chung và không tính là lỗi liên tiếp, nên cửa sổ khác có thể chạy ngay khi đến hạn.

VS Code và Antigravity IDE cấp cho tiện ích hai thư mục lưu trữ riêng, nên không dùng chung kết quả. Cài tiện ích vào cả hai thì mỗi chu kỳ agy chạy hai lần (mỗi ứng dụng một lần), và thông báo đổi mức xuất hiện ở cả hai.

Khi dùng Remote SSH, WSL hay Dev Container, tiện ích được khai báo chạy ở máy cục bộ (`extensionKind: ui`, nơi có agy), không chạy ở máy từ xa.

### 4.8. Sau khi máy ngủ hoặc ngủ đông

- Mỗi 60 giây tiện ích kiểm xem đã tới hạn làm mới chưa, nên sau khi máy thức tối đa khoảng 60 giây là có lần làm mới nếu đã quá hạn.
- Cũng làm mới khi một giới hạn vừa qua giờ reset mà lần thử gần nhất diễn ra trước giờ đó. Mỗi mốc reset chỉ kích đúng một lần thử, kể cả khi đang giãn khoảng làm mới do lỗi.
- Số liệu cũ hơn 2 lần `refreshInterval` (thường gặp ngay sau khi thức) được đánh dấu là dữ liệu cũ, vẫn hiển thị chứ không bị xóa.
- Lần làm mới đầu sau khi thức có thể lỗi nếu mạng chưa lên; thanh giữ số cũ kèm dấu dữ liệu cũ, và lần sau sẽ thử lại.
- Đồng hồ hệ thống bị lùi về trước lần thử gần nhất cũng kích hoạt làm mới.

### 4.9. Nhật ký

Kênh Output "Quota agy" ghi mỗi lần chạy agy: thành công (thời gian chạy, số giới hạn đọc được, mã thoát, `nguồn: agy`) hoặc lỗi (loại lỗi và thông điệp). Khi cửa sổ dùng kết quả mới do cửa sổ khác lấy, ghi một dòng có `nguồn: bộ nhớ đệm (cửa sổ khác, N giây trước)`, chỉ một lần cho mỗi kết quả mới. Các cảnh báo về khóa bận, không ghi được kết quả, hoặc không giết được cây tiến trình cũng ghi ở đây.

Ví dụ thông điệp:

```
Làm mới: thành công, 3332 ms, 4 mốc hợp lệ, mã thoát 0, nguồn: agy
Làm mới: nguồn: bộ nhớ đệm (cửa sổ khác, 42 giây trước).
Làm mới: lỗi timeout, Hết thời gian chờ (45 giây).
```

Nhật ký lần thành công không chứa đầu ra thô của agy. Thông điệp lỗi chỉ lấy dòng đầu không rỗng của đầu ra, tối đa 200 ký tự, sau khi bỏ mã màu và ký tự điều khiển, che email, chuỗi trông như token (`eyJ...`, `ya29.`, `Bearer ...`, `Basic ...`), giá trị các tham số URL nhạy cảm (`token`, `key`, `secret`, `password`, `code` và tương tự), và mọi chuỗi liền từ 24 ký tự chữ, số và ký hiệu `_-./+=` trở lên. Phần bị che được thay bằng `[đã che]`.

### 4.10. Ngôn ngữ

Giao diện mặc định là tiếng Anh, và là tiếng Việt khi ngôn ngữ hiển thị của VS Code là tiếng Việt.

- Ngôn ngữ được chọn một lần, lúc tiện ích kích hoạt, theo `vscode.env.language`: giá trị `vi` hoặc bắt đầu bằng `vi-` (ví dụ `vi-VN`, không phân biệt hoa thường) thì dùng tiếng Việt; mọi giá trị khác dùng tiếng Anh. Sau khi đổi ngôn ngữ hiển thị của VS Code, cần khởi động lại VS Code để tiện ích dùng ngôn ngữ mới.
- Ngôn ngữ áp dụng cho chữ và tên mục trên thanh trạng thái, tooltip, danh sách chi tiết, thông báo, thông điệp lỗi và các thông điệp trong kênh Output "Quota agy". Tên lệnh và mô tả cấu hình được dịch qua `package.nls.json` (tiếng Anh) và `package.nls.vi.json` (tiếng Việt).
- Định dạng giờ reset: tiếng Anh `Tue 03 Nov 02:48`, tiếng Việt `02:48 T3 03/11`.
- Thông điệp lỗi đã lưu trong `state.json` giữ ngôn ngữ lúc lưu, nên ngay sau khi đổi ngôn ngữ hiển thị, một lỗi cũ có thể vẫn hiện bằng ngôn ngữ trước cho tới khi lần làm mới sau thay nó.
- Chữ do chính agy in ra (dòng đầu đầu ra của agy, hiện trong thông điệp lỗi) được giữ nguyên như agy in, không được dịch.
- Chú thích trong mã và tên kiểm thử bằng tiếng Việt.

## 5. Khắc phục sự cố

Bước đầu cho mọi lỗi: chạy "Quota agy: Mở nhật ký", rồi thử trong terminal `agy --output-format json -p "/usage"`.

Giãn khoảng làm mới khi lỗi lặp lại: từ lần lỗi liên tiếp thứ 3, khoảng làm mới tự nhân đôi sau mỗi lần lỗi (ví dụ với mặc định 300 giây: 600, 1 200, 2 400 giây), trần 3600 giây. Mỗi mốc reset đã qua vẫn kích đúng một lần thử. Một lần làm mới thành công, hoặc lệnh "Quota agy: Làm mới quota", đưa khoảng làm mới về bình thường.

### 5.1. Không tìm thấy agy

Dấu hiệu: thanh hiện `$(error) Quota agy: không tìm thấy agy`, một thông báo lỗi có nút "Mở cài đặt".

Nếu `agyQuota.agyPath` có giá trị, tiện ích chỉ dùng đường dẫn đó và yêu cầu: là đường dẫn tuyệt đối, tồn tại và là tệp; trên Windows phải có đuôi `.exe`. Không thử thêm nơi nào khác.

Nếu `agyQuota.agyPath` rỗng, tiện ích tìm theo thứ tự: từng thư mục trong `PATH` (`agy.exe` trên Windows, `agy` nơi khác; mục `PATH` không phải đường dẫn tuyệt đối bị bỏ qua), rồi `%LOCALAPPDATA%\agy\bin\agy.exe` (chỉ Windows). Kết quả được nhớ, và tìm lại khi đổi `agyQuota.agyPath` hoặc khi tệp đã nhớ biến mất.

Cách xử lý:

1. Kiểm agy có cài chưa: `agy --version` trong terminal. Trên Windows, xem vị trí bằng `Get-Command agy`.
2. Đặt `agyQuota.agyPath` thành đường dẫn tuyệt đối của tệp đó trong cài đặt người dùng (ví dụ `C:\Users\<tên>\AppData\Local\agy\bin\agy.exe`).
3. Nếu vừa cài agy, khởi động lại VS Code để nó nhận `PATH` mới.

Nếu agy đang tự cập nhật đúng lúc làm mới, lỗi "không tìm thấy tệp" khi tệp đã nhớ vẫn tồn tại được xếp là lỗi khởi chạy ("Không khởi chạy được agy; tệp vẫn tồn tại."), không phải "không tìm thấy agy", và thường hết ở lần sau.

### 5.2. Chưa đăng nhập hoặc phiên đăng nhập hết hạn

Dấu hiệu dự kiến: thanh hiện `$(error) Quota agy: lỗi` (hoặc số cũ kèm dấu dữ liệu cũ), tooltip có dòng đầu thông báo lỗi của agy.

Các chuỗi lỗi liên quan có trong tệp `agy.exe` 1.4.12 (trích bằng quét chuỗi tĩnh):

- `Error: authentication required. Run 'agy' to log in.`
- `You are not logged into Antigravity.`
- `Failed to retrieve user quota summary: <chi tiết lỗi>`
- `no quota summary is available for this account`

> [!IMPORTANT]
> Các chuỗi trên CHƯA được kiểm bằng chạy thật. Chưa biết khi chưa đăng nhập thì `agy -p "/usage"` ghi ra stdout hay stderr, mã thoát là bao nhiêu, và agy có tự mở trình duyệt hay chờ nhập liệu không. Nếu agy chờ nhập liệu, lần chạy sẽ kết thúc bằng lỗi hết thời gian chờ.

Cách xử lý: mở terminal, chạy `agy` (chế độ tương tác) để đăng nhập, rồi chạy "Quota agy: Làm mới quota".

### 5.3. Dữ liệu cũ

Dấu hiệu: biểu tượng `$(history)` trước số trên thanh, tooltip có dòng "Dữ liệu cũ." kèm lý do.

Nguyên nhân: lần làm mới gần nhất thất bại, hoặc số liệu cũ hơn 2 lần `refreshInterval` (thường sau khi máy ngủ). Số cũ vẫn hiển thị để bạn còn tham khảo.

Cách xử lý:

- Xem lý do trong tooltip hoặc nhật ký.
- Hết thời gian chờ (`Hết thời gian chờ (45 giây).`): agy thường chạy khoảng 4 giây nên mặc định 45 giây là dư; nếu vẫn hết giờ, kiểm mạng và thử lệnh agy trong terminal. Có thể tăng `agyQuota.timeout`.
- Lỗi "Kết quả không phải lệnh usage thành công không có lượt gọi model.": agy trả kết quả không phải của lệnh `/usage` (ví dụ có lượt hội thoại với model, hoặc `status` khác `SUCCESS`). Có thể agy bản mới đã đổi hoặc bỏ lệnh `/usage`. Kiểm `agy --version` và chạy thử lệnh trong terminal; tiện ích tự giãn khoảng làm mới để tránh tiêu quota.
- Sau khi khắc phục, chạy "Quota agy: Làm mới quota".

### 5.4. Tệp .cmd hoặc .bat không được hỗ trợ (Windows)

Nếu `agyQuota.agyPath` trỏ tới tệp không có đuôi `.exe` (ví dụ `.cmd`, `.bat`, hoặc một thư mục), tiện ích báo lỗi "Trên Windows chỉ hỗ trợ tệp .exe, không hỗ trợ thư mục hoặc đuôi khác." (xếp vào loại "không tìm thấy agy"). Lý do: tiện ích chạy agy trực tiếp không qua shell (để tránh chèn lệnh và cửa sổ console), và Node.js không chạy được `.cmd`/`.bat` theo cách đó. Khi tự tìm trên `PATH`, tiện ích cũng chỉ tìm `agy.exe`.

Cách xử lý: trỏ `agyQuota.agyPath` tới chính `agy.exe` (thường ở `%LOCALAPPDATA%\agy\bin\agy.exe`), không trỏ tới shim hay script bọc.

## 6. Tình trạng kiểm chứng

Mã được viết với sự hỗ trợ của các trợ lý AI (Claude Code, Codex, Gemini) dưới sự điều phối và kiểm tra của tác giả. Chưa có ai ngoài tác giả kiểm tiện ích trên máy khác.

Môi trường đã kiểm: Windows 11, agy 1.4.12, Node 26, máy của tác giả.

Kiểm thử tự động:

```powershell
npm test
```

Lệnh chạy `node --test test/*.test.js`; lần chạy cuối: 174 kiểm thử, 174 đạt, 0 lỗi. Mọi kiểm thử dùng tiến trình giả, không gọi agy thật; các kiểm thử có ghi tệp thật chỉ ghi vào thư mục tạm của hệ điều hành (`os.tmpdir()`).

Giao diện tiếng Anh và tiếng Việt được kiểm bằng kiểm thử: hai từ điển cùng khóa và cùng chỗ giữ chỗ, mọi khóa đều được mã dùng tới, hai tệp `package.nls` phủ đủ mọi tham chiếu trong `package.json`, và không có chữ tiếng Việt lọt vào locale tiếng Anh (thanh trạng thái, tooltip, danh sách chi tiết, thông báo, thông điệp lỗi và thông điệp nhật ký).

Đã đo bằng chạy agy thật trên máy tác giả, bằng script Node thường (không phải extension host; chi tiết ở [docs/SPIKE.vi.md](docs/SPIKE.vi.md)):

- Một lần làm mới hợp lệ mất 3 907 ms, mã thoát 0, stderr rỗng, không treo khi stdin được đóng ngay.
- Cây tiến trình con của agy: `cmd.exe`, 3 `node.exe`, `conhost.exe`, `cmd.exe`, `agy.exe`. Không tiến trình nào có cửa sổ hữu hình (`MainWindowHandle` = 0). Không tiến trình nào còn sót sau khi agy thoát.
- `--settings '{"mcpServers":{}}'` (nội tuyến hoặc đường dẫn tệp) bị agy từ chối sau 165 ms, mã thoát 1. Không có cờ tắt MCP cho riêng lần chạy.
- Hết thời gian chờ (500 ms trong phép thử) cộng `taskkill /PID <pid> /T /F`: cả cây bị giết sau khoảng 0,7 giây, không còn tiến trình mồ côi.
- Cờ `--disable-slash-commands` bị cấm trong tiện ích vì nó khiến `/usage` bị gửi cho model, tốn quota và tạo hội thoại (mục 2).

Đã đóng gói và cài thử trong VS Code (trên bản dựng trước khi bản địa hóa giao diện):

- `@vscode/vsce` 3.6.0 đóng gói thành công: gói 25,6 KB, 11 tệp, gồm `LICENSE`, `package.json`, readme và 6 tệp trong `src`. Mã nguồn hiện tại có thêm `src/i18n.js`, `src/messages.js`, `package.nls.json` và `package.nls.vi.json`, nên gói hiện tại có nhiều tệp hơn.
- Đã cài gói vào VS Code thật. Trong cửa sổ VS Code đang chạy, tiện ích tự kích hoạt (`onStartupFinished`) và lần làm mới đầu thành công (3 332 ms, 4 mốc hợp lệ, mã thoát 0); `state.json` được ghi đúng, không còn tệp khóa hay tệp tạm sót lại.

CHƯA kiểm chứng:

1. Quan sát bằng mắt trong VS Code, ở cả hai ngôn ngữ: hiển thị thanh, màu nền, tooltip dạng bảng, danh sách chi tiết, thông báo, tên lệnh và mô tả cấu hình, và có cửa sổ console nhấp nháy hay không (phép đo cửa sổ ở trên chạy từ Node thường, không phải extension host). Chưa chạy trong Antigravity IDE.
2. Phiên bản VS Code gốc của Antigravity IDE, tức tiện ích (yêu cầu VS Code từ 1.90) có cài và chạy được trong Antigravity IDE không; lệnh `antigravity-ide --install-extension` chưa được chạy thử.
3. macOS và Linux (kể cả vị trí cài mặc định của agy và việc giết nhóm tiến trình bằng tín hiệu trên hai hệ này; ở đó tiện ích chỉ tìm `agy` trên `PATH` hoặc theo `agyQuota.agyPath`).
4. Đầu ra và mã thoát khi chưa đăng nhập hoặc token hết hạn (mục 5.2).
5. Nhiều tiến trình hệ điều hành độc lập tranh khóa `state.lock` cùng lúc (kiểm thử chỉ mô phỏng hai cửa sổ trong cùng một tiến trình Node, trên hệ tệp thật).
6. Phần mềm diệt virus hoặc trình lập chỉ mục giữ tệp khi đổi tên tệp tạm thành `state.json`; tiện ích không thử lại riêng bước đổi tên.
7. Đầu ra khi một nhóm model về 0%, khi tài khoản có nhóm model thứ ba, hoặc khi agy đang tự cập nhật.
8. Agy có in thêm dòng ngoài JSON lên stdout trong một số tình huống không (nếu có, tiện ích sẽ báo lỗi vì phân tích chặt).
9. Mức tiêu thụ CPU và pin mỗi lần làm mới.
10. Hành vi khi dùng Remote SSH, WSL, Dev Container.

## 7. Giấy phép

MIT. Xem tệp `LICENSE`.
