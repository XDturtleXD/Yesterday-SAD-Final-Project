FROM eclipse-temurin:25-jdk AS audiveris-builder

RUN apt-get update \
 && apt-get install -y --no-install-recommends git \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /src/audiveris

COPY audiveris/ /src/audiveris/

RUN ./gradlew --no-daemon :app:installDist -x test -x javadoc


FROM eclipse-temurin:25-jre

WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      fontconfig \
      libgtk-3-0 \
      poppler-utils \
      python3 \
      python3-pip \
      python3-venv \
 && rm -rf /var/lib/apt/lists/*

COPY --from=audiveris-builder /src/audiveris/app/build/install/app /opt/audiveris

ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv "$VIRTUAL_ENV"
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

COPY services/omr/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY services/omr/ .

ENV OMR_TEST_MAX_PAGES=all \
    AUDIVERIS_BIN=/opt/audiveris/bin/Audiveris

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
