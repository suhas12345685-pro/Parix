import ctypes
from ctypes import wintypes
import threading
import sys
import logging

logger = logging.getLogger("hands.hotkey")

# Win32 definitions
user32 = ctypes.windll.user32 if sys.platform == "win32" else None

MOD_CONTROL = 0x0002
MOD_SHIFT = 0x0004
VK_P = 0x50
HOTKEY_ID = 1337
WM_HOTKEY = 0x0312

def start_hotkey_listener(callback):
    """
    Registers the global hotkey Ctrl+Shift+P and starts a message loop thread.
    When triggered, invokes callback in the background.
    """
    if sys.platform != "win32" or not user32:
        logger.info("Global hotkey not supported/disabled on non-Windows platforms")
        return None

    def listener():
        modifiers = MOD_CONTROL | MOD_SHIFT
        # Try to register the hotkey
        # Passing None as HWND registers it for this thread's message queue
        if not user32.RegisterHotKey(None, HOTKEY_ID, modifiers, VK_P):
            logger.error("Failed to register global hotkey Ctrl+Shift+P. It might already be in use.")
            return

        logger.info("Successfully registered global hotkey: Ctrl+Shift+P")

        msg = wintypes.MSG()
        try:
            # GetMessageW blocks until a message is received
            while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
                if msg.message == WM_HOTKEY:
                    if msg.wParam == HOTKEY_ID:
                        logger.info("Global hotkey Ctrl+Shift+P pressed")
                        try:
                            callback()
                        except Exception as e:
                            logger.error("Error in hotkey callback: %s", e)
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))
        except Exception as e:
            logger.error("Exception in hotkey message loop: %s", e)
        finally:
            user32.UnregisterHotKey(None, HOTKEY_ID)
            logger.info("Unregistered global hotkey Ctrl+Shift+P")

    thread = threading.Thread(target=listener, name="ParixHotkeyListener", daemon=True)
    thread.start()
    return thread
