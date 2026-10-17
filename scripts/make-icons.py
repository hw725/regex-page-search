"""확장 아이콘(icons/icon16·32·48·128.png)을 그린다. 다시 그릴 때만 돌린다: py -3 scripts/make-icons.py

그림: 남색 둥근 사각형 위에 흰 돋보기, 그 안에 주황 「.*」(정규식의 상징). 주황은 popup.css 의 --accent 와 같다.
웹 스토어 지침대로 128 판은 96×96 그림 둘레에 16px 투명 여백을 둔다. 작은 판은 여백 없이 가득 채운다(툴바에서 덜 작아 보이게).
"""
from pathlib import Path

from PIL import Image, ImageDraw

S = 1024  # 크게 그린 뒤 줄인다(LANCZOS) — 가장자리가 매끄럽다
NAVY, WHITE, ORANGE = (31, 42, 68, 255), (255, 255, 255, 255), (255, 140, 26, 255)
OUT = Path(__file__).resolve().parent.parent / "icons"


def art() -> Image.Image:
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, S - 1, S - 1), radius=200, fill=NAVY)
    cx, cy, r, w = 430, 430, 270, 78
    d.ellipse((cx - r, cy - r, cx + r, cy + r), outline=WHITE, width=w)
    # 손잡이: 원 바깥 45° 방향
    d.line((cx + 0.72 * r + 30, cy + 0.72 * r + 30, 860, 860), fill=WHITE, width=120)
    d.ellipse((860 - 60, 860 - 60, 860 + 60, 860 + 60), fill=WHITE)
    # 「.」
    d.ellipse((cx - 150, cy + 40, cx - 60, cy + 130), fill=ORANGE)
    # 「*」: 선 셋
    ax, ay, ar, aw = cx + 70, cy - 40, 105, 46
    for dx, dy in ((0, 1), (0.866, 0.5), (0.866, -0.5)):
        d.line((ax - ar * dx, ay - ar * dy, ax + ar * dx, ay + ar * dy), fill=ORANGE, width=aw)
    return im


def main() -> None:
    OUT.mkdir(exist_ok=True)
    big = art()
    for n in (16, 32, 48):
        big.resize((n, n), Image.LANCZOS).save(OUT / f"icon{n}.png", optimize=True)
    canvas = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    canvas.paste(big.resize((96, 96), Image.LANCZOS), (16, 16))
    canvas.save(OUT / "icon128.png", optimize=True)
    print("icons:", ", ".join(sorted(p.name for p in OUT.glob("*.png"))))


if __name__ == "__main__":
    main()
