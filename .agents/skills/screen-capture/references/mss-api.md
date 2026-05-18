# mss API Quick Reference

## Monitors

```python
with mss.mss() as sct:
    sct.monitors[0]  # virtual screen (all monitors combined)
    sct.monitors[1]  # primary monitor
    sct.monitors[2]  # secondary monitor (if exists)
```

Each monitor dict: `{"left": 0, "top": 0, "width": 1920, "height": 1080}`

## Capture

```python
shot = sct.grab(sct.monitors[1])  # returns Screenshot object
shot.rgb     # raw RGB bytes
shot.size    # (width, height)
shot.pixels  # pixel data
```

## Save to PNG

```python
from mss.tools import to_png
png_bytes = to_png(shot.rgb, shot.size)
```

## Region capture

```python
region = {"left": 100, "top": 200, "width": 500, "height": 300}
shot = sct.grab(region)
```
