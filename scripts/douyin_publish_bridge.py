#!/usr/bin/env python3
"""
Bridge script for calling social-auto-upload's DouYinVideo uploader.

Usage:
    python scripts/douyin_publish_bridge.py '<json_params>'

JSON params:
    {
        "video_path": "/abs/path/to/video.mp4",
        "title": "视频标题",
        "tags": ["tag1", "tag2"],
        "account_file": "/abs/path/to/cookie.json",
        "thumbnail_path": null,
        "publish_date": 0,
        "social_auto_upload_dir": "/abs/path/to/social-auto-upload",
        "link_url": null,
        "product_link": null,
        "product_title": null
    }

Outputs JSON to stdout. All logs go to stderr.
"""

import asyncio
import json
import os
import sys
import traceback


def _output_error(message, error_detail=None):
    json.dump(
        {"ok": False, "message": message, "errorDetail": error_detail},
        sys.stdout,
    )
    sys.exit(1)


def main():
    if len(sys.argv) < 2:
        _output_error("Missing JSON argument")

    try:
        params = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        _output_error(f"Invalid JSON: {e}")

    video_path = params.get("video_path", "")
    title = params.get("title", "")
    tags = params.get("tags", [])
    account_file = params.get("account_file", "")
    thumbnail_path = params.get("thumbnail_path")
    publish_date = params.get("publish_date", 0)
    social_auto_upload_dir = params.get("social_auto_upload_dir", "")
    link_url = (params.get("link_url") or "").strip()
    product_link = (params.get("product_link") or "").strip()
    product_title = (params.get("product_title") or "").strip()

    if not video_path or not os.path.isfile(video_path):
        _output_error(f"Video file not found: {video_path}")

    if not account_file or not os.path.isfile(account_file):
        _output_error(f"Cookie file not found: {account_file}")

    if not social_auto_upload_dir or not os.path.isdir(social_auto_upload_dir):
        _output_error(f"social-auto-upload directory not found: {social_auto_upload_dir}")

    # Add social-auto-upload to sys.path so we can import from it
    if social_auto_upload_dir not in sys.path:
        sys.path.insert(0, social_auto_upload_dir)

    try:
        from uploader.douyin_uploader.main import douyin_setup, DouYinVideo
    except ImportError as e:
        _output_error(f"Failed to import social-auto-upload: {e}", traceback.format_exc())

    # Append link_url to title as fallback (description link strategy)
    effective_title = title
    if link_url:
        effective_title = f"{title}\n{link_url}"
        print(f"[bridge] Appending link to description: {link_url}", file=sys.stderr)

    async def run():
        # Validate cookie
        print("[bridge] Validating cookie...", file=sys.stderr)
        try:
            await douyin_setup(account_file, handle=False)
        except Exception as e:
            _output_error(
                f"Cookie 验证失败，请重新扫码登录: {e}",
                traceback.format_exc(),
            )

        # Convert publish_date: 0 = immediate, timestamp (ms) = scheduled
        from datetime import datetime

        pd = 0
        if publish_date and publish_date > 0:
            pd = datetime.fromtimestamp(publish_date / 1000)
            print(f"[bridge] Scheduled publish at: {pd}", file=sys.stderr)

        # Build DouYinVideo kwargs
        video_kwargs = dict(
            title=effective_title,
            file_path=video_path,
            tags=tags,
            publish_date=pd,
            account_file=account_file,
            thumbnail_path=thumbnail_path if thumbnail_path else None,
        )

        # Pass product link if provided (requires account permission)
        if product_link:
            video_kwargs["productLink"] = product_link
            print(f"[bridge] Product link: {product_link}", file=sys.stderr)
        if product_title:
            video_kwargs["productTitle"] = product_title

        app = DouYinVideo(**video_kwargs)
        print("[bridge] Starting upload...", file=sys.stderr)
        await app.main()
        print("[bridge] Upload complete.", file=sys.stderr)

    try:
        asyncio.run(run())
        json.dump({"ok": True, "message": "发布成功"}, sys.stdout)
    except SystemExit:
        # _output_error already called sys.exit, re-raise
        raise
    except Exception as e:
        json.dump(
            {
                "ok": False,
                "message": f"发布失败: {e}",
                "errorDetail": traceback.format_exc(),
            },
            sys.stdout,
        )
        sys.exit(1)


if __name__ == "__main__":
    main()
