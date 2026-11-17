# Kế hoạch thực hiện IA#4: Release and Rollback (CSC13114)

- **Mục tiêu:** Đóng gói dịch vụ rút gọn liên kết (`linkbox`), triển khai thay đổi không gián đoạn (zero-downtime) qua Canary Release có cổng kiểm soát tự động (Gate), và thực hiện Rollback an toàn dưới tải liên tục.
- **Hạn nộp:** 22:00 Thứ Tư, ngày 18/11/2026.

---

## ⚠️ CÁC QUY TẮC BẤT DI BẤT DỊCH & LƯU Ý SỐNG CÒN

> [!CAUTION]
> **1. TUYỆT ĐỐI KHÔNG SỬA `tools/` VÀ `test/app.test.js`**
> * Mã fingerprint in ra ở dòng đầu của `npm run check` và `load-log.txt` **bắt buộc phải là `4b56096c90ea819d`**.
> * Giảng viên sẽ kiểm tra bằng `git diff starter -- tools/ test/app.test.js`.
> * **Nếu phát hiện có chỉnh sửa:** Tiêu chí 4 (Canary release) và Tiêu chí 5 (The way back) sẽ **nhận 0 điểm ngay lập tức**! Nếu phát hiện công cụ có vấn đề, hãy ghi nhận vào `NOTES.md` (đây được tính là phát hiện có giá trị, không bị trừ điểm).
> * **Luôn luôn đưa giới hạn này vào mọi prompt/brief giao cho AI Assistant:** *"Nothing under tools/ and nothing in test/app.test.js may change."*

> [!WARNING]
> **2. MỘT LẦN CHẠY TẢI DUY NHẤT (SINGLE CONTINUOUS LOAD RUN)**
> * `npm run load` sẽ **ghi đè hoàn toàn** file `load-log.txt` mỗi lần khởi chạy.
> * Bạn phải khởi chạy `npm run load` ở Terminal riêng **trước khi thực hiện migration `002`** và chỉ nhấn `Ctrl + C` **sau khi bản lỗi `v3-bad` đã được tự động rollback xong và chạy ổn định ít nhất 10s**.
> * Nếu `npm run load` bị khởi động lại 2 lần, check `L1` sẽ **FAIL** và mất điểm.

> [!IMPORTANT]
> **3. KHỞI ĐỘNG V1 VÀ CHỜ HEALTHY TRƯỚC KHI BẬT LOAD**
> * Thứ tự khởi động trước khi bật load: `docker compose down -v` $\rightarrow$ `up router` $\rightarrow$ `migrate v1` $\rightarrow$ `up slot blue (v1)` $\rightarrow$ **chờ slot blue báo healthy** $\rightarrow$ **rồi mới bật `npm run load`**.
> * Nếu bật `npm run load` khi container chưa kịp sẵn sàng, router sẽ trả về mã 502/lỗi mạng ngay giây đầu tiên, làm rớt tiêu chí **`L3` (Zero failed requests outside bad canary)**.

> [!IMPORTANT]
> **4. KHÔNG ĐƯỢC TẮT CONTAINER CỦA SLOT CŨ SAU KHI RELEASE**
> * Sau khi đưa traffic lên 100% ở slot mới, `deploy/release.js` **phải giữ slot cũ tiếp tục chạy** làm dự phòng.
> * Nếu tắt slot cũ: Khi cần rollback sẽ mất nhiều thời gian khởi động lại, hoặc nếu tắt trước khi traffic chuyển xong sẽ gây lỗi 502 hàng loạt (mất trắng điểm Rollback).

> [!IMPORTANT]
> **5. CỔNG KIỂM SOÁT (GATE) KHÔNG ĐƯỢC CHỈ ĐỌC `/health`**
> * Bản phát hành lỗi `v3-bad` được thiết kế có chủ đích: `/health` vẫn luôn báo xanh (healthy) nhưng thực tế làm lỗi **30% link reads** của người dùng.
> * Gate trong `deploy/release.js` **phải đọc số liệu thực từ `GET :8081/state`** (theo dõi số `errors` trên tổng số `requests` của slot canary). Nếu chỉ kiểm tra `/health`, gate sẽ không phản ứng và đưa release lỗi lên 100% traffic $\rightarrow$ rớt check `L7`.

> [!IMPORTANT]
> **6. `AI-LOG.MD` BẮT BUỘC PHẢI CÓ MỤC `Rejected` THẬT**
> * Rubric Tiêu chí 6 yêu cầu: `AI-LOG.md` phải có các dòng `Changed` và ít nhất một dòng `Rejected` thật (ghi lại trường hợp AI gợi ý sai hoặc code không qua được check nào đó, và check/log nào đã phát hiện ra).
> * Nếu mục `Rejected` bị bỏ trống, điểm tối đa của Tiêu chí 6 sẽ bị giới hạn ở mức **11–16/20 điểm** (thay vì 17–20 điểm).

> [!NOTE]
> **7. LỊCH SỬ GIT THẬT — KHÔNG REBASE HOẶC CHIA LẠI COMMIT SAU KHI LÀM**
> * Mỗi giai đoạn (Packaging, Feature Change, Release Scripts) phải là một commit riêng biệt, tuần tự ngay sau khi hoàn thành.
> * Hệ thống chấm điểm sẽ đối chiếu timestamp của commit với các mốc thời gian ghi trong `AI-LOG.md`. Rebase gom/tách commit nhân tạo sẽ bị phát hiện và hạ điểm.

> [!NOTE]
> **8. LƯU Ý MÔI TRƯỜNG WINDOWS POWERSHELL**
> * Không dùng cú pháp gán biến inline của Linux (`BLUE_TAG=v1 docker compose...`). Trên PowerShell phải gán riêng: `$env:BLUE_TAG = "v1"`.
> * Lệnh ghi log song song ra màn hình và file trên PowerShell: Dùng `... 2>&1 | Tee-Object -Append release-log.txt` thay cho cú pháp `| tee -a` của Linux.

> [!CAUTION]
> **9. CÁC THƯ MỤC / FILE CẤM NỘP**
> * **Tuyệt đối KHÔNG đưa vào file zip:** thư mục `data/` và file `env/production.env`.

> [!WARNING]
> **10. QUY TẮC PHẠT LỆCH ĐIỂM TỰ CHẤM (HONESTY ADJUSTMENT)**
> * Điểm tự đánh giá trong `SELF_ASSESSMENT_REPORT.md` sẽ được so sánh với điểm chấm thực tế:
>   * Lệch trong khoảng $\pm 10$ điểm: **Không phạt** (mức sai số cho phép).
>   * Tự chấm quá cao từ $+11$ đến $+20$ điểm: **Bị trừ 3 điểm**.
>   * Tự chấm quá cao từ $+21$ đến $+30$ điểm: **Bị trừ 6 điểm**.
>   * Tự chấm quá cao trên $+30$ điểm: **Bị trừ 10 điểm**.
>   * Tự chấm quá thấp $\le -21$ điểm: **Bị trừ 3 điểm**.
>   * **Không nộp file `SELF_ASSESSMENT_REPORT.md`:** **Bị trừ 10 điểm trực tiếp** và bỏ qua điểm tự chấm.
> * Mỗi điểm tự chấm trong bảng phải có dẫn chứng cụ thể (file, tag, mã commit, check ID hoặc dòng log). Không có bằng chứng coi như chưa làm.

---

## 📊 BẢNG TRA CỨU TOÀN BỘ KÝ HIỆU & BỘ KIỂM TRA TỰ ĐỘNG (`T`, `I`, `F`, `C`, `L`)

Hệ thống chấm điểm tự động IA#4 sử dụng 5 nhóm tiền tố định danh cho từng bộ kiểm tra tương ứng trong `tools/check.js`:

### 1. Nhóm `T` — Tools & Old-Client Tests (`npm run check -- tools`)
| Ký hiệu | Ý nghĩa chi tiết | Điều kiện PASS |
| :---: | :--- | :--- |
| **`T1`** | **Fingerprint của bộ công cụ** | Mã SHA-256 fingerprint của thư mục `tools/` khớp chính xác với `tools/FINGERPRINT`: `4b56096c90ea819d`. |
| **`T2`** | **Mốc Starter nguyên bản** | Tồn tại git tag `starter`, và không có bất kỳ file nào trong `tools/` hoặc `test/app.test.js` bị chỉnh sửa so với tag `starter`. |
| **`T3`** | **Unit Test cơ bản của Client cũ** | Chạy toàn bộ 6 test trong `test/app.test.js` bằng Node test runner đạt 6/6 PASS (phần điều kiện tiên quyết của Tiêu chí 2). |

---

### 2. Nhóm `I` — Docker Image Packaging (`npm run check -- image --new=linkbox:v1`) · Tiêu chí 1 (20 điểm)
| Ký hiệu | Ý nghĩa chi tiết | Điều kiện PASS |
| :---: | :--- | :--- |
| **`I1`** | **Base Image cố định phiên bản** | Dockerfile sử dụng base image có tag cụ thể (ví dụ: `node:22-alpine`), cấm dùng `node:latest`. |
| **`I2`** | **Kích thước Image tối ưu** | Dung lượng Docker Image $\le 300\text{ MB}$ (starter gốc nặng 1.25 GB). |
| **`I3`** | **Non-root User** | Khai báo `USER node`, không chạy container dưới quyền `root`. |
| **`I4`** | **Không lộ secret trong Image** | Không chứa `ADMIN_TOKEN` trong `ENV`, `ARG` hay bất kỳ layer nào (`docker history` sạch). |
| **`I5`** | **Image tinh gọn qua `.dockerignore`** | Trong `/app` chỉ chứa code chạy thực tế (`src/`, `migrations/`, `package.json`), loại bỏ `.git`, `env/`, `tools/`, `test/`, `data/`, logs... |
| **`I6`** | **Quyền ghi Volume cho Migration** | Thư mục volume `/data` thuộc quyền sở hữu của user `node`, `node src/migrate.js up` chạy thành công trên volume mới. |
| **`I7`** | **Bake Version lúc Build** | Endpoint `/version` trả về đúng giá trị `APP_VERSION` được truyền từ build argument (`docker build --build-arg APP_VERSION=...`). |
| **`I8`** | **Cấu hình từ Biến môi trường** | Các giá trị `APP_ENV`, `BASE_URL`, `DB_PATH`, `ADMIN_TOKEN` nhận từ biến môi trường bên ngoài, không hardcode. |
| **`I9`** | **HEALTHCHECK sẵn sàng** | Lệnh `HEALTHCHECK` trong Dockerfile báo `healthy` chỉ khi HTTP server thực sự sẵn sàng trả lời request. |
| **`I10`** | **Graceful Shutdown (Dừng lịch sự)** | Bắt tín hiệu `SIGTERM`, xử lý nốt request đang chạy dở và thoát hoàn toàn trong **$\le 8$ giây** (Docker kill cưỡng bức ở giây thứ 10). |
| **`I11`** | **Môi trường Production** | Image chạy ổn định với cấu hình file môi trường `production.env`. |
| **`I12`** | **Dữ liệu bền vững (Persistence)** | Database lưu trên volume; khi container bị xóa và tạo container mới thay thế, request sau vẫn trả về 200 (không bị 404 mất link). |
| **`I13`** | **Fail-fast khi thiếu Secret Production** | Với `APP_ENV=production`, nếu thiếu `ADMIN_TOKEN`, app lập tức thoát (exit code 1), in tên biến nhưng **tuyệt đối không in giá trị secret**. |
| **`I14`** | **Từ chối Secret mặc định ở Production** | Với `APP_ENV=production`, nếu `ADMIN_TOKEN=dev-secret`, app lập tức từ chối chạy (exit code 1). |
| **`I15`** | **Tách biệt lệnh Migration** | Lệnh khởi động container (`npm start`) chỉ khởi động server, không được tự động chạy migration (migration là bước chạy riêng). |

---

### 3. Nhóm `F` — Feature Flag & Change (`npm run check -- change`) · Tiêu chí 2 (10 điểm)
| Ký hiệu | Ý nghĩa chi tiết | Điều kiện PASS |
| :---: | :--- | :--- |
| **`F1`** | **Mặc định Flag tắt** | Khi chưa bật flag, `GET /version` trả về `flags.expiry: false`; request tạo link kèm `expiresInSeconds` vẫn trả về `expiresAt: null` như `v1`. |
| **`F2`** | **Bảo vệ Endpoint Flag bằng Token** | `PUT /admin/flags/expiry` với token sai hoặc thiếu header trả về HTTP `401`. |
| **`F3`** | **Bật Flag với đúng Token** | `PUT /admin/flags/expiry` với `x-admin-token` đúng trả về HTTP `200` và cập nhật trạng thái flag. |
| **`F4`** | **Đồng bộ đa Instance qua Database** | Khi bật flag ở instance A, instance B kết nối cùng database tự cập nhật trạng thái flag trong vòng $\le 2\text{ giây}$ mà không cần restart. |
| **`F5`** | **Validation tham số khi Flag bật** | Khi flag ON, `POST /links` với `expiresInSeconds` không hợp lệ (số âm, không phải số nguyên dương) trả về HTTP `400`. |
| **`F6`** | **Hành vi hết hạn của Link** | Khi flag ON, link có hạn trả về `expiresAt` chuẩn ISO 8601; truy cập trước hạn trả về `302` (chuyển hướng); sau khi hết hạn trả về `410` kèm `{"error": "expired"}`. |
| **`F7`** | **Tắt lại Flag mà không cần Restart** | Khi tắt lại flag (`PUT ... {"enabled": false}`), link đã hết hạn quay lại hoạt động như `v1` (trả về `302`), container không bị restart. |

---

### 4. Nhóm `C` — Schema Compatibility (`npm run check -- compat`) · Tiêu chí 3 (15 điểm)
| Ký hiệu | Ý nghĩa chi tiết | Điều kiện PASS |
| :---: | :--- | :--- |
| **`C1`** | **`v1` sống sót trên Schema mới** | Sau khi chạy migration `002_*.up.sql`, instance `v1` cũ vẫn đọc và tạo mới link bình thường (POST 201, GET 200). |
| **`C2`** | **`v1` đọc được dữ liệu do `v2` ghi** | `v1` vẫn chuyển hướng (302) và đọc danh sách (200) bình thường đối với các link do `v2` tạo ra khi flag đang ON. |
| **`C3`** | **`v2` đọc được dữ liệu cũ thời `v1`** | `v2` đọc các link được tạo từ trước migration: trả về HTTP 200, `expiresAt: null`, và chuyển hướng 302 thành công. |
| **`C4`** | **Migration có đường lùi (Rollback Schema)** | Kịch bản `002_*.down.sql` chạy trơn tru, đưa schema về bản `001`; sau đó `002_*.up.sql` có thể nâng cấp lại bình thường. |

---

### 5. Nhóm `L` — Log Analysis (`npm run check -- log`) · Tiêu chí 4 & 5 (50 điểm)
| Ký hiệu | Ý nghĩa chi tiết | Điều kiện PASS |
| :---: | :--- | :--- |
| **`L0`** | **Bộ công cụ gốc môn học** | Dòng đầu của `load-log.txt` in đúng mã fingerprint của thư mục `tools/`: `4b56096c90ea819d`. |
| **`L1`** | **Một lần chạy liên tục** | Đúng 1 đợt chạy `npm run load` từ đầu đến cuối không khởi động lại (`headers === 1`), kết thúc lịch sự bằng `Ctrl + C` (có dòng tổng kết `FINAL ...`). |
| **`L2`** | **Tốc độ tải tối thiểu** | Lưu lượng duy trì trung bình $\ge 20\text{ requests/giây}$ xuyên suốt phiên chạy (chuẩn của starter là ~40 req/s). |
| **`L3`** | **Zero Failed Requests ngoài Canary lỗi** | `outside === 0`: Không phát sinh bất kỳ request lỗi nào (5xx, network, contract, lost links) ở mọi giai đoạn, ngoại trừ các lỗi có chủ đích khi canary `v3-bad`. |
| **`L4`** | **Đúng quy trình Canary Release** | Trải qua ít nhất 2 nấc $< 100\%$ trước khi lên 100%, nấc đầu tiên $\le 25\%$ (vd: 10%) và giữ tối thiểu 10 giây. |
| **`L5`** | **Migration trước khi Deploy** | Đánh dấu migration xuất hiện trước khi `v2` nhận request đầu tiên, và `v1` phục vụ trên schema mới $\ge 5\text{ giây}$. |
| **`L6`** | **Diễn tập Rollback dưới tải** | Sau khi `v2` đạt 100%, rollback về `v1` và để `v1` phục vụ độc lập $\ge 10\text{ giây}$, sau đó mới release lại `v2`. |
| **`L7`** | **Khoanh vùng bản release lỗi** | Bản release lỗi `v3-bad` phát sinh lỗi và **không bao giờ vượt quá 25% traffic** (bị Gate ngắt ngay ở nấc 10%, không bao giờ được đi tiếp). |
| **`L8`** | **Thời gian rollback bản lỗi** | Thời gian từ request lỗi đầu tiên đến request cuối cùng mà `v3-bad` trả lời $\le 5\text{ phút}$ (thực tế auto-gate chỉ mất 1–3s). |
| **`L9`** | **Trạng thái kết thúc sạch sẽ** | Sau khi rollback bản lỗi về `v2`, hệ thống chạy ổn định tiếp tục $\ge 10\text{ giây}$ với 100% traffic trên `v2` và 0 lỗi trước khi bấm `Ctrl + C`. |

---

## Giai đoạn 0: Khởi tạo & Thiết lập mốc chuẩn (`starter`)
**Thời gian dự kiến:** Tối Chủ Nhật (15/11)

- [ ] **Kiểm tra công cụ trên máy:**
  - Docker & Docker Compose hoạt động bình thường (`docker compose version`).
  - Node.js phiên bản $\ge 22.13$ (`node -v`).
  - Git (`git --version`).
- [ ] **Tạo repository & Gắn tag gốc:**
  - Tạo repo từ template `github.com/fithcmus/awad-release-rollback-starter` (hoặc giải nén zip và `git init`).
  - Commit toàn bộ mã nguồn nguyên bản chưa chỉnh sửa.
  - Gắn tag: `git tag starter`.
- [ ] **Đọc tài liệu & Kiểm tra fingerprint:**
  - Đọc kỹ `README.md` và `docs/CHANGE.md`.
  - Chạy `npm run check` lần đầu để xác nhận dòng đầu tiên in ra `4b56096c90ea819d`.
- [ ] **Khởi tạo file nhật ký:** Tạo khung cho `BRIEF.md` và `AI-LOG.md`.

---

## Giai đoạn 1: Đóng gói chuẩn Production — Tag `v1` (20 điểm · Checks `I1`–`I15`)
**Thời gian dự kiến:** Sáng Thứ Hai (16/11)

### 1. Giao việc cho AI (Hand-over #1)
- [ ] Đảm bảo `git status` sạch sẽ.
- [ ] Ghi nội dung yêu cầu vào `BRIEF.md` (nêu rõ ràng buộc không đụng `tools/`, `test/app.test.js` và mục tiêu vượt qua toàn bộ `I1`–`I15`).

### 2. Danh sách kiểm tra kỹ thuật (`Dockerfile`, `.dockerignore`, `src/config.js`, `env/`)
- [ ] **`I1` (Base image cố định):** Dùng `node:22-alpine` (tuyệt đối không dùng `node:latest`).
- [ ] **`I2` (Kích thước image):** Giới hạn dưới `300 MB` (cài dependencies với `--omit=dev`, dọn cache).
- [ ] **`I3` (Non-root user):** Thiết lập `USER node` trong `Dockerfile`.
- [ ] **`I4` (Không lộ secret):** Không đặt `ADMIN_TOKEN` trong `ENV` hay `ARG` ở bất kỳ layer nào (kiểm tra lại bằng `docker history linkbox:v1`).
- [ ] **`I5` (Image tinh gọn):** Tạo `.dockerignore` loại bỏ `.git`, `env/`, `tools/`, `test/`, `data/`, `*.log`, `Dockerfile`... Trong `/app` chỉ chứa code chạy thực tế (`src/`, `migrations/`, `package.json`, `node_modules/`).
- [ ] **`I6` (Quyền ghi Volume):** Thư mục chứa database (ví dụ `/data`) phải thuộc quyền sở hữu của user `node`.
- [ ] **`I7`, `I8`, `I11` (Cấu hình tách biệt):** `BASE_URL`, `DB_PATH`, `APP_ENV`, `ADMIN_TOKEN` truyền từ bên ngoài qua biến môi trường; `APP_VERSION` gắn lúc build.
- [ ] **`I9` (Healthcheck):** Cấu hình `HEALTHCHECK` trong `Dockerfile` / Compose, chỉ báo `healthy` khi HTTP server thực sự sẵn sàng nhận request.
- [ ] **`I10` (Graceful Shutdown):** Dùng exec-form `CMD ["node", "src/server.js"]` để Node là PID 1; bắt tín hiệu `SIGTERM`, ngừng nhận kết nối mới, xử lý nốt request đang chạy và thoát trong **dưới 8 giây**.
- [ ] **`I12` (Dữ liệu bền vững):** Lưu SQLite database trên Docker volume dùng chung (`DB_PATH`) để dữ liệu không bị mất khi thay thế container.
- [ ] **`I13`, `I14` (Fail-fast khi thiếu cấu hình):** Nếu thiếu biến bắt buộc (như `ADMIN_TOKEN` ở môi trường `production`), ứng dụng phải thoát ngay với exit code `1`, in ra **tên biến** bị thiếu nhưng **tuyệt đối không in giá trị secret**.
- [ ] **`I15` (Tách biệt Migration):** Lệnh khởi động container (`npm start`) chỉ khởi chạy server, không tự động chạy migration.

### 3. Nghiệm thu & Commit `v1`
- [ ] Build image: `docker build -t linkbox:v1 --build-arg APP_VERSION=1.0.0 .` (theo hướng dẫn trong `README.md`).
- [ ] Chạy kiểm tra: `npm run check -- image --new=linkbox:v1` $\rightarrow$ Đảm bảo **15/15 PASS**.
- [ ] Cập nhật `AI-LOG.md` (ghi rõ các thay đổi `Changed` và lỗi của AI bị từ chối `Rejected` nếu có).
- [ ] Commit riêng phần đóng gói và gắn tag:
  ```bash
  git add Dockerfile .dockerignore src/ env/ docker-compose.yml BRIEF.md AI-LOG.md
  git commit -m "Package linkbox v1 image and runtime configuration"
  git tag v1
  ```

---

## Giai đoạn 2: Tính năng sau Feature Flag & Migration — Tag `v2` (25 điểm · Checks `T3`, `F1`–`F7`, `C1`–`C4`, `L5`)
**Thời gian dự kiến:** Chiều Thứ Hai (16/11)

### 1. Giao việc cho AI (Hand-over #2)
- [ ] Đảm bảo `git status` sạch sẽ trước khi giao việc.
- [ ] Ghi Brief #2 vào `BRIEF.md` (nêu rõ đặc tả trong `docs/CHANGE.md`, nguyên tắc Expand/Contract, cấm sửa `tools/` và `test/app.test.js`).

### 2. Danh sách kiểm tra kỹ thuật (`migrations/`, `src/`)
- [ ] **Migration Expand/Contract (`migrations/002_*.up.sql` & `.down.sql`):**
  - `002_*.up.sql` chỉ bổ sung cột/bảng mới (nullable hoặc có giá trị mặc định), không xóa hay đổi tên cột cũ để `v1` vẫn chạy bình thường trên schema mới (`C1`, `C2`).
  - `002_*.down.sql` hoàn tác được thay đổi schema khi cần (`C4`).
  - Khi `v2` khởi động, kiểm tra schema: nếu migration `002` chưa chạy thì báo lỗi và thoát ngay (tránh nhận traffic khi thiếu cột).
- [ ] **Feature Flag lưu trong Database (`F1`–`F7`):**
  - Trạng thái flag (`expiry`) lưu trong DB, các instance tự đồng bộ/đọc lại trong vòng tối đa **2 giây** mà không cần restart container hay đổi biến môi trường.
  - Khi flag **TẮT**: `v2` hoạt động giống hệt `v1`.
  - Khi flag **BẬT**: `v2` thực thi đúng logic hết hạn liên kết theo `docs/CHANGE.md`.

### 3. Nghiệm thu & Commit `v2`
- [ ] Chạy unit test & migration check (`npm test`, kiểm tra `T3`, `F1`–`F7`, `C1`–`C4`).
- [ ] Build image `linkbox:v2` và chạy `npm run check -- image --new=linkbox:v2`.
- [ ] Cập nhật `AI-LOG.md`.
- [ ] Commit riêng phần tính năng & migration, sau đó gắn tag:
  ```bash
  git add src/ migrations/ BRIEF.md AI-LOG.md
  git commit -m "Implement expiry feature behind DB flag and migration 002"
  git tag v2
  ```

---

## Giai đoạn 3: Script Canary Release & Rollback (35 điểm · Checks `L0`–`L4`, `L6`–`L9`)
**Thời gian dự kiến:** Sáng Thứ Ba (17/11)

### 1. Giao việc cho AI (Hand-over #3)
- [ ] Đảm bảo `git status` sạch sẽ.
- [ ] Ghi Brief #3 vào `BRIEF.md` (yêu cầu viết `deploy/release.js` và `deploy/rollback.js` dựa trên `GET :8081/state`, không sửa `tools/`).

### 2. Yêu cầu kỹ thuật cho `deploy/release.js` (`npm run release -- <tag>`)
- [ ] Đọc trạng thái hiện tại từ `GET :8081/state` để xác định slot đang chạy (`blue` hoặc `green`) và chọn slot còn lại làm canary.
- [ ] Khởi động slot canary với image tag được truyền vào.
- [ ] **Bắt buộc chờ Docker báo `healthy`** trước khi chuyển bất kỳ % traffic nào.
- [ ] **Chia giai đoạn (Canary stages):** Ít nhất 2 mức dưới 100%, trong đó mức đầu tiên **$\le 25\%$ và giữ tối thiểu 10 giây** (ví dụ: `10%` trong 12 giây $\rightarrow$ `50%` trong 12 giây $\rightarrow$ `100%`).
- [ ] **Cổng kiểm soát tự động (Automated Gate):**
  - Trong suốt thời gian chờ ở mỗi giai đoạn, liên tục gọi `GET :8081/state` để theo dõi số lượng `requests` và `errors` của slot canary.
  - Khi đủ số request tối thiểu (ví dụ $\ge 10$ requests), nếu tỷ lệ lỗi vượt ngưỡng (ví dụ $> 5\%$), **tự động hủy release, chuyển ngay 100% traffic về slot cũ** và thoát với mã lỗi khác 0.
- [ ] **Giữ slot cũ chạy dự phòng:** Sau khi đưa slot mới lên 100%, **không tắt** container của slot cũ để sẵn sàng cho lệnh rollback tức thì.

### 3. Yêu cầu kỹ thuật cho `deploy/rollback.js` (`npm run rollback`)
- [ ] Thực thi chỉ bằng **một lệnh duy nhất** (`npm run rollback`).
- [ ] Xác định slot dự phòng (đang có trọng số 0%) và chuyển ngay 100% traffic về slot đó.
- [ ] Gọi lại `GET :8081/state` để xác nhận trọng số mới đã cập nhật thành công trước khi in thông báo hoàn tất.

### 4. Nghiệm thu & Commit Deploy Scripts
- [ ] Chạy thử nghiệm (rehearsal) kịch bản release `v2` và `v3-bad` dưới tải giả lập để tinh chỉnh ngưỡng Gate.
- [ ] Cập nhật `AI-LOG.md`.
- [ ] Commit riêng phần script triển khai:
  ```bash
  git add deploy/ package.json BRIEF.md AI-LOG.md
  git commit -m "Add canary release gate and instant rollback scripts"
  ```

---

## Giai đoạn 4: Chạy thực nghiệm liên tục & Thu thập Logs
**Thời gian dự kiến:** Chiều Thứ Ba (17/11)

> **Lưu ý quan trọng:** Toàn bộ chuỗi thao tác dưới đây phải diễn ra trong **MỘT lần chạy `npm run load` duy nhất** từ đầu đến cuối (nếu tắt `npm run load` giữa chừng để chạy lại, check `L1` sẽ báo lỗi).

1. **Chuẩn bị trạng thái ban đầu sạch sẽ (Terminal 2):**
   ```powershell
   docker compose down -v
   docker compose up -d --build router
   npm run migrate:image -- v1
   $env:BLUE_TAG = "v1"
   docker compose up -d --no-deps blue
   # Kiểm tra và đợi container blue báo healthy:
   docker compose ps blue
   ```
2. **Bật tải liên tục (Terminal 1):**
   ```bash
   npm run load
   ```
   *(⚠️ Giữ nguyên Terminal 1 chạy xuyên suốt từ lúc này cho đến hết bước 8, tuyệt đối không ngắt hay chạy lại).*
3. **Chạy Migration lên `v2` (Terminal 2 — ghi toàn bộ log vào `release-log.txt`):**
   ```powershell
   npm run migrate:image -- v2 2>&1 | Tee-Object -Append release-log.txt
   # Đợi khoảng 10 giây: để v1 phục vụ trên schema mới ít nhất 5 giây (thỏa mãn check L5)
   ```
4. **Release `v2` qua Canary Gate:**
   ```powershell
   npm run release -- v2 2>&1 | Tee-Object -Append release-log.txt
   # Quan sát canary đi qua 10% (giữ >= 10s) -> 50% -> 100% với 0 lỗi (L3, L4)
   ```
5. **Bật Feature Flag & Kiểm thử trên `v2`:**
   ```powershell
   curl.exe -X PUT http://localhost:8080/admin/flags/expiry -H "x-admin-token: staging-only-not-a-secret" -H "content-type: application/json" -d '{"enabled":true}'
   # Đợi khoảng 10 giây để traffic chạy qua tính năng mới
   ```
6. **Diễn tập Rollback về `v1` xuyên qua Migration (`L6`):**
   ```powershell
   npm run rollback 2>&1 | Tee-Object -Append release-log.txt
   # Giữ v1 chạy độc lập khoảng 10–15 giây dưới tải để kiểm chứng v1 sống sót trên schema 002 (L6)
   ```
7. **Release lại `v2` lên 100%:**
   ```powershell
   npm run release -- v2 2>&1 | Tee-Object -Append release-log.txt
   # Đợi vài giây sau khi v2 lên 100%
   ```
8. **Build bản lỗi `v3-bad`, Release & Tự động Rollback (`L7`, `L8`, `L9`):**
   ```powershell
   npm run drill:build -- v2
   npm run release -- v3-bad 2>&1 | Tee-Object -Append release-log.txt
   # Quan sát Gate tự động phát hiện lỗi ở mức 10% và tự động kéo traffic về v2 trong vài giây (L7, L8)
   # Đợi tiếp 10–15 giây để v2 chạy ổn định với 0 lỗi sau rollback (L9)
   ```
9. **Kết thúc tải & Chạy kiểm tra tổng hợp:**
   - Nhấn `Ctrl + C` ở Terminal 1 để `npm run load` chốt dòng `FINAL ...` trong `load-log.txt`.
   - Chạy lệnh kiểm tra cuối cùng:
     ```powershell
     npm run check 2>&1 | Tee-Object check-log.txt
     ```
   - Mở `check-log.txt`: xác nhận fingerprint `4b56096c90ea819d` và tất cả các check `I1`–`I15`, `T3`, `F1`–`F7`, `C1`–`C4`, `L0`–`L9` đều **PASS**.

### 10. Danh mục nghiệm thu chi tiết nhóm Tiêu chí `L` (`load-log.txt` · 50/100 điểm)

| Check ID | Ý nghĩa & Tiêu chí Rubric | Điều kiện đạt (PASS) theo công cụ kiểm tra (`tools/report.js`) |
| :---: | :--- | :--- |
| **`L0`** | **Bộ công cụ gốc môn học**<br>*(Tiêu chí 4 · Rubric p.3)* | Dòng đầu của `load-log.txt` in đúng mã fingerprint của thư mục `tools/`: `4b56096c90ea819d` (không bị sửa file trong `tools/` hay `test/app.test.js`). |
| **`L1`** | **Một lần chạy liên tục**<br>*(Tiêu chí 4 · Rubric p.3)* | Đúng 1 lần chạy `npm run load` từ đầu đến cuối không khởi động lại (`headers === 1`), kết thúc lịch sự bằng `Ctrl + C` (có dòng tổng kết `FINAL ...`). |
| **`L2`** | **Tốc độ tải tối thiểu**<br>*(Tiêu chí 4 · Rubric p.3)* | Lưu lượng duy trì trung bình $\ge 20$ requests/giây trong toàn bộ phiên chạy (chuẩn của starter là ~40 req/s). |
| **`L3`** | **Không có request lỗi ngoài ý muốn**<br>*(Tiêu chí 4 · Rubric p.3)* | `outside === 0`: **0 request bị lỗi** (không dính lỗi HTTP 5xx, mất kết nối mạng, sai contract, hay lost links) ở mọi giai đoạn, ngoại trừ các lỗi có chủ đích khi canary `v3-bad`. |
| **`L4`** | **Đúng quy trình Canary Release**<br>*(Tiêu chí 4 · Rubric p.3)* | Trải qua ít nhất 2 nấc $< 100\%$ trước khi lên 100%, trong đó nấc đầu tiên phải $\le 25\%$ traffic (thường chọn 10%) và giữ tối thiểu 10 giây. |
| **`L5`** | **Migration trước khi Deploy**<br>*(Tiêu chí 3 · Rubric p.3)* | Có đánh dấu migration (`migrate:image`) trước khi `v2` nhận request đầu tiên; và `v1` phải phục vụ ít nhất 5 giây trên schema mới mà không lỗi. |
| **`L6`** | **Diễn tập Rollback dưới tải**<br>*(Tiêu chí 5 · Rubric p.4)* | Sau khi `v2` lên 100%, phải diễn tập rollback về `v1`, để `v1` phục vụ độc lập ít nhất 10 giây dưới tải (`v1 alone >= 10s`), sau đó mới release lại `v2`. |
| **`L7`** | **Khoanh vùng bản release lỗi**<br>*(Tiêu chí 5 · Rubric p.4)* | Bản release lỗi `v3-bad` phải phát sinh lỗi (`failedBad > 0`) và **tuyệt đối không bao giờ được chiếm quá 25% traffic** (bị Gate ngắt ngay ở nấc 10%, không bao giờ được đi tiếp lên các nấc sau). |
| **`L8`** | **Thời gian rollback bản lỗi**<br>*(Tiêu chí 5 · Rubric p.4)* | Thời gian từ request lỗi đầu tiên của `v3-bad` đến request cuối cùng mà `v3-bad` trả lời phải $\le 5$ phút (`300s`). Nếu Gate tự động rollback thì thời gian thực tế chỉ khoảng 1–3 giây. |
| **`L9`** | **Trạng thái kết thúc sạch sẽ**<br>*(Tiêu chí 5 · Rubric p.4)* | Sau khi rollback bản lỗi về `v2`, hệ thống phải chạy ổn định tiếp tục ít nhất 10 giây (`holdSecs = 10s`) với 100% traffic trên `v2` và **0 failed request** trước khi bấm `Ctrl + C`. |

---

## Giai đoạn 5: Viết báo cáo phân tích & Nộp bài
**Thời gian dự kiến:** Sáng – Chiều Thứ Tư (18/11, hoàn tất trước 20:00)

### 1. Hoàn thiện bộ tài liệu Markdown
- [ ] **`RELEASE.md`:**
  - Lập **bảng kế hoạch 5 cột** cho từng bước: `Schema sau bước đó | Phiên bản đang phục vụ | Lệnh thực thi chính xác | Cách hoàn tác (Undo) | Các phiên bản tương thích với schema`.
  - Chỉ rõ **Point of No Return** (bước không thể quay lui, hoặc giải thích tại sao không có).
  - Giải thích **ngưỡng lỗi của Gate** (chọn bao nhiêu %, tối thiểu bao nhiêu request, vì sao chọn mức đó) và **ngưỡng này bỏ sót điều gì** (ví dụ: lỗi độ trễ cao nhưng vẫn trả HTTP 200, lỗi ở các endpoint ít traffic).
  - Trả lời đầy đủ phần **Rollback không hoàn tác được gì**:
    1. Liên kết đã hết hạn trong lúc `v1` đang phục vụ (sau khi rollback) thì xử lý thế nào?
    2. Liên kết do `v1` tạo ra sau khi flag đã bật có dữ liệu `expires_at` ra sao?
    3. Trạng thái của Feature Flag trong DB sau khi rollback đang ở đâu và ai/cái gì tắt nó?
    4. Bước nào trong bảng không có đường lùi (hoặc lý do vì sao không có)?
- [ ] **`NOTES.md`:** Ghi nhận các bất thường của công cụ chấm (nếu có) hoặc giới hạn phần cứng nếu máy không giữ nổi mức 20 req/s ở `L2`.
- [ ] **`BRIEF.md` & `AI-LOG.md`:** Rà soát lại toàn bộ các brief đã dùng và đảm bảo `AI-LOG.md` có đầy đủ mục `Changed` và `Rejected` thực tế.
- [ ] **`SELF_ASSESSMENT_REPORT.md`:**
  - Lập bảng tự chấm điểm cho 6 tiêu chí, mỗi tiêu chí phải dẫn chứng cụ thể (tên file, tag, mã commit, check ID hoặc khoảng dòng trong `load-log.txt`).
  - Viết mục ngắn *What I did not manage*.
  - Đảm bảo tổng điểm tự chấm sát với thực tế (sai lệch $\le \pm 10$ điểm để không bị trừ điểm Honesty Adjustment).

### 2. Kiểm tra lần cuối & Đóng gói nộp bài
- [ ] Kiểm tra tính toàn vẹn của công cụ chấm:
  ```bash
  git diff starter -- tools/ test/app.test.js
  ```
  *(Kết quả bắt buộc phải trống hoàn toàn).*
- [ ] Commit các file log và tài liệu báo cáo (`RELEASE.md`, `NOTES.md`, `BRIEF.md`, `AI-LOG.md`, `SELF_ASSESSMENT_REPORT.md`, `load-log.txt`, `release-log.txt`, `check-log.txt`).
- [ ] Dọn dẹp các file cấm nộp: xóa thư mục `data/` và file `env/production.env`.
- [ ] Nén toàn bộ thư mục dự án (**bao gồm cả thư mục `.git`**) thành file `<MSSV>_<Tổng_điểm>.zip` (ví dụ: `23120001_98.zip`).
- [ ] Kiểm tra lại bên trong file `.zip` có đủ `.git`, tags (`starter`, `v1`, `v2`), code và các file báo cáo/log.
- [ ] Nộp bài trên Google Classroom bằng tài khoản `<MSSV>@student.hcmus.edu.vn` trước **22:00 ngày 18/11/2026**.


---

## 📚 Phụ lục: Giải thích chi tiết Kiến trúc & Cú pháp `compose.yaml`

### 1. Sơ đồ kiến trúc luồng dữ liệu (Data Flow)
```text
Khách hàng / Kịch bản kiểm thử tải (npm run load)
                     │
                     ▼ (Gửi request vào cổng :8080)
┌────────────────────────────────────────────────────────┐
│                   ROUTER CONTAINER                     │
│  - Cổng :8080 (Traffic): Load Balancer phân bổ % tải   │
│  - Cổng :8081 (Control): Bảng điều khiển quản lý       │
│      + GET  /state   : Đọc trọng số, requests, errors  │
│      + POST /weights : Cài đặt tỉ lệ % blue/green      │
└───────────────┬────────────────────────┬───────────────┘
                │ (VD: 90% traffic)      │ (VD: 10% traffic)
                ▼                        ▼
     ┌─────────────────────┐  ┌─────────────────────┐
     │      SLOT BLUE      │  │     SLOT GREEN      │
     │  (Container v1 cũ)  │  │  (Container v2 mới) │
     └──────────┬──────────┘  └──────────┬──────────┘
                │                        │
                └───────────┬────────────┘
                            ▼
           [ Mount chung Volume /data/app.db ]
```

### 2. Mổ xẻ từng dòng cú pháp trong Service `blue` / `green`

```yaml
  blue:
    image: linkbox:${BLUE_TAG:-v1}
    env_file: env/${APP_ENV:-staging}.env
    volumes:
      - data:/data
```

#### a. `image: linkbox:${BLUE_TAG:-v1}`
- **Ý nghĩa:** Chỉ định Docker Image dùng để tạo container.
- **Cú pháp `${BIẾN:-mặc_định}`:**
  - `${ ... }`: Đọc biến môi trường từ cửa sổ Terminal/PowerShell của máy bạn.
  - `:-`: Nếu biến chưa được gán trên máy bạn, tự động lấy giá trị phía sau làm mặc định.
  - Trong JavaScript, nó hoạt động tương tự: `image = "linkbox:" + (process.env.BLUE_TAG ?? "v1")`.
- **Hoạt động thực tế:**
  - Nếu chỉ gõ `docker compose up blue` $\rightarrow$ dùng `linkbox:v1`.
  - Nếu gõ `$env:BLUE_TAG = "v2"` rồi `docker compose up -d blue` $\rightarrow$ dùng `linkbox:v2`.
  - Giúp thay đổi phiên bản của từng slot linh hoạt mà **không cần sửa file `compose.yaml`**.

#### b. `env_file: env/${APP_ENV:-staging}.env`
- **Ý nghĩa:** Nạp file cấu hình môi trường (.env) vào container khi khởi chạy.
- **Biến `APP_ENV` đọc từ đâu? (Giải quyết bài toán "Con gà hay quả trứng"):**
  - Biến `APP_ENV` này **KHÔNG** đọc từ trong file `staging.env`. Nó được đọc từ **Terminal PowerShell trên máy của bạn**.
  - **Bước 1 (Trên máy bạn):** Docker Compose kiểm tra xem máy bạn có biến `$env:APP_ENV` không. Nếu không, nó lấy mặc định là `"staging"`, hình thành chuỗi đường dẫn `"env/staging.env"`.
  - **Bước 2 (Mở file):** Docker Compose tìm mở file `env/staging.env` trên ổ cứng và đọc các biến cấu hình (`PORT=3000`, `DB_PATH=/data/app.db`, `ADMIN_TOKEN=...`).
  - **Bước 3 (Runtime Injection):** Khi container được bật lên, Docker Compose mới bơm các biến này vào RAM của container. Lúc này Node.js mới đọc được qua `process.env`.
- **Phân biệt sống còn giữa Build Time và Run Time:**
  - Lúc `docker build` (Build Time): Docker hoàn toàn **không đọc** `staging.env` (thậm chí `.dockerignore` đã chặn thư mục `env/`). Image được tạo ra hoàn toàn "sạch sẽ", không dính bí mật hay cấu hình cố định nào.
  - Lúc `docker compose up` (Run Time): Biến môi trường mới được truyền từ ngoài vào.
  - Triết lý cốt lõi: *"One image, many environments: Build once. Run it anywhere, configured from outside."* Cùng một image `linkbox:v1`, gắn `staging.env` thì chạy staging (`I8`), gắn `production.env` thì chạy production (`I11`).

#### c. `volumes: - data:/data`
- **Cú pháp `- <Ổ_cứng_ngoài>:<Thư_mục_trong_container>`:**
  - `data`: Tên của Docker Named Volume độc lập được khai báo ở cuối file `compose.yaml`.
  - `/data`: Thư mục nằm bên trong máy ảo Linux của container.
- **Ý nghĩa sống còn:**
  - Container bình thường có tính chất tạm bợ (ephemeral) — khi tắt hoặc xóa container thì mọi file bên trong nó mất sạch.
  - Cú pháp này gắn ổ cứng ảo `data` vào thư mục `/data` của container. Dữ liệu SQLite (`/data/app.db`) được lưu vĩnh viễn trên volume ngoài máy host.
  - Khi container `blue` bị xóa và thay thế, dữ liệu cũ vẫn nguyên vẹn (đạt check **`I12: data outlives the container`**).
  - Cả `blue` và `green` đều gắn chung volume này, nên cả 2 phiên bản cũ và mới cùng chia sẻ chung một file database SQLite.

#### d. Lệnh `docker compose up -d --no-deps <idleSlot>`
- `-d`: Chạy ngầm dưới nền (detached mode).
- `--no-deps` (No Dependencies): Chỉ bật duy nhất container được chỉ định, **tuyệt đối không khởi động lại các container khác (như `router`)**. Nhờ đó, lưu lượng khách hàng đang truy cập qua Router không bị gián đoạn hay đứt kết nối.


### 3. Phân biệt Build-time vs Run-time Injection: Biến môi trường được nạp khi nào?

#### a. Khẳng định cốt lõi: Có phải inject vào lúc Build Image không?
> [!IMPORTANT]
> **KHÔNG PHẢI!** Biến trong file `.env` **tuyệt đối KHÔNG được nạp vào lúc `docker build` (Build Time)**.  
> Chúng chỉ được Docker Compose đọc và truyền vào container **vào lúc container khởi chạy (`docker compose up` / Runtime)**.

#### b. Bảng so sánh rạch ròi giữa 2 giai đoạn

| Tiêu chí | Giai đoạn 1: Build Time (`docker build`) | Giai đoạn 2: Run Time (`docker compose up` / `docker run`) |
| :--- | :--- | :--- |
| **Hành động** | Đóng gói mã nguồn thành Docker Image (`linkbox:v1`) | Khởi tạo và chạy Container từ Image có sẵn |
| **Tần suất** | Chỉ chạy khi có commit code mới | Chạy mỗi khi deploy, restart container, scale instance |
| **File `.env` có được đọc?** | **HOÀN TOÀN KHÔNG**. File `.dockerignore` chặn thư mục `env/` để Docker daemon không nhìn thấy | **CÓ**. Docker Compose đọc file `env/staging.env` từ ổ cứng máy host |
| **Bí mật (`ADMIN_TOKEN`)** | Không bao giờ lưu vào image (đạt chuẩn check **`I4: no secrets in image`**) | Được nạp an toàn vào bộ nhớ RAM của tiến trình container |
| **Tính chất Image** | Độc lập, bất biến (Immutable), "sạch sẽ" 100% | Phụ thuộc vào file cấu hình được gắn vào lúc bật |
| **Biến môi trường trong code** | Chỉ có `APP_VERSION` (nhờ `ARG/ENV` trong Dockerfile) | Đầy đủ `APP_ENV`, `PORT`, `DB_PATH`, `ADMIN_TOKEN` |

#### c. Luồng hoạt động chi tiết từng bước (Step-by-step Flow)

```text
[ Máy Host: Terminal & Ổ cứng ]
  │
  ├─ 1. Bạn gõ lệnh: docker compose up -d --no-deps blue
  ├─ 2. Docker Compose đọc compose.yaml:
  │       image: linkbox:${BLUE_TAG:-v1}           --> Quyết định lấy image "linkbox:v1"
  │       env_file: env/${APP_ENV:-staging}.env    --> Tìm file "env/staging.env" trên ổ cứng
  ├─ 3. Docker Compose mở file "env/staging.env", parse từng dòng:
  │       APP_ENV=staging
  │       DB_PATH=/data/app.db
  │       ADMIN_TOKEN=staging-only-not-a-secret
  │
[ Docker Engine (Daemon) ]
  │
  ├─ 4. Docker tạo một Container mới từ image "linkbox:v1"
  ├─ 5. Docker truyền danh sách biến môi trường (tương đương cờ -e KEY=VAL) vào Container
  │
[ Bên trong Container (Linux Virtual Environment) ]
  │
  ├─ 6. Nhân Linux khởi tạo process mới: "node src/server.js" (User: node)
  ├─ 7. Hệ điều hành gán bảng Environment Variables vào tiến trình Node.js
  ├─ 8. Node.js khởi động, runtime nạp toàn bộ biến vào đối tượng toàn cục process.env
  └─ 9. File src/config.js thực thi:
          process.env.APP_ENV      ===> "staging"
          process.env.ADMIN_TOKEN  ===> "staging-only-not-a-secret"
          process.env.DB_PATH      ===> "/data/app.db"
```

#### d. Tại sao kiến trúc này sống còn trong môi trường doanh nghiệp (12-Factor App)?
1. **Bảo mật tuyệt đối (Zero Secret Leak):** Nếu biến được nạp lúc `docker build`, token bí mật sẽ bị ghi chết vĩnh viễn vào các layer của Image. Bất kỳ ai gõ `docker history` hoặc kéo image về Docker Hub/Registry đều sẽ xem được token (vi phạm trực tiếp check `I4`).
2. **Nguyên lý "Build Once, Run Anywhere":** Bạn chỉ cần build duy nhất một Docker Image `linkbox:v1`. Image này có thể chạy trên máy lập trình viên (với `env/dev.env`), chạy trên máy kiểm thử (với `env/staging.env` - check `I8`), hoặc chạy trên cụm máy chủ thật (với `env/production.env` - check `I11`) mà **không cần phải sửa một dòng code hay build lại image**.

---

### 4. Hướng dẫn toàn tập cú pháp Set biến môi trường trên Terminal (Linux vs PowerShell)

Biến môi trường trên máy host đóng vai trò quyết định giá trị mặc định cho `${BLUE_TAG:-v1}` hay `${APP_ENV:-staging}` trong file `compose.yaml`.

#### a. Bảng tra cứu đối chiếu nhanh (Cheat Sheet)

| Thao tác | Windows PowerShell | Linux / macOS (Bash / Zsh) |
| :--- | :--- | :--- |
| **Gán biến trong session hiện tại** | `$env:BIEN = "gia_tri"` | `export BIEN="gia_tri"` |
| **Gán biến chỉ cho duy nhất 1 lệnh** | `$env:BIEN="gia_tri"; lenh` | `BIEN=gia_tri lenh` *(Inline - rất mạnh mẽ)* |
| **Xem giá trị của biến** | `$env:BIEN` hoặc `echo $env:BIEN` | `echo $BIEN` hoặc `printenv BIEN` |
| **Xóa biến khỏi session** | `Remove-Item env:BIEN` hoặc `$env:BIEN = $null` | `unset BIEN` |
| **Liệt kê tất cả biến môi trường** | `Get-ChildItem env:` hoặc `dir env:` | `printenv` hoặc `env` |
| **Kiểm tra biến có tồn tại không** | `Test-Path env:BIEN` | `[ -z "$BIEN" ] && echo "Chưa có"` |

#### b. Chi tiết trên Windows PowerShell

1. **Gán biến cho toàn bộ phiên làm việc (Session Scope):**
   ```powershell
   # Gán tag cho slot blue
   $env:BLUE_TAG = "v2"

   # Gán môi trường chạy là production
   $env:APP_ENV = "production"

   # Sau khi gán, lệnh docker compose sẽ tự động nhận giá trị này
   docker compose up -d --no-deps blue
   ```
   *Lưu ý: Biến này sẽ tồn tại cho đến khi bạn đóng cửa sổ PowerShell.*

2. **Xem lại giá trị đã gán:**
   ```powershell
   echo $env:BLUE_TAG
   # Kết quả: v2
   ```

3. **Xóa biến (đưa về mặc định trong `compose.yaml`):**
   ```powershell
   $env:BLUE_TAG = $null
   # hoặc:
   Remove-Item env:BLUE_TAG
   ```

#### c. Chi tiết trên Linux / macOS (Bash / Zsh)

1. **Cách 1: Gán inline chỉ cho đúng 1 câu lệnh (Khuyên dùng nhất trên Linux):**
   ```bash
   # Biến BLUE_TAG chỉ tồn tại trong đúng lúc lệnh docker compose thực thi
   # Không làm ảnh hưởng hay rò rỉ biến sang các lệnh sau đó
   BLUE_TAG=v2 docker compose up -d --no-deps blue

   APP_ENV=production docker compose up -d
   ```

2. **Cách 2: Gán biến cho cả phiên làm việc (Session Scope với `export`):**
   ```bash
   export BLUE_TAG="v2"
   export APP_ENV="production"

   # Chạy lệnh
   docker compose up -d --no-deps blue
   ```

3. **Xem và xóa biến trên Linux:**
   ```bash
   # Xem giá trị
   echo $BLUE_TAG
   # Kết quả: v2

   # Xóa biến
   unset BLUE_TAG
   ```

#### d. Ví dụ áp dụng thực chiến trong bài lab IA#4

Khi bạn chuẩn bị Release canary phiên bản `v2` lên slot `idleSlot` (giả sử là `green`):
- **Trên Windows PowerShell:**
  ```powershell
  $env:GREEN_TAG = "v2"
  docker compose up -d --no-deps green
  ```
- **Trên Linux (Bash):**
  ```bash
  GREEN_TAG=v2 docker compose up -d --no-deps green
  ```
Lúc này `compose.yaml` đọc `${GREEN_TAG:-v1}` sẽ nhận ngay giá trị `"v2"`, khởi chạy container slot `green` chạy image `linkbox:v2` mà file `compose.yaml` không cần thay đổi một ký tự nào.


### 3. Phân biệt Build-time vs Run-time Injection: Biến môi trường được nạp khi nào?

#### a. Khẳng định cốt lõi: Có phải inject vào lúc Build Image không?
> [!IMPORTANT]
> **KHÔNG PHẢI!** Biến trong file `.env` **tuyệt đối KHÔNG được nạp vào lúc `docker build` (Build Time)**.  
> Chúng chỉ được Docker Compose đọc và truyền vào container **vào lúc container khởi chạy (`docker compose up` / Runtime)**.

#### b. Bảng so sánh rạch ròi giữa 2 giai đoạn

| Tiêu chí | Giai đoạn 1: Build Time (`docker build`) | Giai đoạn 2: Run Time (`docker compose up` / `docker run`) |
| :--- | :--- | :--- |
| **Hành động** | Đóng gói mã nguồn thành Docker Image (`linkbox:v1`) | Khởi tạo và chạy Container từ Image có sẵn |
| **Tần suất** | Chỉ chạy khi có commit code mới | Chạy mỗi khi deploy, restart container, scale instance |
| **File `.env` có được đọc?** | **HOÀN TOÀN KHÔNG**. File `.dockerignore` chặn thư mục `env/` để Docker daemon không nhìn thấy | **CÓ**. Docker Compose đọc file `env/staging.env` từ ổ cứng máy host |
| **Bí mật (`ADMIN_TOKEN`)** | Không bao giờ lưu vào image (đạt chuẩn check **`I4: no secrets in image`**) | Được nạp an toàn vào bộ nhớ RAM của tiến trình container |
| **Tính chất Image** | Độc lập, bất biến (Immutable), "sạch sẽ" 100% | Phụ thuộc vào file cấu hình được gắn vào lúc bật |
| **Biến môi trường trong code** | Chỉ có `APP_VERSION` (nhờ `ARG/ENV` trong Dockerfile) | Đầy đủ `APP_ENV`, `PORT`, `DB_PATH`, `ADMIN_TOKEN` |

#### c. Luồng hoạt động chi tiết từng bước (Step-by-step Flow)

```text
[ Máy Host: Terminal & Ổ cứng ]
  │
  ├─ 1. Bạn gõ lệnh: docker compose up -d --no-deps blue
  ├─ 2. Docker Compose đọc compose.yaml:
  │       image: linkbox:${BLUE_TAG:-v1}           --> Quyết định lấy image "linkbox:v1"
  │       env_file: env/${APP_ENV:-staging}.env    --> Tìm file "env/staging.env" trên ổ cứng
  ├─ 3. Docker Compose mở file "env/staging.env", parse từng dòng:
  │       APP_ENV=staging
  │       DB_PATH=/data/app.db
  │       ADMIN_TOKEN=staging-only-not-a-secret
  │
[ Docker Engine (Daemon) ]
  │
  ├─ 4. Docker tạo một Container mới từ image "linkbox:v1"
  ├─ 5. Docker truyền danh sách biến môi trường (tương đương cờ -e KEY=VAL) vào Container
  │
[ Bên trong Container (Linux Virtual Environment) ]
  │
  ├─ 6. Nhân Linux khởi tạo process mới: "node src/server.js" (User: node)
  ├─ 7. Hệ điều hành gán bảng Environment Variables vào tiến trình Node.js
  ├─ 8. Node.js khởi động, runtime nạp toàn bộ biến vào đối tượng toàn cục process.env
  └─ 9. File src/config.js thực thi:
          process.env.APP_ENV      ===> "staging"
          process.env.ADMIN_TOKEN  ===> "staging-only-not-a-secret"
          process.env.DB_PATH      ===> "/data/app.db"
```

#### d. Tại sao kiến trúc này sống còn trong môi trường doanh nghiệp (12-Factor App)?
1. **Bảo mật tuyệt đối (Zero Secret Leak):** Nếu biến được nạp lúc `docker build`, token bí mật sẽ bị ghi chết vĩnh viễn vào các layer của Image. Bất kỳ ai gõ `docker history` hoặc kéo image về Docker Hub/Registry đều sẽ xem được token (vi phạm trực tiếp check `I4`).
2. **Nguyên lý "Build Once, Run Anywhere":** Bạn chỉ cần build duy nhất một Docker Image `linkbox:v1`. Image này có thể chạy trên máy lập trình viên (với `env/dev.env`), chạy trên máy kiểm thử (với `env/staging.env` - check `I8`), hoặc chạy trên cụm máy chủ thật (với `env/production.env` - check `I11`) mà **không cần phải sửa một dòng code hay build lại image**.

---

### 4. Hướng dẫn toàn tập cú pháp Set biến môi trường trên Terminal (Linux vs PowerShell)

Biến môi trường trên máy host đóng vai trò quyết định giá trị mặc định cho `${BLUE_TAG:-v1}` hay `${APP_ENV:-staging}` trong file `compose.yaml`.

#### a. Bảng tra cứu đối chiếu nhanh (Cheat Sheet)

| Thao tác | Windows PowerShell | Linux / macOS (Bash / Zsh) |
| :--- | :--- | :--- |
| **Gán biến trong session hiện tại** | `$env:BIEN = "gia_tri"` | `export BIEN="gia_tri"` |
| **Gán biến chỉ cho duy nhất 1 lệnh** | `$env:BIEN="gia_tri"; lenh` | `BIEN=gia_tri lenh` *(Inline - rất mạnh mẽ)* |
| **Xem giá trị của biến** | `$env:BIEN` hoặc `echo $env:BIEN` | `echo $BIEN` hoặc `printenv BIEN` |
| **Xóa biến khỏi session** | `Remove-Item env:BIEN` hoặc `$env:BIEN = $null` | `unset BIEN` |
| **Liệt kê tất cả biến môi trường** | `Get-ChildItem env:` hoặc `dir env:` | `printenv` hoặc `env` |
| **Kiểm tra biến có tồn tại không** | `Test-Path env:BIEN` | `[ -z "$BIEN" ] && echo "Chưa có"` |

#### b. Chi tiết trên Windows PowerShell

1. **Gán biến cho toàn bộ phiên làm việc (Session Scope):**
   ```powershell
   # Gán tag cho slot blue
   $env:BLUE_TAG = "v2"

   # Gán môi trường chạy là production
   $env:APP_ENV = "production"

   # Sau khi gán, lệnh docker compose sẽ tự động nhận giá trị này
   docker compose up -d --no-deps blue
   ```
   *Lưu ý: Biến này sẽ tồn tại cho đến khi bạn đóng cửa sổ PowerShell.*

2. **Xem lại giá trị đã gán:**
   ```powershell
   echo $env:BLUE_TAG
   # Kết quả: v2
   ```

3. **Xóa biến (đưa về mặc định trong `compose.yaml`):**
   ```powershell
   $env:BLUE_TAG = $null
   # hoặc:
   Remove-Item env:BLUE_TAG
   ```

#### c. Chi tiết trên Linux / macOS (Bash / Zsh)

1. **Cách 1: Gán inline chỉ cho đúng 1 câu lệnh (Khuyên dùng nhất trên Linux):**
   ```bash
   # Biến BLUE_TAG chỉ tồn tại trong đúng lúc lệnh docker compose thực thi
   # Không làm ảnh hưởng hay rò rỉ biến sang các lệnh sau đó
   BLUE_TAG=v2 docker compose up -d --no-deps blue

   APP_ENV=production docker compose up -d
   ```

2. **Cách 2: Gán biến cho cả phiên làm việc (Session Scope với `export`):**
   ```bash
   export BLUE_TAG="v2"
   export APP_ENV="production"

   # Chạy lệnh
   docker compose up -d --no-deps blue
   ```

3. **Xem và xóa biến trên Linux:**
   ```bash
   # Xem giá trị
   echo $BLUE_TAG
   # Kết quả: v2

   # Xóa biến
   unset BLUE_TAG
   ```

#### d. Ví dụ áp dụng thực chiến trong bài lab IA#4

Khi bạn chuẩn bị Release canary phiên bản `v2` lên slot `idleSlot` (giả sử là `green`):
- **Trên Windows PowerShell:**
  ```powershell
  $env:GREEN_TAG = "v2"
  docker compose up -d --no-deps green
  ```
- **Trên Linux (Bash):**
  ```bash
  GREEN_TAG=v2 docker compose up -d --no-deps green
  ```
Lúc này `compose.yaml` đọc `${GREEN_TAG:-v1}` sẽ nhận ngay giá trị `"v2"`, khởi chạy container slot `green` chạy image `linkbox:v2` mà file `compose.yaml` không cần thay đổi một ký tự nào.


---

### 5. Giải thích cờ Build: `--build-arg APP_VERSION=...` và `-t` (Cơ chế Bake Version & Cặp đôi `ARG` / `ENV`)

Khi đóng gói image phiên bản mới (ví dụ `v2` hoặc `v1`), chúng ta dùng câu lệnh:
```bash
docker build --build-arg APP_VERSION=2.0.0 -t linkbox:v2 .
```

#### a. Ý nghĩa của cờ `-t` (viết tắt của `--tag`)
- **Mục đích:** Dùng để đặt tên (repository name) và nhãn phiên bản (tag) cho Docker Image sau khi build xong.
- **Cú pháp:** `-t <tên_image>:<phiên_bản>`
  - Trong ví dụ trên: Tên image là `linkbox`, tag là `v2`.
- **Tại sao bắt buộc phải có `-t`?**
  - Nếu không truyền `-t`, Docker vẫn build image thành công nhưng chỉ gán một mã ID băm ngẫu nhiên (ví dụ `sha256:9f8a12bc4...`).
  - Khi có `-t linkbox:v2`, ta có thể gọi tên image ngắn gọn, trực quan trong `compose.yaml` (`image: linkbox:v2` hoặc `image: linkbox:${BLUE_TAG:-v1}`).

#### b. Ý nghĩa của cờ `--build-arg APP_VERSION=2.0.0`
- **Mục đích:** Dùng để truyền tham số (Build Argument) từ dòng lệnh bên ngoài vào bên trong file `Dockerfile` tại thời điểm build image.
- **Liên hệ với dòng 16 & 17 trong `Dockerfile`:**
  ```dockerfile
  ARG APP_VERSION=1.0.0
  ENV APP_VERSION=$APP_VERSION
  ```
- **Cơ chế hoạt động:**
  1. `ARG APP_VERSION=1.0.0`: Khai báo biến build với giá trị fallback mặc định là `1.0.0`.
  2. Khi gõ cờ `--build-arg APP_VERSION=2.0.0`, Docker sẽ **ghi đè giá trị `1.0.0` thành `2.0.0`** trong quá trình build layer.
  3. Dòng tiếp theo `ENV APP_VERSION=$APP_VERSION` sẽ **"nướng chết" (bake)** giá trị `2.0.0` này thành biến môi trường cố định vĩnh viễn bên trong image.
  4. Khi container chạy lên, code Node.js gọi `process.env.APP_VERSION` sẽ nhận được chuỗi `"2.0.0"`. Khi client gọi API `GET /version`, server sẽ trả về:
     ```json
     {
       "version": "2.0.0",
       "flags": { "expiry": false }
     }
     ```
  5. Cơ chế này giúp chúng ta vượt qua bài kiểm tra **Check `I7: image bakes APP_VERSION`** và **Check `F1: version reporting`**.

#### c. Bảng so sánh rạch ròi giữa `ARG` và `ENV` trong Docker

| Tiêu chí | `ARG` (Build Argument) | `ENV` (Environment Variable) |
| :--- | :--- | :--- |
| **Thời điểm tồn tại** | Chỉ sống trong lúc chạy lệnh `docker build`. Khi image build xong, `ARG` hoàn toàn biến mất. | Tồn tại xuyên suốt cả lúc build lẫn **lúc container đang chạy (Runtime)**. |
| **Ứng dụng Node.js có đọc được không?** | **Không** (`process.env` không truy cập được biến `ARG`). | **Có** (`process.env.APP_VERSION` đọc trực tiếp từ OS table). |
| **Bảo mật secrets (mật khẩu/token)** | Vẫn có thể bị soi thấy trong image metadata/history (`docker history`). Không dùng cho token bí mật. | Không bao giờ dùng cho secret trong Dockerfile (đáp ứng đúng check `I4: no secrets in image`). |
| **Lợi ích khi kết hợp cả hai:** | Giúp bạn build linh hoạt bất kỳ phiên bản nào (`v1`, `v2`, `v3`) chỉ bằng cách thay đổi giá trị truyền vào `--build-arg APP_VERSION=...` trên terminal mà **không cần sửa một dòng nào trong `Dockerfile`**. | |
