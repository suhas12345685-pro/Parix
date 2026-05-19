"""Tests for AccessibilityPoller — fingerprint-based debounce + send."""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from hands.accessibility.types import AccessibilitySnapshot, UIElement
from hands.sensors.a11y_poller import AccessibilityPoller


@dataclass
class _StubBridge:
    """A bridge whose `snapshot()` yields a queue of preconfigured snapshots."""

    queue: list[AccessibilitySnapshot]

    async def snapshot(self, mode: str = "auto") -> AccessibilitySnapshot:
        if not self.queue:
            raise RuntimeError("stub bridge ran out of snapshots")
        return self.queue.pop(0)

    def is_native_available(self) -> bool:
        return True


def _make_snapshot(app: str, focused_role: str, focused_name: str) -> AccessibilitySnapshot:
    el = UIElement(
        role=focused_role,
        name=focused_name,
        value=None,
        state={"focused", "enabled"},
        bounds=(0, 0, 100, 20),
        children=[],
        source="accessibility",
    )
    return AccessibilitySnapshot(
        timestamp=time.time(),
        platform="windows",
        backend_used="uiautomation",
        focused_app=app,
        focused_element=el,
        tree=el,
        raw_text=None,
        confidence=0.9,
    )


def test_summarize_keeps_focused_element_and_truncates_children() -> None:
    child = UIElement("button", "Go", None, set(), None, [], "accessibility")
    root = UIElement(
        "window",
        "App",
        None,
        set(),
        None,
        [child] * 12,  # more than the 8-child cap
        "accessibility",
    )
    snap = AccessibilitySnapshot(
        timestamp=1.0,
        platform="windows",
        backend_used="uiautomation",
        focused_app="App",
        focused_element=child,
        tree=root,
        raw_text=None,
        confidence=0.9,
    )
    summary = snap.summarize(child_depth=1)
    assert summary["focused_app"] == "App"
    assert summary["focused_element"]["role"] == "button"
    assert summary["backend_used"] == "uiautomation"


def test_fingerprint_changes_on_focus_change() -> None:
    a = _make_snapshot("Code", "text_field", "untitled.py")
    b = _make_snapshot("Code", "text_field", "auth.py")
    assert a.fingerprint() != b.fingerprint()


def test_fingerprint_stable_when_state_is_same() -> None:
    a = _make_snapshot("Code", "text_field", "auth.py")
    b = _make_snapshot("Code", "text_field", "auth.py")
    # Timestamps differ but fingerprint should not — debounce relies on this.
    assert a.fingerprint() == b.fingerprint()


def test_poller_debounces_identical_snapshots() -> None:
    snap_a = _make_snapshot("Code", "text_field", "auth.py")
    snap_a_again = _make_snapshot("Code", "text_field", "auth.py")
    snap_b = _make_snapshot("Browser", "link", "Sign in")

    bridge = _StubBridge(queue=[snap_a, snap_a_again, snap_b])
    sent: list[dict] = []

    async def send(payload: dict) -> None:
        sent.append(payload)

    poller = AccessibilityPoller(send, bridge=bridge, interval_s=0.05)  # type: ignore[arg-type]

    async def drive() -> None:
        # Drive three ticks manually rather than starting the loop, so the
        # test is deterministic.
        for _ in range(3):
            await poller._maybe_send(await bridge.snapshot())

    asyncio.run(drive())

    # First snapshot sent. Second is a duplicate fingerprint, suppressed.
    # Third is a different app/element, sent again.
    snapshots = [s for s in sent if "snapshot_id" in s]
    assert len(snapshots) == 2
    assert snapshots[0]["focused_app"] == "Code"
    assert snapshots[1]["focused_app"] == "Browser"


def test_poller_emits_focus_change_when_focused_app_transitions() -> None:
    snap_a = _make_snapshot("Code", "text_field", "auth.py")
    snap_a_inner = _make_snapshot("Code", "text_field", "billing.py")
    snap_b = _make_snapshot("Browser", "link", "Sign in")

    bridge = _StubBridge(queue=[snap_a, snap_a_inner, snap_b])
    sent: list[dict] = []

    async def send(payload: dict) -> None:
        sent.append(payload)

    poller = AccessibilityPoller(send, bridge=bridge, interval_s=0.05)  # type: ignore[arg-type]

    async def drive() -> None:
        for _ in range(3):
            await poller._maybe_send(await bridge.snapshot())

    asyncio.run(drive())

    focus_events = [s for s in sent if s.get("event_type") == "focus_change"]
    # First snapshot: app went None → Code. Second: focus shifted within Code
    # (same app, fingerprint changed because element differs) — must NOT emit
    # a focus_change. Third: Code → Browser, emits focus_change.
    assert len(focus_events) == 2
    assert focus_events[0]["data"]["focused_app"] == "Code"
    assert focus_events[0]["data"]["previous_app"] == ""
    assert focus_events[1]["data"]["focused_app"] == "Browser"
    assert focus_events[1]["data"]["previous_app"] == "Code"
    assert focus_events[1]["data"]["focused_element"]["role"] == "link"


def test_poller_start_and_stop_are_idempotent() -> None:
    bridge = _StubBridge(queue=[_make_snapshot("Code", "text_field", "x")] * 10)

    async def send(payload: dict) -> None:
        await asyncio.sleep(0)

    async def drive() -> None:
        poller = AccessibilityPoller(send, bridge=bridge, interval_s=0.05)  # type: ignore[arg-type]
        poller.start()
        poller.start()  # second start is a no-op
        await asyncio.sleep(0.12)
        await poller.stop()
        await poller.stop()  # second stop is a no-op

    asyncio.run(drive())
