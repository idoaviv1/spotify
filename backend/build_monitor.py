#!/usr/bin/env python3
"""Codemagic build monitor and IPA downloader for Homeify."""
import sys
import time
import json
import urllib.request
from pathlib import Path

BUILD_ID = sys.argv[1] if len(sys.argv) > 1 else "6a9e99201386ffcde087167a"
API_TOKEN = "u-jxzU__0hLCtlnicGY6XMZqyDG9YVLFbuc1_zWzQ2E"
DEST_DIR = Path("/media/windows/Shared-IPA")
DEST_DIR.mkdir(parents=True, exist_ok=True)

headers = {
    "x-auth-token": API_TOKEN,
    "User-Agent": "HomeifyBuilder/1.0"
}

print(f"📡 Monitoring Codemagic build: {BUILD_ID}...")

last_status = None
last_action = None

while True:
    url = f"https://api.codemagic.io/builds/{BUILD_ID}"
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        print(f"⚠️ Network error checking build: {e}")
        time.sleep(10)
        continue

    build = data.get("build", {})
    status = build.get("status")
    actions = build.get("buildActions", [])

    # Find current running action
    curr_action = None
    for a in actions:
        if a.get("status") == "running":
            curr_action = a.get("name")
            break
        elif a.get("status") == "success":
            curr_action = f"Done: {a.get('name')}"

    if status != last_status or curr_action != last_action:
        print(f"[{time.strftime('%H:%M:%S')}] Status: {status} | Current Step: {curr_action}", flush=True)
        last_status = status
        last_action = curr_action

    if status in ("finished", "failed", "canceled", "timeout"):
        if status == "finished":
            print("🎉 Build SUCCESS! Fetching artefacts...")
            artefacts = build.get("artefacts", [])
            print(f"Found {len(artefacts)} artefacts:")
            for art in artefacts:
                name = art.get("name", "app.ipa")
                art_url = art.get("url")
                size = art.get("size", 0)
                dest_file = DEST_DIR / name
                print(f"📥 Downloading {name} ({size / (1024*1024):.2f} MB) to {dest_file}...")
                
                art_req = urllib.request.Request(art_url, headers=headers)
                with urllib.request.urlopen(art_req) as art_resp, open(dest_file, "wb") as f:
                    while chunk := art_resp.read(65536):
                        f.write(chunk)
                
                print(f"✅ Successfully saved IPA to: {dest_file} ({dest_file.stat().st_size} bytes)")

            print("🏆 Build process complete!")
            sys.exit(0)
        else:
            print(f"❌ Build failed with status: {status}")
            print(f"Message: {build.get('message')}")
            # Print failed action log if available
            for a in actions:
                if a.get("status") == "failed":
                    print(f"Failed action: {a.get('name')}")
            sys.exit(1)

    time.sleep(10)
