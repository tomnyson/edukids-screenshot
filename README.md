# 📸 Edukids Screenshot

<div align="center">
  <img src="app-tauri/src/assets/edukids-logo.png" width="120" alt="Edukids Screenshot Logo" />
  <h3>Ứng dụng chụp màn hình & chỉnh sửa ảnh chuyên nghiệp</h3>
  <p>Được xây dựng bởi <strong>Edukid Tây Nguyên</strong> · Tauri v2 + React + Rust</p>
</div>

---

## ✨ Tính năng

| Tính năng | Mô tả |
|-----------|-------|
| 📷 Chụp toàn màn hình | Phím tắt `Cmd/Ctrl + Shift + 3` |
| ✂️ Chụp vùng chọn | Phím tắt `Cmd/Ctrl + Shift + 2` |
| 📋 Dán ảnh từ clipboard | Nhấn `Cmd/Ctrl + V` để dán và chỉnh sửa ảnh bất kỳ |
| 🖼️ Nền tùy chỉnh | Gradient, solid color, hoặc ảnh nền tuỳ ý |
| ✏️ Chỉnh sửa ảnh | Vẽ tự do, hình chữ nhật, mũi tên, text |
| 🔄 Undo / Redo | Ctrl+Z / Ctrl+Y |
| 💾 Lưu & Copy | Lưu file PNG hoặc copy vào clipboard |
| 🖱️ Resize ảnh | Kéo góc ảnh để thay đổi kích thước |
| 🖥️ Đa màn hình | Tự động nhận diện màn hình chứa con trỏ |
| 🔔 System Tray | Chạy nền, gọi nhanh từ menu tray |

---

## 📋 Yêu cầu hệ thống

### macOS
- macOS 11.0 (Big Sur) trở lên
- Quyền **Screen Recording** (System Settings → Privacy & Security → Screen Recording)

### Windows
- Windows 10 / 11 (x64)
- Không cần cấp quyền đặc biệt

---

## 🚀 Cài đặt & Chạy

### Bước 1 — Cài đặt Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Kiểm tra cài đặt:
```bash
rustc --version   # ≥ 1.77
```

### Bước 2 — Cài đặt Node.js

Tải từ [nodejs.org](https://nodejs.org) — phiên bản **20 LTS** hoặc mới hơn.

```bash
node --version   # ≥ 20
```

### Bước 3 — Clone & cài dependencies

```bash
git clone <repo-url>
cd screenshot-tool/app-tauri
npm install
```

### Bước 4 — Chạy môi trường phát triển

```bash
npm run dev
# hoặc
yarn dev
```

> 💡 **macOS**: Lần đầu chạy, hệ thống sẽ yêu cầu cấp quyền **Screen Recording**.  
> Vào **System Settings → Privacy & Security → Screen Recording** và bật quyền cho **Terminal** (hoặc iTerm2).

---

## 📦 Build ứng dụng

### macOS — tạo file `.app` và `.dmg`

```bash
npm run build
# hoặc
yarn build
```

Output sẽ nằm tại:
```
src-tauri/target/release/bundle/macos/Edukids Screenshot.app
src-tauri/target/release/bundle/dmg/Edukids Screenshot_1.0.0_aarch64.dmg
```

### Windows — tạo file `.exe` / `.msi`

> ⚠️ File Windows **phải được build trên Windows**. Không thể cross-compile từ macOS.

Trên máy Windows, chạy:
```bash
npm run build
```

Output:
```
src-tauri/target/release/bundle/nsis/Edukids Screenshot_1.0.0_x64-setup.exe
```

### Build tự động qua GitHub Actions

Push code lên GitHub → CI workflow `.github/workflows/build-windows.yml` tự chạy trên Windows runner và upload file cài đặt vào **Artifacts** tab.

---

## 🗂️ Cấu trúc dự án

```
app-tauri/
├── src/                    # Frontend (React + TypeScript)
│   ├── App.tsx             # Root component
│   ├── components/
│   │   ├── Toolbar.tsx     # Thanh công cụ chính
│   │   ├── CanvasEditor.tsx # Editor ảnh (Fabric.js)
│   │   ├── OverlayEditor.tsx# Overlay chọn vùng chụp
│   │   └── AppLogo.tsx     # Logo component
│   └── assets/
│       └── edukids-logo.png
├── src-tauri/              # Backend (Rust)
│   ├── src/
│   │   ├── commands.rs     # Tauri commands (IPC)
│   │   ├── lib.rs          # App entry point
│   │   └── tray.rs         # System tray
│   ├── icons/              # App icons (16–512px)
│   └── tauri.conf.json     # Cấu hình Tauri
└── package.json
```

---

## 🤝 Đóng góp phát triển

Mọi đóng góp đều được hoan nghênh! Dưới đây là quy trình:

### 1. Fork & Clone

```bash
git clone https://github.com/<your-username>/screenshot-tool.git
cd screenshot-tool/app-tauri
npm install
```

### 2. Tạo branch mới

```bash
git checkout -b feature/ten-tinh-nang
# hoặc
git checkout -b fix/mo-ta-loi
```

### 3. Phát triển

- **Frontend** (React/TypeScript): chỉnh sửa trong `src/`
- **Backend** (Rust): chỉnh sửa trong `src-tauri/src/`
- Chạy `npm run dev` để xem thay đổi real-time

### 4. Kiểm tra trước khi commit

```bash
# Kiểm tra Rust compile
cd src-tauri && cargo check

# Build production để đảm bảo không lỗi
npm run build
```

### 5. Commit & Push

```bash
git add .
git commit -m "feat: mô tả thay đổi ngắn gọn"
git push origin feature/ten-tinh-nang
```

### 6. Tạo Pull Request

Vào GitHub → **New Pull Request** → mô tả thay đổi và lý do.

---

### 📌 Quy ước commit

| Prefix | Ý nghĩa |
|--------|---------|
| `feat:` | Tính năng mới |
| `fix:` | Sửa lỗi |
| `refactor:` | Tái cấu trúc code |
| `docs:` | Cập nhật tài liệu |
| `chore:` | CI/CD, config, build |

---

## 👨‍💻 Tác giả

**Lê Hồng Sơn** — [tabletkindfire@gmail.com](mailto:tabletkindfire@gmail.com)  
**Edukid Tây Nguyên**

---

## 📄 License

MIT © 2025 Edukid Tây Nguyên
