"""Virtual Desktop manager for isolated UI automation.

Usage:
  python vda_manager.py create    — Create Parix_Workspace desktop
  python vda_manager.py list      — List all virtual desktops
  python vda_manager.py close     — Close Parix_Workspace desktop

Windows only. Requires pyvda: pip install pyvda
"""

import json
import sys


def create_workspace() -> dict:
    try:
        import pyvda
        desktops = pyvda.get_virtual_desktops()
        for d in desktops:
            if hasattr(d, 'name') and d.name == "Parix_Workspace":
                return {"action": "create", "status": "already_exists", "count": len(desktops)}
        new_desktop = pyvda.VirtualDesktop.create()
        return {"action": "create", "status": "created", "count": len(desktops) + 1}
    except ImportError:
        return {"action": "create", "status": "error", "error": "pyvda not installed"}
    except Exception as e:
        return {"action": "create", "status": "error", "error": str(e)}


def list_desktops() -> dict:
    try:
        import pyvda
        desktops = pyvda.get_virtual_desktops()
        current = pyvda.VirtualDesktop.current()
        return {
            "action": "list",
            "count": len(desktops),
            "current_index": desktops.index(current) if current in desktops else -1,
        }
    except ImportError:
        return {"action": "list", "error": "pyvda not installed"}
    except Exception as e:
        return {"action": "list", "error": str(e)}


def close_workspace() -> dict:
    try:
        import pyvda
        desktops = pyvda.get_virtual_desktops()
        if len(desktops) <= 1:
            return {"action": "close", "status": "skipped", "reason": "only one desktop"}
        last = desktops[-1]
        last.remove()
        return {"action": "close", "status": "closed"}
    except ImportError:
        return {"action": "close", "error": "pyvda not installed"}
    except Exception as e:
        return {"action": "close", "error": str(e)}


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "list"
    actions = {"create": create_workspace, "list": list_desktops, "close": close_workspace}
    fn = actions.get(cmd, list_desktops)
    print(json.dumps(fn(), indent=2))
