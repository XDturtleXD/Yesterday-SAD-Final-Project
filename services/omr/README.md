# OMR Conversion Service

FastAPI service for converting score PDFs into MusicXML with Audiveris.

The React app should not call this service directly. The intended flow is:

```text
React frontend
  -> Express backend
  -> FastAPI OMR service
  -> Audiveris
  -> MusicXML
```

## Requirements

- Python 3.10+
- Poppler, used by `pdf2image`
- Audiveris

On macOS, Audiveris is usually available at:

```text
/Applications/Audiveris.app/Contents/MacOS/Audiveris
```

## Local Setup

From this folder:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export AUDIVERIS_BIN="/Applications/Audiveris.app/Contents/MacOS/Audiveris"
uvicorn main:app --reload --port 8000
```

From the repo root, after installing Python dependencies, you can also run:

```bash
npm run dev:omr
```

Run all three local services with:

```bash
npm run dev:all
```

## Environment

```env
AUDIVERIS_BIN=/Applications/Audiveris.app/Contents/MacOS/Audiveris
OMR_TEST_MAX_PAGES=all
```

`OMR_TEST_MAX_PAGES=all` processes the full PDF. Set it to a number like `1`
for faster local testing.

The Express backend reaches this service through:

```env
OMR_SERVICE_URL=http://127.0.0.1:8000
```

## API

```text
GET /health
POST /upload
GET /status/{job_id}
POST /retry/{job_id}
GET /result/{job_id}/audiveris/page/{page_number}
GET /result/{job_id}/audiveris/page/{page_number}/raw
GET /logs/{job_id}/audiveris/page/{page_number}
```

Generated job files are written to:

```text
services/omr/jobs/{job_id}/
```

The job directory is ignored by git except for `jobs/.gitkeep`.
