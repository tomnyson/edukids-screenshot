# 📸 Edukids Screenshot

<div align="center">
  <img src="src/assets/edukids-logo.png" width="120" alt="Edukids Screenshot Logo" />
  <h3>Ứng dụng chụp màn hình & chỉnh sửa ảnh chuyên nghiệp</h3>
  <p>Được xây dựng bởi <strong>Edukid Tây Nguyên</strong> · Tauri v2 + React + Rust</p>
</div>

---

## ✨ Tính năng

| Tính năng               | Mô tả                                              |
| ----------------------- | -------------------------------------------------- |
| 📷 Chụp toàn màn hình   | Phím tắt `Cmd/Ctrl + Shift + 3`                    |
| ✂️ Chụp vùng chọn       | Phím tắt `Cmd/Ctrl + Shift + 2`                    |
| 📋 Dán ảnh từ clipboard | Nhấn `Cmd/Ctrl + V` để dán và chỉnh sửa ảnh bất kỳ |
| 🖼️ Nền tùy chỉnh        | Gradient, solid color, hoặc ảnh nền tuỳ ý          |
| ✏️ Chỉnh sửa ảnh        | Vẽ tự do, hình chữ nhật, mũi tên, text             |
| 🔄 Undo / Redo          | Ctrl+Z / Ctrl+Y                                    |
| 💾 Lưu & Copy           | Lưu file PNG hoặc copy vào clipboard               |
| 🖱️ Resize ảnh           | Kéo góc ảnh để thay đổi kích thước                 |
| 🖥️ Đa màn hình          | Tự động nhận diện màn hình chứa con trỏ            |
| 🔔 System Tray          | Chạy nền, gọi nhanh từ menu tray                   |

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
cd screenshot-tool
yarn install
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

Trước khi build, đặt FFmpeg vào `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`. Tauri yêu cầu hậu tố target-triple, đổi tên từ `ffmpeg.exe` [tải tại gyan.dev](https://www.gyan.dev/ffmpeg/builds/). Nếu chưa cấu hình khóa ký cập nhật, đặt biến môi trường `TAURI_SIGNING_PRIVATE_KEY` trước khi build.

Trên máy Windows, chạy:

```bash
npm run build
```

Output:

```
src-tauri/target/release/bundle/nsis/Edukids Screenshot_1.0.0_x64-setup.exe
```

### Build tự động qua GitHub Actions

Workflow `.github/workflows/release.yml` build song song **Windows x64**, **macOS Apple Silicon (arm64)** và **macOS Intel (x64)**:

- Push lên `main` (hoặc chạy tay trong tab Actions) → build và upload file cài đặt vào tab **Artifacts**.
- Push tag `v*` → build, tạo **GitHub Release** kèm file cài đặt và `latest.json` cho tính năng tự cập nhật. Release ở dạng nháp và chỉ được công khai khi cả 3 bản build đều thành công.

### 🔄 Tự động cập nhật (từ v1.1.0)

Khi khởi động, app kiểm tra bản mới trên GitHub Releases. Nếu có bản mới, app hỏi **Cập nhật / Để sau**. Có thể kiểm tra thủ công qua menu tray **🔄 Kiểm tra cập nhật** hoặc nút trong màn hình **Giới thiệu**.

> Các bản 1.0.x chưa có updater, nên người dùng cần cài tay bản 1.1.0 **một lần**.

**Thiết lập một lần (khóa ký bản cập nhật):**

```bash
yarn tauri signer generate -w ~/.tauri/edukids.key
```

- Dán nội dung `~/.tauri/edukids.key.pub` vào `plugins.updater.pubkey` trong `src-tauri/tauri.conf.json`.
- Thêm GitHub Secrets: `TAURI_SIGNING_PRIVATE_KEY` (nội dung file `~/.tauri/edukids.key`) và `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.
- ⚠️ Giữ khóa riêng cẩn thận. Mất khóa thì các bản đã cài sẽ không nhận được cập nhật nữa.

### 🧪 Build & test trên máy trước khi phát hành (bắt buộc)

Cần cài: Rust (`winget install Rustlang.Rustup`) và Visual Studio Build Tools 2022 với workload C++. Đặt `ffmpeg.exe` vào `src-tauri/binaries/ffmpeg-x86_64-pc-windows-msvc.exe`.

```bash
yarn build:local   # build bản release, không đóng gói installer
yarn test:smoke    # mở app thật và kiểm tra tự động, phải đạt 11/11
```

Smoke test kiểm tra: không bật cửa sổ console, IPC hoạt động, đủ 4 phím tắt, chụp màn hình, mở và đóng vùng chọn mà không treo, Ctrl+Shift+2, quay video 3 giây, đổi phím tắt. Test sẽ tắt Edukids đang chạy. Có thể test file đã cài bằng: `node scripts/smoke-test-windows.mjs "%LOCALAPPDATA%\Edukids Screenshot\screenshot-tool.exe"`.

### 🏷️ Phát hành phiên bản mới

0. Chạy build và smoke test ở mục trên. Chỉ tiếp tục khi đạt 11/11.
1. Tăng version (ví dụ `1.1.1`) ở **cả 3 file**: `package.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`.
2. Commit, rồi tạo và push tag:
   ```bash
   git commit -am "release: v1.1.1"
   git tag v1.1.1
   git push origin main --tags
   ```
3. Chờ CI chạy xong. Release mới được công khai và app đã cài sẽ tự nhận bản cập nhật.

### 🍎 Lưu ý cài đặt trên macOS (bản chưa ký Apple)

Lần đầu mở app, nhấn chuột phải vào app → **Open**. Nếu macOS báo app "bị hỏng" (damaged), chạy:

```bash
xattr -cr "/Applications/Edukids Screenshot.app"
```

---

## 🗂️ Cấu trúc dự án

```
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
cd screenshot-tool
yarn install
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

| Prefix      | Ý nghĩa              |
| ----------- | -------------------- |
| `feat:`     | Tính năng mới        |
| `fix:`      | Sửa lỗi              |
| `refactor:` | Tái cấu trúc code    |
| `docs:`     | Cập nhật tài liệu    |
| `chore:`    | CI/CD, config, build |

---

## 👨‍💻 Tác giả

**Lê Hồng Sơn** — [tabletkindfire@gmail.com](mailto:tabletkindfire@gmail.com)  
**Edukid Tây Nguyên**

---

## 📄 License

MIT © 2025 Edukid Tây Nguyên
claude --dangerously-skip-permissions
