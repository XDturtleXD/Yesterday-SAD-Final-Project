from __future__ import annotations

import os
import shutil
import subprocess
import zipfile
from pathlib import Path

from engines.base import BaseEngine, EngineResult
from utils.musicxml_utils import extract_musicxml_from_mxl


DEFAULT_AUDIVERIS_BIN = Path("/Applications/Audiveris.app/Contents/MacOS/Audiveris")


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


class AudiverisEngine(BaseEngine):
    name = "audiveris"
    timeout_seconds = 600

    def run(self, image_path: Path, output_dir: Path) -> EngineResult:
        output_dir.mkdir(parents=True, exist_ok=True)
        audiveris_bin = _audiveris_bin()
        if not audiveris_bin.exists():
            return EngineResult(
                engine_name=self.name,
                success=False,
                musicxml_path=None,
                stdout="",
                stderr="",
                error_message=f"Audiveris binary missing: {audiveris_bin}",
            )
        if not audiveris_bin.is_file():
            return EngineResult(
                engine_name=self.name,
                success=False,
                musicxml_path=None,
                stdout="",
                stderr="",
                error_message=f"Audiveris path is not a file. Tried audiveris_bin: {audiveris_bin}",
            )

        command = [
            str(audiveris_bin),
            "-batch",
            "-export",
            "-output",
            str(output_dir),
            str(image_path),
        ]
        command = [str(part) for part in command]

        try:
            completed = subprocess.run(
                command,
                capture_output=True,
                env=_audiveris_env(),
                text=True,
                timeout=self.timeout_seconds,
                check=False,
            )
        except FileNotFoundError:
            return EngineResult(
                engine_name=self.name,
                success=False,
                musicxml_path=None,
                stdout="",
                stderr="",
                error_message=f"Audiveris executable could not be run. Tried audiveris_bin: {audiveris_bin}",
            )
        except subprocess.TimeoutExpired as exc:
            return EngineResult(
                engine_name=self.name,
                success=False,
                musicxml_path=None,
                stdout=_to_text(exc.stdout),
                stderr=_to_text(exc.stderr),
                error_message=(
                    f"Audiveris timed out after {self.timeout_seconds} seconds. "
                    f"Tried audiveris_bin: {audiveris_bin}"
                ),
            )
        except Exception as exc:
            return EngineResult(
                engine_name=self.name,
                success=False,
                musicxml_path=None,
                stdout="",
                stderr="",
                error_message=(
                    f"Audiveris failed before completion: {exc}. "
                    f"Tried audiveris_bin: {audiveris_bin}"
                ),
            )

        if completed.returncode != 0:
            return EngineResult(
                engine_name=self.name,
                success=False,
                musicxml_path=None,
                stdout=_to_text(completed.stdout),
                stderr=_to_text(completed.stderr),
                error_message=(
                    f"Audiveris exited with return code {completed.returncode}. "
                    f"Tried audiveris_bin: {audiveris_bin}"
                ),
            )

        exported_path = _find_audiveris_output(output_dir, image_path.parent)
        if exported_path is None:
            return EngineResult(
                engine_name=self.name,
                success=False,
                musicxml_path=None,
                stdout=_to_text(completed.stdout),
                stderr=_to_text(completed.stderr),
                error_message=(
                    "Audiveris completed but no .musicxml, .mxl, or .xml file was found. "
                    f"Tried audiveris_bin: {audiveris_bin}"
                ),
            )

        normalized_path = output_dir / f"{image_path.stem}.musicxml"
        try:
            if exported_path.suffix.lower() == ".mxl":
                extract_musicxml_from_mxl(exported_path, normalized_path)
            elif exported_path != normalized_path:
                shutil.copyfile(exported_path, normalized_path)
        except Exception as exc:
            return EngineResult(
                engine_name=self.name,
                success=False,
                musicxml_path=None,
                stdout=_to_text(completed.stdout),
                stderr=_to_text(completed.stderr),
                error_message=(
                    f"Audiveris output could not be normalized: {exc}. "
                    f"Tried audiveris_bin: {audiveris_bin}"
                ),
            )

        return EngineResult(
            engine_name=self.name,
            success=True,
            musicxml_path=normalized_path,
            stdout=_to_text(completed.stdout),
            stderr=_to_text(completed.stderr),
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
