#!/usr/bin/env python3
"""Verify the vCenter Paste Assistant source tree and release package."""

from __future__ import annotations

import json
import re
import subprocess
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EXTENSION = ROOT / "extension"
MANIFEST_PATH = EXTENSION / "manifest.json"
ZIP_PATH = ROOT / "vcenter-paste-assistant-v1.0.1.zip"
THIS_SCRIPT = Path(__file__).resolve()

LEGACY_BRANDING_TERMS = (
    "pro" + "xmox",
    "no" + "vnc",
    "pve" + "-snippets",
    "vcenter" + "-snippets",
    "xman" + "601",
    "jampbpobgkkfoeiogobjlbhldk" + "jgcfkg",
)
LEGACY_BRANDING = re.compile("|".join(LEGACY_BRANDING_TERMS), re.IGNORECASE)
LEGACY_NAMESPACE = re.compile(r"pmx[-_]", re.IGNORECASE)
OFFICIAL_REPOSITORY = "https://github.com/hkrt69iruk/vCenter-Paste-Assistant"
GITHUB_URL = re.compile(r"https?://github\.com/[^\s)>\]\"']+", re.IGNORECASE)
STALE_REPOSITORY_URL = re.compile(
    r"github\.com/(?:hkrt69iruk/vcenter-" + "snippets|xman" + r"601/pve-" + "snippets)",
    re.IGNORECASE,
)
TEXT_SUFFIXES = {".html", ".js", ".json", ".md", ".py", ".svg", ".txt"}
RELEASE_VERSION = "1.0.1"
DEBUG_OUTPUT = re.compile(r"console\.(?:log|debug|warn)\s*\(")


def fail(message: str) -> None:
    raise AssertionError(message)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="strict")


def manifest_references(manifest: dict) -> set[str]:
    references: set[str] = set()
    for script in manifest.get("content_scripts", []):
        references.update(script.get("js", []))
        references.update(script.get("css", []))
    action = manifest.get("action", {})
    if action.get("default_popup"):
        references.add(action["default_popup"])
    references.update(action.get("default_icon", {}).values())
    options = manifest.get("options_ui", {})
    if options.get("page"):
        references.add(options["page"])
    references.update(manifest.get("icons", {}).values())
    return references


def verify_manifest() -> tuple[dict, set[str]]:
    manifest = json.loads(read_text(MANIFEST_PATH))
    if manifest.get("manifest_version") != 3:
        fail("manifest_version must be 3")
    if manifest.get("version") != RELEASE_VERSION:
        fail(f"manifest version must be {RELEASE_VERSION}")
    references = manifest_references(manifest)
    missing = sorted(ref for ref in references if not (EXTENSION / ref).is_file())
    if missing:
        fail(f"Missing manifest references: {missing}")
    return manifest, references


def verify_html_references() -> None:
    for html_path in EXTENSION.glob("*.html"):
        html = read_text(html_path)
        local_refs = re.findall(r"<(?:script|img)[^>]+(?:src)=\"([^\"]+)\"", html)
        local_refs += re.findall(r"<link[^>]+href=\"([^\"]+)\"", html)
        for reference in local_refs:
            if reference.startswith(("http://", "https://", "data:")):
                continue
            if not (html_path.parent / reference).is_file():
                fail(f"Missing HTML reference: {html_path.name} -> {reference}")


def verify_javascript() -> int:
    files = sorted(EXTENSION.glob("*.js"))
    for path in files:
        result = subprocess.run(
            ["node", "--check", str(path)],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
        if result.returncode:
            fail(f"JavaScript syntax error in {path.name}:\n{result.stderr}")
    return len(files)


def verify_legacy_markers() -> None:
    branding_hits: list[str] = []
    namespace_hits: list[str] = []
    stale_url_hits: list[str] = []
    unexpected_github_hits: list[str] = []
    for path in ROOT.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        relative = path.relative_to(ROOT)
        if any(part in {".git", "tmp"} for part in relative.parts):
            continue
        if path.name == "LICENSE" or path.resolve() == THIS_SCRIPT:
            continue
        text = read_text(path)
        if LEGACY_BRANDING.search(text):
            branding_hits.append(str(relative))
        if LEGACY_NAMESPACE.search(text):
            namespace_hits.append(str(relative))
        if STALE_REPOSITORY_URL.search(text):
            stale_url_hits.append(str(relative))
        for url in GITHUB_URL.findall(text):
            if not url.lower().startswith(OFFICIAL_REPOSITORY.lower()):
                unexpected_github_hits.append(f"{relative}: {url}")
    if branding_hits:
        fail(f"Legacy branding remains in: {sorted(set(branding_hits))}")
    if namespace_hits:
        fail(f"Legacy namespace remains in: {sorted(set(namespace_hits))}")
    if stale_url_hits:
        fail(f"Stale repository URL remains in: {sorted(set(stale_url_hits))}")
    if unexpected_github_hits:
        fail(f"Unexpected GitHub URL remains in: {sorted(set(unexpected_github_hits))}")


def verify_runtime_quality() -> None:
    debug_hits: list[str] = []
    for path in EXTENSION.glob("*.js"):
        text = read_text(path)
        if DEBUG_OUTPUT.search(text):
            debug_hits.append(path.name)
    if debug_hits:
        fail(f"Development console output remains in: {sorted(debug_hits)}")


def verify_zip(references: set[str]) -> int:
    if not ZIP_PATH.is_file():
        fail(f"Release package not found: {ZIP_PATH.name}")
    with zipfile.ZipFile(ZIP_PATH) as archive:
        bad = archive.testzip()
        if bad:
            fail(f"Corrupt ZIP entry: {bad}")
        names = set(archive.namelist())
    required = {"manifest.json", "LICENSE", *references}
    missing = sorted(required - names)
    if missing:
        fail(f"Release package is missing: {missing}")
    if any(name.startswith("extension/") for name in names):
        fail("ZIP must contain extension files at its root")
    forbidden = [name for name in names if name.startswith(("tmp/", ".git/"))]
    if forbidden:
        fail(f"Forbidden files in ZIP: {forbidden}")
    return len(names)


def main() -> int:
    manifest, references = verify_manifest()
    verify_html_references()
    js_count = verify_javascript()
    verify_legacy_markers()
    verify_runtime_quality()
    zip_count = verify_zip(references)
    print("Release verification passed.")
    print(f"Version: {manifest['version']}")
    print(f"JavaScript files checked: {js_count}")
    print(f"ZIP entries checked: {zip_count}")
    print("Legacy branding: clean")
    print("Legacy namespace: clean")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (AssertionError, FileNotFoundError, json.JSONDecodeError) as error:
        print(f"Verification failed: {error}", file=sys.stderr)
        raise SystemExit(1)
