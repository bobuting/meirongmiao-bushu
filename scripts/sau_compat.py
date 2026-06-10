"""
C5: Shared compatibility layer for social-auto-upload.

Handles:
  - sys.path injection
  - conf module generation (from conf.py / conf.example.py / defaults)
  - headless config (env DOUYIN_PUBLISH_HEADLESS > conf.py > default True)
"""

import os
import sys
import types
from pathlib import Path


def _detect_local_chrome_path() -> str:
    candidates: list[Path] = []
    if os.name == "nt":
        local_app_data = os.environ.get("LOCALAPPDATA", "").strip()
        program_files = os.environ.get("ProgramFiles", "").strip()
        program_files_x86 = os.environ.get("ProgramFiles(x86)", "").strip()
        if local_app_data:
            candidates.append(Path(local_app_data) / "Google/Chrome/Application/chrome.exe")
        if program_files:
            candidates.append(Path(program_files) / "Google/Chrome/Application/chrome.exe")
        if program_files_x86:
            candidates.append(Path(program_files_x86) / "Google/Chrome/Application/chrome.exe")
    else:
        candidates.extend(
            [
                Path("/usr/bin/google-chrome"),
                Path("/usr/bin/google-chrome-stable"),
                Path("/usr/bin/chromium"),
                Path("/usr/bin/chromium-browser"),
                Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
            ]
        )
    for candidate in candidates:
        if candidate.is_file():
            return str(candidate)
    return ""


def setup_social_auto_upload(social_auto_upload_dir: str) -> None:
    """
    Add social-auto-upload to sys.path and inject a compatible `conf` module.

    Call once before importing anything from social-auto-upload.
    """
    if social_auto_upload_dir not in sys.path:
        sys.path.insert(0, social_auto_upload_dir)
    _ensure_conf_module(social_auto_upload_dir)


def _ensure_conf_module(social_auto_upload_dir: str) -> None:
    if "conf" in sys.modules:
        return

    base_dir = Path(social_auto_upload_dir).resolve()
    conf_module = types.ModuleType("conf")
    conf_module.BASE_DIR = base_dir
    conf_module.XHS_SERVER = "http://127.0.0.1:11901"
    conf_module.LOCAL_CHROME_PATH = ""
    conf_module.LOCAL_CHROME_HEADLESS = True

    # Try to load from conf.py, fallback to conf.example.py
    conf_py = base_dir / "conf.py"
    conf_example_py = base_dir / "conf.example.py"
    config_source = conf_py if conf_py.is_file() else conf_example_py if conf_example_py.is_file() else None
    if config_source is not None:
        namespace = {"__file__": str(config_source)}
        exec(compile(config_source.read_text(encoding="utf-8"), str(config_source), "exec"), namespace)
        conf_module.BASE_DIR = namespace.get("BASE_DIR", conf_module.BASE_DIR)
        conf_module.XHS_SERVER = namespace.get("XHS_SERVER", conf_module.XHS_SERVER)
        conf_module.LOCAL_CHROME_PATH = namespace.get("LOCAL_CHROME_PATH", conf_module.LOCAL_CHROME_PATH)
        conf_module.LOCAL_CHROME_HEADLESS = namespace.get(
            "LOCAL_CHROME_HEADLESS",
            conf_module.LOCAL_CHROME_HEADLESS,
        )

    if not getattr(conf_module, "BASE_DIR", None):
        conf_module.BASE_DIR = base_dir

    # Env overrides
    if os.environ.get("SOCIAL_AUTO_UPLOAD_CHROME_PATH"):
        conf_module.LOCAL_CHROME_PATH = os.environ["SOCIAL_AUTO_UPLOAD_CHROME_PATH"].strip()
    elif not str(getattr(conf_module, "LOCAL_CHROME_PATH", "")).strip():
        conf_module.LOCAL_CHROME_PATH = _detect_local_chrome_path()

    # Headless: env > conf.py > default True
    headless_env = os.environ.get("DOUYIN_PUBLISH_HEADLESS", "").strip().lower()
    if headless_env:
        conf_module.LOCAL_CHROME_HEADLESS = headless_env not in {"0", "false", "no"}

    sys.modules["conf"] = conf_module
