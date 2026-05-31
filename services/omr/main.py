from __future__ import annotations

import json
import os
import re
import shutil
import uuid
from pathlib import Path
from typing import Any

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pdf2image import convert_from_path
from PIL import Image

from engines.audiveris_engine import AudiverisEngine
from engines.base import BaseEngine, EngineResult
from utils.musicxml_utils import merge_musicxml_files
from utils.preprocess_utils import SUPPORTED_MODES, _process_page


BASE_DIR = Path(__file__).resolve().parent
JOBS_DIR = BASE_DIR / "jobs"
SAFE_JOB_ID_RE = re.compile(r"^[a-f0-9]{32}$")


def _test_max_pages() -> int | None:
    raw_value = os.getenv("OMR_TEST_MAX_PAGES", "").strip()
    if not raw_value:
        return None
    if raw_value.lower() in {"none", "all", "0"}:
        return None
    return int(raw_value)


TEST_MAX_PAGES: int | None = _test_max_pages()
SUPPORTED_ENGINES = ["audiveris"]
DEFAULT_ENGINE = "audiveris"
SUPPORTED_PREPROCESS_MODES = ["none", *sorted(SUPPORTED_MODES)]

app = FastAPI(title="Score PDF to MusicXML")
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
templates = Jinja2Templates(directory=BASE_DIR / "templates")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "engine": DEFAULT_ENGINE,
        "test_max_pages": TEST_MAX_PAGES,
    }


def selected_engine_names(engine: str) -> list[str]:
    if engine == "audiveris":
        return [engine]
    raise ValueError(
        f"Unsupported engine: {engine}. Expected one of: {', '.join(SUPPORTED_ENGINES)}"
    )


def validate_preprocess_mode(preprocess_mode: str) -> str:
    normalized_mode = preprocess_mode.lower()
    if normalized_mode not in SUPPORTED_PREPROCESS_MODES:
        raise ValueError(
            "Unsupported preprocess_mode: "
            f"{preprocess_mode}. Expected one of: {', '.join(SUPPORTED_PREPROCESS_MODES)}"
        )
    return normalized_mode


def create_engine_results() -> dict[str, Any]:
    return {
        engine_name: {
            "success": False,
            "musicxml_available": False,
            "error_message": None,
            "pages": {},
        }
        for engine_name in ["audiveris"]
    }


def create_initial_status(
    job_id: str,
    preprocess_mode: str = "none",
    engine: str = DEFAULT_ENGINE,
) -> dict[str, Any]:
    return {
        "job_id": job_id,
        "status": "queued",
        "preprocess_mode": preprocess_mode,
        "engine": engine,
        "current_page": 0,
        "total_pages": 0,
        "engine_results": create_engine_results(),
        "message": "Job queued",
        "result_available": False,
        "error_message": None,
        "page_results": [],
    }


def get_job_dir(job_id: str) -> Path:
    if not SAFE_JOB_ID_RE.fullmatch(job_id):
        raise HTTPException(status_code=400, detail="Invalid job_id")
    return JOBS_DIR / job_id


def get_existing_job_dir(job_id: str) -> Path:
    job_dir = get_job_dir(job_id)
    if not job_dir.exists():
        raise HTTPException(status_code=404, detail="Job not found")
    return job_dir


def status_path_for(job_dir: Path) -> Path:
    return job_dir / "status.json"


def write_status(job_dir: Path, status: dict[str, Any]) -> None:
    status_file = status_path_for(job_dir)
    tmp_file = status_file.with_suffix(".json.tmp")
    tmp_file.write_text(
        json.dumps(status, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp_file.replace(status_file)


def read_status(job_dir: Path) -> dict[str, Any]:
    status_file = status_path_for(job_dir)
    if not status_file.exists():
        raise HTTPException(status_code=404, detail="Status file not found")
    return json.loads(status_file.read_text(encoding="utf-8"))


def list_page_results(job_id: str, musicxml_dir: Path) -> list[dict[str, Any]]:
    page_results: list[dict[str, Any]] = []
    if not musicxml_dir.exists():
        return page_results

    for page_file in sorted(musicxml_dir.glob("page_*.musicxml")):
        try:
            page_number = int(page_file.stem.split("_")[-1])
        except ValueError:
            continue
        page_results.append(
            {
                "page_number": page_number,
                "filename": page_file.name,
                "download_url": f"/result/{job_id}/page/{page_number}",
            }
        )
    return page_results


def engine_result_path(job_dir: Path, engine_name: str, page_number: int) -> Path:
    return job_dir / "results" / engine_name / f"page_{page_number:03d}.musicxml"


def engine_log_path(job_dir: Path, engine_name: str, page_number: int) -> Path:
    return job_dir / "results" / engine_name / f"page_{page_number:03d}.log"


def refresh_engine_result_flags(job_id: str, job_dir: Path, status: dict[str, Any]) -> None:
    engine_results = status.setdefault("engine_results", create_engine_results())
    any_result_available = False
    total_pages = int(status.get("total_pages") or 0)

    for engine_name in ["audiveris"]:
        engine_status = engine_results.setdefault(
            engine_name,
            {
                "success": False,
                "musicxml_available": False,
                "error_message": None,
                "pages": {},
            },
        )
        pages = engine_status.setdefault("pages", {})
        engine_available = False
        for page_number in range(1, total_pages + 1):
            page_file = engine_result_path(job_dir, engine_name, page_number)
            page_key = str(page_number)
            if page_file.exists():
                any_result_available = True
                engine_available = True
                page_status = pages.setdefault(page_key, {})
                page_status.update(
                    {
                        "success": True,
                        "musicxml_available": True,
                        "error_message": page_status.get("error_message"),
                        "download_url": f"/result/{job_id}/{engine_name}/page/{page_number}",
                        "preview_url": f"/preview/{job_id}/{engine_name}/page/{page_number}",
                        "log_url": f"/logs/{job_id}/{engine_name}/page/{page_number}",
                    }
                )
        engine_status["musicxml_available"] = engine_available
        if engine_available and not engine_status.get("error_message"):
            engine_status["success"] = True

    status["result_available"] = any_result_available


def update_status(job_id: str, **updates: Any) -> dict[str, Any]:
    job_dir = get_job_dir(job_id)
    status = read_status(job_dir)
    status.update(updates)
    status["page_results"] = list_page_results(job_id, job_dir / "musicxml")
    refresh_engine_result_flags(job_id, job_dir, status)
    write_status(job_dir, status)
    return status


def clear_generated_outputs(job_dir: Path) -> None:
    for generated_dir in [
        job_dir / "pages",
        job_dir / "processed",
        job_dir / "results",
        job_dir / "musicxml",
        job_dir / "audiveris_output",
        job_dir / "preprocessed",
    ]:
        if generated_dir.exists():
            shutil.rmtree(generated_dir)
        generated_dir.mkdir(parents=True, exist_ok=True)

    result_file = job_dir / "result.musicxml"
    if result_file.exists():
        result_file.unlink()


def build_engine(engine_name: str) -> BaseEngine:
    if engine_name == "audiveris":
        return AudiverisEngine()
    raise ValueError(f"Unsupported engine: {engine_name}")


def save_processed_page(image_path: Path, processed_path: Path, preprocess_mode: str) -> Path:
    processed_path.parent.mkdir(parents=True, exist_ok=True)
    if preprocess_mode == "none":
        shutil.copy2(image_path, processed_path)
        return processed_path

    with Image.open(image_path) as page_image:
        processed_image = _process_page(page_image, preprocess_mode)
        processed_image.save(processed_path, "PNG")
    return processed_path


def ensure_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    return str(value)


def write_engine_log(log_path: Path, result: EngineResult) -> None:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_path.write_text(
        "\n".join(
            [
                f"engine={ensure_text(result.engine_name)}",
                f"success={result.success}",
                f"error_message={ensure_text(result.error_message)}",
                "",
                "STDOUT:",
                ensure_text(result.stdout),
                "",
                "STDERR:",
                ensure_text(result.stderr),
            ]
        ),
        encoding="utf-8",
    )


def failed_engine_result(engine_name: str, error_message: str) -> EngineResult:
    return EngineResult(
        engine_name=engine_name,
        success=False,
        musicxml_path=None,
        stdout="",
        stderr="",
        error_message=error_message,
    )


def convert_pdf_pages_for_job(pdf_path: Path, output_dir: Path) -> list[Path]:
    if not pdf_path.exists():
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    output_dir.mkdir(parents=True, exist_ok=True)
    convert_kwargs: dict[str, Any] = {"dpi": 300}
    if TEST_MAX_PAGES is not None:
        convert_kwargs["last_page"] = TEST_MAX_PAGES

    try:
        pages = convert_from_path(str(pdf_path), **convert_kwargs)
    except Exception as exc:
        raise RuntimeError(
            "Failed to convert PDF to images. If the uploaded file is a valid PDF, "
            "make sure Poppler is installed and available in PATH. "
            f"Original error: {exc}"
        ) from exc

    image_paths: list[Path] = []
    for index, page in enumerate(pages, start=1):
        image_path = output_dir / f"page_{index:03d}.png"
        page.save(image_path, "PNG")
        image_paths.append(image_path)

    return image_paths


def record_engine_result(
    status: dict[str, Any],
    job_id: str,
    job_dir: Path,
    engine_name: str,
    page_number: int,
    result: EngineResult,
) -> None:
    engine_status = status["engine_results"][engine_name]
    pages = engine_status.setdefault("pages", {})
    output_file = engine_result_path(job_dir, engine_name, page_number)
    musicxml_available = result.success and output_file.exists()

    pages[str(page_number)] = {
        "success": result.success,
        "musicxml_available": musicxml_available,
        "error_message": result.error_message,
        "download_url": f"/result/{job_id}/{engine_name}/page/{page_number}",
        "preview_url": f"/preview/{job_id}/{engine_name}/page/{page_number}",
        "log_url": f"/logs/{job_id}/{engine_name}/page/{page_number}",
    }

    engine_status["success"] = any(page.get("success") for page in pages.values())
    engine_status["musicxml_available"] = any(
        page.get("musicxml_available") for page in pages.values()
    )
    engine_status["error_message"] = None if engine_status["success"] else result.error_message


def selected_engine_summary(
    status: dict[str, Any],
    engine_names: list[str],
) -> tuple[bool, bool]:
    selected_statuses = [
        status.get("engine_results", {}).get(engine_name, {})
        for engine_name in engine_names
    ]
    any_musicxml = any(
        engine_status.get("musicxml_available") for engine_status in selected_statuses
    )
    any_failed = False
    for engine_status in selected_statuses:
        pages = engine_status.get("pages", {})
        if not engine_status.get("success"):
            any_failed = True
        if any(not page.get("success") for page in pages.values()):
            any_failed = True
    return any_musicxml, any_failed


def process_job(
    job_id: str,
    preprocess_mode: str | None = None,
    engine: str | None = None,
) -> None:
    job_dir = get_job_dir(job_id)
    pdf_path = job_dir / "input.pdf"
    pages_dir = job_dir / "pages"
    processed_dir = job_dir / "processed"
    results_dir = job_dir / "results"

    try:
        current_status = read_status(job_dir)
        preprocess_mode = validate_preprocess_mode(
            preprocess_mode or current_status.get("preprocess_mode", "none")
        )
        engine = DEFAULT_ENGINE
        engine_names = selected_engine_names(engine)

        pages_dir.mkdir(parents=True, exist_ok=True)
        processed_dir.mkdir(parents=True, exist_ok=True)
        results_dir.mkdir(parents=True, exist_ok=True)

        update_status(
            job_id,
            status="processing",
            message="Converting PDF pages to PNG images",
            current_page=0,
            total_pages=0,
            preprocess_mode=preprocess_mode,
            engine=engine,
            engine_results=create_engine_results(),
            error_message=None,
        )

        page_images = convert_pdf_pages_for_job(pdf_path, pages_dir)
        if not page_images:
            raise RuntimeError("PDF conversion produced no images")

        total_pages = len(page_images)
        update_status(
            job_id,
            total_pages=total_pages,
            message=f"Converted {total_pages} page(s); preparing processed images",
        )

        for page_number, image_path in enumerate(page_images, start=1):
            update_status(
                job_id,
                current_page=page_number,
                total_pages=total_pages,
                message=(
                    f"Preprocessing page {page_number} / {total_pages}"
                    if preprocess_mode != "none"
                    else f"Preparing page {page_number} / {total_pages}"
                ),
            )

            processed_image = save_processed_page(
                image_path,
                processed_dir / f"page_{page_number:03d}.png",
                preprocess_mode,
            )

            for engine_name in engine_names:
                update_status(
                    job_id,
                    current_page=page_number,
                    total_pages=total_pages,
                    message=(
                        f"Running {engine_name.title()} on page "
                        f"{page_number} / {total_pages}"
                    ),
                )

                engine_dir = results_dir / engine_name
                work_dir = engine_dir / f"page_{page_number:03d}_work"
                try:
                    engine_runner = build_engine(engine_name)
                    result = engine_runner.run(processed_image, work_dir)
                except Exception as exc:
                    result = failed_engine_result(
                        engine_name,
                        f"{engine_name.title()} failed before returning a result: {exc}",
                    )
                log_file = engine_log_path(job_dir, engine_name, page_number)
                write_engine_log(log_file, result)

                final_musicxml = engine_result_path(job_dir, engine_name, page_number)
                try:
                    if result.success and result.musicxml_path and result.musicxml_path.exists():
                        final_musicxml.parent.mkdir(parents=True, exist_ok=True)
                        if result.musicxml_path != final_musicxml:
                            shutil.copyfile(result.musicxml_path, final_musicxml)
                except Exception as exc:
                    result = failed_engine_result(
                        engine_name,
                        f"{engine_name.title()} output could not be saved: {exc}",
                    )
                    write_engine_log(log_file, result)

                status = read_status(job_dir)
                record_engine_result(
                    status,
                    job_id,
                    job_dir,
                    engine_name,
                    page_number,
                    result,
                )
                refresh_engine_result_flags(job_id, job_dir, status)
                write_status(job_dir, status)

        final_status = read_status(job_dir)
        refresh_engine_result_flags(job_id, job_dir, final_status)
        any_musicxml, any_failed = selected_engine_summary(final_status, engine_names)
        if any_musicxml:
            result_files = [
                engine_result_path(job_dir, DEFAULT_ENGINE, page_number)
                for page_number in range(1, total_pages + 1)
            ]
            merge_outcome = merge_musicxml_files(result_files, job_dir / "result.musicxml")
            final_status.update(
                {
                    "status": "done",
                    "current_page": total_pages,
                    "total_pages": total_pages,
                    "message": (
                        "Completed with warnings. Audiveris produced MusicXML."
                        if any_failed
                        else "Done"
                    ),
                    "error_message": None,
                    "result_available": True,
                    "result_download_url": f"/result/{job_id}/musicxml",
                    "result_raw_url": f"/result/{job_id}/musicxml/raw",
                    "merge_message": merge_outcome.message,
                }
            )
        else:
            final_status.update(
                {
                    "status": "error",
                    "current_page": total_pages,
                    "total_pages": total_pages,
                    "message": "Job failed",
                    "error_message": "Audiveris failed to produce MusicXML.",
                }
            )
        write_status(job_dir, final_status)
    except Exception as exc:
        try:
            update_status(
                job_id,
                status="error",
                message="Job failed",
                error_message=str(exc),
            )
        except Exception:
            error_status = create_initial_status(
                job_id,
                preprocess_mode=preprocess_mode or "none",
                engine=engine or DEFAULT_ENGINE,
            )
            error_status.update(
                {
                    "status": "error",
                    "message": "Job failed",
                    "error_message": str(exc),
                }
            )
            write_status(job_dir, error_status)


@app.get("/")
def index(request: Request, job_id: str | None = None):
    initial_job_id = job_id if job_id and SAFE_JOB_ID_RE.fullmatch(job_id) else ""
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={"initial_job_id": initial_job_id},
    )


@app.post("/upload")
async def upload_pdf(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    preprocess_mode: str = Form("none"),
    engine: str = Form(DEFAULT_ENGINE),
):
    filename = Path(file.filename or "").name
    if Path(filename).suffix.lower() != ".pdf":
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    try:
        preprocess_mode = validate_preprocess_mode(preprocess_mode)
        # Keep the form field for older clients, but this MVP always runs Audiveris.
        engine = DEFAULT_ENGINE
        selected_engine_names(engine)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job_id = uuid.uuid4().hex
    job_dir = JOBS_DIR / job_id
    job_dir.mkdir(parents=True, exist_ok=False)
    (job_dir / "pages").mkdir(exist_ok=True)
    (job_dir / "processed").mkdir(exist_ok=True)
    (job_dir / "results").mkdir(exist_ok=True)

    write_status(
        job_dir,
        create_initial_status(job_id, preprocess_mode=preprocess_mode, engine=engine),
    )

    pdf_path = job_dir / "input.pdf"
    with pdf_path.open("wb") as output_file:
        shutil.copyfileobj(file.file, output_file)

    background_tasks.add_task(process_job, job_id, preprocess_mode, engine)
    return JSONResponse({"job_id": job_id})


@app.post("/retry/{job_id}")
def retry_job(job_id: str, background_tasks: BackgroundTasks):
    job_dir = get_existing_job_dir(job_id)
    pdf_path = job_dir / "input.pdf"
    if not pdf_path.exists():
        raise HTTPException(status_code=404, detail="Original PDF not found")

    previous_status = read_status(job_dir)
    preprocess_mode = validate_preprocess_mode(previous_status.get("preprocess_mode", "none"))
    engine = DEFAULT_ENGINE
    selected_engine_names(engine)

    clear_generated_outputs(job_dir)
    write_status(
        job_dir,
        create_initial_status(job_id, preprocess_mode=preprocess_mode, engine=engine),
    )
    background_tasks.add_task(process_job, job_id, preprocess_mode, engine)
    return JSONResponse({"job_id": job_id})


@app.get("/status/{job_id}")
def get_status(job_id: str):
    job_dir = get_existing_job_dir(job_id)
    status = read_status(job_dir)
    status["page_results"] = list_page_results(job_id, job_dir / "musicxml")
    refresh_engine_result_flags(job_id, job_dir, status)
    return status


@app.get("/result/{job_id}/musicxml")
def download_musicxml(job_id: str):
    # Legacy aggregated-result route. The Audiveris-only main flow stores
    # per-page results under jobs/{job_id}/results/audiveris/.
    job_dir = get_existing_job_dir(job_id)
    status = read_status(job_dir)
    result_file = job_dir / "result.musicxml"

    if not result_file.exists():
        if status.get("status") != "done":
            raise HTTPException(status_code=409, detail="MusicXML is not ready yet")
        raise HTTPException(status_code=404, detail="Result MusicXML not found")

    return FileResponse(
        result_file,
        media_type="application/vnd.recordare.musicxml+xml",
        filename=f"{job_id}.musicxml",
    )


@app.get("/result/{job_id}/page/{page_number}")
def download_page_musicxml(job_id: str, page_number: int):
    # Legacy aggregated page route retained for compatibility with old jobs.
    if page_number < 1:
        raise HTTPException(status_code=400, detail="page_number must be >= 1")

    job_dir = get_existing_job_dir(job_id)
    page_file = job_dir / "musicxml" / f"page_{page_number:03d}.musicxml"
    if not page_file.exists():
        raise HTTPException(status_code=404, detail="Page MusicXML not found")

    return FileResponse(
        page_file,
        media_type="application/vnd.recordare.musicxml+xml",
        filename=page_file.name,
    )


@app.get("/result/{job_id}/{engine_name}/page/{page_number}")
def download_engine_page_musicxml(job_id: str, engine_name: str, page_number: int):
    if page_number < 1:
        raise HTTPException(status_code=400, detail="page_number must be >= 1")
    if engine_name != "audiveris":
        raise HTTPException(status_code=400, detail="Invalid engine_name")

    job_dir = get_existing_job_dir(job_id)
    page_file = engine_result_path(job_dir, engine_name, page_number)
    if not page_file.exists():
        raise HTTPException(status_code=404, detail="Engine page MusicXML not found")

    return FileResponse(
        page_file,
        media_type="application/vnd.recordare.musicxml+xml",
        filename=page_file.name,
    )


@app.get("/result/{job_id}/{engine_name}/page/{page_number}/raw")
def raw_engine_page_musicxml(job_id: str, engine_name: str, page_number: int):
    if page_number < 1:
        raise HTTPException(status_code=400, detail="page_number must be >= 1")
    if engine_name != "audiveris":
        raise HTTPException(status_code=400, detail="Invalid engine_name")

    job_dir = get_existing_job_dir(job_id)
    page_file = engine_result_path(job_dir, engine_name, page_number)
    if not page_file.exists():
        raise HTTPException(status_code=404, detail="Engine page MusicXML not found")

    return Response(
        content=page_file.read_text(encoding="utf-8", errors="replace"),
        media_type="application/vnd.recordare.musicxml+xml; charset=utf-8",
    )


@app.get("/logs/{job_id}/{engine_name}/page/{page_number}")
def engine_page_log(job_id: str, engine_name: str, page_number: int):
    if page_number < 1:
        raise HTTPException(status_code=400, detail="page_number must be >= 1")
    if engine_name != "audiveris":
        raise HTTPException(status_code=400, detail="Invalid engine_name")

    job_dir = get_existing_job_dir(job_id)
    log_file = engine_log_path(job_dir, engine_name, page_number)
    if not log_file.exists():
        raise HTTPException(status_code=404, detail="Engine page log not found")

    return Response(
        content=log_file.read_text(encoding="utf-8", errors="replace"),
        media_type="text/plain; charset=utf-8",
    )


@app.get("/preview/{job_id}/{engine_name}/page/{page_number}")
def preview_engine_page_musicxml(
    request: Request,
    job_id: str,
    engine_name: str,
    page_number: int,
):
    if page_number < 1:
        raise HTTPException(status_code=400, detail="page_number must be >= 1")
    if engine_name != "audiveris":
        raise HTTPException(status_code=400, detail="Invalid engine_name")

    get_existing_job_dir(job_id)
    return templates.TemplateResponse(
        request=request,
        name="preview.html",
        context={
            "job_id": job_id,
            "engine_name": engine_name,
            "page_number": page_number,
        },
    )


@app.get("/preview/{job_id}")
def preview_musicxml(request: Request, job_id: str):
    # Legacy aggregated preview route retained for compatibility with old jobs.
    get_existing_job_dir(job_id)
    return templates.TemplateResponse(
        request=request,
        name="preview.html",
        context={"job_id": job_id, "engine_name": "", "page_number": 1},
    )


@app.get("/result/{job_id}/musicxml/raw")
def raw_musicxml(job_id: str):
    # Legacy aggregated-result route. The Audiveris-only main flow stores
    # per-page results under jobs/{job_id}/results/audiveris/.
    job_dir = get_existing_job_dir(job_id)
    status = read_status(job_dir)
    result_file = job_dir / "result.musicxml"

    if not result_file.exists():
        if status.get("status") != "done":
            raise HTTPException(status_code=409, detail="MusicXML is not ready yet")
        raise HTTPException(status_code=404, detail="Result MusicXML not found")

    xml_text = result_file.read_text(encoding="utf-8", errors="replace")
    return Response(
        content=xml_text,
        media_type="application/vnd.recordare.musicxml+xml; charset=utf-8",
    )
