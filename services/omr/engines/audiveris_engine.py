from __future__ import annotations

import os
import shutil
import subprocess
import zipfile
from pathlib import Path

from engines.base import BaseEngine, EngineResult
from utils.musicxml_utils import extract_musicxml_from_mxl


DEFAULT_AUDIVERIS_BIN = Path("/opt/audiveris/bin/Audiveris")


class AudiverisError(RuntimeError):
    def __init__(self, message: str, stdout: str = "", stderr: str = "") -> None:
        super().__init__(message)
        self.stdout = stdout
        self.stderr = stderr


def _to_text(value: str | bytes | None) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def _audiveris_bin() -> Path:
    configured_bin = os.getenv("AUDIVERIS_BIN")
    if configured_bin:
        return Path(configured_bin).expanduser()
    return DEFAULT_AUDIVERIS_BIN


def _audiveris_env() -> dict[str, str]:
    env = os.environ.copy()
    headless_option = "-Djava.awt.headless=true"
    existing_options = env.get("JAVA_TOOL_OPTIONS", "").strip()
    if headless_option not in existing_options.split():
        env["JAVA_TOOL_OPTIONS"] = f"{existing_options} {headless_option}".strip()
    return env


def run_audiveris(input_path: str, output_dir: str, timeout_seconds: int = 600) -> str:
    musicxml_path, _, _ = _run_audiveris(input_path, output_dir, timeout_seconds)
    return musicxml_path


def _run_audiveris(
    input_path: str,
    output_dir: str,
    timeout_seconds: int = 600,
) -> tuple[str, str, str]:
    source_path = Path(input_path)
    target_dir = Path(output_dir)
    target_dir.mkdir(parents=True, exist_ok=True)

    audiveris_bin = _audiveris_bin()
    if not audiveris_bin.exists():
        raise AudiverisError(
            "Audiveris is not installed or AUDIVERIS_BIN points to a missing file. "
            f"Tried audiveris_bin: {audiveris_bin}"
        )
    if not audiveris_bin.is_file():
        raise AudiverisError(
            f"Audiveris path is not a file. Tried audiveris_bin: {audiveris_bin}"
        )

    command = [
        str(audiveris_bin),
        "-batch",
        "-export",
        "-output",
        str(target_dir),
        str(source_path),
    ]

    try:
        completed = subprocess.run(
            command,
            capture_output=True,
            env=_audiveris_env(),
            text=True,
            timeout=timeout_seconds,
            check=False,
        )
    except FileNotFoundError as exc:
        raise AudiverisError(
            f"Audiveris executable could not be run. Tried audiveris_bin: {audiveris_bin}"
        ) from exc
    except subprocess.TimeoutExpired as exc:
        raise AudiverisError(
            f"Audiveris timed out after {timeout_seconds} seconds. "
            f"Tried audiveris_bin: {audiveris_bin}",
            stdout=_to_text(exc.stdout),
            stderr=_to_text(exc.stderr),
        ) from exc
    except Exception as exc:
        raise AudiverisError(
            f"Audiveris failed before completion: {exc}. "
            f"Tried audiveris_bin: {audiveris_bin}"
        ) from exc

    stdout = _to_text(completed.stdout)
    stderr = _to_text(completed.stderr)
    if completed.returncode != 0:
        raise AudiverisError(
            f"Audiveris exited with return code {completed.returncode}. "
            f"Tried audiveris_bin: {audiveris_bin}",
            stdout=stdout,
            stderr=stderr,
        )

    exported_path = _find_audiveris_output(target_dir, source_path.parent)
    if exported_path is None:
        raise AudiverisError(
            "Audiveris completed but no .musicxml, .mxl, or .xml file was found. "
            f"Tried audiveris_bin: {audiveris_bin}",
            stdout=stdout,
            stderr=stderr,
        )

    normalized_path = target_dir / f"{source_path.stem}.musicxml"
    if exported_path.suffix.lower() == ".mxl":
        try:
            extract_musicxml_from_mxl(exported_path, normalized_path)
        except Exception as exc:
            raise AudiverisError(
                f"Audiveris output could not be normalized: {exc}. "
                f"Tried audiveris_bin: {audiveris_bin}",
                stdout=stdout,
                stderr=stderr,
            ) from exc
        return str(normalized_path), stdout, stderr
    if exported_path != normalized_path:
        try:
            shutil.copyfile(exported_path, normalized_path)
        except Exception as exc:
            raise AudiverisError(
                f"Audiveris output could not be normalized: {exc}. "
                f"Tried audiveris_bin: {audiveris_bin}",
                stdout=stdout,
                stderr=stderr,
            ) from exc
        return str(normalized_path), stdout, stderr
    return str(exported_path), stdout, stderr


class AudiverisEngine(BaseEngine):
    name = "audiveris"
    timeout_seconds = 600

    def run(self, image_path: Path, output_dir: Path) -> EngineResult:
        try:
            musicxml_path_raw, stdout, stderr = _run_audiveris(
                str(image_path),
                str(output_dir),
                timeout_seconds=self.timeout_seconds,
            )
            musicxml_path = Path(musicxml_path_raw)
        except AudiverisError as exc:
            return EngineResult(
                engine_name=self.name,
                success=False,
                musicxml_path=None,
                stdout=exc.stdout,
                stderr=exc.stderr,
                error_message=str(exc),
            )

        try:
            if not musicxml_path.exists():
                raise FileNotFoundError(musicxml_path)
        except Exception as exc:
            return EngineResult(
                engine_name=self.name,
                success=False,
                musicxml_path=None,
                stdout="",
                stderr="",
                error_message=(
                    f"Audiveris output could not be normalized: {exc}. "
                    f"Tried audiveris_bin: {_audiveris_bin()}"
                ),
            )

        return EngineResult(
            engine_name=self.name,
            success=True,
            musicxml_path=musicxml_path,
            stdout=stdout,
            stderr=stderr,
            error_message=None,
        )


def _find_audiveris_output(output_dir: Path, image_dir: Path) -> Path | None:
    candidates: list[Path] = []
    for search_dir in (output_dir, image_dir):
        if not search_dir.exists():
            continue
        for extension in (".musicxml", ".mxl", ".xml"):
            candidates.extend(
                path
                for path in search_dir.rglob(f"*{extension}")
                if "META-INF" not in path.parts
            )

    if not candidates:
        return None

    unique_candidates = sorted(set(candidates))
    return max(
        unique_candidates,
        key=lambda path: (_musicxml_payload_size(path), path.stat().st_mtime),
    )


def _musicxml_payload_size(path: Path) -> int:
    if path.suffix.lower() != ".mxl":
        return path.stat().st_size

    try:
        with zipfile.ZipFile(path) as mxl_file:
            return sum(
                info.file_size
                for info in mxl_file.infolist()
                if (
                    info.filename.lower().endswith(".musicxml")
                    or info.filename.lower().endswith(".xml")
                )
                and "META-INF" not in Path(info.filename).parts
            )
    except (OSError, zipfile.BadZipFile):
        return path.stat().st_size
