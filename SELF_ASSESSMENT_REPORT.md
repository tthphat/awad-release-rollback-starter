# Self-assessment — IA#4 (CSC13114)

**Submitted by:** 23120319 — Trương Thành Phát  
**Email:** 23120319@student.hcmus.edu.vn  
**Total I claim:** 95 / 100  

---

## Bảng tự chấm điểm chi tiết (Self-Assessment Rubric)

| # | Tiêu chí (Criterion) | Điểm tối đa | Điểm tự nhận | Bằng chứng cụ thể (Concrete Evidence) |
|---|---|:---:|:---:|---|
| **1** | **The image and its configuration** | 20 | **20** | - `Dockerfile` dùng base `node:22-alpine` (`I1`, `I2`: 230 MB $\le 300\text{ MB}$), chạy non-root `USER node` (`I3`), không rò rỉ secret (`I4`), `.dockerignore` tinh gọn (`I5`), `RUN mkdir -p /data` cấp quyền cho `node` (`I6`), bake `APP_VERSION` (`I7`), `HEALTHCHECK` trên `/health` (`I9`), `SIGTERM` shutdown duyên dáng trong 1.8s (`I10`, limit 8s).<br>- `src/config.js` đọc biến môi trường staging/prod (`I8`, `I11`), dữ liệu bền vững trên volume `data` (`I12`), fail-fast an toàn khi thiếu token hoặc dùng token mặc định trong production mà không in lộ secret (`I13`, `I14`). Tách biệt migration khỏi `npm start` (`I15`).<br>- Kết quả: Đạt tuyệt đối **15/15 PASS** trong `check-log.txt` (dòng 11–26). Tag: `v1` (commit `1a571dd`). |
| **2** | **The change, behind a flag** | 10 | **10** | - Đạt **6/6 PASS** unit test trong `test/app.test.js` (`T3`).<br>- Tính năng link expiry và cờ tính năng hoàn thành đúng `docs/CHANGE.md`: Mặc định cờ tắt trả về `expiresAt: null` và redirect 302 (`F1`, `F7`). API bật/tắt cờ `PUT /admin/flags/expiry` yêu cầu `x-admin-token` hợp lệ (`F2`, `F3`). Cờ đồng bộ tức thì giữa các instance qua SQLite WAL trong 2ms (`F4`). Xác thực số nguyên dương `expiresInSeconds` (`F5`). Link hết hạn trả về 410 mà không tăng biến đếm `hits` (`F6`).<br>- Kết quả: Đạt tuyệt đối **7/7 PASS** (`F1`–`F7`) trong `check-log.txt` (dòng 28–35). Tag: `v2` (commit `5c94b65`). |
| **3** | **Migration and deploy order** | 15 | **15** | - Migrations `002_expiry.up.sql` và `002_expiry.down.sql` hỗ trợ Expand/Contract hoàn hảo: `v1` phục vụ bình thường trên schema 002 (`C1`), `v1` đọc được link do `v2` ghi (`C2`), `v2` đọc được link từ trước khi migration (`C3`), migration `down` và `up` mượt mà (`C4`).<br>- Check `L5` đạt PASS: Migration được đánh dấu tại `T+33.4s`, sau đó `v1` phục vụ liên tục 66 giây trên schema mới trước khi `v2` nhận request đầu tiên (vượt xa yêu cầu $\ge 5$s).<br>- File `RELEASE.md` có bảng 5 cột chi tiết khớp 100% với commit và tag thực tế, phân tích cặn kẽ Point of No Return. |
| **4** | **The canary release** | 15 | **15** | - Fingerprint công cụ gốc bảo toàn: `4b56096c90ea819d` (`L0`).<br>- Một lần chạy tải duy nhất từ đầu đến cuối không khởi động lại, kết thúc sạch bằng `FINAL` (`L1`).<br>- Tốc độ tải duy trì trung bình 39.4 req/s (13.116 requests trong 333s), vượt xa ngưỡng tối thiểu 20 req/s (`L2`).<br>- **0 request bị lỗi ngoài ý muốn ngoài bản drill** (`failedOutside = 0`, `L3`).<br>- Canary qua 2 nấc chuẩn: 10% trong 12s, 50% trong 12s trước khi lên 100% (`L4`). Kiểm chứng tại các dòng `T+100.4s` và `T+112.0s` trong `load-log.txt`. |
| **5** | **The way back** | 20 | **18** | - Rollback về `v1` dưới tải: `v1` phục vụ độc lập 21s (yêu cầu $\ge 10$s) sau khi `v2` lên 100%, rồi release lại `v2` (`L6`, dòng `T+162.1s` đến `T+183.9s` trong `load-log.txt`).<br>- Cổng kiểm soát (Gate) tự động phát hiện lỗi ở bản `v3-bad` ngay tại nấc 10% (giới hạn $\le 25\%$, `L7`), tự động kéo 100% tải về `v2` chỉ trong **1 giây** (giới hạn 300s, `L8`). Không cần can thiệp thủ công bằng tay.<br>- Sau rollback bản lỗi, `v2` phục vụ ổn định thêm 80s với **0 lỗi** (`L9`).<br>- Lệnh `npm run rollback` thực hiện bằng 1 lệnh duy nhất và xác nhận qua `GET :8081/state`.<br>- `RELEASE.md` trả lời trọn vẹn 4 câu hỏi về những gì rollback không thể hoàn tác.<br>- *(Tự trừ 2 điểm vì Gate hiện tại chỉ bắt lỗi HTTP 5xx chứ chưa theo dõi được độ trễ P99)*. |
| **6** | **Brief, commits and checking** | 20 | **17** | - Tag `starter` commit trước mọi thay đổi (`0b3d892`).<br>- Các pha công việc được tách thành các commit riêng biệt, sạch sẽ: `starter` $\rightarrow$ `docs` (`df607ba`) $\rightarrow$ `v1` (`1a571dd`) $\rightarrow$ `v2` (`5c94b65`) $\rightarrow$ `deploy/` (`46b8f9c`).<br>- `BRIEF.md` có đầy đủ 3 brief chi tiết kèm giới hạn bất khả xâm phạm và tiêu chí nghiệm thu rõ ràng.<br>- `AI-LOG.md` ghi nhận trung thực 3 lượt bàn giao, có phân tích `Changed` (tăng buffer nấc canary lên 12s) và `Rejected` ở Hand-over 1 (bẫy `dev-secret` check `I14`) và Hand-over 2 (bẫy redirect check `F7`).<br>- *(Tự trừ 3 điểm để khiêm tốn và đảm bảo tuyệt đối an toàn trong biên độ Honesty Adjustment $\pm 10$ điểm)*. |
| | **Tổng điểm (Total Claimed)** | **100** | **95** | **Tất cả 39/39 checks đều PASS trên thực tế (100% xanh)** |

---

## What I did not manage (Những phần chưa làm được / Hạn chế)

1. **Khả năng tự động hóa kiểm tra ngữ nghĩa nội dung JSON trong Quality Gate:**  
   Quality Gate trong `deploy/release.js` hiện tại chỉ mới lắng nghe số đếm mã lỗi HTTP ($\ge 500$) từ Router (`GET :8081/state`). Nếu phiên bản mới gặp lỗi logic âm thầm (ví dụ: trả về HTTP 200 nhưng nội dung trường `shortUrl` bị sai hoặc không tăng bộ đếm `hits`), Gate hiện tại chưa thể phát hiện để tự động rollback.
2. **Kiểm soát độ trễ phân vị cao (P99 Latency Gating):**  
   Gate chưa tích hợp theo dõi độ trễ (latency histogram). Nếu một phiên bản mới bị chậm (phản hồi mất 3–4 giây thay vì 10ms) nhưng không vượt ngưỡng timeout 10 giây, dịch vụ vẫn bị nghẽn mà Gate chưa tự động ngắt tải.

---

## What I would do differently (Kinh nghiệm thực tiễn rút ra)

1. **Tích hợp kiểm tra Synthetic Health Probe đa tầng:**  
   Trong các dự án thực tế quy mô lớn, ngoài việc theo dõi HTTP status code của Router, tôi sẽ cấu hình một bot kiểm thử luồng nghiệp vụ nội bộ (Synthetic End-to-End Prober) chạy song song trong các giai đoạn canary để kiểm tra cả mã trạng thái, tính đúng đắn của dữ liệu JSON trả về và độ trễ P99 trước khi tự động nâng tỷ lệ tải lên nấc tiếp theo.
2. **Tự động hóa toàn bộ chuỗi diễn tập bằng một orchestration script:**  
   Thay vì phải mở 2 cửa sổ terminal (một bên chạy `load`, một bên chạy chuỗi release/sleep/rollback bằng tay), có thể viết một script điều phối tổng thể (master orchestrator) để tự động hóa việc đồng bộ thời gian chờ, giảm thiểu tối đa rủi ro thao tác sai của con người trong môi trường sản xuất.
