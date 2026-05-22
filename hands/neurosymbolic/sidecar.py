import asyncio
import json
import logging
import os
import time
import uuid
from typing import Any

logger = logging.getLogger("hands.neurosymbolic")


def _clamp(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


def _text(data: dict[str, Any]) -> str:
    values = [
        data.get("error"),
        data.get("output"),
        data.get("stderr"),
        data.get("message"),
        data.get("command"),
    ]
    return "\n".join(str(value) for value in values if isinstance(value, str))


def _fact(
    predicate: str,
    args: list[str],
    truth: float,
    evidence: list[str] | None = None,
    source: str = "python-sidecar",
) -> dict[str, Any]:
    return {
        "predicate": predicate,
        "args": args,
        "truth": _clamp(truth),
        "source": source,
        "evidence": evidence or [],
    }


def perceive(event: dict[str, Any], _context: dict[str, Any]) -> list[dict[str, Any]]:
    event_type = str(event.get("type", "unknown"))
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    confidence = _clamp(float(event.get("confidence", 0.0)))
    text = _text(data).lower()

    facts = [
        _fact("EventType", [event_type], 1.0, [f"sensor:{event_type}"]),
        _fact("Confidence", [event_type], confidence, [f"confidence:{confidence:.2f}"]),
    ]

    if confidence >= 0.75:
        facts.append(_fact("HighConfidence", [event_type], confidence))
    if "terminal_error" in event_type:
        facts.append(_fact("TerminalError", ["event"], confidence))
    if "module_not_found" in text or "cannot find module" in text or "no module named" in text:
        facts.append(_fact("MissingDependency", ["project"], 0.9, ["module import failure"]))
    if "eacces" in text or "permission denied" in text or "access is denied" in text:
        facts.append(_fact("PermissionFailure", ["project"], 0.86, ["permission error"]))
    if "enospc" in text or "no space left" in text or "disk full" in text:
        facts.append(_fact("DiskPressure", ["host"], 0.92, ["space exhaustion"]))
    if "disk" in event_type:
        facts.append(_fact("DiskPressure", ["host"], confidence))
    if "cpu" in event_type:
        facts.append(_fact("CpuPressure", ["host"], confidence))
    if "memory" in event_type or "swap" in event_type:
        facts.append(_fact("MemoryPressure", ["host"], confidence))
    if "battery" in event_type:
        facts.append(_fact("BatteryRisk", ["host"], confidence))
    if "clipboard" in event_type:
        facts.append(_fact("SensitiveClipboard", ["host"], confidence))
    if "app_crash" in event_type or "app_hang" in event_type:
        facts.append(_fact("ApplicationInstability", [str(data.get("app", "unknown"))], confidence))

    return facts


def _has_fact(facts: list[dict[str, Any]], predicate: str) -> bool:
    return any(f.get("predicate") == predicate and float(f.get("truth", 0)) >= 0.6 for f in facts)


def _action(
    kind: str,
    payload: dict[str, Any],
    confidence: float,
    utility: float,
    risk: float,
    reversibility: float,
    explanation: str,
    capabilities: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "payload": payload,
        "confidence": _clamp(confidence),
        "utility": _clamp(utility),
        "risk": _clamp(risk),
        "reversibility": _clamp(reversibility),
        "explanation": explanation,
        "capabilities": capabilities or [],
        "provenance": ["python-sidecar", "synalinks", "hybridagi"],
    }


def behavior_graph(
    event: dict[str, Any],
    facts: list[dict[str, Any]],
    _context: dict[str, Any],
) -> list[dict[str, Any]]:
    data = event.get("data") if isinstance(event.get("data"), dict) else {}
    confidence = _clamp(float(event.get("confidence", 0.0)))
    actions: list[dict[str, Any]] = []

    if _has_fact(facts, "TerminalError"):
        if _has_fact(facts, "MissingDependency"):
            actions.append(
                _action(
                    "cli",
                    {"argv": ["npm", "install"]},
                    min(0.92, confidence),
                    0.78,
                    0.22,
                    0.8,
                    "Install missing project dependencies after a module resolution failure.",
                    ["repo.write", "network.package_registry"],
                )
            )
        actions.append(
            _action(
                "notification",
                {
                    "title": "Terminal Error",
                    "body": f"A terminal command failed{': ' + str(data.get('command')) if data.get('command') else ''}.",
                    "urgency": "medium",
                },
                confidence,
                0.58,
                0.05,
                1.0,
                "Notify the user about the failed terminal command.",
                ["notify"],
            )
        )

    if _has_fact(facts, "DiskPressure"):
        actions.append(
            _action(
                "notification",
                {
                    "title": "Disk Space Low",
                    "body": "Disk pressure detected. Review cleanup options before deleting files.",
                    "urgency": "high",
                },
                confidence,
                0.7,
                0.05,
                1.0,
                "Surface low-disk pressure without mutating files.",
                ["notify"],
            )
        )

    if _has_fact(facts, "SensitiveClipboard"):
        actions.append(
            _action(
                "notification",
                {
                    "title": "Sensitive Clipboard",
                    "body": "The clipboard appears to contain sensitive data.",
                    "urgency": "high",
                },
                confidence,
                0.84,
                0.03,
                1.0,
                "Warn before a possible credential leak.",
                ["notify"],
            )
        )

    return actions


def _score(action: dict[str, Any]) -> float:
    confidence = _clamp(float(action.get("confidence", 0.5)))
    utility = _clamp(float(action.get("utility", 0.5)))
    risk = _clamp(float(action.get("risk", 0.5)))
    reversibility = _clamp(float(action.get("reversibility", 0.5)))
    safety = _clamp(1.0 - risk)
    implication = min(1.0, 1.0 - risk + safety)
    goal = max(0.0, utility + confidence - 1.0)
    safe = max(0.0, safety + implication + max(reversibility, 1 - risk) - 2.0)
    return _clamp(0.42 * goal + 0.38 * safe + 0.15 * reversibility + 0.05 * confidence)


def optimize(actions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        [{"actionId": action.get("id"), "score": _score(action)} for action in actions],
        key=lambda item: item["score"],
        reverse=True,
    )


async def _handle_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter) -> None:
    try:
        while line := await reader.readline():
            started = time.perf_counter()
            try:
                request = json.loads(line.decode("utf-8"))
                method = request.get("method")
                payload = request.get("payload") if isinstance(request.get("payload"), dict) else {}

                if method == "perceive":
                    result = perceive(payload.get("event", {}), payload.get("context", {}))
                elif method == "behavior_graph":
                    result = behavior_graph(
                        payload.get("event", {}),
                        payload.get("facts", []),
                        payload.get("context", {}),
                    )
                elif method == "optimize":
                    result = optimize(payload.get("actions", []))
                else:
                    raise ValueError(f"unknown method: {method}")

                response = {
                    "id": request.get("id"),
                    "ok": True,
                    "result": result,
                    "latencyMs": round((time.perf_counter() - started) * 1000, 3),
                }
            except Exception as exc:  # noqa: BLE001 - protocol boundary
                response = {
                    "id": None,
                    "ok": False,
                    "error": str(exc),
                }

            writer.write((json.dumps(response) + "\n").encode("utf-8"))
            await writer.drain()
    finally:
        writer.close()
        await writer.wait_closed()


async def serve(host: str | None = None, port: int | None = None) -> None:
    host = host or os.getenv("PARIX_NEUROSYMBOLIC_HOST", "127.0.0.1")
    port = int(port or os.getenv("PARIX_NEUROSYMBOLIC_PORT", "8771"))

    try:
        server = await asyncio.start_server(_handle_client, host, port)
    except OSError as exc:
        logger.warning("Neuro-symbolic sidecar unavailable on %s:%d: %s", host, port, exc)
        return

    sockets = ", ".join(str(sock.getsockname()) for sock in server.sockets or [])
    logger.info("Neuro-symbolic sidecar listening on %s", sockets)

    async with server:
        await server.serve_forever()

