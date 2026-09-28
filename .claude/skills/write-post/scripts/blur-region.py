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
        x, y, w, h = [int(v) for v in b.split(",")]
        out.append((x, y, w, h))
    return out

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
    cmd = [exe, a.src]
    if a.crop_top:
        cmd += ["-gravity", "north", "-chop", f"0x{a.crop_top}"]
    cmd += ["-gravity", "northwest"]  # 합성 좌표는 왼쪽 위 기준. north가 남아 있으면 엉뚱한 자리에 붙는다.
    # -region은 -scale에 안 먹어서 화면 전체가 흐려진다. 영역을 잘라 픽셀화·블러한 뒤 같은 자리에 합성한다.
    for (x, y, w, h) in boxes(a):
        y2 = max(0, y - a.crop_top)
        cmd += ["(", "+clone", "-crop", f"{w}x{h}+{x}+{y2}", "+repage", "-scale", "8%", "-resize", f"{w}x{h}!", "-blur", f"0x{a.radius}", ")",
                "-geometry", f"+{x}+{y2}", "-composite"]
    cmd += [a.dst]
    subprocess.run(cmd, check=True)
    return "imagemagick"

def main():
    a = parse()
    try:
        used = with_pillow(a)
    except ImportError:
        try:
            used = with_magick(a)
        except Exception:
            print("Pillow도 ImageMagick도 없습니다. 둘 중 하나를 설치하세요:\n  pip3 install pillow\n  brew install imagemagick", file=sys.stderr)
            sys.exit(2)
    print(f"saved {a.dst} ({used}, blur {len(boxes(a))} regions, crop-top {a.crop_top})")

if __name__ == "__main__":
    main()
