from __future__ import annotations

import importlib.util

import hands.platforms as platform_mod


def test_detect_arch_normalizes_x64(monkeypatch):
    monkeypatch.setattr(platform_mod.platform, "machine", lambda: "AMD64")

    assert platform_mod.detect_arch() == "x64"


def test_detect_arch_normalizes_arm64(monkeypatch):
    monkeypatch.setattr(platform_mod.platform, "machine", lambda: "aarch64")

    assert platform_mod.detect_arch() == "arm64"


def test_detect_distro_reads_os_release(tmp_path, monkeypatch):
    os_release = tmp_path / "os-release"
    os_release.write_text('NAME="Ubuntu"\nID=ubuntu\n', encoding="utf-8")

    monkeypatch.setattr(platform_mod.sys, "platform", "linux")
    monkeypatch.setattr(platform_mod.Path, "exists", lambda self: str(self) == "/etc/os-release")
    monkeypatch.setattr(platform_mod.Path, "read_text", lambda self, **_: 'NAME="Ubuntu"\nID=ubuntu\n')

    assert platform_mod.detect_distro() == "ubuntu"


def test_probe_accessibility_uses_platform_module(monkeypatch):
    monkeypatch.setattr(platform_mod, "detect_os", lambda: "windows")
    monkeypatch.setattr(importlib.util, "find_spec", lambda name: object() if name == "pywinauto" else None)

    assert platform_mod.probe_capability("accessibility") is True


def test_unknown_capability_is_false():
    assert platform_mod.probe_capability("nope") is False
