from __future__ import annotations

import copy
import re
import shutil
import zipfile
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class MergeOutcome:
    merged: bool
    message: str
    output_file: Path


BAD_MUSICXML_TITLES = {"", "music21", "music21 fragment"}


def _xml_escape_text(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _is_bad_musicxml_title(value: str) -> bool:
    return re.sub(r"\s+", " ", value).strip().lower() in BAD_MUSICXML_TITLES


def _insert_movement_title(xml: str, title: str) -> str:
    escaped_title = _xml_escape_text(title)
    score_match = re.search(r"<score-(?:partwise|timewise)\b[^>]*>", xml)
    if not score_match:
        return xml

    insert_at = score_match.end()
    return f"{xml[:insert_at]}\n  <movement-title>{escaped_title}</movement-title>{xml[insert_at:]}"


def sanitize_musicxml_title(output_file: Path, title: str | None = None) -> None:
    xml = output_file.read_text(encoding="utf-8")
    normalized_title = title.strip() if title else None
    found_bad_title = False

    def sanitize_tag(match: re.Match[str]) -> str:
        nonlocal found_bad_title
        tag_name = match.group("tag")
        value = match.group("value")
        if not _is_bad_musicxml_title(value):
            return match.group(0)

        found_bad_title = True
        if normalized_title:
            if tag_name.lower() == "credit-words":
                return ""
            return f"{match.group('open')}{_xml_escape_text(normalized_title)}{match.group('close')}"
        return ""

    tag_pattern = re.compile(
        r"(?P<open><(?P<tag>movement-title|work-title|credit-words)\b[^>]*>)"
        r"(?P<value>.*?)"
        r"(?P<close></(?P=tag)>)",
        re.IGNORECASE | re.DOTALL,
    )
    sanitized = tag_pattern.sub(sanitize_tag, xml)
    sanitized = re.sub(
        r"<creator\b[^>]*type=[\"']composer[\"'][^>]*>.*?</creator>",
        lambda match: (
            ""
            if _is_bad_musicxml_title(re.sub(r"<[^>]+>", "", match.group(0)))
            else match.group(0)
        ),
        sanitized,
        flags=re.IGNORECASE | re.DOTALL,
    )

    if (
        normalized_title
        and "<movement-title" not in sanitized.lower()
        and "<work-title" not in sanitized.lower()
    ):
        sanitized = _insert_movement_title(sanitized, normalized_title)

    if sanitized != xml or found_bad_title:
        output_file.write_text(sanitized, encoding="utf-8")


def _copy_first_page(input_files: list[Path], output_file: Path, message: str) -> MergeOutcome:
    shutil.copy2(input_files[0], output_file)
    return MergeOutcome(merged=False, message=message, output_file=output_file)


def extract_musicxml_from_mxl(mxl_path: Path, output_musicxml_path: Path) -> Path:
    try:
        with zipfile.ZipFile(mxl_path) as mxl_file:
            xml_names = [
                name
                for name in mxl_file.namelist()
                if (
                    name.lower().endswith(".musicxml")
                    or name.lower().endswith(".xml")
                )
                and "META-INF" not in Path(name).parts
            ]
            musicxml_names = [
                name for name in xml_names if name.lower().endswith(".musicxml")
            ]
            selected_name = (musicxml_names or xml_names)[0] if xml_names else None
            if selected_name is None:
                raise RuntimeError(
                    f"No suitable MusicXML XML file found inside MXL archive: {mxl_path}"
                )

            output_musicxml_path.parent.mkdir(parents=True, exist_ok=True)
            output_musicxml_path.write_bytes(mxl_file.read(selected_name))
            return output_musicxml_path
    except zipfile.BadZipFile as exc:
        raise RuntimeError(f"Could not open MXL archive as a zip file: {mxl_path}") from exc
    except OSError as exc:
        raise RuntimeError(f"Could not open MXL archive: {mxl_path}. Details: {exc}") from exc


def merge_musicxml_files(input_files: list[Path], output_file: Path) -> MergeOutcome:
    existing_files = [Path(path) for path in input_files if Path(path).exists()]
    if not existing_files:
        raise RuntimeError("No MusicXML files are available to merge")

    output_file.parent.mkdir(parents=True, exist_ok=True)

    if len(existing_files) == 1:
        shutil.copy2(existing_files[0], output_file)
        return MergeOutcome(
            merged=True,
            message="Single-page MusicXML copied to final result",
            output_file=output_file,
        )

    try:
        from music21 import converter, stream

        parsed_scores = [converter.parse(str(path)) for path in existing_files]
        combined_score = stream.Score(id="merged_score")

        max_part_count = max(len(score.parts) for score in parsed_scores)
        if max_part_count == 0:
            raise RuntimeError("music21 did not find any parts in parsed MusicXML")

        for part_index in range(max_part_count):
            combined_part = stream.Part(id=f"P{part_index + 1}")
            measure_number = 1

            for parsed_score in parsed_scores:
                parts = list(parsed_score.parts)
                if part_index >= len(parts):
                    continue

                source_part = parts[part_index]
                if not combined_part.partName and source_part.partName:
                    combined_part.partName = source_part.partName

                for measure in source_part.getElementsByClass(stream.Measure):
                    copied_measure = copy.deepcopy(measure)
                    copied_measure.number = measure_number
                    combined_part.append(copied_measure)
                    measure_number += 1

            if len(combined_part.getElementsByClass(stream.Measure)) > 0:
                combined_score.insert(0, combined_part)

        if not combined_score.parts:
            raise RuntimeError("No measures were appended during merge")

        combined_score.write("musicxml", fp=str(output_file))
        sanitize_musicxml_title(output_file)
        return MergeOutcome(
            merged=True,
            message="Merged multi-page MusicXML with music21",
            output_file=output_file,
        )
    except Exception as exc:
        # MVP simplification: if structural merge fails, keep the first page as
        # the final preview/download and expose all per-page MusicXML files.
        return _copy_first_page(
            existing_files,
            output_file,
            "multi-page merge failed, page files are available. "
            f"Fallback result uses the first page only. Details: {exc}",
        )
