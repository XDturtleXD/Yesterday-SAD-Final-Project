const uploadForm = document.querySelector("#uploadForm");
const pdfFileInput = document.querySelector("#pdfFile");
const preprocessModeSelect = document.querySelector("#preprocessMode");
const fileName = document.querySelector("#fileName");
const jobPanel = document.querySelector("#jobPanel");
const jobIdElement = document.querySelector("#jobId");
const statusBadge = document.querySelector("#statusBadge");
const statusMessage = document.querySelector("#statusMessage");
const progressBar = document.querySelector("#progressBar");
const progressText = document.querySelector("#progressText");
const errorBox = document.querySelector("#errorBox");
const resultActions = document.querySelector("#resultActions");
const downloadLink = document.querySelector("#downloadLink");
const previewLink = document.querySelector("#previewLink");
const retryButton = document.querySelector("#retryButton");
const pageResults = document.querySelector("#pageResults");
const pageResultList = document.querySelector("#pageResultList");
const engineResults = document.querySelector("#engineResults");
const uploadButton = document.querySelector("#uploadButton");

let pollingTimer = null;
let activeJobId = window.INITIAL_JOB_ID || localStorage.getItem("omrLastJobId");

function rememberJob(jobId) {
  activeJobId = jobId;
  localStorage.setItem("omrLastJobId", jobId);
}

function setHidden(element, hidden) {
  if (!element) return;
  element.classList.toggle("hidden", hidden);
}

function setStatusBadge(status) {
  if (!statusBadge) return;
  statusBadge.className = `status-badge ${status}`;
  statusBadge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
}

function updateProgress(currentPage, totalPages) {
  if (!progressBar || !progressText) return;

  const total = Number(totalPages) || 0;
  const current = Number(currentPage) || 0;
  const percent = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;

  progressBar.style.width = `${percent}%`;
  progressText.textContent = total > 0
    ? `Processing page ${current} / ${total}`
    : "Preparing pages";
}

function renderPageResults(jobId, pages) {
  if (!pageResults || !pageResultList) return;
  pageResultList.innerHTML = "";

  if (!pages || pages.length === 0) {
    setHidden(pageResults, true);
    return;
  }

  pages.forEach((page) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = page.download_url;
    link.textContent = `Page ${page.page_number}: ${page.filename}`;
    item.appendChild(link);
    pageResultList.appendChild(item);
  });

  setHidden(pageResults, false);
}

function selectedEngines() {
  return ["audiveris"];
}

function pageEntries(engineStatus) {
  const pages = engineStatus?.pages || {};
  return Object.entries(pages)
    .map(([pageNumber, page]) => ({ pageNumber: Number(pageNumber), ...page }))
    .sort((a, b) => a.pageNumber - b.pageNumber);
}

async function showLog(logElement, logUrl) {
  try {
    const response = await fetch(logUrl);
    if (!response.ok) {
      throw new Error(`Unable to load log: ${response.status}`);
    }
    logElement.textContent = await response.text();
  } catch (error) {
    logElement.textContent = error.message;
  }
  setHidden(logElement, false);
}

function renderEngineResults(jobId, status) {
  if (!engineResults) return;

  const visibleEngines = selectedEngines();
  let hasVisibleResult = false;

  ["audiveris"].forEach((engineName) => {
    const section = document.querySelector(`#${engineName}Result`);
    if (!section) return;

    const shouldShow = visibleEngines.includes(engineName);
    setHidden(section, !shouldShow);
    if (!shouldShow) return;

    hasVisibleResult = true;
    const engineStatus = status.engine_results?.[engineName] || {};
    const statusElement = section.querySelector(".engine-status");
    const actionsElement = section.querySelector(".engine-actions");
    const logElement = section.querySelector(".engine-log");
    const pages = pageEntries(engineStatus);

    statusElement.textContent = engineStatus.success
      ? "Success"
      : (engineStatus.error_message || "Waiting");
    statusElement.className = `engine-status ${engineStatus.success ? "success" : "pending"}`;
    actionsElement.innerHTML = "";
    if (logElement) {
      setHidden(logElement, true);
      logElement.textContent = "";
    }

    if (pages.length === 0) {
      return;
    }

    pages.forEach((page) => {
      const row = document.createElement("div");
      row.className = "engine-page-row";

      const label = document.createElement("span");
      label.textContent = `Page ${page.pageNumber}`;
      row.appendChild(label);

      if (page.musicxml_available) {
        const preview = document.createElement("a");
        preview.className = "secondary-button";
        preview.href = page.preview_url;
        preview.textContent = "Preview";
        row.appendChild(preview);

        const download = document.createElement("a");
        download.className = "secondary-button";
        download.href = page.download_url;
        download.textContent = "Download MusicXML";
        row.appendChild(download);
      }

      if (page.log_url) {
        const logButton = document.createElement("button");
        logButton.className = "secondary-button";
        logButton.type = "button";
        logButton.textContent = "Show log";
        logButton.addEventListener("click", () => showLog(logElement, page.log_url));
        row.appendChild(logButton);
      }

      if (!page.success && page.error_message) {
        const errorText = document.createElement("span");
        errorText.className = "inline-error";
        errorText.textContent = page.error_message;
        row.appendChild(errorText);
      }

      actionsElement.appendChild(row);
    });
  });

  setHidden(engineResults, !hasVisibleResult);
}

async function pollStatus(jobId) {
  try {
    const response = await fetch(`/status/${jobId}`);
    if (!response.ok) {
      throw new Error(`Unable to load status: ${response.status}`);
    }

    const status = await response.json();
    setStatusBadge(status.status);
    statusMessage.textContent = status.message || "";
    updateProgress(status.current_page, status.total_pages);
    renderPageResults(jobId, status.page_results || []);
    renderEngineResults(jobId, status);

    if (status.status === "done") {
      clearInterval(pollingTimer);
      pollingTimer = null;
      uploadButton.disabled = false;
      retryButton.disabled = false;
      setHidden(retryButton, true);
      setHidden(resultActions, false);
      setHidden(errorBox, true);
      progressBar.style.width = "100%";
    }

    if (status.status === "error") {
      clearInterval(pollingTimer);
      pollingTimer = null;
      uploadButton.disabled = false;
      retryButton.disabled = false;
      errorBox.textContent = status.error_message || "Job failed";
      setHidden(errorBox, false);
      setHidden(resultActions, false);
      setHidden(retryButton, false);
    }

    return status.status;
  } catch (error) {
    clearInterval(pollingTimer);
    pollingTimer = null;
    uploadButton.disabled = false;
    errorBox.textContent = error.message;
    setHidden(errorBox, false);
    return "error";
  }
}

async function beginPolling(jobId) {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }

  rememberJob(jobId);
  setHidden(jobPanel, false);
  jobIdElement.textContent = jobId;

  const status = await pollStatus(jobId);
  if (status !== "done" && status !== "error") {
    pollingTimer = setInterval(() => pollStatus(jobId), 2000);
  }
}

if (pdfFileInput) {
  pdfFileInput.addEventListener("change", () => {
    const selectedFile = pdfFileInput.files[0];
    fileName.textContent = selectedFile ? selectedFile.name : "PDF only";
  });
}

if (uploadForm) {
  uploadForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedFile = pdfFileInput.files[0];
    if (!selectedFile) {
      setHidden(jobPanel, false);
      errorBox.textContent = "Please choose a PDF file first.";
      setHidden(errorBox, false);
      return;
    }

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("preprocess_mode", preprocessModeSelect?.value || "none");
    formData.append("engine", "audiveris");

    uploadButton.disabled = true;
    setHidden(jobPanel, false);
    setHidden(errorBox, true);
    setHidden(resultActions, true);
    setHidden(pageResults, true);
    setHidden(engineResults, true);
    jobIdElement.textContent = "-";
    setStatusBadge("queued");
    statusMessage.textContent = "Uploading PDF";
    updateProgress(0, 0);

    try {
      const response = await fetch("/upload", {
        method: "POST",
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "Upload failed");
      }

      const jobId = payload.job_id;
      statusMessage.textContent = "Job queued";
      await beginPolling(jobId);
    } catch (error) {
      uploadButton.disabled = false;
      errorBox.textContent = error.message;
      setHidden(errorBox, false);
    }
  });
}

if (retryButton) {
  retryButton.addEventListener("click", async () => {
    const jobId = activeJobId || jobIdElement.textContent.trim();
    if (!jobId || jobId === "-") return;

    retryButton.disabled = true;
    uploadButton.disabled = true;
    setHidden(errorBox, true);
    setHidden(resultActions, true);
    setHidden(pageResults, true);
    setHidden(engineResults, true);
    setStatusBadge("queued");
    statusMessage.textContent = "Retrying job";
    updateProgress(0, 0);

    try {
      const response = await fetch(`/retry/${jobId}`, { method: "POST" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail || "Retry failed");
      }

      await beginPolling(payload.job_id);
    } catch (error) {
      uploadButton.disabled = false;
      retryButton.disabled = false;
      errorBox.textContent = error.message;
      setHidden(errorBox, false);
      setHidden(resultActions, false);
      setHidden(retryButton, false);
    }
  });
}

if (uploadForm && activeJobId) {
  setHidden(jobPanel, false);
  jobIdElement.textContent = activeJobId;
  setStatusBadge("queued");
  statusMessage.textContent = "Loading saved job";
  updateProgress(0, 0);
  beginPolling(activeJobId);
}

async function renderPreview() {
  const scoreContainer = document.querySelector("#score");
  const previewError = document.querySelector("#previewError");
  if (!scoreContainer || !window.JOB_ID) return;

  const engineName = window.ENGINE_NAME;
  const pageNumber = window.PAGE_NUMBER || 1;
  const rawUrl = engineName
    ? `/result/${window.JOB_ID}/${engineName}/page/${pageNumber}/raw`
    : `/result/${window.JOB_ID}/musicxml/raw`;
  const downloadUrl = engineName
    ? `/result/${window.JOB_ID}/${engineName}/page/${pageNumber}`
    : `/result/${window.JOB_ID}/musicxml`;

  try {
    const response = await fetch(rawUrl);
    if (!response.ok) {
      throw new Error(`MusicXML is not available yet: ${response.status}`);
    }

    const musicXml = await response.text();
    const osmd = new opensheetmusicdisplay.OpenSheetMusicDisplay(scoreContainer, {
      autoResize: true,
      backend: "svg",
      drawTitle: true,
    });
    await osmd.load(musicXml);
    osmd.render();
  } catch (error) {
    previewError.innerHTML = `
      <p>${error.message}</p>
      <a href="${downloadUrl}">Download MusicXML</a>
    `;
    setHidden(previewError, false);
  }
}

renderPreview();
