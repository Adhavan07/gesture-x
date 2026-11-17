#!/usr/bin/env python3
"""Gesture virtual mouse for Linux (Wayland via ydotool). Q / ESC quits."""
import argparse, collections, math, os, subprocess, threading, time

import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision

MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          "models", "hand_landmarker.task")

# ---------------- tunables ----------------
ACTIVE_BOX = (0.20, 0.15, 0.80, 0.75)  # camera area (mirrored, normalized) mapped to the full screen
PINCH_ON, PINCH_OFF = 0.28, 0.40       # pinch start/release, relative to hand size (hysteresis)
MIN_REACH = 0.95                       # pinching fingertip must be this far from wrist (blocks fist false-pinch)
EXT_RATIO = 1.08                       # finger counts as extended if tip is this much farther than PIP joint
DRAG_HOLD = 0.35                       # seconds of pinch before drag begins
CLICK_COOLDOWN = 0.15
HOLD_PAUSE, HOLD_RESUME = 0.30, 0.20   # seconds to hold fist / open palm
LOSS_TIMEOUT = 0.30                    # hand lost this long -> release everything
SCROLL_GAIN = 60.0                     # wheel ticks per full frame height of hand travel
SCROLL_INVERT = False
FILTER_MINCUTOFF, FILTER_BETA = 1.5, 0.008


# ---------------- mouse backend ----------------
class YdotoolMouse:
    def __init__(self, relative=False):
        self.env = os.environ.copy()
        self.env.setdefault("YDOTOOL_SOCKET", f"/run/user/{os.getuid()}/.ydotool_socket")
        self.relative = relative
        self.last = None
        self.cmds = collections.deque()
        self.cv = threading.Condition()
        self.alive = True
        threading.Thread(target=self._worker, daemon=True).start()

    def _push(self, kind, args):
        with self.cv:
            if kind == "move" and self.cmds and self.cmds[-1][0] == "move":
                self.cmds[-1] = (kind, args)   # coalesce stale moves
            else:
                self.cmds.append((kind, args))
            self.cv.notify()

    def _worker(self):
        while self.alive:
            with self.cv:
                while not self.cmds and self.alive:
                    self.cv.wait(0.2)
                if not self.cmds:
                    continue
                _, args = self.cmds.popleft()
            subprocess.run(["ydotool", *args], env=self.env,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    def move(self, x, y):
        if self.relative:
            if self.last is not None:
                dx, dy = x - self.last[0], y - self.last[1]
                if dx or dy:
                    self._push("move", ["mousemove", "-x", str(dx), "-y", str(dy)])
            self.last = (x, y)
        else:
            self._push("move", ["mousemove", "--absolute", "-x", str(x), "-y", str(y)])

    def click_left(self):  self._push("btn", ["click", "0xC0"])
    def click_right(self): self._push("btn", ["click", "0xC1"])
    def left_down(self):   self._push("btn", ["click", "0x40"])
    def left_up(self):     self._push("btn", ["click", "0x80"])
    def wheel(self, t):    self._push("btn", ["mousemove", "--wheel", "-x", "0", "-y", str(t)])

    def close(self):
        time.sleep(0.2)
        self.alive = False


# ---------------- smoothing ----------------
class OneEuro:
    def __init__(self, mincutoff=1.0, beta=0.0, dcutoff=1.0):
        self.mc, self.beta, self.dc = mincutoff, beta, dcutoff
        self.x = self.dx = self.t = None

    @staticmethod
    def _a(cutoff, dt):
        return 1.0 / (1.0 + (1.0 / (2 * math.pi * cutoff)) / dt)

    def __call__(self, x, t):
        if self.x is None:
            self.x, self.dx, self.t = x, 0.0, t
            return x
        dt = max(t - self.t, 1e-3)
        self.t = t
        dx = (x - self.x) / dt
        self.dx += self._a(self.dc, dt) * (dx - self.dx)
        cutoff = self.mc + self.beta * abs(self.dx)
        self.x += self._a(cutoff, dt) * (x - self.x)
        return self.x


def dist(a, b):
    return math.hypot(a[0] - b[0], a[1] - b[1])


def clamp01(v):
    return max(0.0, min(1.0, v))


# ---------------- gesture engine ----------------
class Engine:
    def __init__(self, mouse, sw, sh):
        self.m, self.sw, self.sh = mouse, sw, sh
        self.fx = OneEuro(FILTER_MINCUTOFF, FILTER_BETA)
        self.fy = OneEuro(FILTER_MINCUTOFF, FILTER_BETA)
        self.paused = True
        self.mid_p = self.idx_p = False
        self.pinch = None
        self.pinch_t = 0.0
        self.dragging = False
        self.cool_until = 0.0
        self.fist_since = self.open_since = None
        self.scroll_prev = None
        self.scroll_acc = 0.0
        self.last_xy = None
        self.last_seen = time.monotonic()
        self.dbg = ""

    # --- helpers
    def classify(self, pts):
        scale = max(dist(pts[0], pts[9]), 1e-6)

        def ext(tip, pip):
            return dist(pts[0], pts[tip]) > dist(pts[0], pts[pip]) * EXT_RATIO

        idx, mid, rng, pky = ext(8, 6), ext(12, 10), ext(16, 14), ext(20, 18)
        d_tm = dist(pts[4], pts[12]) / scale
        d_ti = dist(pts[4], pts[8]) / scale
        reach_m = dist(pts[0], pts[12]) / scale
        reach_i = dist(pts[0], pts[8]) / scale
        thr = lambda active: PINCH_OFF if active else PINCH_ON
        mid_p = d_tm < thr(self.mid_p) and reach_m > MIN_REACH
        idx_p = d_ti < thr(self.idx_p) and reach_i > MIN_REACH
        if mid_p and idx_p:
            if d_tm <= d_ti: idx_p = False
            else: mid_p = False
        self.mid_p, self.idx_p = mid_p, idx_p
        self.dbg = f"tm={d_tm:.2f} ti={d_ti:.2f}"

        if mid_p: return "PINCH_L"
        if idx_p: return "PINCH_R"
        if idx and mid and rng and pky: return "OPEN"
        if not (idx or mid or rng or pky): return "FIST"
        if idx and mid and not rng and not pky: return "SCROLL"
        if idx and not mid: return "POINT"
        return "NONE"

    def move(self, x, y):
        xy = (int(round(x)), int(round(y)))
        if xy != self.last_xy:
            self.m.move(*xy)
            self.last_xy = xy

    def finish_pinch(self, now, click=True):
        if self.pinch == "PINCH_L":
            if self.dragging: self.m.left_up()
            elif click: self.m.click_left()
        elif self.pinch == "PINCH_R" and click:
            self.m.click_right()
        if self.pinch:
            self.cool_until = now + CLICK_COOLDOWN
        self.pinch, self.dragging = None, False

    def reset_inputs(self, now):
        self.finish_pinch(now, click=False)
        self.scroll_prev, self.scroll_acc = None, 0.0
        self.fist_since = self.open_since = None
        self.mid_p = self.idx_p = False

    # --- main update
    def update(self, lms, w, h, now):
        if lms is None:
            if now - self.last_seen > LOSS_TIMEOUT:
                self.reset_inputs(now)
            return "NO HAND"
        self.last_seen = now
        pts = [(p.x * w, p.y * h) for p in lms]

        x0, y0, x1, y1 = ACTIVE_BOX
        nx = clamp01((lms[5].x - x0) / (x1 - x0))
        ny = clamp01((lms[5].y - y0) / (y1 - y0))
        tx = self.fx(nx * (self.sw - 1), now)
        ty = self.fy(ny * (self.sh - 1), now)

        g = self.classify(pts)

        if g == "FIST":
            self.open_since = None
            if self.fist_since is None: self.fist_since = now
            if not self.paused and now - self.fist_since >= HOLD_PAUSE:
                self.reset_inputs(now)
                self.paused = True
            return "PAUSED" if self.paused else "FIST..."
        self.fist_since = None

        if g == "OPEN":
            if self.open_since is None: self.open_since = now
            if self.paused:
                if now - self.open_since >= HOLD_RESUME:
                    self.paused = False
                return "PAUSED (hold open palm)" if self.paused else "RESUMED"
            self.finish_pinch(now, click=False)
            self.scroll_prev = None
            return "OPEN"
        self.open_since = None

        if self.paused:
            return "PAUSED (show open palm)"

        if g in ("PINCH_L", "PINCH_R"):
            self.scroll_prev = None
            if self.pinch and self.pinch != g:
                self.finish_pinch(now, click=False)
            if self.pinch is None:
                if now < self.cool_until:
                    return "COOLDOWN"
                self.pinch, self.pinch_t = g, now
            if g == "PINCH_L":
                if not self.dragging and now - self.pinch_t >= DRAG_HOLD:
                    self.m.left_down()
                    self.dragging = True
                if self.dragging:
                    self.move(tx, ty)
                    return "DRAGGING"
                return "LEFT PINCH"
            return "RIGHT PINCH"

        self.finish_pinch(now)

        if g == "SCROLL":
            y = lms[9].y
            if self.scroll_prev is not None:
                sign = -1 if SCROLL_INVERT else 1
                self.scroll_acc += (self.scroll_prev - y) * SCROLL_GAIN * sign
                ticks = int(self.scroll_acc)
                if ticks:
                    self.m.wheel(ticks)
                    self.scroll_acc -= ticks
            self.scroll_prev = y
            return "SCROLL"
        self.scroll_prev, self.scroll_acc = None, 0.0

        if g == "POINT":
            self.move(tx, ty)
            return "POINT"
        return "READY"

    def release_all(self):
        self.finish_pinch(time.monotonic(), click=False)


# ---------------- misc ----------------
def get_screen_size(arg):
    if arg:
        w, h = arg.lower().split("x")
        return int(w), int(h)
    try:
        import tkinter as tk
        r = tk.Tk(); r.withdraw()
        w, h = r.winfo_screenwidth(), r.winfo_screenheight()
        r.destroy()
        return w, h
    except Exception:
        return 1920, 1080


def test_mouse(mouse, sw, sh):
    print("Moving cursor: center, 4 corners, center. Watch where it lands.")
    for x, y in [(sw // 2, sh // 2), (50, 50), (sw - 50, 50),
                 (sw - 50, sh - 50), (50, sh - 50), (sw // 2, sh // 2)]:
        mouse.move(x, y)
        print(f"  -> {x},{y}")
        time.sleep(1.2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--camera", type=int, default=0)
    ap.add_argument("--screen", help="e.g. 1920x1080")
    ap.add_argument("--relative", action="store_true", help="use relative ydotool moves")
    ap.add_argument("--test-mouse", action="store_true")
    ap.add_argument("--no-preview", action="store_true")
    args = ap.parse_args()

    sw, sh = get_screen_size(args.screen)
    mouse = YdotoolMouse(relative=args.relative)
    print(f"Screen {sw}x{sh} | backend ydotool ({'relative' if args.relative else 'absolute'})")

    if args.test_mouse:
        test_mouse(mouse, sw, sh)
        mouse.close()
        return

    opts = vision.HandLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=MODEL_PATH),
        running_mode=vision.RunningMode.VIDEO,
        num_hands=1,
        min_hand_detection_confidence=0.6,
        min_hand_presence_confidence=0.5,
        min_tracking_confidence=0.5,
    )
    detector = vision.HandLandmarker.create_from_options(opts)
    cap = cv2.VideoCapture(args.camera)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
    if not cap.isOpened():
        print("Cannot open camera"); return

    engine = Engine(mouse, sw, sh)
    print("Hold an OPEN PALM to start. Fist = pause. Q/ESC = quit.")
    last_ts, fps, t_prev = 0, 0.0, time.monotonic()
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                continue
            frame = cv2.flip(frame, 1)
            h, w = frame.shape[:2]
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            ts = int(time.monotonic() * 1000)
            ts = max(ts, last_ts + 1); last_ts = ts
            res = detector.detect_for_video(
                mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb), ts)
            lms = res.hand_landmarks[0] if res.hand_landmarks else None

            now = time.monotonic()
            label = engine.update(lms, w, h, now)
            fps = 0.9 * fps + 0.1 / max(now - t_prev, 1e-6); t_prev = now

            if not args.no_preview:
                x0, y0, x1, y1 = ACTIVE_BOX
                cv2.rectangle(frame, (int(x0 * w), int(y0 * h)), (int(x1 * w), int(y1 * h)),
                              (255, 200, 0), 1)
                if lms:
                    for p in lms:
                        cv2.circle(frame, (int(p.x * w), int(p.y * h)), 3, (0, 255, 0), -1)
                    kx, ky = int(lms[5].x * w), int(lms[5].y * h)
                    cv2.circle(frame, (kx, ky), 8, (0, 0, 255), 2)
                color = (0, 0, 255) if "PAUSED" in label else (0, 255, 0)
                cv2.putText(frame, label, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
                cv2.putText(frame, f"{engine.dbg}  {fps:.0f}fps", (10, 52),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
                cv2.imshow("Gesture Mouse", frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord("q"), 27):
                break
    finally:
        engine.release_all()
        mouse.close()
        cap.release()
        cv2.destroyAllWindows()
        print("Gesture mouse stopped safely.")


if __name__ == "__main__":
    main()
