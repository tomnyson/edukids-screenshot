#!/bin/bash
# fix-git-history.sh
# Xóa toàn bộ lịch sử git cũ có chứa file lớn, tạo commit sạch và force push
# Chạy: bash fix-git-history.sh

set -e
cd "$(dirname "$0")"

echo "📦 Bước 1: Tạo orphan branch mới (không có lịch sử)..."
git checkout --orphan clean-main

echo "🗑️  Bước 2: Xóa tất cả file khỏi index..."
git rm -rf --cached . 2>/dev/null || true

echo "✅ Bước 3: Add chỉ các file source cần thiết..."
git add .gitignore
git add README.md
git add .github/
git add app-tauri/src/
git add app-tauri/src-tauri/src/
git add app-tauri/src-tauri/Cargo.toml
git add app-tauri/src-tauri/Cargo.lock
git add app-tauri/src-tauri/tauri.conf.json
git add app-tauri/src-tauri/build.rs
git add app-tauri/src-tauri/icons/
git add app-tauri/package.json
git add app-tauri/index.html
git add app-tauri/vite.config.ts
git add app-tauri/tsconfig.json
git add app-tauri/yarn.lock

echo "💾 Bước 4: Commit sạch..."
git commit -m "feat: Edukids Screenshot v1.0.0 (clean history)

- Chụp màn hình vùng chọn và toàn màn hình (Cmd+Shift+2/3)  
- Dán ảnh từ clipboard (Cmd+V)
- Nền tùy chỉnh: gradient, solid color, ảnh nền
- Resize và di chuyển ảnh trên canvas
- Vẽ tự do, hình chữ nhật, mũi tên, text
- Undo/Redo, lưu file PNG, copy clipboard
- Hỗ trợ đa màn hình theo con trỏ chuột
- System tray, phím tắt toàn cục
- About modal: tác giả Lê Hồng Sơn
- Build Windows qua GitHub Actions
- Logo Edukid Tây Nguyên"

echo "🚀 Bước 5: Force push lên GitHub (thay thế lịch sử cũ)..."
git push origin clean-main:main --force

echo "🔄 Bước 6: Chuyển local branch về main..."
git branch -D main 2>/dev/null || true
git checkout -b main
git branch -D clean-main 2>/dev/null || true
git branch --set-upstream-to=origin/main main

echo ""
echo "✅ XONG! Lịch sử git đã được làm sạch và push thành công."
