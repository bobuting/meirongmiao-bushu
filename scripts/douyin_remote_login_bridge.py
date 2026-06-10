#!/usr/bin/env python3
"""
Remote Douyin login bridge.

Runs on Linux:
1. Starts an xpra HTML5 session
2. Launches headed Playwright Chromium inside that display
3. Lets the user operate the remote browser from the frontend
4. Saves storage_state when login succeeds
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

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
CHALLENGE_TEXTS = [
    "身份验证",
    "接收短信验证码",
    "发送短信验证",
    "手机刷脸验证",
    "为保障账号安全，请先完成身份验证",
]


def write_state(
    session_file: Path,
    *,
    session_id: str,
    user_id: str,
    status: str,
    remote_login_url: str = "",
    error_message: str | None = None,
    challenge_text: str | None = None,
    created_at: int | None = None,
    expires_at: int | None = None,
    bind_port: int | None = None,
    display_num: int | None = None,
) -> None:
    session_file.parent.mkdir(parents=True, exist_ok=True)
    payload = {
      "sessionId": session_id,
      "userId": user_id,
      "status": status,
      "remoteLoginUrl": remote_login_url,
      "errorMessage": error_message,
      "challengeText": challenge_text,
      "createdAt": created_at or int(time.time() * 1000),
      "expiresAt": expires_at or int(time.time() * 1000) + 15 * 60 * 1000,
      "bindPort": bind_port,
      "displayNum": display_num,
    }
    session_file.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


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


async def detect_challenge(page) -> str | None:
    for text in CHALLENGE_TEXTS:
        if await has_visible_text(page, text):
            return text
    return None


async def has_auth_cookies(context) -> bool:
    try:
        cookies = await context.cookies(["https://creator.douyin.com/", "https://www.douyin.com/"])
    except Exception:
        return False
    cookie_names = {str(item.get("name", "")).strip() for item in cookies}
    return any(name in cookie_names for name in AUTH_COOKIE_NAMES)


async def is_authenticated(page, context) -> bool:
    if await detect_challenge(page):
        return False
    current_url = page.url
    has_login_prompts = await has_any_visible_text(page, LOGIN_PROMPT_TEXTS)
    if current_url and UPLOAD_URL_KEYWORD in current_url and await has_auth_cookies(context):
        return True
    if not has_login_prompts and await has_auth_cookies(context):
        return True
    if not has_login_prompts and await has_any_visible_text(page, AUTHENTICATED_TEXTS):
        return True
    return False


def start_xpra(xpra_bin: str, display_num: int, bind_host: str, bind_port: int) -> None:
    if shutil.which(xpra_bin) is None:
        raise RuntimeError(f"未找到 xpra 可执行文件: {xpra_bin}")

    command = [
        xpra_bin,
        "start",
        f":{display_num}",
        f"--bind-tcp={bind_host}:{bind_port}",
        "--html=on",
        "--daemon=yes",
        "--exit-with-children=yes",
        "--pulseaudio=no",
        "--notifications=no",
        "--bell=no",
        "--printing=no",
        "--speaker=off",
        "--microphone=off",
        "--webcam=no",
    ]
    result = subprocess.run(command, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        raise RuntimeError(
            f"启动 xpra 失败: {result.stderr.strip() or result.stdout.strip() or f'code={result.returncode}'}"
        )


def stop_xpra(xpra_bin: str, display_num: int) -> None:
    if shutil.which(xpra_bin) is None:
        return
    subprocess.run([xpra_bin, "stop", f":{display_num}"], capture_output=True, text=True, check=False)


async def run_bridge(args: argparse.Namespace) -> int:
    session_file = Path(args.session_file)
    cookie_file = Path(args.cookie_file)
    session_id = session_file.stem
    user_id = cookie_file.stem.replace("user-", "", 1)
    created_at = int(time.time() * 1000)
    expires_at = created_at + int(args.timeout_ms)
    remote_login_url = (
        args.public_url_template.replace("{sessionId}", session_id)
        .replace("{port}", str(args.bind_port))
        .replace("{display}", str(args.display_num))
    )

    if sys.platform == "win32":
        write_state(
            session_file,
            session_id=session_id,
            user_id=user_id,
            status="error",
            remote_login_url=remote_login_url,
            error_message="远程登录桥接仅支持 Linux 服务器环境",
            created_at=created_at,
            expires_at=expires_at,
            bind_port=args.bind_port,
            display_num=args.display_num,
        )
        return 1

    write_state(
        session_file,
        session_id=session_id,
        user_id=user_id,
        status="starting",
        remote_login_url=remote_login_url,
        created_at=created_at,
        expires_at=expires_at,
        bind_port=args.bind_port,
        display_num=args.display_num,
    )

    try:
        start_xpra(args.xpra_bin, args.display_num, args.bind_host, args.bind_port)
        await asyncio.sleep(2)
        write_state(
            session_file,
            session_id=session_id,
            user_id=user_id,
            status="ready",
            remote_login_url=remote_login_url,
            created_at=created_at,
            expires_at=expires_at,
            bind_port=args.bind_port,
            display_num=args.display_num,
        )
    except Exception as error:
        write_state(
            session_file,
            session_id=session_id,
            user_id=user_id,
            status="error",
            remote_login_url=remote_login_url,
            error_message=str(error),
            created_at=created_at,
            expires_at=expires_at,
            bind_port=args.bind_port,
            display_num=args.display_num,
        )
        return 1

    try:
        from playwright.async_api import async_playwright
    except Exception as error:
        write_state(
            session_file,
            session_id=session_id,
            user_id=user_id,
            status="error",
            remote_login_url=remote_login_url,
            error_message=f"Playwright unavailable: {error}",
            created_at=created_at,
            expires_at=expires_at,
            bind_port=args.bind_port,
            display_num=args.display_num,
        )
        stop_xpra(args.xpra_bin, args.display_num)
        return 1

    previous_display = os.environ.get("DISPLAY")
    os.environ["DISPLAY"] = f":{args.display_num}"

    async with async_playwright() as playwright:
        launch_options: dict[str, object] = {"headless": False}
        if args.chrome_bin:
            launch_options["executable_path"] = args.chrome_bin
        browser = await playwright.chromium.launch(**launch_options)
        context = await browser.new_context()
        page = await context.new_page()
        last_challenge: str | None = None
        try:
            await page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=30000)
            while int(time.time() * 1000) < expires_at:
                challenge_text = await detect_challenge(page)
                if challenge_text:
                    if challenge_text != last_challenge:
                        write_state(
                            session_file,
                            session_id=session_id,
                            user_id=user_id,
                            status="challenge_required",
                            remote_login_url=remote_login_url,
                            challenge_text=challenge_text,
                            created_at=created_at,
                            expires_at=expires_at,
                            bind_port=args.bind_port,
                            display_num=args.display_num,
                        )
                        last_challenge = challenge_text
                elif last_challenge is not None:
                    last_challenge = None
                    write_state(
                        session_file,
                        session_id=session_id,
                        user_id=user_id,
                        status="ready",
                        remote_login_url=remote_login_url,
                        created_at=created_at,
                        expires_at=expires_at,
                        bind_port=args.bind_port,
                        display_num=args.display_num,
                    )

                if await is_authenticated(page, context):
                    cookie_file.parent.mkdir(parents=True, exist_ok=True)
                    await context.storage_state(path=str(cookie_file))
                    write_state(
                        session_file,
                        session_id=session_id,
                        user_id=user_id,
                        status="confirmed",
                        remote_login_url=remote_login_url,
                        created_at=created_at,
                        expires_at=expires_at,
                        bind_port=args.bind_port,
                        display_num=args.display_num,
                    )
                    return 0

                await asyncio.sleep(2)

            write_state(
                session_file,
                session_id=session_id,
                user_id=user_id,
                status="timeout",
                remote_login_url=remote_login_url,
                created_at=created_at,
                expires_at=expires_at,
                bind_port=args.bind_port,
                display_num=args.display_num,
            )
            return 0
        except Exception as error:
            write_state(
                session_file,
                session_id=session_id,
                user_id=user_id,
                status="error",
                remote_login_url=remote_login_url,
                error_message=str(error),
                created_at=created_at,
                expires_at=expires_at,
                bind_port=args.bind_port,
                display_num=args.display_num,
            )
            return 1
        finally:
            await context.close()
            await browser.close()
            if previous_display is None:
                os.environ.pop("DISPLAY", None)
            else:
                os.environ["DISPLAY"] = previous_display
            stop_xpra(args.xpra_bin, args.display_num)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--session-file", required=True)
    parser.add_argument("--cookie-file", required=True)
    parser.add_argument("--xpra-bin", required=True)
    parser.add_argument("--bind-host", required=True)
    parser.add_argument("--bind-port", type=int, required=True)
    parser.add_argument("--display-num", type=int, required=True)
    parser.add_argument("--public-url-template", required=True)
    parser.add_argument("--timeout-ms", type=int, default=15 * 60 * 1000)
    parser.add_argument("--chrome-bin", default="")
    return parser.parse_args()


def main() -> int:
    return asyncio.run(run_bridge(parse_args()))


if __name__ == "__main__":
    raise SystemExit(main())
