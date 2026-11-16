# AI Log (CSC13114)

Sinh viên: 23120319 — Trương Thành Phát

## 2026-11-16 — IA#4: Đóng gói linkbox v1 theo tiêu chuẩn Production (Hand-over #1)
- **Tool**: Antigravity (Gemini 3.8 Flash).
- **Asked for**: "Package linkbox as v1 image according to IA#4 requirements. Base image node:22-alpine, non-root user node, no secret baked in, only runtime files in image via .dockerignore, graceful shutdown on SIGTERM under 8s, config from environment, fail-fast on missing/dev-secret admin token in production without printing secret value, separate migration from start. Do not change anything under tools/ or in test/app.test.js. Ensure all 15 image checks I1-I15 pass."
- **Kept**: (Đang cập nhật sau khi kiểm thử và nghiệm thu mã nguồn v1)
- **Changed**: (Đang cập nhật sau khi kiểm thử và nghiệm thu mã nguồn v1)
- **Rejected**: (Đang cập nhật sau khi kiểm thử và nghiệm thu mã nguồn v1)
- **By hand**: Tự kiểm tra môi trường chạy Docker, Node.js v26, xác nhận fingerprint `4b56096c90ea819d`, gắn git tag `starter` trên commit gốc chưa qua chỉnh sửa của trường.
