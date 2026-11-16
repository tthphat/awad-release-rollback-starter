# BRIEF — IA#4 Release and Rollback (CSC13114)

Sinh viên: 23120319 — Trương Thành Phát

---

## Hand-over #1: Đóng gói chuẩn Production — Phiên bản v1

- **Ngày giao việc:** 2026-11-16
- **Mục tiêu:** Đóng gói dịch vụ `linkbox` thành Docker image `linkbox:v1` sẵn sàng cho môi trường Production mà không làm thay đổi hành vi nghiệp vụ của dịch vụ.
- **Yêu cầu chi tiết:**
  1. Cập nhật `Dockerfile`:
     - Sử dụng base image cố định `node:22-alpine` (thay vì `node:latest`).
     - Tối ưu kích thước image $\le 300\text{ MB}$.
     - Thiết lập chạy bằng non-root user `USER node`.
     - Tuyệt đối không nhúng secret (`ADMIN_TOKEN`) vào bất kỳ layer hay cấu hình nào của image.
     - Cấp quyền ghi thư mục volume `/data` cho user `node`.
     - Nhận biến `APP_VERSION` thông qua build argument: `docker build --build-arg APP_VERSION=1.0.0 -t linkbox:v1 .`.
     - Thêm chỉ thị `HEALTHCHECK` kiểm tra tính sẵn sàng của HTTP server.
     - Dùng exec-form `CMD ["node", "src/server.js"]` để Node nhận trực tiếp tín hiệu `SIGTERM` làm PID 1.
  2. Tạo file `.dockerignore`:
     - Loại bỏ toàn bộ các file/thư mục không cần thiết cho quá trình chạy thực tế: `.git`, `Dockerfile`, `compose.yaml`, `env/`, `test/`, `tools/`, `data/`, `*.log`, `*.md`... Chỉ giữ lại `src/`, `migrations/`, `package.json`, `package-lock.json`.
  3. Cập nhật `src/config.js` & `src/server.js`:
     - Đọc cấu hình từ biến môi trường: `APP_ENV`, `BASE_URL`, `DB_PATH`, `ADMIN_TOKEN`.
     - Xử lý Fail-fast: Khi `APP_ENV=production`, nếu thiếu `ADMIN_TOKEN` hoặc dùng token mặc định `dev-secret`, ứng dụng phải thoát ngay lập tức (exit code 1), in ra tên biến cấu hình bị lỗi và **tuyệt đối không in giá trị secret**.
     - Bắt tín hiệu `SIGTERM`, dừng nhận kết nối mới, đợi hoàn tất các request đang xử lý dở dang (graceful shutdown) và thoát trong $\le 8\text{ giây}$.
  4. Cập nhật `package.json`:
     - Tách biệt migration khỏi lệnh khởi động: `npm start` chỉ chạy `node src/server.js`, không tự ý chạy migration (migration là bước chạy riêng biệt).
- **Giới hạn nghiêm ngặt (Limits):**
  - **TUYỆT ĐỐI KHÔNG CHỈNH SỬA** bất kỳ file nào trong thư mục `tools/` và file `test/app.test.js`.
  - Giữ nguyên chữ ký hàm `createApp(db, config)` và cấu trúc `node src/migrate.js`.
  - Không chạy lệnh `git commit` hay `git push`.
- **Tiêu chí nghiệm thu (Done condition):**
  - Lệnh `npm run check -- image --new=linkbox:v1` báo **PASS toàn bộ 15/15 bài kiểm tra (`I1` đến `I15`)**.

