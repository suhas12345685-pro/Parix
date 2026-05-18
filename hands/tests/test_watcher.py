from __future__ import annotations

from hands.sensors.watcher import (
    Watcher,
    build_sensor_event,
    get_active_window_title,
    score_output,
)


# ── score_output tests ───────────────────────────────────────────────

def test_score_clean_output():
    confidence, tags = score_output("npm install completed successfully")
    assert confidence == 0.0
    assert tags == []


def test_score_single_error():
    confidence, tags = score_output("error: Cannot find module 'foo'")
    assert confidence > 0.0
    assert "error:" in tags


def test_score_traceback():
    text = "Traceback (most recent call last):\n  File 'test.py'\nTypeError: bad"
    confidence, tags = score_output(text)
    assert confidence > 0.5
    assert "traceback" in tags


def test_score_multiple_patterns():
    text = "FAILED\nerror: segfault in module"
    confidence, tags = score_output(text)
    assert len(tags) >= 3
    assert confidence > 0.7


def test_score_npm_err():
    text = "npm ERR! code ENOENT\nnpm ERR! errno -4058"
    confidence, tags = score_output(text)
    assert confidence > 0.0
    assert "ERR!" in tags


def test_score_fatal():
    confidence, tags = score_output("fatal: not a git repository")
    assert "fatal" in tags
    assert confidence > 0.5


def test_score_panic():
    confidence, tags = score_output("goroutine 1 [running]: panic: runtime error")
    assert "panic" in tags


def test_score_oom():
    confidence, tags = score_output("JavaScript heap out of memory")
    assert "oom" in tags


def test_score_disk_full():
    confidence, tags = score_output("ENOSPC: no space left on device")
    assert "disk_full" in tags


def test_score_connection_refused():
    confidence, tags = score_output("Error: connect ECONNREFUSED 127.0.0.1:5432")
    assert "conn_refused" in tags


def test_score_permission_denied():
    confidence, tags = score_output("EACCES: permission denied, open '/etc/passwd'")
    assert "perm_denied" in tags


# ── False positive suppression ───────────────────────────────────────

def test_suppresses_zero_errors():
    confidence, tags = score_output("Build succeeded with 0 errors, 0 warnings")
    assert confidence == 0.0


def test_suppresses_no_errors():
    confidence, tags = score_output("Compilation complete. No errors found.")
    assert confidence == 0.0


def test_suppresses_error_handler_import():
    confidence, tags = score_output("from utils.error_handler import handle")
    assert confidence == 0.0


def test_suppresses_error_class_names():
    confidence, tags = score_output("class ErrorBoundary extends Component {")
    assert confidence == 0.0


# ── build_sensor_event tests ─────────────────────────────────────────

def test_build_event_structure():
    event = build_sensor_event("some error text", 0.75, ["error:"], window_title="Terminal")
    assert event.event_type == "terminal_error"
    assert event.confidence == 0.75
    assert event.data["matches"] == ["error:"]
    assert event.data["window_title"] == "Terminal"
    assert event.data["source"] == "terminal"


def test_build_event_truncates_long_output():
    long_text = "x" * 10000
    event = build_sensor_event(long_text, 0.5, ["error:"])
    assert len(event.data["output"]) <= 4000


# ── Watcher class tests ─────────────────────────────────────────────

def test_watcher_deduplicates_same_buffer():
    watcher = Watcher()
    # Monkey-patch the readers
    import hands.sensors.watcher as mod
    original_title = mod.get_active_window_title
    original_buffer = mod.read_terminal_buffer

    mod.get_active_window_title = lambda: "Terminal"
    mod.read_terminal_buffer = lambda max_lines=20: "error: something broke"

    events1 = watcher.poll_once()
    events2 = watcher.poll_once()

    mod.get_active_window_title = original_title
    mod.read_terminal_buffer = original_buffer

    assert len(events1) == 1
    assert len(events2) == 0  # same buffer hash, deduplicated


def test_watcher_fires_on_new_buffer():
    watcher = Watcher()
    import hands.sensors.watcher as mod
    original_title = mod.get_active_window_title
    original_buffer = mod.read_terminal_buffer

    mod.get_active_window_title = lambda: "Terminal"

    call_count = 0

    def fake_buffer(max_lines=20):
        nonlocal call_count
        call_count += 1
        return f"error: failure #{call_count}"

    mod.read_terminal_buffer = fake_buffer

    events1 = watcher.poll_once()
    events2 = watcher.poll_once()

    mod.get_active_window_title = original_title
    mod.read_terminal_buffer = original_buffer

    assert len(events1) == 1
    assert len(events2) == 1  # different buffer, new event


def test_watcher_ignores_clean_output():
    watcher = Watcher()
    import hands.sensors.watcher as mod
    original_title = mod.get_active_window_title
    original_buffer = mod.read_terminal_buffer

    mod.get_active_window_title = lambda: "Terminal"
    mod.read_terminal_buffer = lambda max_lines=20: "npm install completed\n3 packages added"

    events = watcher.poll_once()

    mod.get_active_window_title = original_title
    mod.read_terminal_buffer = original_buffer

    assert len(events) == 0


def test_watcher_empty_buffer_no_event():
    watcher = Watcher()
    import hands.sensors.watcher as mod
    original_buffer = mod.read_terminal_buffer
    mod.read_terminal_buffer = lambda max_lines=20: ""
    events = watcher.poll_once()
    mod.read_terminal_buffer = original_buffer
    assert len(events) == 0


# ── Window title reader smoke test ───────────────────────────────────

def test_get_active_window_title_returns_string():
    title = get_active_window_title()
    assert isinstance(title, str)
