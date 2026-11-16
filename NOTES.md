# NOTES — IA#4 Release and Rollback (CSC13114)

Sinh viên: 23120319 — Trương Thành Phát

## 1. Ghi nhận về môi trường và công cụ thực thi (Environment & Tools Findings)

- **Môi trường chạy:** Windows 11, Node.js v26.13.1, Docker Desktop (WSL 2 backend) với Docker Compose v5.7.0.
- **Fingerprint công cụ:** `4b56096c90ea819d` (khớp hoàn toàn với giá trị quy định trong Rubric và file `tools/FINGERPRINT`).
- **Khác biệt môi trường Windows / PowerShell:**
  - Không thể sử dụng cú pháp gán biến môi trường inline kiểu Linux (`BLUE_TAG=v1 docker compose...`). Trên PowerShell phải gán riêng thông qua biến môi trường phiên làm việc: `$env:BLUE_TAG = "v1"`.
  - Để ghi song song log ra cả màn hình terminal và file mà không làm hỏng định dạng ký tự xuống dòng, sử dụng lệnh `... 2>&1 | Tee-Object -Append <log-file>`.

## 2. Ghi nhận các bất thường của công cụ kiểm tra (Tool Findings)
- *(Sẽ ghi nhận chi tiết nếu phát hiện bất thường trong quá trình chạy kiểm tra và thực nghiệm)*

## 3. Khả năng đáp ứng tải của phần cứng (Hardware & Rate Findings)
- *(Sẽ ghi nhận thông số lưu lượng thực tế đo được qua check L2 sau khi hoàn thành lượt chạy tải liên tục)*
