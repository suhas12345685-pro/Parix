from __future__ import annotations

import hands.hatchery as hatchery


def test_health_check_stdout_contains_os(capsys, monkeypatch, tmp_path):
    monkeypatch.setattr(hatchery, "detect_os", lambda: "windows")
    monkeypatch.setattr(hatchery, "detect_arch", lambda: "x64")
    monkeypatch.setattr(hatchery, "detect_distro", lambda: None)
    monkeypatch.setattr(hatchery, "probe_capability", lambda _: True)
    monkeypatch.setattr(hatchery, "CONFIG_PATH", tmp_path / "config.json")
    monkeypatch.setattr(hatchery, "ENV_PATH", tmp_path / ".env")

    hatchery.health_check()

    assert "OS:" in capsys.readouterr().out


def test_read_env_parses_sample_env(tmp_path):
    env_path = tmp_path / ".env"
    env_path.write_text(
        "\n".join([
            "# comment",
            "OPENAI_API_KEY='sk-test'",
            'GEMINI_API_KEY="gemini-test"',
            "PARIX_WEBHOOK_URL=https://example.test/hook",
            "",
        ]),
        encoding="utf-8",
    )

    assert hatchery._read_env(env_path) == {
        "OPENAI_API_KEY": "sk-test",
        "GEMINI_API_KEY": "gemini-test",
        "PARIX_WEBHOOK_URL": "https://example.test/hook",
    }


def test_write_env_writes_and_reads_with_tmp_path(tmp_path):
    env_path = tmp_path / ".env"
    env = {
        "TELEGRAM_CHAT_ID": "123",
        "TELEGRAM_BOT_TOKEN": "token",
    }

    hatchery._write_env(env_path, env)

    assert hatchery._read_env(env_path) == env
