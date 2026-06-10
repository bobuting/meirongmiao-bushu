#!/usr/bin/env python3
"""
Douyin QR auth bridge.

This worker runs in background:
1. Open creator.douyin.com in Playwright browser
2. Extract QR image source
3. Write session state to a JSON file
4. Monitor scan / confirm status
5. Save Playwright storage_state to the requested cookie file
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from pathlib import Path
from urllib.parse import urljoin

# Force UTF-8 encoding on Windows for stdout/stderr to handle Chinese characters
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")


LOGIN_URL = "https://creator.douyin.com/"
UPLOAD_URL_KEYWORD = "creator-micro/content"
AUTH_COOKIE_NAMES = {"sessionid", "sessionid_ss", "sid_guard", "passport_auth_status"}
AUTHENTICATED_TEXTS = [
    "发布视频",
    "发布作品",
    "内容管理",
    "数据中心",
    "创作者服务中心",
    "去发布",
]
LOGIN_PROMPT_TEXTS = ["扫码登录", "手机号登录", "验证码登录", "手机登录"]


def parse_bool(value: str, default: bool = True) -> bool:
    normalized = str(value or "").strip().lower()
    if normalized in {"1", "true", "yes", "on"}:
        return True
    if normalized in {"0", "false", "no", "off"}:
        return False
    return default


def write_state(
    session_file: Path,
    *,
    session_id: str,
    user_id: str,
    qr_code_url: str = "",
    qr_updated_at: int | None = None,
    status: str = "pending",
    error_message: str | None = None,
    created_at: int | None = None,
    expires_at: int | None = None,
) -> None:
    session_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "sessionId": session_id,
        "userId": user_id,
        "qrCodeUrl": qr_code_url,
        "qrUpdatedAt": qr_updated_at,
        "status": status,
        "errorMessage": error_message,
        "createdAt": created_at or int(time.time() * 1000),
        "expiresAt": expires_at or int(time.time() * 1000) + 5 * 60 * 1000,
    }
    session_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


async def click_scan_login_if_needed(page) -> None:
    candidates = [
        page.get_by_text("扫码登录"),
        page.get_by_role("tab", name="扫码登录"),
        page.get_by_role("button", name="扫码登录"),
    ]
    for locator in candidates:
        try:
            if await locator.count() > 0:
                await locator.first.click(timeout=1500)
                await asyncio.sleep(0.5)
                return
        except Exception:
            continue


async def resolve_qr_image_src(page) -> str:
    try:
        return await page.evaluate(
            """
            () => {
              const selectors = [
                "img[alt*='二维码']",
                "img[alt*='qrcode']",
                "img[src*='qrcode']",
                "img[class*='qr']",
                ".qrcode img",
              ];
              for (const selector of selectors) {
                const element = document.querySelector(selector);
                const src = (element?.getAttribute('src') || '').trim();
                if (src) return src;
              }
              return '';
            }
            """
        )
    except Exception:
        return ""


async def has_visible_text(page, text: str) -> bool:
    try:
        locator = page.get_by_text(text)
        count = await locator.count()
        for index in range(min(count, 3)):
            if await locator.nth(index).is_visible():
                return True
    except Exception:
        return False
    return False


async def has_any_visible_text(page, texts: list[str]) -> bool:
    for text in texts:
        if await has_visible_text(page, text):
            return True
    return False


async def detect_scanned(page) -> bool:
    return await has_any_visible_text(page, ["请在手机上确认", "请在抖音APP上确认", "扫码成功", "已扫码"])


async def has_auth_cookies(context) -> bool:
    try:
        cookies = await context.cookies(["https://creator.douyin.com/", "https://www.douyin.com/"])
    except Exception:
        return False
    cookie_names = {str(item.get("name", "")).strip() for item in cookies}
    return any(name in cookie_names for name in AUTH_COOKIE_NAMES)


async def detect_confirmed(page, context, original_url: str) -> bool:
    current_url = page.url
    has_login_prompts = await has_any_visible_text(page, LOGIN_PROMPT_TEXTS)
    if current_url != original_url and UPLOAD_URL_KEYWORD in current_url:
        return True
    if not has_login_prompts and await has_auth_cookies(context):
        return True
    if not has_login_prompts and await has_any_visible_text(page, AUTHENTICATED_TEXTS):
        return True
    return current_url != original_url and "creator.douyin.com" in current_url and not has_login_prompts


async def generate_qr(session_file: Path, cookie_file: Path, timeout_ms: int, headless: bool) -> int:
    created_at = int(time.time() * 1000)
    expires_at = created_at + timeout_ms
    session_id = session_file.stem
    user_id = cookie_file.stem.replace("user-", "", 1)
    write_state(
        session_file,
        session_id=session_id,
        user_id=user_id,
        status="pending",
        created_at=created_at,
        expires_at=expires_at,
    )

    try:
        from playwright.async_api import async_playwright
    except Exception as error:
        write_state(
            session_file,
            session_id=session_id,
            user_id=user_id,
            status="error",
            error_message=f"Playwright unavailable: {error}",
            created_at=created_at,
            expires_at=expires_at,
        )
        return 1

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=headless)
        context = await browser.new_context()
        page = await context.new_page()
        try:
            await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30000)
            await click_scan_login_if_needed(page)
            qr_src = ""
            qr_ready_deadline = min(expires_at, int(time.time() * 1000) + 8000)
            while int(time.time() * 1000) < qr_ready_deadline:
                qr_src = await resolve_qr_image_src(page)
                if qr_src:
                    break
                await asyncio.sleep(0.2)
            if not qr_src:
                raise RuntimeError("未找到抖音登录二维码")
            qr_code_url = qr_src if qr_src.startswith("data:") else urljoin(page.url, qr_src)
            qr_updated_at = int(time.time() * 1000)
            original_url = page.url
            write_state(
                session_file,
                session_id=session_id,
                user_id=user_id,
                qr_code_url=qr_code_url,
                qr_updated_at=qr_updated_at,
                status="pending",
                created_at=created_at,
                expires_at=expires_at,
            )

            scanned = False
            while int(time.time() * 1000) < expires_at:
                latest_qr_src = await resolve_qr_image_src(page)
                if latest_qr_src:
                    latest_qr_code_url = (
                        latest_qr_src if latest_qr_src.startswith("data:") else urljoin(page.url, latest_qr_src)
                    )
                    if latest_qr_code_url != qr_code_url:
                        qr_code_url = latest_qr_code_url
                        qr_updated_at = int(time.time() * 1000)
                        write_state(
                            session_file,
                            session_id=session_id,
                            user_id=user_id,
                            qr_code_url=qr_code_url,
                            qr_updated_at=qr_updated_at,
                            status="scanned" if scanned else "pending",
                            created_at=created_at,
                            expires_at=expires_at,
                        )
                if not scanned and await detect_scanned(page):
                    scanned = True
                    write_state(
                        session_file,
                        session_id=session_id,
                        user_id=user_id,
                        qr_code_url=qr_code_url,
                        qr_updated_at=qr_updated_at,
                        status="scanned",
                        created_at=created_at,
                        expires_at=expires_at,
                    )
                if await detect_confirmed(page, context, original_url):
                    cookie_file.parent.mkdir(parents=True, exist_ok=True)
                    await context.storage_state(path=str(cookie_file))
                    write_state(
                        session_file,
                        session_id=session_id,
                        user_id=user_id,
                        qr_code_url=qr_code_url,
                        qr_updated_at=qr_updated_at,
                        status="confirmed",
                        created_at=created_at,
                        expires_at=expires_at,
                    )
                    await browser.close()
                    return 0
                await asyncio.sleep(1)

            write_state(
                session_file,
                session_id=session_id,
                user_id=user_id,
                qr_code_url=qr_code_url,
                qr_updated_at=qr_updated_at,
                status="timeout",
                created_at=created_at,
                expires_at=expires_at,
            )
            await browser.close()
            return 0
        except Exception as error:
            write_state(
                session_file,
                session_id=session_id,
                user_id=user_id,
                status="error",
                error_message=str(error),
                created_at=created_at,
                expires_at=expires_at,
            )
            await browser.close()
            return 1


def check_status(session_file: Path) -> int:
    if not session_file.exists():
      print(json.dumps({"status": "error", "errorMessage": "Session not found"}))
      return 1
    print(session_file.read_text(encoding="utf-8"))
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    generate = subparsers.add_parser("generate-qr")
    generate.add_argument("--session-file", required=True)
    generate.add_argument("--cookie-file", required=True)
    generate.add_argument("--timeout-ms", type=int, default=5 * 60 * 1000)
    generate.add_argument("--headless", default="true")

    status = subparsers.add_parser("check-status")
    status.add_argument("--session-file", required=True)

    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.command == "generate-qr":
        return asyncio.run(
            generate_qr(
                Path(args.session_file),
                Path(args.cookie_file),
                int(args.timeout_ms),
                parse_bool(args.headless, True),
            ),
        )
    if args.command == "check-status":
        return check_status(Path(args.session_file))
    print(json.dumps({"success": False, "error": "Unknown command"}))
    return 1


if __name__ == "__main__":
    sys.exit(main())
