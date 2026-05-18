from __future__ import annotations

from unittest.mock import patch

import hands.sensors.shadow_loop as shadow_loop


def _patch_sweep_metrics(
    *,
    disk=None,
    cpu=None,
    memory=None,
    battery=None,
    idle=0.0,
    uptime=1.0,
):
    return patch.multiple(
        shadow_loop,
        _disk_usage=lambda: [] if disk is None else disk,
        _cpu_percent=lambda: cpu,
        _memory_usage=lambda: memory,
        _battery_info=lambda: battery,
        _idle_seconds=lambda: idle,
        _uptime_hours=lambda: uptime,
    )


def test_sweep_normal_returns_no_events():
    with _patch_sweep_metrics():
        assert shadow_loop.sweep() == []


def test_sweep_disk_low_emits_sensor_event():
    disk_alert = {"mount": "C:\\", "free_pct": 5.0, "free_gb": 2.0, "total_gb": 40.0}

    with _patch_sweep_metrics(disk=[disk_alert]):
        events = shadow_loop.sweep()

    assert len(events) == 1
    assert events[0]["type"] == "SENSOR_EVENT"
    assert events[0]["event_type"] == "disk_low"
    assert events[0]["data"]["drives"] == [disk_alert]
    assert events[0]["confidence"] == 0.95


def test_sweep_cpu_high_emits_sensor_event():
    with _patch_sweep_metrics(cpu=95.0):
        events = shadow_loop.sweep()

    assert len(events) == 1
    assert events[0]["type"] == "SENSOR_EVENT"
    assert events[0]["event_type"] == "cpu_high"
    assert events[0]["data"]["percent"] == 95.0
    assert events[0]["confidence"] == 0.7


def test_sweep_memory_high_emits_sensor_event():
    memory = {"used_pct": 93.0, "available_gb": 0.75, "swap_pct": 10.0}

    with _patch_sweep_metrics(memory=memory):
        events = shadow_loop.sweep()

    assert len(events) == 1
    assert events[0]["type"] == "SENSOR_EVENT"
    assert events[0]["event_type"] == "memory_high"
    assert events[0]["data"] == {"used_pct": 93.0, "available_gb": 0.75}
    assert events[0]["confidence"] == 0.85


def test_sweep_battery_low_emits_sensor_event():
    battery = {"percent": 10.0, "plugged": False, "secs_left": 600}

    with _patch_sweep_metrics(battery=battery):
        events = shadow_loop.sweep()

    assert len(events) == 1
    assert events[0]["type"] == "SENSOR_EVENT"
    assert events[0]["event_type"] == "battery_low"
    assert events[0]["data"] == {"percent": 10.0, "secs_left": 600}
    assert events[0]["confidence"] == 0.9


def test_sweep_idle_shutdown_when_idle_and_battery_below_twenty_percent():
    battery = {"percent": 19.0, "plugged": False, "secs_left": 1200}

    with _patch_sweep_metrics(battery=battery, idle=1801.0):
        events = shadow_loop.sweep()

    assert len(events) == 1
    assert events[0]["type"] == "SILENT_INTENT_EVENT"
    assert events[0]["intent_type"] == "idle_shutdown"
    assert events[0]["data"] == {"idle_seconds": 1801.0, "battery_percent": 19.0}
    assert events[0]["confidence"] == 0.8
