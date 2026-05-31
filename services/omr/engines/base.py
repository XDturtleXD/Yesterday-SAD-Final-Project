from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional


@dataclass
class EngineResult:
    engine_name: str
    success: bool
    musicxml_path: Optional[Path]
    stdout: str
    stderr: str
    error_message: Optional[str]


class BaseEngine:
    name: str

    def run(self, image_path: Path, output_dir: Path) -> EngineResult:
        raise NotImplementedError

