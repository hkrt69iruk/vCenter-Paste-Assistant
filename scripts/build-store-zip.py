#!/usr/bin/env python3
"""Build a ZIP package for Chrome/Edge extension store upload."""

import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTENSION_DIR = ROOT / "extension"
ZIP_PATH = ROOT / "vcenter-paste-assistant-v1.0.0.zip"


def main():
    if not EXTENSION_DIR.is_dir():
        raise SystemExit(f"Not found: {EXTENSION_DIR}")

    with zipfile.ZipFile(ZIP_PATH, "w", zipfile.ZIP_DEFLATED) as zf:
        for path in sorted(EXTENSION_DIR.rglob("*")):
            if path.is_file():
                zf.write(path, path.relative_to(EXTENSION_DIR))
        zf.write(ROOT / "LICENSE", "LICENSE")

    print(f"Created {ZIP_PATH}")
    print("Upload this file to the Chrome Web Store or Edge Add-ons.")


if __name__ == "__main__":
    main()
