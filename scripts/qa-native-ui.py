"""Capture the real native menu renderers in isolated SDL test profiles."""
import concurrent.futures
import hashlib
import json
import os
import pathlib
import subprocess
import time
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "tmp" / ("native-ui-" + str(time.time_ns()))
SCREENS = [
    "pause", "intro", "title", "credits", "ending", "evaluation",
    "continue", "story", "waiting", "results", "frontend",
]


def capture(job):
    game, screen = job
    folder = OUTPUT / game / screen
    user = folder / ("srb2" if game == "adventure" else "srb2kart")
    (user / "screenshots").mkdir(parents=True)
    args = [
        str(ROOT / "native" / game / (game + ".exe")), "-home", str(folder),
        "-skipintro", "-nosound", "-nomusic", "-win", "-width", "640",
        "-height", "400", "-ph-ui-test", screen,
        "-file", str(ROOT / "native" / game / "ponyhaven.pk3"),
    ]
    with (folder / "process.log").open("w") as log:
        result = subprocess.run(
            args, cwd=ROOT / "native" / game, stdout=log, stderr=log, timeout=35,
            env={**os.environ, "SDL_VIDEODRIVER": "dummy", "SDL_RENDER_DRIVER": "software"},
        )
    assert result.returncode == 0, (game, screen, result.returncode, folder)
    shots = list(user.rglob("*.png"))
    assert len(shots) == 1, (game, screen, "expected one new screenshot", shots)
    with Image.open(shots[0]) as image:
        assert image.size == (640, 400), (game, screen, image.size)
        digest = hashlib.sha256(image.convert("RGB").tobytes()).hexdigest()
    print(game, screen, "captured", flush=True)
    return {"game": game, "screen": screen, "path": str(shots[0]), "pixels": digest}


if __name__ == "__main__":
    jobs = [(game, screen) for game in ["adventure", "ponykart"]
            for screen in SCREENS + (["finale"] if game == "adventure" else ["vote"])]
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        captures = list(pool.map(capture, jobs))
    for game in ["adventure", "ponykart"]:
        rows = [item for item in captures if item["game"] == game]
        common = {item["pixels"] for item in rows
                  if item["screen"] not in ["pause", "results", "vote"]}
        assert len(common) == 1, (game, "frontend screens must use the same replacement panel")
        sheet = Image.new("RGB", (960, 4 * 225), "#eee7fa")
        draw = ImageDraw.Draw(sheet)
        for index, item in enumerate(rows):
            x, y = (index % 3) * 320, (index // 3) * 225
            with Image.open(item["path"]) as image:
                sheet.paste(image.convert("RGB").resize((320, 200)), (x, y + 25))
            draw.text((x + 8, y + 6), game + " / " + item["screen"], fill="#2b203d")
        sheet.save(OUTPUT / (game + "-menus.png"))
    (OUTPUT / "report.json").write_text(json.dumps(captures, indent=2))
    print("All 24 native UI renders passed:", OUTPUT)
