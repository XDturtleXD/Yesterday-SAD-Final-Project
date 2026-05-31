from __future__ import annotations

from pathlib import Path

from pdf2image import convert_from_path
from PIL import Image, ImageFilter, ImageOps


DEFAULT_DPI = 400
UPSCALE_FACTOR = 1.5
SUPPORTED_MODES = {"basic", "high_contrast", "resize", "classical_part", "thin_ink"}


def _to_grayscale(image: Image.Image) -> Image.Image:
    return image.convert("L")


def _autocontrast(image: Image.Image) -> Image.Image:
    return ImageOps.autocontrast(image)


def _threshold(image: Image.Image, threshold: int = 190) -> Image.Image:
    grayscale = _to_grayscale(image)
    return grayscale.point(lambda pixel: 255 if pixel > threshold else 0, mode="1").convert("L")


def _resample_filter() -> int:
    try:
        return Image.Resampling.LANCZOS
    except AttributeError:
        return Image.LANCZOS


def _upscale(image: Image.Image, factor: float = UPSCALE_FACTOR) -> Image.Image:
    width, height = image.size
    new_size = (max(1, int(width * factor)), max(1, int(height * factor)))
    return image.resize(new_size, _resample_filter())


def _mild_sharpen(image: Image.Image) -> Image.Image:
    return image.filter(ImageFilter.UnsharpMask(radius=1.0, percent=80, threshold=3))


def _thin_ink(image: Image.Image) -> Image.Image:
    gray = _autocontrast(_to_grayscale(image))
    upscaled = _upscale(gray)

    # In grayscale score images, black ink has low pixel values and white paper
    # has high pixel values.
    # MaxFilter replaces each pixel with the local maximum, so it can shrink
    # black regions slightly by letting nearby white pixels win.
    thinned = upscaled.filter(ImageFilter.MaxFilter(size=3))

    # Over-thinning can break staff lines and stems; blend most of the original
    # image back in so the effect stays light.
    blended = Image.blend(upscaled, thinned, alpha=0.35)
    return _mild_sharpen(blended)


def _find_content_bbox(image: Image.Image) -> tuple[int, int, int, int] | None:
    grayscale = _to_grayscale(image)
    content_mask = grayscale.point(lambda pixel: 255 if pixel < 245 else 0, mode="L")
    bbox = content_mask.getbbox()
    if bbox is None:
        return None

    left, top, right, bottom = bbox
    width, height = grayscale.size
    min_content_width = int(width * 0.10)
    min_content_height = int(height * 0.10)
    if right - left < min_content_width or bottom - top < min_content_height:
        return None

    return bbox


def _safe_crop(image: Image.Image, bbox: tuple[int, int, int, int] | None) -> Image.Image:
    if bbox is None:
        return image

    width, height = image.size
    left, top, right, bottom = bbox

    padding_x = max(80, int(width * 0.06))
    padding_y = max(80, int(height * 0.05))
    crop_left = max(0, left - padding_x)
    crop_top = max(0, top - padding_y)
    crop_right = min(width, right + padding_x)
    crop_bottom = min(height, bottom + padding_y)

    max_crop_x = int(width * 0.20)
    max_crop_y = int(height * 0.20)
    crop_left = min(crop_left, max_crop_x)
    crop_top = min(crop_top, max_crop_y)
    crop_right = max(crop_right, width - max_crop_x)
    crop_bottom = max(crop_bottom, height - max_crop_y)

    if crop_left <= 0 and crop_top <= 0 and crop_right >= width and crop_bottom >= height:
        return image
    if crop_right <= crop_left or crop_bottom <= crop_top:
        return image

    return image.crop((crop_left, crop_top, crop_right, crop_bottom))


def _process_page(image: Image.Image, mode: str) -> Image.Image:
    processed = _autocontrast(_to_grayscale(image))

    if mode == "basic":
        return processed
    if mode == "high_contrast":
        return _threshold(processed)
    if mode == "resize":
        return _upscale(processed)
    if mode == "classical_part":
        cropped = _safe_crop(processed, _find_content_bbox(processed))
        return _mild_sharpen(_upscale(cropped))
    if mode == "thin_ink":
        return _thin_ink(image)

    raise RuntimeError(
        f"Unsupported preprocessing mode: {mode}. "
        f"Expected one of: {', '.join(sorted(SUPPORTED_MODES))}"
    )


def create_enhanced_pdf(
    input_pdf: Path,
    output_pdf: Path,
    work_dir: Path,
    mode: str = "classical_part",
) -> Path:
    if mode not in SUPPORTED_MODES:
        raise RuntimeError(
            f"Unsupported preprocessing mode: {mode}. "
            f"Expected one of: {', '.join(sorted(SUPPORTED_MODES))}"
        )
    if not input_pdf.exists():
        raise RuntimeError(f"Input PDF does not exist: {input_pdf}")

    output_pdf.parent.mkdir(parents=True, exist_ok=True)
    work_dir.mkdir(parents=True, exist_ok=True)

    try:
        pages = convert_from_path(str(input_pdf), dpi=DEFAULT_DPI)
    except Exception as exc:
        raise RuntimeError(
            "Failed to convert PDF pages to images for preprocessing. "
            "Make sure the input is a valid PDF and Poppler is available. "
            f"Details: {exc}"
        ) from exc

    if not pages:
        raise RuntimeError(f"PDF preprocessing produced no pages: {input_pdf}")

    processed_pages: list[Image.Image] = []
    try:
        for index, page in enumerate(pages, start=1):
            processed_page = _process_page(page, mode)
            processed_image_path = work_dir / f"processed_page_{index:03d}.png"
            processed_page.save(processed_image_path, "PNG")
            processed_pages.append(processed_page.convert("RGB"))

        first_page, remaining_pages = processed_pages[0], processed_pages[1:]
        first_page.save(
            output_pdf,
            "PDF",
            resolution=DEFAULT_DPI,
            save_all=True,
            append_images=remaining_pages,
        )
    except Exception as exc:
        raise RuntimeError(f"Failed to write enhanced PDF: {output_pdf}. Details: {exc}") from exc

    return output_pdf
