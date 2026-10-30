"""Prometheus metrics helpers for VozLab workers."""

from __future__ import annotations

import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from prometheus_client import (
    CONTENT_TYPE_LATEST,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)


class MetricsServer:
    """Minimal HTTP server exposing /metrics for Prometheus scraping."""

    def __init__(self, port: int = 9100) -> None:
        self.port = port
        self._server: HTTPServer | None = None
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        handler = self._make_handler()
        self._server = HTTPServer(("0.0.0.0", self.port), handler)
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        if self._server is not None:
            self._server.shutdown()

    @staticmethod
    def _make_handler() -> type[BaseHTTPRequestHandler]:
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:  # noqa: N802
                if self.path == "/metrics":
                    payload = generate_latest()
                    self.send_response(200)
                    self.send_header("Content-Type", CONTENT_TYPE_LATEST)
                    self.send_header("Content-Length", str(len(payload)))
                    self.end_headers()
                    self.wfile.write(payload)
                else:
                    self.send_response(404)
                    self.end_headers()

            def log_message(self, *args: object) -> None:  # noqa: D401
                return

        return Handler


# Shared metric instances (imported by workers)
messages_processed = Counter(
    "vozlab_worker_messages_processed_total",
    "Messages processed by a worker",
    ["worker", "stream"],
)

messages_failed = Counter(
    "vozlab_worker_messages_failed_total",
    "Messages failed and sent to DLQ",
    ["worker", "stream"],
)

processing_duration = Histogram(
    "vozlab_worker_processing_duration_seconds",
    "Time to process a single message",
    ["worker"],
    buckets=(0.1, 0.5, 1, 2, 5, 10, 30, 60),
)

queue_lag = Gauge(
    "vozlab_worker_queue_lag",
    "Pending messages in the consumer group",
    ["worker", "stream", "group"],
)

llm_duration = Histogram(
    "vozlab_worker_llm_duration_seconds",
    "LLM call latency",
    ["worker"],
    buckets=(0.5, 1, 2, 5, 10, 30, 60, 120),
)
