#!/usr/bin/env python3
"""캡처 이미지의 지정 영역을 블러(또는 크롭)합니다.

사용법:
  python3 blur-region.py IN.png OUT.png --blur x,y,w,h [--blur x,y,w,h ...] [--crop-top N] [--radius 18]

- 좌표는 원본 픽셀 기준(레티나 2배 캡처면 2배 좌표).
- --crop-top N : 위에서 N픽셀 잘라냄(브라우저 주소창처럼 위치가 고정된 것).
- Pillow가 없으면 ImageMagick(magick)로 자동 폴백. 둘 다 없으면 설치 안내 후 종료.
"""
import sys, argparse, shutil, subprocess

def parse():
    ap = argparse.ArgumentParser()
    ap.add_argument("src"); ap.add_argument("dst")
    ap.add_argument("--blur", action="append", default=[], help="x,y,w,h")
    ap.add_argument("--crop-top", type=int, default=0)
    ap.add_argument("--radius", type=int, default=18)
    return ap.parse_args()

def boxes(args):
    out = []
    for b in args.blur:
        parts = b.split(",")
        if len(parts) != 4:
            print(f"--blur 값은 x,y,w,h 네 숫자여야 해요: '{b}'", file=sys.stderr); sys.exit(3)
        x, y, w, h = [int(v) for v in parts]
        out.append((x, y, w, h))
    return out

def image_size(src):
    exe = shutil.which("magick") or shutil.which("identify")
    try:
        if exe and exe.endswith("magick"):
            out = subprocess.run([exe, "identify", "-format", "%w %h", src], capture_output=True, text=True, check=True).stdout
        elif exe:
            out = subprocess.run([exe, "-format", "%w %h", src], capture_output=True, text=True, check=True).stdout
        else:
            return None
        w, h = out.split()[:2]; return int(w), int(h)
    except Exception:
        return None

def with_pillow(a):
    from PIL import Image, ImageFilter
    im = Image.open(a.src).convert("RGB")
    if a.crop_top:
        im = im.crop((0, a.crop_top, im.width, im.height))
    for (x, y, w, h) in boxes(a):
        y2 = y - a.crop_top
        if y2 + h <= 0: continue
        y2 = max(0, y2)
        region = im.crop((x, y2, x + w, y2 + h))
        # 픽셀화 + 블러 두 겹: 글자 복원이 안 되게
        small = region.resize((max(1, w // 12), max(1, h // 12)))
        region = small.resize(region.size).filter(ImageFilter.GaussianBlur(a.radius))
        im.paste(region, (x, y2))
    im.save(a.dst)
    return "pillow"

def with_magick(a):
    exe = shutil.which("magick") or shutil.which("convert")
    if not exe: raise RuntimeError("no magick")
    size = image_size(a.src)
    if size and a.crop_top >= size[1]:
        print(f"--crop-top {a.crop_top}이 이미지 높이 {size[1]}보다 커요.", file=sys.stderr); sys.exit(3)
    cmd = [exe, a.src]
    if a.crop_top:
        cmd += ["-gravity", "north", "-chop", f"0x{a.crop_top}"]
    cmd += ["-gravity", "northwest"]  # 합성 좌표는 왼쪽 위 기준. north가 남아 있으면 엉뚱한 자리에 붙는다.
    # -region은 -scale에 안 먹어서 화면 전체가 흐려진다. 영역을 잘라 픽셀화·블러한 뒤 같은 자리에 합성한다.
    for (x, y, w, h) in boxes(a):
        y2 = y - a.crop_top
        if y2 + h <= 0: continue  # 잘라낸 위쪽 영역은 건너뛴다(Pillow 경로와 같게)
        if y2 < 0: h += y2; y2 = 0
        if size and (x >= size[0] or y2 >= size[1] - a.crop_top):
            print(f"--blur {x},{y},{w},{h} 영역이 이미지 밖이에요(크기 {size[0]}x{size[1]}).", file=sys.stderr); sys.exit(3)
        cmd += ["(", "+clone", "-crop", f"{w}x{h}+{x}+{y2}", "+repage", "-scale", "8%", "-resize", f"{w}x{h}!", "-blur", f"0x{a.radius}", ")",
                "-geometry", f"+{x}+{y2}", "-composite"]
    cmd += [a.dst]
    subprocess.run(cmd, check=True)
    return "imagemagick"

def main():
    a = parse()
    import os
    if not os.path.exists(a.src):
        print(f"원본 파일이 없어요: {a.src}", file=sys.stderr); sys.exit(3)
    try:
        used = with_pillow(a)
    except ImportError:
        exe = shutil.which("magick") or shutil.which("convert")
        if not exe:
            print("Pillow도 ImageMagick도 없습니다. 둘 중 하나를 설치하세요:\n  pip3 install pillow\n  brew install imagemagick", file=sys.stderr)
            sys.exit(2)
        try:
            used = with_magick(a)
        except subprocess.CalledProcessError as e:
            print(f"가리기 실패(ImageMagick 오류). 좌표와 파일을 확인하세요: {e}", file=sys.stderr); sys.exit(3)
    print(f"saved {a.dst} ({used}, blur {len(boxes(a))} regions, crop-top {a.crop_top})")

if __name__ == "__main__":
    main()
