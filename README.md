# Hệ Thống Nhà Xe Thông Minh (Smart Parking System) - Demo Đồ Án

Ứng dụng web theo dõi và điều khiển nhà xe thông minh được thiết kế theo kiến trúc chuẩn **MVC (Model - View - Controller)**, mã nguồn viết bằng Vanilla JavaScript (ES Modules), giao diện Dark Theme tối ưu cho thiết bị di động, không sử dụng framework hay công cụ đóng gói (build/bundler).

---

## 1. Cấu Trúc Thư Mục & Phân Vai Kiến Trúc MVC

```
.
├── index.html                          # Khung HTML semantic, nạp CSS, CDN Firebase & module JS
├── css/
│   └── app.css                         # Dark mode design system, layout responsive (1 cột <800px, 2 cột >=800px)
├── js/
│   ├── app.js                          # Điểm bootstrap duy nhất: Khởi tạo và inject dependencies vào Controllers
│   ├── services/
│   │   └── pinService.js               # Quản lý mã hóa SHA-256, kiểm tra và lưu trữ mã PIN trong localStorage
│   ├── models/
│   │   ├── parkingModel.js             # Quản lý state bãi xe (số xe, sức chứa, barrie), chống trùng lặp khi F5
│   │   ├── espModel.js                 # Giao tiếp HTTP với ESP32 (GET /data, GET /barrie) qua mạng LAN
│   │   └── firebaseModel.js            # Giao tiếp Firebase phụ (đồng bộ events/commands từ xa nếu có)
│   ├── views/
│   │   ├── dashboardView.js            # Render thẻ tổng quan, sơ đồ 5 ô đỗ xe, banner cảnh báo, phát beep, ô IP
│   │   ├── logView.js                  # Render bảng 50 sự kiện, lọc, thống kê hôm nay, biểu đồ 24h & xuất CSV
│   │   └── controlView.js              # Quản lý tương tác nút khẩn cấp, modal PIN, modal cấu hình & toasts
│   └── controllers/
│       ├── dashboardController.js      # Poll GET http://{IP}/data mỗi 300ms, cập nhật số liệu, thống kê & nhật ký
│       └── gateController.js           # Gọi GET http://{IP}/barrie sau khi xác thực PIN 1234 và confirm
└── README.md                           # Tài liệu kiến trúc, hướng dẫn chạy và thông số kết nối
```

### Nguyên tắc phân tách MVC:
- **Model**: Chỉ lưu trữ trạng thái dữ liệu và thực hiện giao tiếp mạng (`espModel.js` cho LAN ESP, `firebaseModel.js` cho Firebase). Tuyệt đối **không đụng DOM**.
- **View**: Chỉ lắng nghe DOM, cập nhật giao diện và phát ra các sự kiện (callback) khi người dùng thao tác. Tuyệt đối **không fetch HTTP, không gọi Firebase**.
- **Controller**: Đóng vai trò cầu nối nghiệp vụ giữa Model và View. Điều phối poll 300ms, Page Visibility, so sánh cars để cập nhật thống kê, xác thực PIN và gửi lệnh barrie.
- **app.js**: Chỉ khởi tạo các đối tượng và truyền phụ thuộc (Dependency Injection), **không chứa logic nghiệp vụ**.

---

## 2. Cách Chạy Ứng Dụng Web

Do dự án sử dụng chuẩn **JavaScript ES Modules (`import`/`export`)**, bạn cần chạy ứng dụng qua một HTTP Server cục bộ:

- **Cách 1 (VS Code Live Server)**: Chuột phải vào file `index.html` chọn **"Open with Live Server"**.
- **Cách 2 (Python 3)**: Chạy lệnh `python3 -m http.server 8080` rồi mở `http://localhost:8080`.
- **Cách 3 (Node.js npx)**: Chạy lệnh `npx serve .`

---

## 3. Cơ Chế Hoạt Động (Kết Nối Trực Tiếp ESP32)

### A. Giao tiếp LAN với ESP32 (Nguồn chính):
- **Cấu hình IP**: Ô nhập IP trên Header, lưu trong `localStorage` (mặc định: `192.168.1.50`), có nút **Lưu** và **Kết nối lại**.
- **Chu kỳ Poll**: Tự động gọi `GET http://{IP}/data` **mỗi 300ms** khi tab đang mở. Khi tab ẩn (`document.hidden`), tạm dừng poll để tiết kiệm tài nguyên; mở lại tab thì poll ngay lập tức.
- **Dữ liệu trả về**: `{"cars": 2, "max": 5, "status": "CON SLOT"|"FULL SLOT", "barrie": "MO"|"DONG"}`. Thẻ lớn, sơ đồ 5 ô đỗ xe, trạng thái barrie được vẽ trực tiếp từ dữ liệu này, **không phụ thuộc Firebase**.
- **Xử lý mất kết nối**: Nếu fetch lỗi, hệ thống giữ nguyên số xe cũ, hiển thị chấm đỏ mất kết nối, **không reset `cars` về 0**, không thêm nhật ký rác.
- **Thống kê & Nhật ký tự động**: Khi `cars` thay đổi, trong cùng một tick:
  - Nếu xe tăng: cộng chênh lệch vào lượt vào (`vao`) và giờ hiện tại theo `Asia/Ho_Chi_Minh` (`hours[hour]`).
  - Nếu xe giảm: cộng chênh lệch vào lượt ra (`ra`).
  - Lần đầu sau khi F5: chỉ ghi nhận mốc, không tính vào/ra sai lệch.
  - Cập nhật biểu đồ 24 cột CSS thuần ngay lập tức.
  - Chèn dòng nhật ký sự kiện với nguồn ghi `ESP`.
  - Lưu trữ `parkStats` `{ date, vao, ra, cars, hours[24] }` trong `localStorage`. F5 không mất.
  - Qua ngày mới: reset lượt vào, lượt ra, biểu đồ; giữ nguyên số xe `cars` trong bãi.

### B. Điều khiển Barrie khẩn cấp:
- Bấm nút **Mở Barrie** hoặc **Đóng Barrie**.
- Nhập mã PIN 4 số (mặc định: `1234`, lưu hash SHA-256 trong `localStorage`, có chức năng đổi PIN).
- Xác nhận lần 2.
- Gọi trực tiếp `GET http://{IP}/barrie?action=open` hoặc `GET http://{IP}/barrie?action=close`.
- Khóa nút khi đang gửi, hiển thị thông báo kết quả hoặc lỗi CORS nếu có.
- **Không ghi** vào `/parking/commands/barrie`.

### C. Vai trò của Firebase (Phụ):
- Firebase chỉ đóng vai trò đồng bộ sự kiện phụ hoặc giám sát dự phòng.
- Ngay cả khi mất kết nối Internet / mất Firebase, Web vẫn điều khiển và giám sát hoàn hảo ESP32 cùng mạng Wi-Fi.
- Đã xóa listener coi `/parking/state` là nguồn chính.
