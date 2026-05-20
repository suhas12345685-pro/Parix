"""Diagnostics package — crash reporter and runtime health probes."""

from .crash_reporter import init_crash_reporter, report_error

__all__ = ["init_crash_reporter", "report_error"]
