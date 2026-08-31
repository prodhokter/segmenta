import os
import subprocess
from PIL import Image

def generate_icons():
    chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
    svg_path = os.path.abspath("apps/desktop/static/logo.svg")

    html_content = f"""<!DOCTYPE html>
<html>
<head>
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{
    background: transparent;
    width: 512px;
    height: 512px;
    overflow: hidden;
    display: flex;
    align-items: center;
    justify-content: center;
  }}
  img {{
    width: 512px;
    height: 512px;
    display: block;
  }}
</style>
</head>
<body>
  <img src="file:///{svg_path.replace(os.sep, '/')}" />
</body>
</html>"""

    temp_html = os.path.abspath("temp_icon_render.html")
    temp_png = os.path.abspath("temp_rendered_512.png")

    with open(temp_html, "w", encoding="utf-8") as f:
        f.write(html_content)

    cmd = [
        chrome_path,
        "--headless=new",
        "--disable-gpu",
        "--force-device-scale-factor=1",
        "--window-size=512,512",
        "--default-background-color=00000000",
        f"--screenshot={temp_png}",
        f"file:///{temp_html.replace(os.sep, '/')}"
    ]

    print("Rendering SVG to 512x512 PNG via Chrome headless...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print("Chrome error:", result.stderr)
        raise RuntimeError("Failed to render SVG")

    if not os.path.exists(temp_png):
        raise FileNotFoundError("Rendered PNG not found")

    im_512 = Image.open(temp_png).convert("RGBA")
    print(f"Loaded master PNG: {im_512.size}, mode: {im_512.mode}")

    # Targets:
    # Desktop Tauri icons
    tauri_icons_dir = os.path.abspath("apps/desktop/src-tauri/icons")
    os.makedirs(tauri_icons_dir, exist_ok=True)

    # 512x512 icon.png
    im_512.save(os.path.join(tauri_icons_dir, "icon.png"), "PNG")
    print("Saved icon.png (512x512)")

    # 32x32.png
    im_32 = im_512.resize((32, 32), Image.Resampling.LANCZOS)
    im_32.save(os.path.join(tauri_icons_dir, "32x32.png"), "PNG")
    print("Saved 32x32.png")

    # 128x128.png
    im_128 = im_512.resize((128, 128), Image.Resampling.LANCZOS)
    im_128.save(os.path.join(tauri_icons_dir, "128x128.png"), "PNG")
    print("Saved 128x128.png")

    # 128x128@2x.png (256x256)
    im_256 = im_512.resize((256, 256), Image.Resampling.LANCZOS)
    im_256.save(os.path.join(tauri_icons_dir, "128x128@2x.png"), "PNG")
    print("Saved 128x128@2x.png (256x256)")

    # icon.ico (16, 32, 48, 64, 128, 256)
    ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    im_512.save(
        os.path.join(tauri_icons_dir, "icon.ico"),
        format="ICO",
        sizes=ico_sizes
    )
    print("Saved icon.ico with sizes:", ico_sizes)

    # Static favicon.png (128x128 or 32x32)
    static_dir = os.path.abspath("apps/desktop/static")
    os.makedirs(static_dir, exist_ok=True)
    im_128.save(os.path.join(static_dir, "favicon.png"), "PNG")
    print("Saved apps/desktop/static/favicon.png")

    # Extension icons (icon16.png, icon32.png, icon48.png, icon128.png)
    ext_icons_dir = os.path.abspath("apps/extension/icons")
    os.makedirs(ext_icons_dir, exist_ok=True)

    im_16 = im_512.resize((16, 16), Image.Resampling.LANCZOS)
    im_16.save(os.path.join(ext_icons_dir, "icon16.png"), "PNG")
    print("Saved icon16.png")

    im_32.save(os.path.join(ext_icons_dir, "icon32.png"), "PNG")
    print("Saved icon32.png")

    im_48 = im_512.resize((48, 48), Image.Resampling.LANCZOS)
    im_48.save(os.path.join(ext_icons_dir, "icon48.png"), "PNG")
    print("Saved icon48.png")

    im_128.save(os.path.join(ext_icons_dir, "icon128.png"), "PNG")
    print("Saved icon128.png")

    # Cleanup temp files
    if os.path.exists(temp_html):
        os.remove(temp_html)
    if os.path.exists(temp_png):
        os.remove(temp_png)

    print("All multi-resolution icons successfully generated!")

if __name__ == "__main__":
    generate_icons()
