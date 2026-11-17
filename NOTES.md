# NOTES — IA#4 Release and Rollback (CSC13114)

**Sinh viên:** 23120319 — Trương Thành Phát  
**Môn học:** AWAD (CSC13114) — Phát triển ứng dụng Web nâng cao  

---

## 1. Ghi nhận về môi trường và công cụ thực thi (Environment & Tools Findings)

- **Môi trường chạy thực nghiệm:**
  - Hệ điều hành: Windows 11 Home, PowerShell 5.1 / 7.
  - Runtime: Node.js v22.13.1 (Corepack / npm 10.x).
  - Containerization: Docker Desktop (WSL 2 backend: Linux kernel 6.6.87.2-microsoft-standard-WSL2), Docker Engine v29.9.3, Docker Compose v5.7.0.
- **Fingerprint công cụ:** `4b56096c90ea819d` (khớp hoàn toàn với giá trị quy định trong Rubric và file `tools/FINGERPRINT`).
- **Khác biệt môi trường Windows / PowerShell:**
  1. *Cú pháp biến môi trường:* PowerShell không hỗ trợ cú pháp gán biến môi trường inline như Linux (`VAR=val command`). Để truyền biến môi trường cho Docker Compose khi deploy từng slot, phải gán qua session: `$env:BLUE_TAG = "v1"` hoặc truyền trực tiếp trong code Node.js qua `spawnSync(..., { env: { ...process.env, BLUE_TAG: tag } })`.
  2. *Ghi đồng thời log:* Trên Windows PowerShell, để ghi song song output ra màn hình console và lưu file log mà không làm hỏng ký tự xuống dòng (`CRLF` vs `LF`), lệnh chuẩn xác là: `... 2>&1 | Tee-Object -Append <log-file>`.

---

## 2. Ghi nhận các phát hiện kỹ thuật và bẫy kiểm tra (Tool & Test Findings)

1. **Bẫy phát hiện lộ Secret ở Check `I14` (`tools/check.js`):**
   - Trong `tools/check.js`, đoạn mã kiểm tra rò rỉ token bí mật thực thi như sau:
     ```javascript
     const leaks = /dev-secret/.test(said);
     ```
   - *Phát hiện:* Nếu trong `src/config.js`, lập trình viên in thông báo lỗi chứa chính từ khóa đó (ví dụ: `console.error("ADMIN_TOKEN cannot be dev-secret")`), biến `leaks` sẽ trả về `true` và check `I14` bị đánh trượt (FAIL)!
   - *Giải pháp:* Viết thông báo lỗi mô tả khái quát mà không in chuỗi token: `console.error('Error: ADMIN_TOKEN cannot use default development secret in production')`.

2. **Bẫy chuyển hướng khi tắt Feature Flag ở Check `F7` (`docs/CHANGE.md`):**
   - Trong `docs/CHANGE.md` có quy định: *"With the flag off, GET /r/:code always redirects, even for a link that has expired."*
   - *Phát hiện:* Nếu logic kiểm tra hết hạn trong `src/app.js` chỉ kiểm tra `if (row.expires_at && Date.now() >= new Date(row.expires_at).getTime())` mà quên điều kiện `flagExpiry`, thì các liên kết có `expires_at` được tạo lúc cờ đang bật sẽ vẫn trả về 410 khi cờ bị tắt, vi phạm trực tiếp check `F7`.
   - *Giải pháp:* Logic kiểm tra hết hạn phải phụ thuộc trực tiếp vào cờ: `if (flagExpiry && row.expires_at && ...)` để khi cờ tắt, liên kết luôn redirect 302 bình thường.

3. **Bẫy kiểm tra `/health` của bản phát hành lỗi `v3-bad`:**
   - Trong `tools/drills/fault.mjs`, đối tượng can thiệp HTTP chỉ đánh chặn các route `/links/:code` và `/r/:code` với tỷ lệ lỗi 30% HTTP 500, còn route `/health` hoàn toàn không bị can thiệp và luôn trả về `200 OK`.
   - *Phát hiện:* Bất kỳ script release nào chỉ thăm dò `/health` của Docker/Container sẽ bị đánh lừa và đẩy thẳng bản lỗi lên 100% traffic, làm hỏng kiểm thử `L7` và `L8`.
   - *Giải pháp:* Script `deploy/release.js` phải theo dõi trực tiếp số đếm lỗi của Router (`GET :8081/state`) trong suốt các giai đoạn canary (10% và 50%) để kịp thời kích hoạt Automated Gate rollback.

---

## 3. Khả năng đáp ứng tải của phần cứng và kết quả đo lường (Hardware & Rate Findings)

Kết quả đo lường thực tế từ tệp `load-log.txt` và `check-log.txt` trên máy chạy thực nghiệm:

- **Lưu lượng tải trung bình (Check `L2`):**
  - Đạt **13.116 requests** trong **333 giây**, tương đương **39.4 requests/giây** (yêu cầu tối thiểu của rubric là $\ge 20$ req/s). Tốc độ tải duy trì đều đặn, không có hiện tượng nghẽn hàng đợi (queue starvation) hay rớt kết nối mạng (`network = 0`).
- **Thời gian dừng duyên dáng (Graceful Shutdown - Check `I10`):**
  - Tiến trình Node.js hoàn thành việc đóng kết nối nhàn rỗi và các request đang bay dở chỉ trong **1.8 giây** khi nhận tín hiệu `SIGTERM` (giới hạn cho phép là 8.0 giây).
- **Tốc độ đồng bộ Feature Flag giữa các container (Check `F4`):**
  - Nhờ cơ chế SQLite WAL (Write-Ahead Logging) mode, thay đổi cờ từ một instance được phản ánh sang instance thứ hai chỉ mất **2 mili-giây** (giới hạn tối đa là 2000 mili-giây).
- **Hiệu năng của Cổng kiểm soát (Automated Gate - Check `L7`, `L8`):**
  - Bản phát hành lỗi `v3-bad` bị chặn ngay ở nấc canary **10%** (giới hạn tối đa 25%).
  - Thời gian quay lui (Time to rollback) từ request lỗi đầu tiên đến request cuối cùng chỉ mất **1 giây** (giới hạn tối đa 300 giây / 5 phút).
- **Độ tin cậy toàn phiên (Zero-Downtime Reliability - Check `L3`, `L9`):**
  - Tổng số request bị lỗi ngoài ý muốn ngoài bản drill: **Đúng 0 request (`failedOutside = 0`)**.
  - Sau khi rollback, hệ thống chạy ổn định thêm **80 giây** trên phiên bản `v2` với 0 lỗi trước khi dừng tải.
