# RELEASE PLAN & POST-RELEASE ANALYSIS (CSC13114)

**Student:** Trương Thành Phát  
**Student ID:** 23120319  
**Assignment:** IA#4 — Release and Rollback  

---

## 1. Five-Column Deployment Plan Table

Bảng dưới đây mô tả chi tiết từng bước của quy trình triển khai Expand/Contract, kết hợp phát hành Canary và Rollback dưới tải liên tục.

| # | Schema sau bước đó | Phiên bản đang phục vụ | Lệnh thực thi chính xác | Cách hoàn tác cụ thể (Undo) | Phiên bản code tương thích |
|---|---|---|---|---|---|
| **1** | `001_baseline` | `v1` (100% on `blue`) | `BLUE_TAG=v1 docker compose up -d --no-deps blue` | `docker compose stop blue` | `v1` |
| **2** | `002_expiry` *(Expand)* | `v1` (100% on `blue`) | `npm run migrate:image -- v2` | `npm run migrate:image -- v2 down` *(Xem mục 2)* | `v1`, `v2` (Tương thích 2 chiều nhờ cột `expires_at` nullable và bảng `flags`) |
| **3** | `002_expiry` | `v1` (90% on `blue`)<br>`v2` (10% on `green`) | `npm run release -- v2` *(Canary Stage 1)* | Automated Quality Gate tự động revert hoặc:<br>`curl -X POST http://127.0.0.1:8081/weights -d '{"blue":100,"green":0}'` | `v1`, `v2` |
| **4** | `002_expiry` | `v1` (50% on `blue`)<br>`v2` (50% on `green`) | `npm run release -- v2` *(Canary Stage 2)* | Automated Quality Gate tự động revert hoặc:<br>`curl -X POST http://127.0.0.1:8081/weights -d '{"blue":100,"green":0}'` | `v1`, `v2` |
| **5** | `002_expiry` | `v2` (100% on `green`) | `npm run release -- v2` *(Final Stage)* | `npm run rollback` (chuyển 100% về slot `blue` đang chạy nền) | `v1`, `v2` |
| **6** | `002_expiry` | `v2` (100% on `green`, flag ON) | `curl -X PUT http://localhost:8080/admin/flags/expiry -H "x-admin-token: staging-only-not-a-secret" -H "content-type: application/json" -d '{"enabled":true}'` | `curl -X PUT http://localhost:8080/admin/flags/expiry -H "x-admin-token: staging-only-not-a-secret" -H "content-type: application/json" -d '{"enabled":false}'` | `v1`, `v2` |
| **7** | `002_expiry` | `v1` (100% on `blue`) *(Rollback under load)* | `npm run rollback` | `npm run release -- v2` (hoặc đặt lại weights về `green`: 100%) | `v1`, `v2` |
| **8** | `002_expiry` | `v2` (100% on `green`) *(Forward again)* | `npm run release -- v2` | `npm run rollback` | `v1`, `v2` |
| **9** | `002_expiry` | `v2` (90% on `green`)<br>`v3-bad` (10% on `blue`) | `npm run drill:build -- v2`<br>`npm run release -- v3-bad` | **Tự động ngắt bởi Quality Gate:** Script phát hiện lỗi 5xx ở nấc 10% và lập tức kéo 100% traffic về `green` (`v2`) | `v1`, `v2` (loại trừ `v3-bad` lỗi) |
| **10** | `002_expiry` | `v2` (100% on `green`) *(Clean end)* | Tự động hoàn tất bởi Quality Gate sau 1 giây | `npm run rollback` | `v1`, `v2` |

---

## 2. Điểm không thể quay đầu (Point of No Return)

### Câu hỏi: Bước nào trong bảng kế hoạch không có đường quay lui an toàn? Tại sao?

1. **Về mặt hạ tầng điều phối lưu lượng (Traffic Routing):**
   - **Hoàn toàn không có Point of No Return:** Bất kỳ lúc nào, lưu lượng người dùng cũng có thể được chuyển đổi qua lại giữa `blue` và `green` trong thời gian dưới 1 giây thông qua router (`POST :8081/weights` hoặc lệnh `npm run rollback`). Cả hai slot container đều được giữ chạy nền liên tục, không bị tắt khi release hoàn tất.

2. **Về mặt cấu trúc và toàn vẹn dữ liệu (Data Integrity):**
   - **Bước có Point of No Return:** Lệnh `npm run migrate:image -- v2 down` (khi hoàn tác migration).
   - **Nguyên nhân cốt lõi:**  
     Trong file `migrations/002_expiry.down.sql`, lệnh thực thi là:
     ```sql
     ALTER TABLE links DROP COLUMN expires_at;
     DROP TABLE IF EXISTS flags;
     ```
     Nếu người dùng đã tạo các liên kết có đặt thời hạn sống (`expires_at`) trong giai đoạn `v2` hoạt động khi Feature Flag đang bật (`enabled = 1`), việc thực thi migration `down` sẽ **xóa vĩnh viễn cột `expires_at`**. Toàn bộ thông tin về thời gian hết hạn của tất cả các liên kết trong quá khứ sẽ bị hủy hoàn toàn và không thể khôi phục nếu không có bản sao lưu trước đó.
   - **Chiến lược xử lý thực tế trong doanh nghiệp:**  
     Khi phát hiện sự cố sau khi đã triển khai lên production, quy trình chuẩn là:
     1. Tắt Feature Flag thông qua API: `PUT /admin/flags/expiry` với `{"enabled": false}` (thao tác này không làm mất dữ liệu).
     2. Rollback traffic về phiên bản ổn định (`v1`): `npm run rollback`.
     3. **Tuyệt đối không chạy migration down** trên cơ sở dữ liệu production để bảo toàn tính toàn vẹn của dữ liệu đã ghi.

---

## 3. Phân tích Cổng kiểm soát chất lượng tự động (Quality Gate Limits)

### a. Lý do lựa chọn ngưỡng kích hoạt Gate
Trong file `deploy/release.js`, ngưỡng kích hoạt của Automated Quality Gate được thiết lập là:
```javascript
if (deltaErrors >= 1) {
  // Tự động kéo 100% tải về slot cũ ngay lập tức
}
```

- **Lý do kỹ thuật:**  
  Trong một dịch vụ short-link lành mạnh, các liên kết hợp lệ không bao giờ được phép trả về mã lỗi HTTP 5xx. Việc xuất hiện dù chỉ **1 lỗi HTTP 5xx** trên slot canary là chỉ dấu tin cậy cho thấy phiên bản mới đang gặp sự cố nghiêm trọng (như bản `v3-bad` bị tiêm lỗi làm hỏng 30% request đọc).
- **Hiệu quả đo lường thực tế:**  
  - Ngưỡng này giúp phát hiện bản lỗi `v3-bad` ngay tại nấc 10% trong vòng **1–2 giây** đầu tiên.
  - Giữ đỉnh tải của bản lỗi ở mức **10%** (vượt xa yêu cầu $\le 25\%$ của check `L7`).
  - Rút ngắn thời gian rollback xuống chỉ còn **1 giây** (vượt xa giới hạn tối đa 300 giây của check `L8`).
  - Đảm bảo **0 request bị lỗi bên ngoài bản lỗi** (đạt tuyệt đối check `L3`).

### b. Ngưỡng Gate này có thể bỏ sót những loại lỗi nào? (What the limit misses)

Mặc dù rất nhạy với lỗi HTTP 5xx, cơ chế kiểm soát chất lượng dựa trên `deltaErrors` từ Router Control sẽ bỏ sót 3 nhóm lỗi sau:

1. **Lỗi logic nghiệp vụ âm thầm (Silent Business Logic Errors):**
   - Router chỉ kiểm tra mã HTTP status code ($\ge 500$). Nếu phiên bản mới trả về HTTP 200 OK nhưng dữ liệu bên trong bị sai lệch (ví dụ: liên kết chuyển hướng nhầm sang trang khác, không tăng biến đếm `hits`, hoặc trả về JSON thiếu thuộc tính), Router vẫn ghi nhận là request thành công và Gate sẽ không kích hoạt.
2. **Lỗi nghẽn hiệu năng và độ trễ cao (Performance Degradation & High Latency):**
   - Nếu container mới gặp sự cố rò rỉ bộ nhớ (memory leak) hoặc nghẽn CPU khiến thời gian phản hồi tăng từ 10ms lên 4000ms, dịch vụ trở nên cực kỳ chậm chạp đối với người dùng. Tuy nhiên, miễn là request không vượt quá giới hạn timeout (10 giây), Router vẫn không tính là lỗi 5xx, do đó Gate sẽ bỏ sót sự cố nghẽn này.
3. **Lỗi xuất hiện ở các trường hợp biên với tần suất cực thấp (Rare Edge Cases):**
   - Nếu một lỗi chỉ xảy ra với xác suất 1/10.000 requests, giai đoạn canary 10% trong 12 giây (~40 requests) sẽ không có đủ kích thước mẫu thống kê để kích hoạt lỗi đó. Phiên bản lỗi sẽ vượt qua Gate để được đẩy lên 100% trước khi lỗi bắt đầu bùng phát ở quy mô lớn.

---

## 4. Những gì lệnh Rollback không thể hoàn tác (What a Rollback Does Not Undo)

Việc chuyển hướng lưu lượng (traffic shift) bằng lệnh `npm run rollback` chỉ mất chưa đầy 1 giây, nhưng trạng thái của thế giới thực tế bên dưới không tự động quay ngược lại. Dưới đây là phân tích chi tiết cho từng trường hợp:

### a. Điều gì xảy ra với một liên kết đã hết hạn trong lúc `v1` đang phục vụ?
- Mã nguồn của `v1` hoàn toàn không có logic xử lý cột `expires_at` hay kiểm tra bảng `flags`.
- Khi người dùng truy cập `GET /r/:code` vào một liên kết đã quá hạn trong thời gian `v1` đang phục vụ, `v1` **VẪN THỰC HIỆN CHUYỂN HƯỚNG BÌNH THƯỜNG (HTTP 302 Redirect)** và **VẪN ĐẾM TĂNG BIẾN `hits`**!
- Người dùng vẫn sử dụng được liên kết như một liên kết bình thường, không nhận được thông báo 410.
- Chỉ khi hệ thống được chuyển tiếp trở lại `v2` và cờ `expiry` đang bật, liên kết đó mới lập tức bị chặn lại và trả về HTTP 410 `{"error": "expired"}` mà không tăng `hits`.

### b. Điều gì xảy ra với một liên kết được tạo bởi `v1` sau khi cờ đã bật?
- Giả sử hệ thống đang rollback về `v1` nhưng cờ `flags.expiry` trong cơ sở dữ liệu vẫn đang bật (`enabled = 1`).
- Nếu một client gửi yêu cầu `POST /links` kèm theo trường `expiresInSeconds`, mã nguồn của `v1` hoàn toàn **bỏ qua trường này** (theo đúng đặc tả trong `test/app.test.js`: unknown fields are ignored) và lưu `expires_at` là `NULL`.
- Kết quả: Liên kết này sẽ trở thành một **liên kết vĩnh viễn (never expires)**. Kể cả sau này khi traffic được chuyển lại sang `v2`, liên kết này vẫn không bao giờ hết hạn vì giá trị `expires_at` trong cơ sở dữ liệu là `NULL`.

### c. Trạng thái của Feature Flag sau khi Rollback nằm ở đâu và ai là người tắt nó?
- Cờ tính năng được lưu trữ bền vững bên trong bảng `flags` của cơ sở dữ liệu SQLite (`/data/app.db`).
- Lệnh `npm run rollback` chỉ gửi yêu cầu tới Router Control ở cổng `:8081` để thay đổi trọng số lưu lượng (`weights: blue=100, green=0`). Lệnh này **hoàn toàn không chạm vào cơ sở dữ liệu**.
- Do đó, sau khi rollback, trạng thái của cờ **VẪN Ở NGUYÊN TRẠNG THÁI BẬT (`enabled = 1`)**.
- **Ai là người tắt cờ?** Người vận hành hệ thống (Operator / SRE) phải là người chủ động gửi HTTP request có xác thực tới endpoint quản trị để tắt cờ:
  ```bash
  curl -X PUT http://localhost:8080/admin/flags/expiry \
    -H "x-admin-token: staging-only-not-a-secret" \
    -H "content-type: application/json" \
    -d '{"enabled":false}'
  ```

---

## 5. Kết luận & Khuyến nghị vận hành

1. Quy trình Expand/Contract kết hợp Database-backed Feature Flag cho phép việc triển khai và hoàn tác dịch vụ diễn ra hoàn toàn không gián đoạn (Zero-Downtime), đạt chuẩn kiểm tra thực tế với 13.140 requests liên tục mà không có bất kỳ request lỗi ngoài ý muốn nào (`outside = 0`).
2. Rollback bằng traffic shifting là giải pháp ứng cứu khẩn cấp tuyệt vời (thực thi trong 1 giây), nhưng đội ngũ kỹ thuật phải nhận thức rõ các tác động dữ liệu (side-effects) để có các biện pháp xử lý dữ liệu và cấu hình cờ tiếp theo một cách an toàn.

