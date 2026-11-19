"""Shared Playwright helpers for the deck scripts (export, overlap check, walkthrough)."""
from __future__ import annotations

import json
import pathlib
from contextlib import asynccontextmanager

from playwright.async_api import async_playwright, Page

ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_HTML = ROOT / "dist-single" / "index.html"
# headless WebGL (only needed for three.js scenes)
GL_ARGS = ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"]


def deck_url(target: str | None, query: str = "", hash_: str = "") -> str:
    """A file path or an http(s) URL → URL with optional ?query and #hash."""
    t = target or str(DEFAULT_HTML)
    url = t if t.startswith(("http://", "https://", "file://")) else pathlib.Path(t).resolve().as_uri()
    url = url.split("#")[0]
    if query:
        url += ("&" if "?" in url else "?") + query
    return url + (f"#{hash_}" if hash_ else "")


@asynccontextmanager
async def open_deck(url: str, errors: list[str] | None = None, width: int = 1920, height: int = 1080):
    """Chromium page at the stage size, with page errors collected into `errors`."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=GL_ARGS)
        page = await browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        if errors is not None:
            page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
            page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        await page.goto(url)
        await page.wait_for_function("window.__deck && window.__deck.ready()", timeout=30_000)
        try:
            yield page
        finally:
            await browser.close()


async def deck_info(page: Page) -> dict:
    return await page.evaluate(
        "({ids: __deck.ids, titles: __deck.titles, notes: __deck.notes, steps: __deck.steps,"
        " appendix: __deck.appendix, twoPage: __deck.twoPage, order: __deck.order})"
    )


async def show(page: Page, i: int, k: int | str, settle_ms: int = 400) -> None:
    await page.evaluate(f"__deck.show({i}, {json.dumps(k)})")
    await page.wait_for_timeout(settle_ms)


async def state(page: Page) -> dict:
    return await page.evaluate("__deck.state()")
