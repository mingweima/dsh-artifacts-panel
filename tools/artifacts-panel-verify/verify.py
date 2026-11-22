#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DSH「产物面板」页面验证脚本。

用途：在隔离的 headless Chrome 里打开 DSH Web GUI，点击顶部「产物」页签，
截图并检查关键断言（页签存在、面板渲染、空态文案、无报错文本）。

设计要点：
  * 只用临时 profile + 随机调试端口，不碰用户已打开的 Chrome；
  * 通过 CDP（Chrome DevTools Protocol）控制页面，Python 3.9 + websockets；
  * 退出码：0=通过，1=断言失败，2=环境问题（Chrome/页面/鉴权等）；
  * 插件未安装时友好失败：页签找不到 → 退出 1，提示「插件可能未安装/未生效」；
  * 结束时杀 Chrome、删 profile，并自检残留进程为 0。

用法：
    python3 tools/artifacts-panel-verify/verify.py
    python3 tools/artifacts-panel-verify/verify.py --url "http://127.0.0.1:51732/?token=..."
    python3 tools/artifacts-panel-verify/verify.py --selftest   # 不依赖 DSH，自检脚本机制
    DSH_WEB_URL="http://127.0.0.1:51732/?token=..." python3 .../verify.py

注意：dsh web 需要启动时打印的带 token 的 URL；裸端口会返回 401。
本脚本不读取、不落盘任何 token（结果 JSON 里会脱敏）。
"""

from __future__ import annotations

import argparse
import asyncio
import base64
import json
import os
import re
import shutil
import signal
import socket
import struct
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    import websockets
except ImportError:  # pragma: no cover - 只在极简环境触发
    websockets = None

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SHOTS_DIR = os.path.join(SCRIPT_DIR, "shots")
DEFAULT_URL = os.environ.get("DSH_WEB_URL", "http://127.0.0.1:51732")
VIEWPORT = (1440, 900)

# 页面崩溃/前端异常的特征文本（用于断言 4）
ERROR_TEXT_RE = re.compile(
    r"(crashed|Cannot read|Uncaught|TypeError|Minified React error|Something went wrong)",
    re.IGNORECASE,
)


class EnvError(RuntimeError):
    """环境问题：Chrome 起不来、页面打不开、需要鉴权等（退出码 2）。"""


# ---------------------------------------------------------------------------
# 小工具
# ---------------------------------------------------------------------------


def log(msg: str) -> None:
    """人类可读进度输出走 stderr，stdout 只留 JSON 结果。"""
    print(msg, file=sys.stderr, flush=True)


def now_stamp() -> str:
    return datetime.now().strftime("%Y%m%d-%H%M%S")


def redact_url(url: str) -> str:
    """结果里保存 URL 时脱敏 query 中的 token/key/secret。"""
    return re.sub(r"((?:token|key|secret|auth|sig)=)[^&]+", r"\1***", url, flags=re.I)


def png_size(data: bytes):
    if not data.startswith(b"\x89PNG\r\n\x1a\n") or len(data) < 24:
        return None
    return struct.unpack(">II", data[16:24])


def http_json(url: str, timeout: float = 2.0):
    with urllib.request.urlopen(url, timeout=timeout) as resp:
        return json.loads(resp.read().decode("utf-8"))


def ps_lines():
    """返回 ps 输出行；解析失败时返回空列表。"""
    try:
        out = subprocess.run(
            ["ps", "axo", "pid,command"], capture_output=True, text=True, timeout=10
        )
    except (OSError, subprocess.SubprocessError):
        return []
    return [line.strip() for line in out.stdout.splitlines() if line.strip()]


def find_chrome() -> str:
    candidates = [
        os.environ.get("CHROME_BIN", ""),
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Chromium.app/Contents/MacOS/Chromium",
        shutil.which("google-chrome") or "",
        shutil.which("chromium") or "",
        shutil.which("chromium-browser") or "",
        shutil.which("chrome") or "",
    ]
    for path in candidates:
        if path and os.path.isfile(path) and os.access(path, os.X_OK):
            return path
    raise EnvError(
        "未找到 Chrome/Chromium。可用 CHROME_BIN=/path/to/chrome 指定，或先安装 Chrome。"
    )


# ---------------------------------------------------------------------------
# 最小 CDP 客户端
# ---------------------------------------------------------------------------


class CDP:
    def __init__(self, ws):
        self.ws = ws
        self._next_id = 0
        self.events = []

    async def call(self, method: str, params=None, timeout: float = 20.0):
        self._next_id += 1
        mid = self._next_id
        await self.ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
        deadline = time.monotonic() + timeout
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise TimeoutError(f"CDP 命令超时：{method}")
            raw = await asyncio.wait_for(self.ws.recv(), timeout=remaining)
            msg = json.loads(raw)
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError(f"CDP {method} 失败：{msg['error']}")
                return msg.get("result", {})
            self.events.append(msg)
            if len(self.events) > 500:
                self.events = self.events[-200:]

    async def eval(self, expression: str, timeout: float = 15.0):
        res = await self.call(
            "Runtime.evaluate",
            {"expression": expression, "returnByValue": True, "awaitPromise": True},
            timeout=timeout,
        )
        if res.get("exceptionDetails"):
            return None
        return res.get("result", {}).get("value")

    def console_errors(self):
        found = []
        for ev in self.events:
            method = ev.get("method")
            if method == "Runtime.consoleAPICalled" and ev["params"].get("type") == "error":
                args = ev["params"].get("args") or []
                text = " ".join(
                    str(a.get("value", a.get("description", ""))) for a in args
                ).strip()
                found.append(text[:300])
            elif method == "Log.entryAdded":
                entry = ev["params"].get("entry", {})
                if entry.get("level") == "error":
                    found.append(str(entry.get("text", ""))[:300])
        # 去重保序
        seen, unique = set(), []
        for item in found:
            if item and item not in seen:
                seen.add(item)
                unique.append(item)
        return unique[-20:]


# ---------------------------------------------------------------------------
# 启动 / 清理 Chrome
# ---------------------------------------------------------------------------


def launch_chrome(chrome: str, url: str):
    """起一个隔离 headless Chrome，返回 (proc, tmpdir, port)。"""
    tmpdir = tempfile.mkdtemp(prefix="dsh-verify-chrome-")
    base_args = [
        "--remote-debugging-port=0",
        f"--user-data-dir={tmpdir}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        "--hide-scrollbars",
        "--window-size=1440,900",
        "--force-device-scale-factor=1",
        "--disable-extensions",
        "--disable-sync",
        "--disable-background-networking",
        "--disable-features=Translate,MediaRouter",
        "about:blank",
    ]
    last_err = ""
    for headless_flag in ("--headless=new", "--headless"):
        proc = subprocess.Popen(
            [chrome, headless_flag] + base_args,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,  # 独立进程组，方便整组回收
        )
        port_file = os.path.join(tmpdir, "DevToolsActivePort")
        deadline = time.monotonic() + 20
        port = None
        while time.monotonic() < deadline:
            if proc.poll() is not None:
                break
            if os.path.exists(port_file):
                try:
                    with open(port_file, "r", encoding="utf-8") as fh:
                        port = int(fh.readline().strip())
                except (OSError, ValueError):
                    port = None
                if port:
                    break
            time.sleep(0.2)
        if port:
            # 等 /json/version 真的可访问
            for _ in range(50):
                try:
                    http_json(f"http://127.0.0.1:{port}/json/version", timeout=1)
                    return proc, tmpdir, port
                except Exception:
                    time.sleep(0.2)
        last_err = f"{headless_flag} 启动失败（proc_alive={proc.poll() is None}）"
        terminate_chrome(proc, tmpdir)
        shutil.rmtree(tmpdir, ignore_errors=True)
        tmpdir = tempfile.mkdtemp(prefix="dsh-verify-chrome-")
        base_args[1] = f"--user-data-dir={tmpdir}"
    raise EnvError(f"Chrome 无法启动：{last_err}")


def kill_pids(pids):
    for pid in pids:
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass


def terminate_chrome(proc, tmpdir: str):
    """先礼后兵：TERM → KILL，且只杀 cmdline 里带本脚本临时 profile 的进程。"""
    if proc is not None and proc.poll() is None:
        try:
            proc.terminate()
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                proc.kill()
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                pass
        except OSError:
            pass
    # 子进程可能还挂着：只认 tmpdir 这条线索，绝不误伤老板的 Chrome
    for _ in range(20):
        ours = []
        for line in ps_lines():
            if tmpdir and tmpdir in line and "chrome" in line.lower():
                parts = line.split(None, 1)
                if parts and parts[0].isdigit():
                    ours.append(int(parts[0]))
        if not ours:
            break
        kill_pids(ours)
        time.sleep(0.1)


def cleanup_and_check(tmpdir: str):
    shutil.rmtree(tmpdir, ignore_errors=True)
    # 等进程真正退出（TERM 后退出有延迟，避免把正在退出的自己算成"残留"）
    deadline = time.monotonic() + 3.0
    while time.monotonic() < deadline:
        if not any(tmpdir and tmpdir in line for line in ps_lines()):
            break
        time.sleep(0.2)
    def is_chrome_proc(line: str) -> bool:
        low = line.lower()
        if "grep" in low:  # 排除本脚本/外层 shell 的命令行
            return False
        return (
            "google chrome.app/contents/macos/google chrome" in low
            or "/chromium" in low
            or "chrome-headless-shell" in low
        )

    global_headless = [
        line for line in ps_lines() if "headless" in line.lower() and is_chrome_proc(line)
    ]
    ours = [line for line in global_headless if tmpdir and tmpdir in line]
    return {
        "profile_removed": not os.path.exists(tmpdir),
        "residual_our_processes": len(ours),
        "residual_our_detail": ours,
        "global_headless_chrome": len(global_headless),
        "note": (
            "全局 headless 进程数仅供观察，可能包含非本脚本进程；本脚本只统计/回收带自身临时 profile 的进程。"
            if global_headless
            else "无 headless Chrome 残留。"
        ),
    }


# ---------------------------------------------------------------------------
# 页面操作
# ---------------------------------------------------------------------------

READY_JS = r"""
(() => {
  const text = document.body ? document.body.innerText : '';
  const input = document.querySelector('textarea, [contenteditable="true"], input[type="text"], input[placeholder]');
  const sidebar = document.querySelector('aside, [class*="sidebar"], [data-slot*="sidebar"]');
  return {
    title: document.title,
    bodyLen: text.length,
    hasInput: !!input,
    hasSidebar: !!sidebar,
    authRequired: /authentication required|dsh web authentication/i.test(text),
    text: text,
  };
})()
"""

FIND_TAB_JS = r"""
(() => {
  const want = '产物';
  const nodes = Array.from(
    document.querySelectorAll('button,a,[role="tab"],[role="button"],li,span,div')
  );
  const cands = [];
  for (const el of nodes) {
    const t = (el.innerText || '').trim();
    if (t !== want) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const role = el.getAttribute('role') || '';
    let score = 0;
    if (role === 'tab') score += 100;
    if (el.closest('[role="tablist"]')) score += 40;
    if (el.tagName === 'BUTTON' || el.tagName === 'A') score += 20;
    if (el.closest('nav,header')) score += 30;
    if (r.top < 160) score += 60;
    if (r.width < 260 && r.height < 64) score += 10;
    score -= Math.min(Math.max(r.top, 0), 900) / 50;
    cands.push({
      score,
      tag: el.tagName,
      role,
      text: t,
      inViewport: r.top >= 0 && r.bottom <= innerHeight,
      rect: { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, top: r.top },
    });
  }
  cands.sort((a, b) => b.score - a.score);
  return { count: cands.length, top: cands[0] || null, all: cands.slice(0, 5) };
})()
"""

PANEL_JS = r"""
(() => {
  const text = document.body.innerText || '';
  const heads = Array.from(document.querySelectorAll('h1,h2,h3,h4,[role="heading"]'))
    .map(h => (h.innerText || '').trim())
    .filter(Boolean);
  const emptyRe = /(暂无|还没有|没有产物|空状态|空空如也|暂无产物)/;
  const main = document.querySelector('main,[role="main"]');
  const mainText = (main ? main.innerText : text) || '';
  return {
    hasArtifactHeading: heads.some(h => h.includes('产物')),
    heads: heads.slice(0, 10),
    emptyState: emptyRe.test(text),
    mainTextSnippet: mainText.replace(/\s+/g, ' ').slice(0, 600),
    bodyText: text.slice(0, 5000),
    errorText: (text.match(/(crashed|Cannot read|Uncaught|TypeError|Minified React error|Something went wrong)/i) || [null])[0],
  };
})()
"""


async def click_tab(cdp: CDP, tab: dict):
    x, y = tab["rect"]["x"], tab["rect"]["y"]
    if not tab.get("inViewport"):
        # 兜底：页面滚动或坐标越界时用程序化 click（React 同样能收到冒泡 click）
        await cdp.eval("(() => { const els=[...document.querySelectorAll('*')].filter(e=>(e.innerText||'').trim()==='产物'); const el=els[els.length-1]; if(el) el.click(); return !!el; })()")
        return "programmatic"
    await cdp.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y})
    await cdp.call(
        "Input.dispatchMouseEvent",
        {"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1},
    )
    await cdp.call(
        "Input.dispatchMouseEvent",
        {"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1},
    )
    return "mouse"


async def wait_until(cdp: CDP, coro_factory, predicate, timeout: float, interval: float = 0.4):
    deadline = time.monotonic() + timeout
    last = None
    while time.monotonic() < deadline:
        try:
            last = await coro_factory()
        except Exception:
            last = None
        if last is not None and predicate(last):
            return last
        await asyncio.sleep(interval)
    return last


async def take_screenshot(cdp: CDP, path: str):
    res = await cdp.call(
        "Page.captureScreenshot",
        {"format": "png", "fromSurface": True, "captureBeyondViewport": False},
        timeout=30,
    )
    data = base64.b64decode(res["data"])
    with open(path, "wb") as fh:
        fh.write(data)
    size = png_size(data)
    viewport = await cdp.eval("({w: innerWidth, h: innerHeight})")
    return {
        "path": path,
        "bytes": len(data),
        "png_size": list(size) if size else None,
        "viewport": viewport,
    }


# ---------------------------------------------------------------------------
# 主流程
# ---------------------------------------------------------------------------


async def verify(url: str, mode: str, timeout: float, shots_dir: str, ts: str):
    chrome = find_chrome()
    log(f"[1/6] 找到 Chrome：{chrome}")
    proc, tmpdir, port = launch_chrome(chrome, url)
    log(f"[2/6] headless Chrome 已启动：port={port} profile={tmpdir}")

    result = {
        "script": os.path.relpath(os.path.abspath(__file__)),
        "mode": mode,
        "time": datetime.now().astimezone().isoformat(timespec="seconds"),
        "url": redact_url(url),
        "viewport": f"{VIEWPORT[0]}x{VIEWPORT[1]}",
        "assertions": [],
        "console_errors": [],
        "page": {},
        "screenshot": None,
        "cleanup": None,
    }

    def add(assert_id, name, ok, detail=""):
        result["assertions"].append({"id": assert_id, "name": name, "ok": bool(ok), "detail": detail})

    ws = None
    env_problem = ""
    try:
        if websockets is None:
            raise EnvError("缺少 websockets 模块（pip install websockets 或改用 Python 3.9+ 自带环境）")
        # 找到页面 target
        targets = http_json(f"http://127.0.0.1:{port}/json/list")
        page = next((t for t in targets if t.get("type") == "page"), None)
        if not page:
            raise EnvError("Chrome 没有可用的 page target")
        ws = await websockets.connect(page["webSocketDebuggerUrl"], max_size=None, open_timeout=10)
        cdp = CDP(ws)
        for method in ("Page.enable", "Runtime.enable", "Log.enable"):
            await cdp.call(method)
        await cdp.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": VIEWPORT[0],
                "height": VIEWPORT[1],
                "deviceScaleFactor": 1,
                "mobile": False,
            },
        )

        log(f"[3/6] 打开页面：{redact_url(url)}")
        await cdp.call("Page.navigate", {"url": url})

        state = await wait_until(
            cdp,
            lambda: cdp.eval(READY_JS),
            lambda s: s.get("hasInput") or s.get("hasSidebar") or s.get("authRequired"),
            timeout,
        )
        state = state or {}

        if state.get("authRequired"):
            add("A1", "页面就绪", False, "页面返回 dsh web 鉴权要求（401）")
            env_problem = (
                "dsh web 需要带 token 的启动 URL：请把 `dsh web` 打印的完整地址通过 --url 或 "
                "DSH_WEB_URL 传入（脚本不读取凭据）。"
            )
        elif not (state.get("hasInput") or state.get("hasSidebar")):
            add("A1", "页面就绪", False, "等待聊天输入框/侧栏超时")
            env_problem = f"{timeout:.0f}s 内页面未就绪（可能仍在加载或地址不对）"
        else:
            ready_detail = "输入框" if state.get("hasInput") else ""
            if state.get("hasSidebar"):
                ready_detail += ("/" if ready_detail else "") + "侧栏"
            add("A1", "页面就绪", True, f"检测到 {ready_detail}；title={state.get('title', '')!r}")

        tab = None
        if not env_problem:
            log("[4/6] 查找「产物」页签")
            tab = await wait_until(
                cdp,
                lambda: cdp.eval(FIND_TAB_JS),
                lambda r: (r or {}).get("count", 0) > 0,
                timeout=12,
            )
            if tab and tab.get("count"):
                add(
                    "A2",
                    "找到「产物」页签",
                    True,
                    f"共 {tab['count']} 个候选；选中 {tab['top']['tag']} role={tab['top']['role']!r} "
                    f"top={tab['top']['rect']['top']:.0f}",
                )
            else:
                add(
                    "A2",
                    "找到「产物」页签",
                    False,
                    "页签未找到，插件可能未安装/未生效",
                )
                add("A3", "面板渲染完成", False, "未执行（未找到页签）")

        clicked = None
        panel = None
        if tab and tab.get("count"):
            clicked = await click_tab(cdp, tab["top"])
            log(f"[5/6] 已点击「产物」页签（{clicked}）")
            panel = await wait_until(
                cdp,
                lambda: cdp.eval(PANEL_JS),
                lambda p: bool(p.get("hasArtifactHeading") or p.get("emptyState")),
                timeout=12,
            )
            if panel and (panel.get("hasArtifactHeading") or panel.get("emptyState")):
                detail = (
                    "标题含「产物」" if panel.get("hasArtifactHeading") else "检测到空态文案"
                )
                add("A3", "面板渲染完成", True, detail)
            else:
                add(
                    "A3",
                    "面板渲染完成",
                    False,
                    "点击后未检测到「产物」标题或空态文案",
                )

        # 页面文本 / 报错断言（即使没点成也 dump，便于排查）
        page_info = panel or (await cdp.eval(PANEL_JS)) or {}
        if page_info:
            body_text = page_info.get("bodyText", "")
            error_hit = page_info.get("errorText")
            result["page"] = {
                "title": state.get("title", ""),
                "text_summary": re.sub(r"\s+", " ", body_text)[:1200],
                "main_text_snippet": page_info.get("mainTextSnippet", ""),
                "headings": page_info.get("heads", []),
                "empty_state": bool(page_info.get("emptyState")),
            }
            if not env_problem:
                add("A4", "页面无明显报错", not error_hit, f"命中报错文本：{error_hit}" if error_hit else "未命中崩溃/异常文本")

        if os.path.isdir(shots_dir):
            stem = f"{mode}-artifact-page-{ts}" if mode == "selftest" else f"artifact-page-{ts}"
            png_path = os.path.join(shots_dir, stem + ".png")
            log(f"[6/6] 截图：{png_path}")
            shot = await take_screenshot(cdp, png_path)
            shot["path"] = os.path.relpath(png_path)
            result["screenshot"] = shot
            result["console_errors"] = cdp.console_errors()

    except EnvError as exc:
        env_problem = str(exc)
    except (OSError, RuntimeError, TimeoutError, asyncio.TimeoutError) as exc:
        env_problem = f"{type(exc).__name__}: {exc}"
    finally:
        if ws is not None:
            try:
                await ws.close()
            except Exception:
                pass
        terminate_chrome(proc, tmpdir)
        cleanup = cleanup_and_check(tmpdir)
        result["cleanup"] = cleanup

    if env_problem:
        result["env_error"] = env_problem
        # 环境问题优先于断言结论：缺失的断言补成 false
        have = {a["id"] for a in result["assertions"]}
        for aid, name in (("A1", "页面就绪"), ("A2", "找到「产物」页签"), ("A3", "面板渲染完成"), ("A4", "页面无明显报错")):
            if aid not in have:
                add(aid, name, False, "未执行（环境问题）")
    if result["cleanup"]["residual_our_processes"] != 0:
        add("C1", "测试进程清理", False, f"残留 {result['cleanup']['residual_our_processes']} 个本脚本 Chrome 进程")
    else:
        add("C1", "测试进程清理", True, "本脚本无 Chrome 残留")

    all_ok = all(a["ok"] for a in result["assertions"])
    result["ok"] = bool(all_ok and not env_problem)
    result["exit_code"] = 2 if env_problem else (0 if all_ok else 1)
    result["hint"] = (
        "页签未找到，插件可能未安装/未生效：先确认 dsh-artifacts-panel 已安装并在当前 profile 启用。"
        if not env_problem and any(a["id"] == "A2" and not a["ok"] for a in result["assertions"])
        else ""
    )
    return result


# ---------------------------------------------------------------------------
# 自检 fixture（--selftest：不依赖 DSH，验证脚本机制本身）
# ---------------------------------------------------------------------------

FIXTURE_HTML = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>DSH 产物面板 · 自检夹具</title>
<style>
  body { margin:0; font: 14px/1.5 -apple-system, "PingFang SC", sans-serif; background:#0f1115; color:#e6e6e6; }
  nav { display:flex; gap:4px; padding:10px 16px; background:#171a21; border-bottom:1px solid #2a2f3a; }
  nav [role=tab] { background:none; border:0; color:#9aa4b2; padding:8px 14px; font-size:14px; cursor:pointer; border-radius:6px; }
  nav [role=tab][aria-selected=true] { color:#fff; background:#242a35; }
  main { padding:24px 32px; }
  textarea { width:100%; height:120px; background:#171a21; color:#ddd; border:1px solid #2a2f3a; border-radius:8px; }
  .empty { color:#7d8797; margin-top:24px; }
</style></head>
<body>
<nav role="tablist" aria-label="视图">
  <button role="tab" aria-selected="true">Chat</button>
  <button role="tab">Trajectory</button>
  <button role="tab">上下文</button>
  <button role="tab">统计</button>
  <button role="tab">产物</button>
</nav>
<main id="view"><textarea placeholder="给 DSH 发消息…"></textarea></main>
<script>
  const view = document.getElementById('view');
  document.querySelectorAll('nav [role=tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('nav [role=tab]').forEach(t => t.setAttribute('aria-selected', 'false'));
      tab.setAttribute('aria-selected', 'true');
      const name = tab.textContent.trim();
      if (name === '产物') {
        setTimeout(() => {
          view.innerHTML = '<h2>产物</h2><div class="empty">暂无产物，完成一轮对话后会自动收录。</div>';
        }, 120);
      } else {
        view.innerHTML = '<textarea placeholder="给 DSH 发消息…"></textarea>';
      }
    });
  });
</script>
</body></html>"""


class _FixtureHandler(BaseHTTPRequestHandler):
    def do_GET(self):  # noqa: N802 (http.server 约定)
        body = FIXTURE_HTML.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


def start_fixture():
    srv = ThreadingHTTPServer(("127.0.0.1", 0), _FixtureHandler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return srv


# ---------------------------------------------------------------------------
# 入口
# ---------------------------------------------------------------------------


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="DSH 产物面板页面验证（headless Chrome + CDP）")
    parser.add_argument("--url", default=DEFAULT_URL, help="DSH Web GUI 地址；dsh web 需带 token 的完整 URL")
    parser.add_argument("--timeout", type=float, default=30.0, help="页面就绪超时秒数（默认 30）")
    parser.add_argument("--shots-dir", default=SHOTS_DIR, help="截图/结果输出目录")
    parser.add_argument("--selftest", action="store_true", help="用内置夹具页面自检脚本机制，不依赖 DSH")
    args = parser.parse_args(argv)

    os.makedirs(args.shots_dir, exist_ok=True)
    ts = now_stamp()
    mode = "selftest" if args.selftest else "live"
    srv = None
    url = args.url
    if args.selftest:
        srv = start_fixture()
        url = f"http://127.0.0.1:{srv.server_port}/"
        log(f"自检模式：夹具页面 {url}")

    try:
        result = asyncio.run(verify(url, mode, args.timeout, args.shots_dir, ts))
    finally:
        if srv is not None:
            srv.shutdown()
            srv.server_close()

    stem = f"{mode}-artifact-page-{ts}" if mode == "selftest" else f"artifact-page-{ts}"
    json_path = os.path.join(args.shots_dir, stem + ".json")
    try:
        with open(json_path, "w", encoding="utf-8") as fh:
            json.dump(result, fh, ensure_ascii=False, indent=2)
        result["result_json"] = os.path.relpath(json_path)
    except OSError as exc:
        log(f"写入结果 JSON 失败：{exc}")

    log("")
    for a in result["assertions"]:
        log(f"  [{'PASS' if a['ok'] else 'FAIL'}] {a['id']} {a['name']} — {a['detail']}")
    if result.get("env_error"):
        log(f"  环境问题：{result['env_error']}")
    if result.get("hint"):
        log(f"  提示：{result['hint']}")
    if result.get("screenshot"):
        log(f"  截图：{result['screenshot']['path']} ({result['screenshot']['png_size']})")
    cl = result.get("cleanup") or {}
    log(
        f"  清理：本脚本残留={cl.get('residual_our_processes', 'n/a')}，"
        f"profile 已删除={cl.get('profile_removed')}，全局 headless={cl.get('global_headless_chrome', 'n/a')}"
    )
    log(f"  退出码：{result['exit_code']}")

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return int(result["exit_code"])


if __name__ == "__main__":
    sys.exit(main())
