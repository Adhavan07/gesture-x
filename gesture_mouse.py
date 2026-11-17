
import argparse
import os
import sys
import time
import shutil
import subprocess

import cv2
import mediapipe as mp
import numpy as np

# ============================================================
# CONFIGURATION
# ============================================================

CAMERA_INDEX = 0

# Hand movement mapping area. Smaller margins = larger usable area.
FRAME_MARGIN = 0.12

# Cursor smoothing: lower = smoother, higher = faster response.
SMOOTHING = 0.30

# Gesture timing
LEFT_DRAG_HOLD_SECONDS = 0.35
GESTURE_COOLDOWN = 0.25

# Pinch thresholds are normalized by hand palm width.
PINCH_START = 0.32
PINCH_RELEASE = 0.48

# Scroll sensitivity
SCROLL_SENSITIVITY = 8
SCROLL_DEAD_ZONE = 0.018

# Camera preview
SHOW_CAMERA = True
CAMERA_WIDTH = 1280
CAMERA_HEIGHT = 720

MODEL_PATH = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "models",
    "hand_landmarker.task"
)

# ============================================================
# DISPLAY AND MOUSE BACKEND
# ============================================================

SESSION = os.environ.get("XDG_SESSION_TYPE", "").lower()

if SESSION not in ("wayland", "x11"):
    print("Could not detect display session.")
    print("Run: echo $XDG_SESSION_TYPE")
    sys.exit(1)


def get_screen_size():
    try:
        import tkinter as tk

        root = tk.Tk()
        root.withdraw()
        width = root.winfo_screenwidth()
        height = root.winfo_screenheight()
        root.destroy()
        return width, height
    except Exception:
        print("Could not determine display resolution.")
        sys.exit(1)


SCREEN_WIDTH = 0
SCREEN_HEIGHT = 0


class PreviewMouseController:
    def move(self, x, y):
        pass

    def click_left(self):
        pass

    def click_right(self):
        pass

    def left_down(self):
        pass

    def left_up(self):
        pass

    def scroll(self, amount):
        pass

    def release_all(self):
        pass


class MouseController:
    def __init__(self):
        self.session = SESSION
        self.ydotool = shutil.which("ydotool")
        self.left_is_down = False

        if self.session == "x11":
            import pyautogui
            self.pg = pyautogui
            self.pg.FAILSAFE = False
            self.pg.PAUSE = 0
            print("Mouse backend: PyAutoGUI (X11)")

        elif self.session == "wayland":
            if not self.ydotool:
                raise RuntimeError(
                    "Wayland detected, but ydotool is not installed.\n"
                    "Run: sudo dnf install ydotool\n"
                    "Then: sudo systemctl enable --now ydotool"
                )

            print("Mouse backend: ydotool (Wayland)")
            self.run_ydotool("mousemove", "--absolute", "100", "100")

    def run_ydotool(self, *args):
        result = subprocess.run(
            [self.ydotool, *map(str, args)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
            timeout=2
        )

        if result.returncode != 0:
            raise RuntimeError(
                "ydotool failed: " + result.stderr.strip()
            )

    def move(self, x, y):
        x = int(np.clip(x, 0, SCREEN_WIDTH - 1))
        y = int(np.clip(y, 0, SCREEN_HEIGHT - 1))

        if self.session == "x11":
            self.pg.moveTo(x, y, _pause=False)
        else:
            self.run_ydotool(
                "mousemove", "--absolute", str(x), str(y)
            )

    def click_left(self):
        if self.session == "x11":
            self.pg.click(button="left")
        else:
            self.run_ydotool("click", "0xC0")

    def click_right(self):
        if self.session == "x11":
            self.pg.click(button="right")
        else:
            self.run_ydotool("click", "0xC1")

    def left_down(self):
        if self.left_is_down:
            return

        if self.session == "x11":
            self.pg.mouseDown(button="left")
        else:
            self.run_ydotool("click", "0x40")

        self.left_is_down = True

    def left_up(self):
        if not self.left_is_down:
            return

        if self.session == "x11":
            self.pg.mouseUp(button="left")
        else:
            self.run_ydotool("click", "0x80")

        self.left_is_down = False

    def scroll(self, amount):
        if amount == 0:
            return

        if self.session == "x11":
            self.pg.scroll(int(amount))
        else:
            # ydotool wheel uses relative X and Y wheel movement.
            self.run_ydotool(
                "mousemove",
                "--wheel",
                "-x", "0",
                "-y", str(int(amount))
            )

    def release_all(self):
        self.left_up()


# ============================================================
# MEDIAPIPE HAND TRACKER
# ============================================================

if not os.path.isfile(MODEL_PATH):
    print("Hand tracking model not found:")
    print(MODEL_PATH)
    print("Download the model into the models directory first.")
    sys.exit(1)

BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
RunningMode = mp.tasks.vision.RunningMode

options = HandLandmarkerOptions(
    base_options=BaseOptions(model_asset_path=MODEL_PATH),
    running_mode=RunningMode.VIDEO,
    num_hands=1,
    min_hand_detection_confidence=0.65,
    min_hand_presence_confidence=0.65,
    min_tracking_confidence=0.65
)

# ============================================================
# GESTURE HELPERS
# ============================================================

def distance(a, b):
    return np.linalg.norm(
        np.array([a.x, a.y]) - np.array([b.x, b.y])
    )


def finger_is_extended(landmarks, tip, pip):
    # Image Y coordinates increase downwards.
    return landmarks[tip].y < landmarks[pip].y


def detect_gesture(landmarks):
    """
    Returns one of:
    OPEN, FIST, SCROLL, LEFT_PINCH, RIGHT_PINCH, POINT, UNKNOWN
    """

    index_up = finger_is_extended(landmarks, 8, 6)
    middle_up = finger_is_extended(landmarks, 12, 10)
    ring_up = finger_is_extended(landmarks, 16, 14)
    pinky_up = finger_is_extended(landmarks, 20, 18)

    # Approximate palm width for scale-independent pinch detection.
    palm_width = max(distance(landmarks[5], landmarks[17]), 0.001)

    thumb_index = distance(
        landmarks[4], landmarks[8]
    ) / palm_width

    thumb_middle = distance(
        landmarks[4], landmarks[12]
    ) / palm_width

    # Priority 1: pinch gestures.
    if thumb_middle < PINCH_START:
        return "LEFT_PINCH"

    if thumb_index < PINCH_START:
        return "RIGHT_PINCH"

    # Priority 2: pause/resume gestures.
    if index_up and middle_up and ring_up and pinky_up:
        return "OPEN"

    if not index_up and not middle_up and not ring_up and not pinky_up:
        return "FIST"

    # Priority 3: scrolling.
    if index_up and middle_up and not ring_up and not pinky_up:
        return "SCROLL"

    # Priority 4: cursor pointing.
    if index_up and not middle_up and not ring_up and not pinky_up:
        return "POINT"

    return "UNKNOWN"


def draw_hand_landmarks(frame, landmarks):
    height, width = frame.shape[:2]

    points = []
    for lm in landmarks:
        px = int(lm.x * width)
        py = int(lm.y * height)
        points.append((px, py))

    # Draw landmark points.
    for point in points:
        cv2.circle(frame, point, 4, (0, 255, 100), -1)

    # Draw basic hand connections.
    connections = [
        (0, 1), (1, 2), (2, 3), (3, 4),
        (0, 5), (5, 6), (6, 7), (7, 8),
        (5, 9), (9, 10), (10, 11), (11, 12),
        (9, 13), (13, 14), (14, 15), (15, 16),
        (13, 17), (17, 18), (18, 19), (19, 20),
        (0, 17)
    ]

    for start, end in connections:
        cv2.line(
            frame,
            points[start],
            points[end],
            (255, 150, 0),
            2
        )


# ============================================================
# VIRTUAL MOUSE ENGINE
# ============================================================

class GestureMouse:
    def __init__(self, mouse):
        self.mouse = mouse

        self.cursor_x = SCREEN_WIDTH / 2
        self.cursor_y = SCREEN_HEIGHT / 2

        self.previous_gesture = "UNKNOWN"
        self.gesture_started = time.monotonic()
        self.last_action_time = 0

        self.paused = False
        self.dragging = False
        self.left_pinch_active = False
        self.right_pinch_active = False

        self.previous_scroll_y = None

    def action_allowed(self):
        return (
            time.monotonic() - self.last_action_time
            >= GESTURE_COOLDOWN
        )

    def mark_action(self):
        self.last_action_time = time.monotonic()

    def update_cursor(self, landmarks, frame_width, frame_height):
        index_tip = landmarks[8]

        x = index_tip.x
        y = index_tip.y

        # Clamp to a useful camera region.
        x = np.clip(
            (x - FRAME_MARGIN) / (1 - 2 * FRAME_MARGIN),
            0, 1
        )
        y = np.clip(
            (y - FRAME_MARGIN) / (1 - 2 * FRAME_MARGIN),
            0, 1
        )

        # Mirror the horizontal coordinate because the preview
        # behaves like a mirror.
        target_x = (1 - x) * SCREEN_WIDTH
        target_y = y * SCREEN_HEIGHT

        self.cursor_x += (
            target_x - self.cursor_x
        ) * SMOOTHING

        self.cursor_y += (
            target_y - self.cursor_y
        ) * SMOOTHING

        self.mouse.move(self.cursor_x, self.cursor_y)

    def process(self, landmarks, frame_width, frame_height):
        now = time.monotonic()
        gesture = detect_gesture(landmarks)

        # ----------------------------------------------------
        # PAUSE: closed fist
        # ----------------------------------------------------
        if gesture == "FIST":
            self.paused = True
            self.dragging = False
            self.left_pinch_active = False
            self.right_pinch_active = False
            self.mouse.release_all()
            self.previous_scroll_y = None
            self.previous_gesture = gesture
            return gesture

        # ----------------------------------------------------
        # RESUME: open palm
        # ----------------------------------------------------
        if gesture == "OPEN":
            self.mouse.release_all()
            self.left_pinch_active = False
            self.right_pinch_active = False
            self.dragging = False
            self.paused = False
            self.previous_scroll_y = None
            self.previous_gesture = gesture
            return gesture        

        if self.paused:
            self.previous_gesture = gesture
            return "PAUSED"

        # ----------------------------------------------------
        # SCROLL: index + middle fingers
        # ----------------------------------------------------
        if gesture == "SCROLL":
            self.mouse.release_all()
            self.dragging = False
            self.left_pinch_active = False
            self.right_pinch_active = False

            current_y = landmarks[8].y

            if self.previous_scroll_y is not None:
                delta = self.previous_scroll_y - current_y

                if abs(delta) > SCROLL_DEAD_ZONE:
                    amount = int(
                        np.sign(delta) *
                        max(1, abs(delta) * SCROLL_SENSITIVITY * 10)
                    )

                    self.mouse.scroll(amount)

            self.previous_scroll_y = current_y
            self.previous_gesture = gesture
            return gesture

        self.previous_scroll_y = None

        # Move cursor for pointing and pinch operations.
        if gesture in ("POINT", "LEFT_PINCH", "RIGHT_PINCH"):
            self.update_cursor(
                landmarks, frame_width, frame_height
            )

        # ----------------------------------------------------
        # LEFT PINCH: tap = left click, hold = drag
        # ----------------------------------------------------
        if gesture == "LEFT_PINCH":
            if not self.left_pinch_active:
                self.left_pinch_active = True
                self.gesture_started = now
                self.dragging = False

            elif (
                not self.dragging
                and now - self.gesture_started
                >= LEFT_DRAG_HOLD_SECONDS
            ):
                self.mouse.left_down()
                self.dragging = True

            self.previous_gesture = gesture
            return "DRAGGING" if self.dragging else "LEFT PINCH"

        # Release left pinch.
        if self.left_pinch_active:
            if self.dragging:
                self.mouse.left_up()
            elif self.action_allowed():
                self.mouse.click_left()
                self.mark_action()

            self.left_pinch_active = False
            self.dragging = False

        # ----------------------------------------------------
        # RIGHT PINCH: right click on release
        # ----------------------------------------------------
        if gesture == "RIGHT_PINCH":
            if not self.right_pinch_active:
                self.right_pinch_active = True

            self.previous_gesture = gesture
            return "RIGHT PINCH"

        if self.right_pinch_active:
            if self.action_allowed():
                self.mouse.click_right()
                self.mark_action()

            self.right_pinch_active = False

        self.previous_gesture = gesture
        return gesture

    def shutdown(self):
        self.mouse.release_all()


# ============================================================
# MAIN APPLICATION
# ============================================================

def main():
    global SCREEN_WIDTH, SCREEN_HEIGHT

    parser = argparse.ArgumentParser(description="Gesture-controlled virtual mouse")
    parser.add_argument(
        "--preview-only",
        action="store_true",
        help="recognize gestures without controlling the system mouse",
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="skip the camera window and print gesture status in the terminal",
    )
    args = parser.parse_args()

    if args.preview_only:
        SCREEN_WIDTH, SCREEN_HEIGHT = CAMERA_WIDTH, CAMERA_HEIGHT
    else:
        SCREEN_WIDTH, SCREEN_HEIGHT = get_screen_size()

    print("\n========================================")
    print("       GESTURE VIRTUAL MOUSE")
    print("========================================")
    print("Display session:", SESSION)
    print("Screen resolution:", SCREEN_WIDTH, "x", SCREEN_HEIGHT)
    print("\nGESTURES")
    print("----------------------------------------")
    print("Index finger only       = Move cursor")
    print("Thumb + middle pinch    = Left click")
    print("Hold that pinch         = Drag")
    print("Thumb + index pinch     = Right click")
    print("Index + middle fingers  = Scroll")
    print("Closed fist             = Pause")
    print("Open palm               = Resume")
    print("----------------------------------------")
    print("Press Q or ESC to quit.\n")

    if args.preview_only:
        print("Preview only: system mouse input is disabled.")
        mouse = PreviewMouseController()
    else:
        mouse = MouseController()
    controller = GestureMouse(mouse)

    camera = cv2.VideoCapture(CAMERA_INDEX)

    camera.set(cv2.CAP_PROP_FRAME_WIDTH, CAMERA_WIDTH)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, CAMERA_HEIGHT)

    if not camera.isOpened():
        raise RuntimeError(
            "Could not open webcam. Check camera permissions "
            "and CAMERA_INDEX."
        )

    previous_timestamp = 0
    previous_status = None

    try:
        with HandLandmarker.create_from_options(options) as landmarker:

            while True:
                success, frame = camera.read()

                if not success:
                    print("Could not read webcam frame.")
                    break

                # Mirror image for natural movement.
                frame = cv2.flip(frame, 1)

                height, width = frame.shape[:2]

                rgb_frame = cv2.cvtColor(
                    frame, cv2.COLOR_BGR2RGB
                )

                mp_image = mp.Image(
                    image_format=mp.ImageFormat.SRGB,
                    data=rgb_frame
                )

                timestamp = int(time.monotonic() * 1000)
                timestamp = max(timestamp, previous_timestamp + 1)
                previous_timestamp = timestamp

                result = landmarker.detect_for_video(
                    mp_image, timestamp
                )

                status = "NO HAND"

                if result.hand_landmarks:
                    landmarks = result.hand_landmarks[0]

                    draw_hand_landmarks(frame, landmarks)

                    status = controller.process(
                        landmarks, width, height
                    )

                else:
                    # Never leave a drag active if tracking is lost.
                    controller.mouse.release_all()
                    controller.left_pinch_active = False
                    controller.dragging = False
                    controller.right_pinch_active = False
                    controller.previous_scroll_y = None

                # Status display.
                color = (
                    (0, 0, 255)
                    if status == "PAUSED"
                    else (0, 255, 0)
                )

                cv2.rectangle(
                    frame, (10, 10), (340, 75),
                    (25, 25, 25), -1
                )

                cv2.putText(
                    frame,
                    "GESTURE MOUSE",
                    (20, 35),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.65,
                    (255, 255, 255),
                    2
                )

                cv2.putText(
                    frame,
                    "STATUS: " + str(status),
                    (20, 62),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    color,
                    2
                )

                if args.headless and status != previous_status:
                    print("STATUS:", status, flush=True)
                    previous_status = status

                if SHOW_CAMERA and not args.headless:
                    cv2.imshow(
                        "Gesture Virtual Mouse - Q to quit",
                        frame
                    )

                key = cv2.waitKey(1) & 0xFF if not args.headless else 0xFF

                if key == ord("q") or key == 27:
                    break

    except KeyboardInterrupt:
        print("\nStopping gesture mouse...")

    finally:
        controller.shutdown()
        camera.release()
        cv2.destroyAllWindows()
        print("Gesture mouse stopped safely.")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print("\nERROR:", error)
        sys.exit(1)
