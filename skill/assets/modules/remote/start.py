"""The recording tools of the deck remote. Use them through npm (remote/run.mjs finds Python):

    npm run record     start everything (or reuse the running one), open the lead deck and the control
                       page, copy the team message with the phone links to the clipboard
    npm run links      print the links and the team message again
    npm run stop       stop everything (a running take is stopped and mixed first)
    npm run mix        mix the latest take again (finds the OBS file itself); see remote/mix.py

Options after `--`, for example `npm run record -- --fresh`:
    --fresh            new keys: stop the running remote and start again
    --local            only this laptop: no tunnel, no phones
    --mode docker|node Docker (default when it runs) or node + cloudflared
    --no-open          do not open the browser      --qr   also print the phone link as a QR code
    --dry-run          print the links with a fake tunnel, start nothing

A helper process runs next to the server (also in Docker mode): after Stop it mixes the take with ffmpeg
into recordings/<session>/final.mp4 and opens the folder when the control page asks.
Settings: remote/config.json (title, port, speakers, obs). Standard library only; Windows, macOS, Linux.
"""

import argparse
import json
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
import webbrowser

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RUN = os.path.join(HERE, ".run")
STATE = os.path.join(RUN, "state.json")
COMPOSE_FILE = os.path.join(HERE, "compose.yaml")
TUNNEL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
WAIT_SECONDS = 90
sys.path.insert(0, HERE)
try:  # Windows consoles: print the names and the arrows instead of failing on them
    sys.stdout.reconfigure(errors="replace")
except (AttributeError, ValueError):
    pass

# ------------------------------------------------------------------ config

def load_config():
    cfg = {}
    # config.local.json (git-ignored) is merged over config.json: secrets such as the OBS password go there
    for name in ("config.json", "config.local.json"):
        path = os.path.join(HERE, name)
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                part = json.load(f)
            if isinstance(part.get("obs"), dict) and isinstance(cfg.get("obs"), dict):
                part["obs"] = {**cfg["obs"], **part["obs"]}
            cfg.update(part)
    deck = deck_config()
    cfg.setdefault("title", deck.get("title") or "Our talk")
    cfg.setdefault("port", 8787)
    speakers = [{"part": int(s["part"]), "name": str(s["name"])} for s in cfg.get("speakers", []) if s.get("name")]
    if not speakers:
        speakers = deck.get("speakers") or speakers_from_scenes()
    cfg["speakers"] = sorted(speakers, key=lambda s: s["part"])
    return cfg


def deck_config():
    """DECK.title and DECK.speakers from src/deck/config.ts (the starter); part = position + 1."""
    path = os.path.join(ROOT, "src", "deck", "config.ts")
    if not os.path.exists(path):
        return {}
    with open(path, encoding="utf-8") as f:
        src = f.read()
    out = {}
    t = re.search(r"""\btitle\s*:\s*(["'])((?:\\.|(?!\1).)*)\1""", src)
    if t:
        out["title"] = t.group(2)
    sp = re.search(r"\bspeakers\s*:\s*\[([\s\S]*?)\]", src)
    if sp:
        names = [re.search(r"""\bname\s*:\s*(["'])((?:\\.|(?!\1).)*)\1""", o) for o in re.findall(r"\{([^{}]*)\}", sp.group(1))]
        out["speakers"] = [{"part": i + 1, "name": m.group(2)} for i, m in enumerate(n for n in names if n)]
    return out


def speakers_from_scenes():
    """Without config.json: the speakers of the scenes, in the order they first speak."""
    names = []
    src = os.path.join(HERE, "scenes.json")
    if os.path.exists(src):
        with open(src, encoding="utf-8") as f:
            names = [str(s.get("speaker")) for s in json.load(f) if s.get("speaker")]
    else:
        idx = os.path.join(ROOT, "src", "scenes", "index.ts")
        if os.path.exists(idx):
            with open(idx, encoding="utf-8") as f:
                names = re.findall(r'\bspeaker:\s*"([^"]+)"', f.read())
    seen = []
    for n in names:
        if n not in seen:
            seen.append(n)
    return [{"part": i + 1, "name": n} for i, n in enumerate(seen)]



# ------------------------------------------------------------------ links and messages

def links(cfg, key, lead, tunnel):
    port = cfg["port"]
    start = "#" + cfg["startScene"] if cfg.get("startScene") else ""
    local = f"http://localhost:{port}"
    out = {
        "lead": f"{local}/?remote&k={key}&lead={lead}{start}" if lead else None,
        "obs": f"{local}/?remote&obs&k={key}{start}",
        "preflight": f"{local}/preflight?k={key}&lead={lead}" if lead else None,
        "local": f"{local}/?k={key}{start}",
        "local_remote": f"{local}/remote?k={key}",
    }
    if tunnel:
        out["phone"] = f"{tunnel}/remote?k={key}"
        out["parts"] = [(s["part"], s["name"], f"{tunnel}/remote?k={key}#part{s['part']}") for s in cfg["speakers"]]
        out["watch_phone"] = f"{tunnel}/remote?k={key}#watch"
        out["watch_deck"] = f"{tunnel}/?remote&k={key}{start}"
    return out


def team_message(cfg, ln, record=True):
    lines = [f"{cfg['title']}: " + ("we record" if record else "deck remote")]
    if record:
        lines += [
            "1. Join the call on your laptop (not on the phone) and put headphones on.",
            "2. Open your link below on your phone: Chrome on Android, Safari on iPhone.",
            "3. Tap \"I'm ready\" and allow the microphone.",
            "4. Keep that page open with the screen on until the lead says stop.",
            "5. Your Next button lights up on your part: press it when the slide stops moving.",
            "6. If a red bar says the microphone stopped, tap it.",
        ]
    else:
        lines += ["Open your link on your phone. Your Next button lights up while your part is on screen."]
    lines.append("")
    for part, name, url in ln["parts"]:
        lines.append(f"{name}: {url}")
    lines += ["", f"Watch the deck in your browser (click once, then F): {ln['watch_deck']}"]
    return "\n".join(lines)


def test_log(kind, value):
    """Tests (remote/test/test-start.mjs): record browser, clipboard and folder actions instead of doing them."""
    path = os.environ.get("REMOTE_TEST_LOG")
    if not path:
        return False
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps({"kind": kind, "value": value}) + "\n")
    return True


def copy(text):
    """Best effort: the clipboard of this computer."""
    if test_log("copy", text):
        return True
    if os.environ.get("REMOTE_NO_CLIPBOARD"):
        return False
    try:
        if sys.platform == "win32":
            subprocess.run("clip", input=text.encode("utf-16le"), check=True, shell=True)
        elif sys.platform == "darwin":
            subprocess.run(["pbcopy"], input=text.encode(), check=True)
        elif shutil.which("wl-copy"):
            subprocess.run(["wl-copy"], input=text.encode(), check=True, timeout=5)
        elif shutil.which("xclip"):
            subprocess.run(["xclip", "-selection", "clipboard"], input=text.encode(), check=True, timeout=5)
        else:
            return False
        return True
    except (OSError, subprocess.SubprocessError):
        return False


def open_url(url):
    """The default browser (Windows: os.startfile through webbrowser)."""
    if test_log("open", url):
        return True
    if os.environ.get("REMOTE_NO_BROWSER"):
        return False
    try:
        return webbrowser.open(url, new=2)
    except Exception:
        return False


def open_path(path):
    """A folder or a file in Explorer / Finder / the file manager."""
    if test_log("folder", path):
        return True
    try:
        if sys.platform == "win32":
            os.startfile(path)  # noqa: the Windows API
        elif sys.platform == "darwin":
            subprocess.Popen(["open", path])
        else:
            subprocess.Popen(["xdg-open", path], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        return True
    except OSError:
        return False


def obs_line(st):
    o = (st or {}).get("obs") or {}
    state = o.get("state")
    if state == "connected":
        return "OBS: connected. Start on the control page starts the OBS recording too."
    if state == "auth":
        return ("OBS: needs the password. OBS -> Tools -> WebSocket Server Settings -> Show Connect Info,\n"
                "     copy the password into remote/config.local.json {\"obs\": {\"password\": \"...\"}}, then npm run record -- --fresh.\n"
                "     Until then: start the OBS recording by hand before Start.")
    if state == "off":
        return "OBS: automation off (config.json \"obs\": false). Start the OBS recording by hand before Start."
    return ("OBS: not found. Open OBS (Tools -> WebSocket Server Settings -> Enable), or start the OBS recording\n"
            "     by hand before Start. Setup once: remote/RECORDING.md")


def print_summary(cfg, s, st, record, opened, copied, qr=False, invert=False, full=False):
    ln = links(cfg, s["key"], s.get("lead"), s.get("tunnel"))
    print()
    if opened:
        print(f"Opened in your browser: {opened}.")
    if ln.get("parts"):
        team = team_message(cfg, ln, record)
        if copied and not full:
            print("The team message with the phone links is in your clipboard: paste it into the team chat.")
        else:
            print("Send this to the team chat" + (" (also in your clipboard)" if copied else "") + ":")
            print("-" * 63)
            print(team)
            print("-" * 63)
    if record:
        print(obs_line(st))
    print()
    print(f"  Control page  {ln['preflight']}")
    print(f"  Lead deck     {ln['lead']}")
    print(f"  OBS source    {ln['obs']}")
    for part, name, url in ln.get("parts") or []:
        print(f"  {name:<13} {url}")
    if qr and ln.get("phone"):
        try:
            from qr import qr_terminal
            print(f"\nPhone link as a QR code (everyone picks their name):\n{qr_terminal(ln['phone'], invert)}")
        except Exception as e:  # never fail because of the QR code
            print(f"(QR code skipped: {e})")
    print()
    if record:
        print("  Press Start on the control page when it says READY (Ctrl+R in the lead deck works too).")
        print("  Stop ends the take; the mix lands in recordings/<session>/final.mp4 by itself.")
    print("  npm run links   these links again      npm run mix    mix the latest take again")
    print("  npm run stop    stop everything when you are done")
    return ln


# ------------------------------------------------------------------ OBS files

def obs_files(cfg, obs_url, out_dir=HERE):
    """A scene collection (Browser source on track 1, backup mic on track 2) and a profile (1920x1080@60, mkv)."""
    deck_id, mic_id, scene_id = (str(uuid.uuid4()) for _ in range(3))
    mic_kind = {"win32": "wasapi_input_capture", "darwin": "coreaudio_input_capture"}.get(sys.platform, "pulse_input_capture")

    def item(name, src, iid):
        return {"name": name, "source_uuid": src, "visible": True, "locked": True, "rot": 0.0,
                "pos": {"x": 0.0, "y": 0.0}, "scale": {"x": 1.0, "y": 1.0}, "align": 5,
                "bounds_type": 0, "bounds_align": 0, "bounds": {"x": 0.0, "y": 0.0},
                "crop_left": 0, "crop_top": 0, "crop_right": 0, "crop_bottom": 0, "id": iid,
                "scale_filter": "disable", "blend_method": "default", "blend_type": "normal"}

    def source(name, sid, kind, settings, mixers):
        return {"name": name, "uuid": sid, "id": kind, "versioned_id": kind, "settings": settings,
                "mixers": mixers, "volume": 1.0, "balance": 0.5, "muted": False, "enabled": True,
                "flags": 0, "sync": 0, "monitoring_type": 0, "private_settings": {}}

    collection = {
        "name": f"{cfg['title']} recording",
        "current_scene": "Deck", "current_program_scene": "Deck",
        "scene_order": [{"name": "Deck"}],
        "sources": [
            source("Deck", scene_id, "scene", {"id_counter": 2, "custom_size": False,
                   "items": [item("Deck (browser)", deck_id, 1), item("Backup mic", mic_id, 2)]}, 0),
            # track 1 (mixers bit 1): the deck, its animations and the demo music
            source("Deck (browser)", deck_id, "browser_source", {
                "url": obs_url, "is_local_file": False, "width": 1920, "height": 1080,
                "fps_custom": True, "fps": 60, "reroute_audio": True, "shutdown": False,
                "restart_when_active": False, "css": ""}, 1),
            # track 2 only (mixers bit 2): the lead's laptop mic, a rough backup if a phone track fails
            source("Backup mic", mic_id, mic_kind, {"device_id": "default"}, 2),
        ],
        "groups": [], "transitions": [], "quick_transitions": [], "modules": {},
        "current_transition": "Fade", "transition_duration": 300,
    }
    coll_path = os.path.join(out_dir, "obs-scene-collection.json")
    with open(coll_path, "w", encoding="utf-8") as f:
        json.dump(collection, f, indent=2)

    prof_dir = os.path.join(out_dir, "obs-profile")
    os.makedirs(prof_dir, exist_ok=True)
    ini = f"""[General]
Name={cfg['title']} recording

[Video]
BaseCX=1920
BaseCY=1080
OutputCX=1920
OutputCY=1080
FPSType=1
FPSCommon=60
FPSInt=60
FPSNum=60
FPSDen=1
ScaleType=lanczos
ColorFormat=NV12
ColorSpace=709
ColorRange=Partial

[Audio]
SampleRate=48000
ChannelSetup=Stereo

[Output]
Mode=Advanced

[AdvOut]
RecType=Standard
RecFormat=mkv
RecFormat2=mkv
RecTracks=3
RecEncoder=obs_x264
RecAudioEncoder=ffmpeg_aac
RecRB=false

[SimpleOutput]
RecFormat=mkv
RecFormat2=mkv
"""
    with open(os.path.join(prof_dir, "basic.ini"), "w", encoding="utf-8", newline="\r\n" if sys.platform == "win32" else "\n") as f:
        f.write(ini)
    with open(os.path.join(prof_dir, "recordEncoder.json"), "w", encoding="utf-8") as f:
        json.dump({"rate_control": "CRF", "crf": 18, "preset": "veryfast", "keyint_sec": 2}, f)
    return coll_path, prof_dir



# ------------------------------------------------------------------ run state

def save_state(s):
    os.makedirs(RUN, exist_ok=True)
    with open(STATE, "w", encoding="utf-8") as f:
        json.dump(s, f, indent=2)


def load_state():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def project_name():
    return re.sub(r"[^a-z0-9]+", "-", os.path.basename(ROOT).lower()).strip("-") + "-remote"


def compose(args, env=None):
    return ["docker", "compose", "-p", project_name(), "-f", COMPOSE_FILE] + args


def media_dir(cfg):
    """The media folder as a real directory (config.json "mediaDir", relative to the deck project; default media/).
    Docker cannot mount a file, and git on Windows checks a symlink out as a small text file."""
    path = os.path.abspath(os.path.join(ROOT, cfg.get("mediaDir") or "media"))
    if not os.path.isdir(path):
        if os.path.exists(path):
            sys.exit(f"{path} is a file, not a folder. Set \"mediaDir\" in remote/config.json to the folder with the videos.")
        os.makedirs(path, exist_ok=True)
    return path


def docker_ready():
    if not shutil.which("docker"):
        return False
    try:
        return subprocess.run(["docker", "info"], capture_output=True, timeout=20).returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False


def wait_http(port, seconds=25):
    deadline = time.time() + seconds
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(f"http://127.0.0.1:{port}/healthz", timeout=2) as r:
                if r.status == 200:
                    return True
        except OSError:
            pass
        time.sleep(0.5)
    return False


def wait_tunnel(read_log):
    print("Waiting for the Cloudflare address...", end="", flush=True)
    deadline = time.time() + WAIT_SECONDS
    while time.time() < deadline:
        found = TUNNEL_RE.findall(read_log())
        if found:
            print(" done.")
            return found[-1]  # the newest one, if the tunnel restarted
        print(".", end="", flush=True)
        time.sleep(2)
    print()
    return None


def spawn(cmd, log_name, env):
    os.makedirs(RUN, exist_ok=True)
    log = open(os.path.join(RUN, log_name), "w", encoding="utf-8")
    kw = {"cwd": ROOT, "env": env, "stdout": log, "stderr": subprocess.STDOUT, "stdin": subprocess.DEVNULL}
    if sys.platform == "win32":
        kw["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP | 0x00000008  # DETACHED_PROCESS
    else:
        kw["start_new_session"] = True
    return subprocess.Popen(cmd, **kw).pid


def kill(pid):
    if not pid:
        return
    try:
        if sys.platform == "win32":
            subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True)
        else:
            os.kill(pid, signal.SIGTERM)
    except OSError:
        pass


def read_file(path):
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            return f.read()
    except OSError:
        return ""



def obs_env(cfg, docker):
    """OBS_* for the server. Node mode reads config.json itself (a pasted password is picked up live)."""
    o = cfg.get("obs")
    if o is False:
        return {"OBS_URL": "off"}
    o = o if isinstance(o, dict) else {}
    if not docker:
        return {}
    url = o.get("url") or "ws://127.0.0.1:4455"
    # inside the container 127.0.0.1 is the container itself: OBS runs on the host
    url = re.sub(r"//(127\.0\.0\.1|localhost)(?=[:/]|$)", "//host.docker.internal", url)
    return {"OBS_URL": url, "OBS_PASSWORD": str(o.get("password") or "")}


def compose_env(key, lead, cfg, obs_url=""):
    env = {**os.environ, "REMOTE_KEY": key or "unused", "LEAD_KEY": lead or "", "REMOTE_PORT": str(cfg["port"]),
           "MEDIA_HOST_DIR": media_dir(cfg), "OBS_DECK_URL": obs_url, **obs_env(cfg, True)}
    if hasattr(os, "getuid"):
        env["REMOTE_UID"], env["REMOTE_GID"] = str(os.getuid()), str(os.getgid())
    return env


def pid_alive(pid):
    if not pid:
        return False
    if sys.platform == "win32":
        r = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/NH"], capture_output=True, text=True, errors="replace")
        return str(pid) in r.stdout
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    try:  # a zombie child of this process counts as dead
        with open(f"/proc/{pid}/stat") as f:
            return f.read().split()[2] != "Z"
    except OSError:
        return True


def api(s, path, method="GET", data=None, timeout=4):
    """The running server's /api (lead key); None when it does not answer."""
    sep = "&" if "?" in path else "?"
    url = f"http://127.0.0.1:{s['port']}{path}{sep}k={s['key']}&lead={s.get('lead') or ''}"
    body = json.dumps(data).encode() if data is not None else (b"" if method == "POST" else None)
    req = urllib.request.Request(url, data=body, method=method, headers={"content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode("utf-8") or "null")
    except (OSError, ValueError, urllib.error.HTTPError):
        return None


def tunnel_alive(s):
    if s.get("mode") == "node":
        return pid_alive((s.get("pids") or {}).get("tunnel"))
    try:
        r = subprocess.run(compose(["ps", "--status", "running", "--services"]), env=compose_env(None, None, load_config()),
                           cwd=ROOT, capture_output=True, text=True, timeout=30)
        return "tunnel" in r.stdout.split()
    except (OSError, subprocess.SubprocessError):
        return False


def healthy(s, need_tunnel):
    """The remote of this state answers with this key (and its tunnel runs, when phones need it)."""
    if not s or not s.get("key") or api(s, "/api/status") is None:
        return False
    if need_tunnel and not (s.get("tunnel") and tunnel_alive(s)):
        return False
    return True


# ------------------------------------------------------------------ helper (auto-mix, open folder)

def start_helper(s):
    pid = (s.get("pids") or {}).get("helper")
    if pid_alive(pid):
        return pid
    pid = spawn([sys.executable, "-u", os.path.join(HERE, "start.py"), "--helper"], "helper.log", os.environ.copy())
    s.setdefault("pids", {})["helper"] = pid
    save_state(s)
    return pid


def helper():
    """Runs next to the server until it stops: mixes every stopped take, opens folders for the control page."""
    s = load_state()
    if not s:
        return
    import mix as mixmod
    key = s["key"]
    print(f"helper: watching the remote on port {s['port']}", flush=True)
    misses = 0
    while True:
        cur = load_state()
        if not cur or cur.get("key") != key:
            print("helper: the remote was stopped", flush=True)
            return
        job = api(cur, "/api/helper")
        if job is None:
            misses += 1
            if misses > 900:  # 15 minutes without a server
                return
            time.sleep(1)
            continue
        misses = 0
        for j in job.get("jobs") or []:
            if j.get("open"):
                open_path(os.path.join(mixmod.recordings_dir(), os.path.basename(j["open"])))
        mx = job.get("mix") or {}
        if job.get("session") and mx.get("state") == "pending":
            helper_mix(cur, mixmod, job["session"])
        time.sleep(1)


def helper_mix(s, mixmod, session):
    folder = os.path.join(mixmod.recordings_dir(), os.path.basename(session))
    post = lambda m: api(s, "/api/helper", "POST", {"session": session, "mix": m})
    post({"state": "mixing", "note": "starting", "folder": folder})
    print(f"helper: mixing {folder}", flush=True)
    try:
        with open(os.path.join(folder, "timeline.json"), encoding="utf-8") as f:
            driven = bool((json.load(f).get("obs") or {}).get("driven"))
        res = mixmod.mix(folder, wait_video=15 if driven else 90,
                         note=lambda text: post({"state": "mixing", "note": text, "folder": folder}))
        out = res["final"] or res["voices"]
        post({"state": "done", "path": out, "voices": res["voices"], "video": res["video"] or "", "folder": folder,
              "note": "" if res["final"] else "no OBS video found: voices only (npm run mix -- --video <file>)"})
        print(f"helper: done {out}", flush=True)
    except Exception as e:  # MixError and anything else: show it on the control page
        post({"state": "error", "error": str(e), "folder": folder})
        print(f"helper: mix failed: {e}", flush=True)


# ------------------------------------------------------------------ start / stop

def start_docker(cfg, key, lead, local, obs_url):
    env = compose_env(key, lead, cfg, obs_url)
    print("Starting the remote" + ("" if local else " and the tunnel") + " in Docker (the first build takes a few minutes)...")
    args = ["up", "--build", "-d", "--remove-orphans"] + (["remote"] if local else [])
    if subprocess.run(compose(args), env=env, cwd=ROOT).returncode != 0:
        cleanup(quiet=True)
        sys.exit("docker compose up failed. Is Docker Desktop running? Or: npm run record -- --mode node")
    state = {"mode": "docker", "key": key, "lead": lead, "port": cfg["port"], "tunnel": None, "local": local, "pids": {}}
    save_state(state)
    if not wait_http(cfg["port"], 60):
        cleanup(quiet=True)
        sys.exit(f"The remote does not answer. Check: docker compose -p {project_name()} -f remote/compose.yaml logs remote")
    if local:
        return state

    def logs():
        r = subprocess.run(compose(["logs", "--no-color", "tunnel"]), env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
        return r.stdout + r.stderr
    tunnel = wait_tunnel(logs)
    if not tunnel:
        cleanup(quiet=True)
        sys.exit(f"No tunnel address after {WAIT_SECONDS} s (Cloudflare busy?). Run npm run record again.")
    state["tunnel"] = tunnel
    save_state(state)
    return state


def start_node(cfg, key, lead, local, obs_url):
    node = shutil.which("node")
    if not node:
        sys.exit("Node.js is not installed and Docker is not running: install one of them.")
    if subprocess.run([node, "-e", "require.resolve('ws')"], cwd=ROOT, capture_output=True).returncode != 0:
        sys.exit("The ws package is missing: run npm install (ws is a dependency of the deck).")
    cloudflared = shutil.which("cloudflared")
    if not local and not cloudflared:
        sys.exit("cloudflared is not installed, and Docker is not running.\n"
                 "Install it (Windows: winget install Cloudflare.cloudflared; macOS: brew install cloudflared;\n"
                 "Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)\n"
                 "or start Docker Desktop, or use npm run record -- --local for this laptop only.")
    env = {**os.environ, "REMOTE_KEY": key, "LEAD_KEY": lead or "", "PORT": str(cfg["port"]), "HOST": "127.0.0.1",
           "OBS_DECK_URL": obs_url, **obs_env(cfg, False)}
    pid = spawn([node, os.path.join("remote", "server.mjs")], "server.log", env)
    state = {"mode": "node", "key": key, "lead": lead, "port": cfg["port"], "tunnel": None, "local": local, "pids": {"server": pid}}
    save_state(state)
    if not wait_http(cfg["port"]):
        print(read_file(os.path.join(RUN, "server.log"))[-2000:])
        cleanup(quiet=True)
        sys.exit("The remote server did not start (log above). Port busy? npm run stop, then npm run record.")
    if local:
        return state
    tpid = spawn([cloudflared, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{cfg['port']}"], "tunnel.log", os.environ.copy())
    state["pids"]["tunnel"] = tpid
    save_state(state)
    tunnel = wait_tunnel(lambda: read_file(os.path.join(RUN, "tunnel.log")))
    if not tunnel:
        cleanup(quiet=True)
        sys.exit(f"No tunnel address after {WAIT_SECONDS} s (Cloudflare busy?). Run npm run record again; log: remote/.run/tunnel.log")
    state["tunnel"] = tunnel
    save_state(state)
    return state


def cleanup(quiet=False, docker=None):
    """Stop whatever a previous run left: server, tunnel, helper, compose project. Never fails."""
    s = load_state() or {}
    for pid in (s.get("pids") or {}).values():
        kill(pid)
    if s.get("mode") == "docker" or (docker if docker is not None else (not s and shutil.which("docker") and docker_ready())):
        try:
            subprocess.run(compose(["down", "--remove-orphans"]), env=compose_env(None, None, load_config()), cwd=ROOT,
                           capture_output=quiet, timeout=120)
        except (OSError, subprocess.SubprocessError):
            pass
    try:
        os.remove(STATE)
    except OSError:
        pass


def wait_mix(s, seconds=900):
    """npm run stop after a take: let the helper finish the mix first (Ctrl+C skips)."""
    deadline, last = time.time() + seconds, None
    try:
        while time.time() < deadline:
            st = api(s, "/api/status")
            mx = (st or {}).get("mix") or {}
            if not st or mx.get("state") not in ("waiting", "pending", "mixing"):
                if mx.get("state") == "done":
                    print(f"Mixed: {mx.get('path')}")
                elif mx.get("state") == "error":
                    print(f"The mix failed: {mx.get('error')}\nFix it, then: npm run mix")
                return
            if not st.get("helper", {}).get("online"):
                print("Not mixed yet (no helper running): run npm run mix")
                return
            note = f"Mixing the take ({mx.get('note') or mx.get('state')})... Ctrl+C to skip"
            if note != last:
                print(note, flush=True)
                last = note
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nSkipped the mix: run npm run mix later.")


def stop():
    s = load_state()
    if s:
        st = api(s, "/api/status")
        if st and (st.get("rec") or {}).get("state") in ("countdown", "recording"):
            print("A recording is running: stopping it and saving the files...")
            api(s, "/api/rec?action=stop", "POST")
            time.sleep(1)
        if st:
            wait_mix(s)
    cleanup(quiet=True)
    print("Stopped. Recordings are in recordings/.")


# ------------------------------------------------------------------ build

def newest_mtime(paths):
    m = 0.0
    for p in paths:
        p = os.path.join(ROOT, p)
        if os.path.isfile(p):
            m = max(m, os.path.getmtime(p))
        elif os.path.isdir(p):
            for d, _, files in os.walk(p):
                for f in files:
                    m = max(m, os.path.getmtime(os.path.join(d, f)))
    return m


def ensure_build(force=False):
    """Build the single-file deck when dist-single is missing or older than the sources."""
    out = os.path.join(ROOT, "dist-single", "index.html")
    src = newest_mtime(["src", "public", "index.html", "package.json", "vite.config.ts", "vite.config.js"])
    if not force and os.path.exists(out) and os.path.getmtime(out) >= src:
        return
    npm = shutil.which("npm")
    if not npm:
        sys.exit("npm is not installed: install Node.js 20+ or start Docker Desktop.")
    with open(os.path.join(ROOT, "package.json"), encoding="utf-8") as f:
        scripts = json.load(f).get("scripts", {})
    script = "build:single" if "build:single" in scripts else "build"
    print(f"Building the deck (npm run {script})...")
    if subprocess.run([npm, "run", script], cwd=ROOT).returncode != 0:
        sys.exit("The build failed: fix it, then run this again.")


def wait_obs(s, seconds=4.0):
    """The status after the server had a moment to find OBS."""
    deadline = time.time() + seconds
    st = api(s, "/api/status")
    while st and (st.get("obs") or {}).get("state") == "connecting" and time.time() < deadline:
        time.sleep(0.3)
        st = api(s, "/api/status")
    return st


def open_pages(s, st, cfg, force):
    ln = links(cfg, s["key"], s.get("lead"), s.get("tunnel"))
    opened = []
    # the control page first, then the lead deck (the deck ends up in front: it gets the keys)
    if (force or not (st or {}).get("consoles")) and open_url(ln["preflight"]):
        opened.append("the control page")
    if (force or not ((st or {}).get("lead") or {}).get("decks")) and open_url(ln["lead"]):
        opened.append("the lead deck")
    return " and ".join(opened)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--mix":
        os.chdir(ROOT)
        import mix as mixmod
        mixmod.main(sys.argv[2:])
        return
    ap = argparse.ArgumentParser(prog="npm run record --", description="Start the deck remote and print the links.")
    ap.add_argument("--record", action="store_true", help="the recording setup (npm run record)")
    ap.add_argument("--links", action="store_true", help="print the links of the running remote again (npm run links)")
    ap.add_argument("--stop", action="store_true", help="stop everything (npm run stop)")
    ap.add_argument("--fresh", action="store_true", help="new keys: stop the running remote and start again")
    ap.add_argument("--mode", choices=["auto", "docker", "node"], default="auto", help="Docker (default when running) or node + cloudflared")
    ap.add_argument("--local", action="store_true", help="only the deck on this computer: no tunnel, no phones")
    ap.add_argument("--no-open", action="store_true", help="do not open the browser")
    ap.add_argument("--dry-run", action="store_true", help="print the links with a fake tunnel; start nothing, write nothing")
    ap.add_argument("--key", help="use this key instead of a new one")
    ap.add_argument("--no-build", action="store_true", help="node mode: do not build the deck")
    ap.add_argument("--qr", action="store_true", help="also print the phone link as a QR code")
    ap.add_argument("--qr-invert", action="store_true", help="QR code for terminals with a light background")
    ap.add_argument("--helper", action="store_true", help=argparse.SUPPRESS)
    a = ap.parse_args()

    os.chdir(ROOT)
    if a.helper:
        helper()
        return
    cfg = load_config()
    if a.stop:
        stop()
        return

    if a.dry_run:
        key, lead = a.key or secrets.token_hex(6), secrets.token_hex(8)
        s = {"key": key, "lead": lead, "port": cfg["port"], "tunnel": "https://example-words-here.trycloudflare.com"}
        print(f"(dry run: nothing started; speakers: {', '.join(x['name'] for x in cfg['speakers']) or 'none'})")
        print_summary(cfg, s, None, True, "", False, qr=a.qr, invert=a.qr_invert, full=True)
        return

    if a.links:
        s = load_state()
        if not s or not healthy(s, False):
            sys.exit("No running remote found. Start it with: npm run record")
        st = api(s, "/api/status")
        ln = links(cfg, s["key"], s.get("lead"), s.get("tunnel"))
        copied = bool(ln.get("parts")) and copy(team_message(cfg, ln))
        print_summary(cfg, s, st, True, "", copied, qr=a.qr, invert=a.qr_invert, full=True)
        return

    record = a.record
    s = load_state()
    if s and not a.fresh and not a.key and bool(s.get("local")) == a.local and healthy(s, not a.local):
        # idempotent: the remote runs, keep its keys (phones and OBS stay connected)
        print(f"The remote is already running ({s['mode']} mode): reusing it. New keys: npm run record -- --fresh")
        if s.get("lead"):
            start_helper(s)
        st = api(s, "/api/status")
        opened = "" if a.no_open else open_pages(s, st, cfg, force=False)
        ln = links(cfg, s["key"], s.get("lead"), s.get("tunnel"))
        copied = bool(ln.get("parts")) and copy(team_message(cfg, ln, record))
        print_summary(cfg, s, st, record, opened, copied, qr=a.qr, invert=a.qr_invert)
        return

    mode = a.mode
    if mode == "auto":
        mode = "docker" if docker_ready() else "node"
        print(f"Mode: {mode}" + ("" if mode == "docker" else " (Docker is not running)"))
    if s:
        print("Cleaning up the previous run first...")
    # a half-started or stuck run (dead server, missing tunnel, a compose project left behind) goes first
    cleanup(quiet=True, docker=(mode == "docker") or (s or {}).get("mode") == "docker")
    if mode == "node" and not a.no_build:
        ensure_build()

    key = a.key or secrets.token_hex(6)
    lead = secrets.token_hex(8)
    os.makedirs(os.path.join(ROOT, "recordings"), exist_ok=True)
    obs_url = links(cfg, key, lead, None)["obs"]
    s = (start_docker if mode == "docker" else start_node)(cfg, key, lead, a.local, obs_url)
    start_helper(s)
    obs_files(cfg, obs_url)
    st = wait_obs(s)
    opened = "" if a.no_open else open_pages(s, st, cfg, force=True)

    if a.local:
        ln = links(cfg, key, lead, None)
        print(f"""
Only this laptop (no tunnel). Opened: {opened or "nothing"}.
  Control page  {ln['preflight']}
  Lead deck     {ln['lead']}
  Phone remote  {ln['local_remote']}  (a second window, to rehearse)

  npm run stop    stop everything when you are done""")
        return

    ln = links(cfg, key, lead, s["tunnel"])
    copied = copy(team_message(cfg, ln, record))
    print_summary(cfg, s, st, record, opened, copied, qr=a.qr, invert=a.qr_invert)


if __name__ == "__main__":
    main()
