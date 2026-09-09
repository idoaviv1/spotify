import os
import subprocess
from PIL import Image, ImageDraw

PROJECT_DIR = "/home/idodi/Projects/spotify"
FRONTEND_DIR = os.path.join(PROJECT_DIR, "frontend")
RES_DIR = os.path.join(FRONTEND_DIR, "android/app/src/main/res")
IOS_ASSETS = os.path.join(FRONTEND_DIR, "ios/App/App/Assets.xcassets")

# 1. Full Master SVG (512x512)
FULL_ICON_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <!-- Background Gradient -->
    <radialGradient id="bgGrad" cx="50%" cy="36%" r="76%">
      <stop offset="0%" stop-color="#161824" />
      <stop offset="60%" stop-color="#0c0d14" />
      <stop offset="100%" stop-color="#07070a" />
    </radialGradient>

    <!-- Glass Box Background Gradient -->
    <linearGradient id="glassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(30, 215, 96, 0.22)" />
      <stop offset="100%" stop-color="rgba(20, 150, 65, 0.08)" />
    </linearGradient>

    <!-- Bar Neon Gradient -->
    <linearGradient id="barGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2af575" />
      <stop offset="35%" stop-color="#1ed760" />
      <stop offset="100%" stop-color="#129e43" />
    </linearGradient>

    <!-- Ambient Emerald Aura -->
    <radialGradient id="ambientGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(30, 215, 96, 0.38)" />
      <stop offset="50%" stop-color="rgba(30, 215, 96, 0.15)" />
      <stop offset="100%" stop-color="rgba(30, 215, 96, 0)" />
    </radialGradient>

    <!-- Neon Glow Filter -->
    <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur1" />
      <feGaussianBlur in="SourceGraphic" stdDeviation="24" result="blur2" />
      <feMerge>
        <feMergeNode in="blur2" />
        <feMergeNode in="blur1" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- Background Surface -->
  <rect width="512" height="512" rx="115" fill="url(#bgGrad)" />
  <rect x="2" y="2" width="508" height="508" rx="113" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="3" />

  <!-- Ambient Glow Behind Central Emblem -->
  <circle cx="256" cy="256" r="180" fill="url(#ambientGlow)" />

  <!-- Glass Card Frame (matching login-brand-icon-wrapper) -->
  <rect x="106" y="106" width="300" height="300" rx="88" fill="url(#glassGrad)" stroke="rgba(30, 215, 96, 0.38)" stroke-width="4" />
  <rect x="108" y="108" width="296" height="296" rx="86" fill="none" stroke="rgba(255, 255, 255, 0.14)" stroke-width="2" />

  <!-- 4 Music Equalizer Bars -->
  <g filter="url(#neonGlow)">
    <rect x="161" y="234" width="34" height="96" rx="17" fill="url(#barGrad)" />
    <rect x="213" y="150" width="34" height="180" rx="17" fill="url(#barGrad)" />
    <rect x="265" y="200" width="34" height="130" rx="17" fill="url(#barGrad)" />
    <rect x="317" y="168" width="34" height="162" rx="17" fill="url(#barGrad)" />
  </g>
</svg>'''

ROUND_ICON_SVG = FULL_ICON_SVG.replace('rx="115"', 'rx="256"').replace('rx="113"', 'rx="254"')

# 2. Adaptive Foreground SVG (108x108)
ADAPTIVE_FOREGROUND_SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 108 108" width="108" height="108">
  <defs>
    <!-- Bar Neon Gradient -->
    <linearGradient id="afBarGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#2bf575" />
      <stop offset="35%" stop-color="#1ed760" />
      <stop offset="100%" stop-color="#129e43" />
    </linearGradient>

    <!-- Ambient Glow -->
    <radialGradient id="afAmbientGlow" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="rgba(30, 215, 96, 0.45)" />
      <stop offset="50%" stop-color="rgba(30, 215, 96, 0.18)" />
      <stop offset="100%" stop-color="rgba(30, 215, 96, 0)" />
    </radialGradient>

    <!-- Glass Box Background Gradient -->
    <linearGradient id="afGlassGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(30, 215, 96, 0.25)" />
      <stop offset="100%" stop-color="rgba(20, 150, 65, 0.08)" />
    </linearGradient>

    <filter id="afNeonGlow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2.2" result="blur1" />
      <feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="blur2" />
      <feMerge>
        <feMergeNode in="blur2" />
        <feMergeNode in="blur1" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>
  </defs>

  <!-- Ambient Glow in Safe Zone -->
  <circle cx="54" cy="54" r="33" fill="url(#afAmbientGlow)" />

  <!-- Glass Card inside Safe Zone -->
  <rect x="23" y="23" width="62" height="62" rx="18" fill="url(#afGlassGrad)" stroke="rgba(30, 215, 96, 0.42)" stroke-width="1.2" />
  <rect x="23.6" y="23.6" width="60.8" height="60.8" rx="17.4" fill="none" stroke="rgba(255, 255, 255, 0.15)" stroke-width="0.6" />

  <!-- 4 Music Equalizer Bars -->
  <g filter="url(#afNeonGlow)">
    <rect x="33.9" y="49" width="7.2" height="20" rx="3.6" fill="url(#afBarGrad)" />
    <rect x="44.9" y="32" width="7.2" height="37" rx="3.6" fill="url(#afBarGrad)" />
    <rect x="55.9" y="42" width="7.2" height="27" rx="3.6" fill="url(#afBarGrad)" />
    <rect x="66.9" y="36" width="7.2" height="33" rx="3.6" fill="url(#afBarGrad)" />
  </g>
</svg>'''

# 3. Favicon SVG
FAVICON_SVG = FULL_ICON_SVG

def render_svg_to_png(svg_content, out_path, width, height):
    tmp_svg = "/tmp/render_temp.svg"
    with open(tmp_svg, "w") as f:
        f.write(svg_content)
    subprocess.run(["rsvg-convert", "-w", str(width), "-h", str(height), tmp_svg, "-o", out_path], check=True)

# Write public icons
print("Writing frontend/public/icon.svg and favicon.svg...")
with open(os.path.join(FRONTEND_DIR, "public/icon.svg"), "w") as f:
    f.write(FULL_ICON_SVG)
with open(os.path.join(FRONTEND_DIR, "public/favicon.svg"), "w") as f:
    f.write(FAVICON_SVG)

# Write ic_launcher_background.xml
print("Updating ic_launcher_background.xml...")
with open(os.path.join(RES_DIR, "values/ic_launcher_background.xml"), "w") as f:
    f.write('''<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0c0d14</color>
</resources>
''')

# Remove obsolete files
obsolete_files = [
    os.path.join(RES_DIR, "drawable/ic_launcher_background.xml"),
    os.path.join(RES_DIR, "drawable-v24/ic_launcher_foreground.xml")
]
for of in obsolete_files:
    if os.path.exists(of):
        os.remove(of)
        print(f"Removed {of}")

# Render Android Mipmaps
densities = {
    "mipmap-mdpi": {"launcher": 48, "fg": 108},
    "mipmap-hdpi": {"launcher": 72, "fg": 162},
    "mipmap-xhdpi": {"launcher": 96, "fg": 216},
    "mipmap-xxhdpi": {"launcher": 144, "fg": 324},
    "mipmap-xxxhdpi": {"launcher": 192, "fg": 432},
}

for folder, dims in densities.items():
    folder_path = os.path.join(RES_DIR, folder)
    os.makedirs(folder_path, exist_ok=True)
    l_size = dims["launcher"]
    fg_size = dims["fg"]
    
    # 1. ic_launcher.png
    render_svg_to_png(FULL_ICON_SVG, os.path.join(folder_path, "ic_launcher.png"), l_size, l_size)
    # 2. ic_launcher_round.png
    render_svg_to_png(ROUND_ICON_SVG, os.path.join(folder_path, "ic_launcher_round.png"), l_size, l_size)
    # 3. ic_launcher_foreground.png
    render_svg_to_png(ADAPTIVE_FOREGROUND_SVG, os.path.join(folder_path, "ic_launcher_foreground.png"), fg_size, fg_size)
    print(f"Rendered {folder}: launcher={l_size}px, fg={fg_size}px")

# Render iOS Icons
ios_icon_path = os.path.join(IOS_ASSETS, "AppIcon.appiconset/AppIcon-512@2x.png")
if os.path.exists(os.path.dirname(ios_icon_path)):
    render_svg_to_png(FULL_ICON_SVG, ios_icon_path, 1024, 1024)
    print("Rendered iOS AppIcon-512@2x.png (1024x1024)")

# Generate Splash Screens (Android & iOS)
# Load high-res logo emblem
tmp_logo_512 = "/tmp/splash_logo_512.png"
render_svg_to_png(FULL_ICON_SVG, tmp_logo_512, 512, 512)
logo_img = Image.open(tmp_logo_512).convert("RGBA")

def create_splash_screen(w, h, out_file):
    # Dark luxury background #0c0d14
    splash = Image.new("RGBA", (w, h), (12, 13, 20, 255))
    # Target emblem size: ~32% of min dimension
    target_dim = max(96, int(min(w, h) * 0.34))
    scaled_logo = logo_img.resize((target_dim, target_dim), Image.Resampling.LANCZOS)
    pos_x = (w - target_dim) // 2
    pos_y = (h - target_dim) // 2
    splash.alpha_composite(scaled_logo, (pos_x, pos_y))
    splash.convert("RGB").save(out_file, format="PNG")

# Android Splashes
import glob
for splash_path in glob.glob(os.path.join(RES_DIR, "drawable*/splash.png")):
    with Image.open(splash_path) as current_im:
        sw, sh = current_im.size
    create_splash_screen(sw, sh, splash_path)
    print(f"Updated splash {os.path.basename(os.path.dirname(splash_path))}/splash.png ({sw}x{sh})")

# iOS Splashes
for ios_splash in glob.glob(os.path.join(IOS_ASSETS, "Splash.imageset/*.png")):
    create_splash_screen(2732, 2732, ios_splash)
    print(f"Updated iOS splash {os.path.basename(ios_splash)}")

print("All icons and splashes generated successfully!")
