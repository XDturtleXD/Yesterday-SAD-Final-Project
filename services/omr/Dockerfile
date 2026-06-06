FROM python:3.11-slim AS audiveris-builder

WORKDIR /tmp/audiveris-src

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates git openjdk-25-jdk-headless \
 && rm -rf /var/lib/apt/lists/*

RUN git clone --depth=1 --branch 5.10.2 \
      https://github.com/Audiveris/audiveris.git .

RUN ./gradlew --no-daemon :app:installDist -x test \
 && audiveris_bin="$(find app/build/install -path '*/bin/Audiveris' -type f -print -quit)" \
 && test -n "$audiveris_bin" \
 && audiveris_dist="$(dirname "$(dirname "$audiveris_bin")")" \
 && cp -a "$audiveris_dist" /tmp/audiveris-dist \
 && test -f /tmp/audiveris-dist/bin/Audiveris


FROM python:3.11-slim

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      fontconfig \
      libfreetype6 \
      libasound2t64 \
      libgtk-3-0 \
      openjdk-25-jre-headless \
      poppler-utils \
      tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/*

COPY --from=audiveris-builder /tmp/audiveris-dist /opt/audiveris
RUN test -f /opt/audiveris/bin/Audiveris \
 && chmod +x /opt/audiveris/bin/Audiveris

COPY services/omr/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/omr/ ./

ENV OMR_TEST_MAX_PAGES=all \
    AUDIVERIS_BIN=/opt/audiveris/bin/Audiveris

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
