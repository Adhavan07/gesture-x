# Gesture-X 🖱️✋

An AI-powered gesture-controlled virtual mouse using MediaPipe and OpenCV. Control your mouse cursor, click, drag, and scroll using hand gestures via your webcam.

Supports both **X11** (via PyAutoGUI) and **Wayland** (via ydotool) on Linux.

## Features

- **Cursor Navigation**: Smooth cursor tracking mapped to your hand movements.
- **Left Click & Drag**: Pinch index and thumb to click; hold to drag.
- **Right Click**: Gesture-based right clicking.
- **Scroll**: Two-finger vertical scroll controls.
- **Cross-Display Support**: Compatible with X11 and Wayland sessions.

## Prerequisites

- Python 3.9+
- Webcam
- For Wayland users: `ydotool`
  ```bash
  sudo dnf install ydotool      # Fedora
  # or sudo apt install ydotool # Ubuntu/Debian
  sudo systemctl enable --now ydotool
  ```

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/Adhavan07/gesture-x.git
   cd gesture-x
   ```

2. Create and activate a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

## Usage

Run the gesture mouse script:
```bash
python3 gesture_mouse.py
```

Press `q` in the camera preview window to exit.
