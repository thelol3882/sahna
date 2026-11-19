"""Start the deck remote and print every link the team needs.

    npm run record                         # = python remote/start.py --record (see remote/run.mjs)
    python remote/start.py                 # new keys, start (Docker if running, else node), tunnel, links
    python remote/start.py --local         # only this laptop: no tunnel, no phones
    python remote/start.py --links         # print the links of the running remote again
    python remote/start.py --stop          # stop the server and the tunnel
    python remote/start.py --dry-run       # print the links with a fake tunnel, start nothing

--record also checks the build, prints the pre-flight link and writes the OBS files:
  remote/obs-scene-collection.json  (OBS: Scene Collection -> Import)
  remote/obs-profile/               (OBS: Profile -> Import: 1920x1080, 60 fps, mkv, tracks 1+2)

Settings: remote/config.json (title, port, speakers). Standard library only; Windows, macOS, Linux.
"""

import sys as _sys
for _stream in (_sys.stdout, _sys.stderr):  # a Windows console in cp1252 must not crash on arrows or Kazakh text
    try:
        _stream.reconfigure(errors="replace")
    except Exception:
        pass
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
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
RUN = os.path.join(HERE, ".run")
STATE = os.path.join(RUN, "state.json")
COMPOSE_FILE = os.path.join(HERE, "compose.yaml")
TUNNEL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com")
WAIT_SECONDS = 90
sys.path.insert(0, HERE)


# ------------------------------------------------------------------ config

def load_config():
    path = os.path.join(HERE, "config.json")
    cfg = {}
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            cfg = json.load(f)
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


def team_message(cfg, ln, record):
    lines = [
        f"{cfg['title']}: deck remote",
        "",
        "Open your link on your phone (Chrome on Android, Safari on iPhone).",
        "It shows your text for the current step; Next works only while your part is on screen.",
        "Press Next only after the slide stops moving.",
    ]
    if record:
        lines += [
            "",
            "We record the voices on the phones, so please:",
            "- join the call on your laptop, not on this phone, and wear headphones;",
            "- tap Mic once and allow the microphone, tick the two checks;",
            "- keep the remote page open with the screen on until the recording stops.",
        ]
    lines.append("")
    for part, name, url in ln["parts"]:
        lines.append(f"{part}. {name}: {url}")
    lines += ["", f"Watch only (phone): {ln['watch_phone']}",
              "", "Watch the deck in your own browser, in sync and without lag:", ln["watch_deck"],
              "(click the page once so videos can play with sound, then press F)"]
    return "\n".join(lines)


def print_links(cfg, key, lead, tunnel, record, qr=True, invert=False):
    ln = links(cfg, key, lead, tunnel)
    print(f"\nKey: {key}\n")
    print("1. Your own deck, the lead: your keys move every open deck. Keep this link to yourself.")
    print(f"   {ln['lead']}\n")
    print("2. OBS Browser source (1920x1080, 60 fps, Control audio via OBS). It follows the lead and the phones:")
    print(f"   {ln['obs']}\n")
    print("3. Pre-flight checks and REC for everyone (lead only):")
    print(f"   {ln['preflight']}\n")
    if tunnel:
        team = team_message(cfg, ln, record)
        print("4. Send this to the team chat:")
        print("-" * 63)
        print(team)
        print("-" * 63)
        if copy(team):
            print("The team message is in your clipboard.")
        if qr:
            try:
                from qr import qr_terminal
                print(f"\nPhone link as a QR code (everyone picks their name):\n{qr_terminal(ln['phone'], invert)}")
                print("(no scan? try --qr-invert, or send the link)")
            except Exception as e:  # never fail the start because of the QR code
                print(f"(QR code skipped: {e})")
    return ln


def copy(text):
    """Best effort: the clipboard of this computer."""
    try:
        if sys.platform == "win32":
            subprocess.run("clip", input=text.encode("utf-16le"), check=True, shell=True)
        elif sys.platform == "darwin":
            subprocess.run(["pbcopy"], input=text.encode(), check=True)
        elif shutil.which("wl-copy"):
            subprocess.run(["wl-copy"], input=text.encode(), check=True)
        elif shutil.which("xclip"):
            subprocess.run(["xclip", "-selection", "clipboard"], input=text.encode(), check=True)
        else:
            return False
        return True
    except (OSError, subprocess.CalledProcessError):
        return False


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


def compose_env(key, lead, cfg):
    env = {**os.environ, "REMOTE_KEY": key or "unused", "LEAD_KEY": lead or "", "REMOTE_PORT": str(cfg["port"]),
           "MEDIA_HOST_DIR": media_dir(cfg)}
    if hasattr(os, "getuid"):
        env["REMOTE_UID"], env["REMOTE_GID"] = str(os.getuid()), str(os.getgid())
    return env


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


# ------------------------------------------------------------------ start / stop

def start_docker(cfg, key, lead, local):
    env = compose_env(key, lead, cfg)
    print("Building and starting the remote" + ("" if local else " and the tunnel") + " in Docker (the first build takes a few minutes)...")
    args = ["up", "--build", "-d"] + (["remote"] if local else [])
    if subprocess.run(compose(args), env=env, cwd=ROOT).returncode != 0:
        sys.exit("docker compose up failed. Is Docker Desktop running? Or use --mode node.")
    save_state({"mode": "docker", "key": key, "lead": lead, "port": cfg["port"], "tunnel": None})
    if not wait_http(cfg["port"], 60):
        sys.exit(f"The remote does not answer. Check: docker compose -p {project_name()} -f remote/compose.yaml logs remote")
    if local:
        return None

    def logs():
        r = subprocess.run(compose(["logs", "--no-color", "tunnel"]), env=env, capture_output=True, text=True, encoding="utf-8", errors="replace")
        return r.stdout + r.stderr
    tunnel = wait_tunnel(logs)
    if not tunnel:
        sys.exit(f"No tunnel address after {WAIT_SECONDS} s. Check: docker compose -p {project_name()} -f remote/compose.yaml logs tunnel")
    save_state({"mode": "docker", "key": key, "lead": lead, "port": cfg["port"], "tunnel": tunnel})
    return tunnel


def start_node(cfg, key, lead, local):
    node = shutil.which("node")
    if not node:
        sys.exit("Node.js is not installed and Docker is not running: install one of them.")
    if subprocess.run([node, "-e", "require.resolve('ws')"], cwd=ROOT, capture_output=True).returncode != 0:
        sys.exit("The ws package is missing: run npm install (ws is a dev dependency of the deck).")
    cloudflared = shutil.which("cloudflared")
    if not local and not cloudflared:
        sys.exit("cloudflared is not installed, and Docker is not running.\n"
                 "Install it (macOS: brew install cloudflared; Windows: winget install Cloudflare.cloudflared;\n"
                 "Linux: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)\n"
                 "or start Docker Desktop, or use --local for this laptop only.")
    env = {**os.environ, "REMOTE_KEY": key, "LEAD_KEY": lead or "", "PORT": str(cfg["port"]), "HOST": "127.0.0.1"}
    pid = spawn([node, os.path.join("remote", "server.mjs")], "server.log", env)
    state = {"mode": "node", "key": key, "lead": lead, "port": cfg["port"], "tunnel": None, "pids": {"server": pid}}
    save_state(state)
    if not wait_http(cfg["port"]):
        print(read_file(os.path.join(RUN, "server.log"))[-2000:])
        kill(pid)
        sys.exit("The remote server did not start (log above).")
    if local:
        return None
    tpid = spawn([cloudflared, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{cfg['port']}"], "tunnel.log", os.environ.copy())
    state["pids"]["tunnel"] = tpid
    save_state(state)
    tunnel = wait_tunnel(lambda: read_file(os.path.join(RUN, "tunnel.log")))
    if not tunnel:
        sys.exit(f"No tunnel address after {WAIT_SECONDS} s. Check remote/.run/tunnel.log")
    state["tunnel"] = tunnel
    save_state(state)
    return tunnel


def stop():
    s = load_state() or {}
    if s.get("mode") == "node":
        for pid in (s.get("pids") or {}).values():
            kill(pid)
        print("Stopped the remote server and the tunnel.")
    elif shutil.which("docker"):
        cfg = load_config()
        r = subprocess.run(compose(["down"]), env=compose_env(None, None, cfg), cwd=ROOT)
        if r.returncode != 0 and s:
            sys.exit(r.returncode)
    try:
        os.remove(STATE)
    except OSError:
        pass


def main():
    ap = argparse.ArgumentParser(description="Start the deck remote and print the links.")
    ap.add_argument("--record", action="store_true", help="the full recording setup: build check, remote, tunnel, links, QR, OBS files")
    ap.add_argument("--mode", choices=["auto", "docker", "node"], default="auto", help="Docker (default when running) or node + cloudflared")
    ap.add_argument("--local", action="store_true", help="only the deck on this computer: no tunnel, no phones")
    ap.add_argument("--links", action="store_true", help="print the links of the running remote again")
    ap.add_argument("--stop", action="store_true", help="stop the remote and the tunnel")
    ap.add_argument("--dry-run", action="store_true", help="print the links with a fake tunnel; start nothing, write nothing")
    ap.add_argument("--key", help="use this key instead of a new one")
    ap.add_argument("--tunnel", help="the trycloudflare address, to only print the links")
    ap.add_argument("--no-build", action="store_true", help="node mode: do not build the deck")
    ap.add_argument("--no-qr", action="store_true", help="do not print the QR code")
    ap.add_argument("--qr-invert", action="store_true", help="QR code for terminals with a light background")
    a = ap.parse_args()

    os.chdir(ROOT)
    cfg = load_config()
    if a.stop:
        stop()
        return

    if a.dry_run:
        key, lead = a.key or secrets.token_hex(6), secrets.token_hex(8)
        tunnel = (a.tunnel or "https://example-words-here.trycloudflare.com").rstrip("/")
        print(f"(dry run: nothing started; speakers: {', '.join(s['name'] for s in cfg['speakers']) or 'none'})")
        print_links(cfg, key, lead, tunnel, record=True, qr=not a.no_qr, invert=a.qr_invert)
        print("\nWould write remote/obs-scene-collection.json and remote/obs-profile/ (with --record).")
        return

    if a.links or a.tunnel:
        s = load_state()
        if not s:
            sys.exit("No running remote found. Start it with: npm run record (or python remote/start.py)")
        tunnel = (a.tunnel or s.get("tunnel") or "").rstrip("/") or None
        print_links(cfg, a.key or s["key"], s.get("lead"), tunnel, record=a.record, qr=not a.no_qr, invert=a.qr_invert)
        return

    if load_state():
        print("A remote seems to be running: stopping it first (new keys for this session).")
        stop()

    mode = a.mode
    if mode == "auto":
        mode = "docker" if docker_ready() else "node"
        print(f"Mode: {mode}" + ("" if mode == "docker" else " (Docker is not running)"))
    if mode == "node" and not a.no_build:
        ensure_build()

    key = a.key or secrets.token_hex(6)
    lead = secrets.token_hex(8)
    os.makedirs(os.path.join(ROOT, "recordings"), exist_ok=True)
    tunnel = (start_docker if mode == "docker" else start_node)(cfg, key, lead, a.local)

    if a.local:
        ln = links(cfg, key, lead, None)
        print(f"""
Open the deck in Chrome, press F, and use the arrow keys or a clicker:
   {ln['local']}
Rehearse the phone remote in a second window:
   {ln['local_remote']}

After the talk: python remote/start.py --stop""")
        return

    ln = print_links(cfg, key, lead, tunnel, record=a.record, qr=not a.no_qr, invert=a.qr_invert)
    if a.record:
        coll, prof = obs_files(cfg, ln["obs"])
        print(f"""
OBS (Studio 30 or newer):
   Profile -> Import -> {os.path.relpath(prof, ROOT)}   (1920x1080, 60 fps, mkv, audio tracks 1+2)
   Scene Collection -> Import -> {os.path.relpath(coll, ROOT)}   (deck on track 1, backup mic on track 2)
   Re-import the scene collection after every start: the key in the deck link changes.

Then: open the lead link, open the pre-flight page, wait for READY, start OBS recording,
press "Start REC for everyone". Afterwards: python remote/mix.py recordings/<session> --video <obs file>""")
    print("After the recording: python remote/start.py --stop")


if __name__ == "__main__":
    main()
