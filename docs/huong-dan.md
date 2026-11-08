# Khôi: Lướt Hang Đèn Lồng

Game arcade dọc cho điện thoại, làm bằng **Cocos Creator 3.8**. Bạn điều khiển Khôi, một chú đèn lồng nhỏ, lướt trong hang động. Khôi chỉ dừng lại khi chạm tường.

## Cách chơi

- **Vuốt** (hoặc phím mũi tên / WASD): Khôi lướt thẳng theo hướng đó cho tới khi đụng tường.
- Vuốt trong lúc đang lướt: lệnh được ghi nhớ và chạy ngay khi Khôi dừng.
- Nhặt **đom đóm** (điểm), **xu** (tiền mua đèn mới), **sao** (3 sao mỗi màn).
- Tránh **gai**, **dơi**, **tên** từ ống phóng và **Bóng Tối** dâng từ dưới lên.
- Vật phẩm hỗ trợ:
  - **Khiên**: đỡ một đòn, sau đó bất tử 1,5 giây.
  - **Nam châm**: hút đom đóm và xu xung quanh trong 10 giây.
  - **Băng giá**: đóng băng dơi, tên và Bóng Tối trong 5 giây.

## Chế độ chơi

| Chế độ | Mô tả |
|---|---|
| Chơi theo màn | 8 màn làm tay. Qua màn để mở màn tiếp theo, mỗi màn có 3 sao. |
| Vô tận | Hang sinh ngẫu nhiên, càng lên cao càng nhiều dơi và tên. Bóng Tối tăng tốc dần. |
| Đèn Lồng | Cửa hàng 5 màu đèn, mua bằng xu. |

Tiến trình (xu, sao, kỷ lục, đèn đã mua) được lưu trong `localStorage`.

## Chạy game

1. Cài **Cocos Dashboard**, sau đó cài **Cocos Creator 3.8.x** (đã thử với typings của 3.8.6).
2. Trong Dashboard chọn **Add / Import project**, chọn thư mục `khoiofthemask`.
3. Khi editor mở, nhấp đúp `assets/scenes/main.scene`.
4. Bấm nút **Play** (▶) để chạy thử trên trình duyệt.
5. Để xuất bản: **Project → Build**, chọn nền tảng (Web Mobile, Android, iOS...). Ở mục *Start Scene*, chọn `main`.

Nếu scene báo thiếu script hoặc bạn mở một scene trống, game vẫn tự khởi động: `GameRoot` tự gắn vào `Canvas` khi scene chạy. Bạn cũng có thể tự kéo component `GameRoot` vào node `Canvas`.

Game không cần ảnh hay âm thanh, mọi thứ được vẽ bằng `Graphics` và `Label`. Thiết kế dọc 720×1280. Điện thoại dài hơn sẽ thấy thêm hang, còn cửa sổ ngang có thêm lề hai bên.

## Chạy thử nhanh trên trình duyệt (không cần Cocos)

```bash
npm run preview
```

Sau đó mở http://localhost:8723. Lệnh này đóng gói chính code game cùng `tools/web-preview/cc`. Đó là một lớp giả lập nhỏ, cài lại bằng Canvas 2D đúng những API Cocos mà game dùng. Bản này chỉ để chơi thử và kiểm tra nhanh. Bản phát hành thật vẫn phải build bằng Cocos Creator.

## Âm thanh

Nhạc và hiệu ứng là nhạc gốc, được tổng hợp bằng code trong [tools/audio/generate-audio.py](../tools/audio/generate-audio.py). Script xuất ra file MP3 trong `assets/resources/audio/`:

- `music-menu`: nhạc nhẹ 90 BPM cho menu, 43 giây, lặp lại.
- `music-game`: nhạc dồn dập 128 BPM khi chơi, 30 giây, lặp lại. Giai điệu dùng âm giai ngũ cung La thứ.
- `sfx-*`: lướt, đom đóm, xu, sao, power-up, vỡ khiên, chết, qua màn, bấm nút.

Nút **♪ BẬT/TẮT** nằm ở góc menu và trong màn tạm dừng. Lựa chọn này được lưu lại. Muốn sửa giai điệu, bạn chỉnh các dòng nốt trong script rồi chạy lại (cần `numpy` và `ffmpeg`):

```bash
python tools/audio/generate-audio.py
```

Trên web, trình duyệt chỉ cho phát âm thanh sau lần chạm hoặc bấm phím đầu tiên.

## Cấu trúc code

```
assets/scripts/
  game-root.ts          Component chính: menu, chọn màn, cửa hàng, HUD, tạm dừng, kết quả
  logic/                Logic thuần, không import 'cc', nên test được bằng Node
    types.ts            Hướng, ô bản đồ, vật phẩm
    grid.ts             Lưới bản đồ và luật lướt (computeSlide)
    world.ts            Vật phẩm, dơi, ống tên, mũi tên
    game-session.ts     Mô phỏng một lượt chơi (di chuyển, va chạm, power-up, Bóng Tối)
    level-parser.ts     Đọc màn chơi dạng chữ ASCII
    levels.ts           8 màn chơi
    endless-generator.ts Sinh hang vô tận, luôn có đường đi lên
    solver.ts           BFS kiểm tra màn chơi qua được
    save-data.ts        Lưu tiến trình, danh sách đèn lồng
  view/                 Phần hiển thị bằng Cocos
    world-view.ts       Vẽ hang, vật phẩm, nhân vật, hiệu ứng, camera
    swipe-input.ts      Vuốt và bàn phím
    sound.ts            Nhạc nền và hiệu ứng âm thanh (AudioSource)
    ui-kit.ts           Tạo nút, chữ, lớp phủ bằng code
    palette.ts          Bảng màu
tests/                  Test Node cho phần logic
```

## Tự thiết kế màn mới

Thêm một mục vào `assets/scripts/logic/levels.ts`. Mỗi màn rộng 11 ô và có đúng 3 sao.

| Ký tự | Nghĩa | Ký tự | Nghĩa |
|---|---|---|---|
| `#` | tường | `P` | điểm xuất phát |
| ` ` | ô trống | `E` | lối ra |
| `.` | đom đóm | `c` | xu |
| `*` | sao | `^` | gai |
| `S` | khiên | `M` | nam châm |
| `F` | băng giá | `h` / `v` | dơi bay ngang / dọc |
| `U` `D` `L` `R` | ống tên bắn lên / xuống / trái / phải | | |

Đặt `darkness: 0.6` (số hàng/giây) để bật Bóng Tối cho màn đó. Sau đó chạy test. Test sẽ báo lỗi nếu lối ra hoặc sao nào không tới được mà không chạm gai.

## Chạy test

```bash
npm install
```

```bash
npm test
```

Bộ test kiểm tra luật lướt, va chạm, power-up, lưu dữ liệu, cả 8 màn (thắng được và lấy đủ 3 sao), và 40 hang vô tận cao 800 hàng (luôn có đường an toàn lên trên).
