import asyncio
import os
from PIL import Image
from playwright.async_api import async_playwright

async def generate_icons():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 512, "height": 512})
        with open("apps/desktop/static/logo.svg", "r", encoding="utf-8") as f:
            svg = f.read()
        html = f"""<!DOCTYPE html>
<html>
<head>
<style>
  html, body {{
    margin: 0;
    padding: 0;
    width: 512px;
    height: 512px;
    background: transparent;
    overflow: hidden;
  }}
  svg {{
    width: 100%;
    height: 100%;
    display: block;
  }}
</style>
</head>
<body>
{svg}
</body>
</html>"""
        await page.set_content(html)
        temp_png = "temp_icon_512.png"
        await page.screenshot(path=temp_png, omit_background=True)
        await browser.close()
        print("Generated master 512x512 image")

    # Load with PIL and resize to target sizes
    img = Image.open("temp_icon_512.png")

    # Tauri desktop icons:
    # 32x32.png, 128x128.png, 128x128@2x.png (256x256), icon.png (512x512), icon.ico
    tauri_dir = "apps/desktop/src-tauri/icons"
    os.makedirs(tauri_dir, exist_ok=True)

    img_32 = img.resize((32, 32), Image.Resampling.LANCZOS)
    img_32.save(os.path.join(tauri_dir, "32x32.png"), "PNG")

    img_128 = img.resize((128, 128), Image.Resampling.LANCZOS)
    img_128.save(os.path.join(tauri_dir, "128x128.png"), "PNG")

    img_256 = img.resize((256, 256), Image.Resampling.LANCZOS)
    img_256.save(os.path.join(tauri_dir, "128x128@2x.png"), "PNG")

    img.save(os.path.join(tauri_dir, "icon.png"), "PNG")

    # ICO format with multiple sizes
    img.save(
        os.path.join(tauri_dir, "icon.ico"),
        format="ICO",
        sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    print("Saved all desktop tauri icons.")

    # Extension icons:
    # icon16.png, icon32.png, icon48.png, icon128.png
    ext_dir = "apps/extension/icons"
    os.makedirs(ext_dir, exist_ok=True)

    img_16 = img.resize((16, 16), Image.Resampling.LANCZOS)
    img_16.save(os.path.join(ext_dir, "icon16.png"), "PNG")

    img_32.save(os.path.join(ext_dir, "icon32.png"), "PNG")

    img_48 = img.resize((48, 48), Image.Resampling.LANCZOS)
    img_48.save(os.path.join(ext_dir, "icon48.png"), "PNG")

    img_128.save(os.path.join(ext_dir, "icon128.png"), "PNG")
    print("Saved all extension icons.")

    if os.path.exists("temp_icon_512.png"):
        os.remove("temp_icon_512.png")

if __name__ == "__main__":
    asyncio.run(generate_icons())
