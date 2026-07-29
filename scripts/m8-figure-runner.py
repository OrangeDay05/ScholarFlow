"""ScholarFlow M8 local trusted Python figure runner.

The runner is loopback-only, uses an isolated temporary directory per run,
limits time/body/output/log sizes and strips the parent environment. Its AST
checks are defense-in-depth only; this is not a production sandbox.
"""

from __future__ import annotations

import argparse
import ast
import base64
import json
import os
from pathlib import Path
import re
import struct
import subprocess
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import matplotlib
import numpy
import pandas

RUNNER_ID = "scholarflow-local-python"
RUNNER_VERSION = "0.1.0"
MAX_BODY_BYTES = 4 * 1024 * 1024
MAX_CODE_CHARACTERS = 32_000
MAX_ROWS = 10_000
MAX_OUTPUT_FILES = 3
MAX_OUTPUT_BYTES = 12 * 1024 * 1024
MAX_LOG_CHARACTERS = 8_000
ALLOWED_IMPORTS = {"__future__", "argparse", "json", "pathlib", "random", "matplotlib", "pandas", "numpy", "math", "statistics"}
BLOCKED_NAMES = {"breakpoint", "compile", "eval", "exec", "globals", "help", "input", "locals", "open", "quit", "exit", "__import__"}
BLOCKED_ATTRIBUTES = {
    "chdir", "connect", "fromfile", "genfromtxt", "getenv", "listdir", "load", "loadtxt",
    "makedirs", "open", "popen", "read_csv", "read_excel", "read_json", "read_parquet", "remove", "rename", "replace",
    "request", "rmdir", "save", "savetxt", "scandir", "socket", "spawn", "system", "to_csv", "to_excel", "to_json",
    "to_parquet", "unlink", "urlopen", "walk", "write_text", "write_bytes",
}
BLOCKED_NODES = (ast.AsyncFunctionDef, ast.Await, ast.ClassDef, ast.Global, ast.Nonlocal, ast.With, ast.AsyncWith)


class PolicyError(ValueError):
    pass


def validate_code(code: str) -> None:
    if not code.strip() or len(code) > MAX_CODE_CHARACTERS:
        raise PolicyError("代码为空或超过 32000 字符限制。")
    try:
        tree = ast.parse(code, mode="exec")
    except SyntaxError as error:
        raise PolicyError(f"Python 语法错误：{error.msg}（第 {error.lineno} 行）。") from error
    for node in ast.walk(tree):
        if isinstance(node, BLOCKED_NODES):
            raise PolicyError(f"不允许使用 {type(node).__name__}。")
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.split(".", 1)[0] not in ALLOWED_IMPORTS:
                    raise PolicyError(f"不允许导入模块 {alias.name}。")
        if isinstance(node, ast.ImportFrom):
            if not node.module or node.module.split(".", 1)[0] not in ALLOWED_IMPORTS:
                raise PolicyError(f"不允许从模块 {node.module or '<relative>'} 导入。")
        if isinstance(node, ast.Name) and node.id in BLOCKED_NAMES:
            raise PolicyError(f"不允许使用 {node.id}。")
        if isinstance(node, ast.Attribute) and (node.attr.startswith("__") or node.attr in BLOCKED_ATTRIBUTES):
            raise PolicyError(f"不允许访问属性 {node.attr}。")
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            lowered = node.value.lower()
            if "../" in lowered or "..\\" in lowered or ":\\" in lowered or lowered.startswith("/"):
                raise PolicyError("代码中不允许出现项目外绝对路径或上级路径。")


def execute(payload: dict[str, Any]) -> dict[str, Any]:
    code = payload.get("code")
    data = payload.get("data")
    run_id = payload.get("runId")
    required_columns = payload.get("requiredColumns")
    timeout_seconds = payload.get("timeoutSeconds", 30)
    if not isinstance(code, str) or not isinstance(data, list) or not isinstance(required_columns, list):
        return failure("failed", "INVALID_INPUT", "代码、数据或字段契约格式无效。")
    if not isinstance(run_id, str) or not re.fullmatch(r"[A-Za-z0-9-]{8,80}", run_id):
        return failure("failed", "INVALID_RUN_ID", "Run ID 格式无效。")
    if not 1 <= len(data) <= MAX_ROWS or not all(isinstance(row, dict) for row in data):
        return failure("failed", "INVALID_ROW_COUNT", "数据必须包含 1—10000 行对象记录。")
    if not isinstance(timeout_seconds, int) or not 5 <= timeout_seconds <= 60:
        return failure("failed", "INVALID_TIMEOUT", "超时必须在 5—60 秒之间。")
    available_columns = set().union(*(row.keys() for row in data))
    missing = [column for column in required_columns if not isinstance(column, str) or column not in available_columns]
    if missing:
        return failure("failed", "MISSING_DATA_COLUMNS", f"当前数据缺少字段：{', '.join(map(str, missing))}。")
    try:
        validate_code(code)
    except PolicyError as error:
        return failure("failed", "CODE_POLICY_BLOCKED", str(error))

    with tempfile.TemporaryDirectory(prefix=f"m8-{run_id[:12]}-") as directory:
        run_dir = Path(directory)
        input_dir, code_dir, output_dir, logs_dir = (run_dir / name for name in ("input", "code", "output", "logs"))
        for path in (input_dir, code_dir, output_dir, logs_dir):
            path.mkdir()
        input_path = input_dir / "snapshot.json"
        script_path = code_dir / "figure.py"
        input_path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        script_path.write_text(code, encoding="utf-8")
        environment = {
            "PATH": os.environ.get("PATH", ""),
            "SYSTEMROOT": os.environ.get("SYSTEMROOT", ""),
            "WINDIR": os.environ.get("WINDIR", os.environ.get("SYSTEMROOT", "C:\\Windows")),
            "TEMP": str(run_dir),
            "TMP": str(run_dir),
            "MPLCONFIGDIR": str(run_dir / "mpl"),
            "PYTHONIOENCODING": "utf-8",
            "PYTHONHASHSEED": "0",
        }
        try:
            completed = subprocess.run(
                [sys.executable, "-I", str(script_path), "--data", str(input_path), "--output-dir", str(output_dir)],
                cwd=run_dir,
                env=environment,
                capture_output=True,
                text=True,
                timeout=timeout_seconds,
                check=False,
            )
        except subprocess.TimeoutExpired as error:
            return failure("timed_out", "EXECUTION_TIMED_OUT", "绘图执行超过时间限制。", stdout=clip(error.stdout), stderr=clip(error.stderr))
        if completed.returncode != 0:
            return failure("failed", "PYTHON_EXECUTION_FAILED", "Python 绘图代码执行失败。", exit_code=completed.returncode, stdout=clip(completed.stdout), stderr=clip(completed.stderr))
        output_files = [path for path in output_dir.iterdir() if path.is_file()]
        if not output_files:
            return failure("failed", "OUTPUT_MISSING", "代码没有生成图件文件。", stdout=clip(completed.stdout), stderr=clip(completed.stderr))
        if len(output_files) > MAX_OUTPUT_FILES:
            return failure("failed", "TOO_MANY_OUTPUTS", "单次运行输出文件数量超过限制。")
        outputs: list[dict[str, Any]] = []
        for path in output_files:
            if path.suffix.lower() != ".png":
                return failure("failed", "FORMAT_NOT_ALLOWED", f"M8.1 只允许保留 PNG，发现 {path.suffix}。")
            content = path.read_bytes()
            if len(content) > MAX_OUTPUT_BYTES or not content.startswith(b"\x89PNG\r\n\x1a\n"):
                return failure("failed", "INVALID_OUTPUT", "输出不是有效的受限大小 PNG。")
            width, height = struct.unpack(">II", content[16:24])
            outputs.append({"format": "png", "base64": base64.b64encode(content).decode("ascii"), "width": width, "height": height, "dpi": 0})
        return {
            **runtime_metadata(),
            "status": "succeeded",
            "stdout": clip(completed.stdout),
            "stderr": clip(completed.stderr),
            "errorType": None,
            "errorMessage": None,
            "exitCode": completed.returncode,
            "outputs": outputs,
        }


def runtime_metadata() -> dict[str, Any]:
    return {
        "runnerId": RUNNER_ID,
        "runnerVersion": RUNNER_VERSION,
        "pythonVersion": f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}",
        "dependencies": {"matplotlib": matplotlib.__version__, "pandas": pandas.__version__, "numpy": numpy.__version__},
    }


def failure(status: str, error_type: str, message: str, *, exit_code: int | None = None, stdout: str = "", stderr: str = "") -> dict[str, Any]:
    return {**runtime_metadata(), "status": status, "stdout": stdout, "stderr": stderr, "errorType": error_type, "errorMessage": message, "exitCode": exit_code, "outputs": []}


def clip(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        value = value.decode("utf-8", errors="replace")
    return value[-MAX_LOG_CHARACTERS:]


class Handler(BaseHTTPRequestHandler):
    server_version = f"ScholarFlowFigureRunner/{RUNNER_VERSION}"

    def do_GET(self) -> None:  # noqa: N802
        if self.path != "/health":
            self.send_error(404)
            return
        self.respond(200, {"status": "ok", "executionMode": "local_trusted", **runtime_metadata()})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/execute":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("content-length", "0"))
            if length <= 0 or length > MAX_BODY_BYTES:
                raise ValueError("请求正文大小无效。")
            payload = json.loads(self.rfile.read(length))
            if not isinstance(payload, dict):
                raise ValueError("请求正文必须是对象。")
            response = execute(payload)
            self.respond(200 if response["status"] == "succeeded" else 422, response)
        except (ValueError, json.JSONDecodeError) as error:
            self.respond(400, failure("failed", "INVALID_REQUEST", str(error)))

    def respond(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.send_header("cache-control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"[m8-runner] {self.address_string()} {format % args}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4318)
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "localhost"}:
        raise SystemExit("The local trusted runner may only bind to loopback.")
    server = ThreadingHTTPServer((args.host, args.port), Handler)
    print(f"M8 local trusted runner listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
