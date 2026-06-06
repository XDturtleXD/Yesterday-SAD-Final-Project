const supabase = require("../config/supabase");
const AppError = require("../utils/appError");
const scoreService = require("./scoreService");

const SCORE_COLUMNS_WITH_SECTION =
  "id, project_id, piece_id, section_id, title, storage_bucket, storage_path, file_type, xml_content, sections(id, code, name)";

const DEFAULT_THRESHOLD = 0.7;
const DEFAULT_LIMIT = 10;
const MIN_SOURCE_NOTES = 4;

const ensureSupabaseReady = () => {
  if (!supabase) {
    throw new AppError("Supabase is not configured", 500);
  }
};

const decodeXmlEntities = (value) =>
  String(value || "")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

const parseAttributes = (tag) => {
  const attrs = {};
  const attrPattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = attrPattern.exec(tag))) {
    attrs[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? "");
  }
  return attrs;
};

const localName = (name) => String(name || "").split(":").pop();

const elementChildren = (node, name) =>
  node.children.filter((child) => child.name === name);

const firstElement = (node, name) => elementChildren(node, name)[0] || null;

const textContent = (node) => {
  if (!node) return "";
  return node.children
    .map((child) => (child.type === "text" ? child.text : textContent(child)))
    .join("");
};

const firstText = (node, name) => textContent(firstElement(node, name)).trim();

const parseSimpleXml = (xml) => {
  if (typeof xml !== "string" || xml.trim().length === 0) {
    throw new AppError("MusicXML content is required", 400);
  }

  const root = { type: "element", name: "__root__", attrs: {}, children: [] };
  const stack = [root];
  const tokenPattern = /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<\/?[^>]+>|[^<]+/g;
  let match;
  while ((match = tokenPattern.exec(xml))) {
    const token = match[0];
    if (
      token.startsWith("<?") ||
      token.startsWith("<!--") ||
      token.startsWith("<!DOCTYPE")
    ) {
      continue;
    }

    if (token.startsWith("<![CDATA[")) {
      stack[stack.length - 1].children.push({
        type: "text",
        text: token.slice(9, -3),
      });
      continue;
    }

    if (token.startsWith("</")) {
      const closingName = localName(token.slice(2, -1).trim());
      while (stack.length > 1) {
        const node = stack.pop();
        if (node.name === closingName) break;
      }
      continue;
    }

    if (token.startsWith("<")) {
      const selfClosing = /\/\s*>$/.test(token);
      const body = token.slice(1, selfClosing ? -2 : -1).trim();
      const spaceIndex = body.search(/\s/);
      const rawName = spaceIndex === -1 ? body : body.slice(0, spaceIndex);
      const node = {
        type: "element",
        name: localName(rawName),
        attrs: parseAttributes(body),
        children: [],
      };
      stack[stack.length - 1].children.push(node);
      if (!selfClosing) stack.push(node);
      continue;
    }

    const text = decodeXmlEntities(token);
    if (text.trim()) {
      stack[stack.length - 1].children.push({ type: "text", text });
    }
  }

  return root;
};

const midiFromPitch = ({ step, alter = 0, octave }) => {
  const semitones = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  if (!Object.prototype.hasOwnProperty.call(semitones, step)) return null;
  const octaveNumber = Number.parseInt(octave, 10);
  if (!Number.isFinite(octaveNumber)) return null;
  return (octaveNumber + 1) * 12 + semitones[step] + alter;
};

const normalizeDuration = (value) => {
  const numeric = Number.parseFloat(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
};

const extractPitchedNotes = (xml, scoreId = null) => {
  const doc = parseSimpleXml(xml);
  const parts = doc.children.flatMap((node) =>
    node.name === "score-partwise" || node.name === "score-timewise"
      ? elementChildren(node, "part")
      : [],
  );
  const notes = [];

  parts.forEach((part) => {
    const partId = part.attrs.id || "P1";
    elementChildren(part, "measure").forEach((measure, measureArrayIndex) => {
      const measureNumber = Number.parseInt(measure.attrs.number, 10);
      const contextCounters = new Map();

      elementChildren(measure, "note").forEach((note) => {
        if (firstElement(note, "rest")) return;

        const pitch = firstElement(note, "pitch");
        if (!pitch) return;

        const step = firstText(pitch, "step");
        const alter = Number.parseInt(firstText(pitch, "alter") || "0", 10);
        const octave = firstText(pitch, "octave");
        const pitchMidi = midiFromPitch({ step, alter: Number.isFinite(alter) ? alter : 0, octave });
        if (pitchMidi === null) return;

        const staff = firstText(note, "staff") || "1";
        const voice = firstText(note, "voice") || "1";
        const contextKey = `${staff}\u0000${voice}`;
        const noteIndex = contextCounters.get(contextKey) || 0;
        contextCounters.set(contextKey, noteIndex + 1);

        notes.push({
          scoreId,
          partId,
          measureNumber: Number.isFinite(measureNumber) ? measureNumber : measureArrayIndex + 1,
          measureArrayIndex,
          noteIndex,
          staff,
          voice,
          pitchMidi,
          duration: normalizeDuration(firstText(note, "duration")),
          step,
          alter: Number.isFinite(alter) ? alter : 0,
          octave,
        });
        // TODO: Chords and polyphonic voices are flattened in document order for this MVP.
      });
    });
  });

  return notes;
};

const refMatchesNote = (ref, note) => {
  if (!ref || typeof ref !== "object") return false;
  if (ref.scoreId && note.scoreId && ref.scoreId !== note.scoreId) return false;
  if (ref.partId && ref.partId !== note.partId) return false;
  if (
    ref.measureArrayIndex !== undefined &&
    Number(ref.measureArrayIndex) !== note.measureArrayIndex
  ) {
    return false;
  }
  if (
    ref.measureArrayIndex === undefined &&
    ref.measureNumber !== undefined &&
    Number(ref.measureNumber) !== note.measureNumber
  ) {
    return false;
  }
  if (ref.noteIndex !== undefined && Number(ref.noteIndex) !== note.noteIndex) return false;
  if (ref.staff && String(ref.staff) !== note.staff) return false;
  if (ref.voice && String(ref.voice) !== note.voice) return false;
  return true;
};

const extractRange = (notes, sourceRange) => {
  const startIndex = notes.findIndex((note) => refMatchesNote(sourceRange?.startRef, note));
  const endIndex = notes.findIndex((note) => refMatchesNote(sourceRange?.endRef, note));

  if (startIndex < 0 || endIndex < 0) {
    throw new AppError("Source range notes could not be found in score", 400);
  }

  const from = Math.min(startIndex, endIndex);
  const to = Math.max(startIndex, endIndex);
  const segment = notes.slice(from, to + 1);
  if (segment.length < MIN_SOURCE_NOTES) {
    throw new AppError(
      `Source range is too short; select at least ${MIN_SOURCE_NOTES} pitched notes`,
      400,
    );
  }

  return segment;
};

const intervals = (notes) =>
  notes.slice(1).map((note, index) => note.pitchMidi - notes[index].pitchMidi);

const contours = (intervalValues) =>
  intervalValues.map((value) => (value > 0 ? "up" : value < 0 ? "down" : "same"));

const rhythmRatios = (notes) =>
  notes.slice(1).map((note, index) => {
    const previous = notes[index].duration || 1;
    return (note.duration || 1) / previous;
  });

const intervalSimilarity = (a, b) => {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  const contourA = contours(a);
  const contourB = contours(b);
  const scores = a.map((value, index) => {
    if (value === b[index]) return 1;
    if (contourA[index] === contourB[index]) return 0.72;
    return 0;
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
};

const rhythmSimilarity = (a, b) => {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 1;
  const scores = a.map((value, index) => {
    const max = Math.max(value, b[index]);
    const min = Math.min(value, b[index]);
    if (max <= 0) return 1;
    return min / max;
  });
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
};

const scoreSegments = (sourceNotes, targetNotes) => {
  const sourceIntervals = intervals(sourceNotes);
  const sourceRhythms = rhythmRatios(sourceNotes);
  const targetIntervals = intervals(targetNotes);
  const targetRhythms = rhythmRatios(targetNotes);
  const intervalScore = intervalSimilarity(sourceIntervals, targetIntervals);
  const rhythmScore = rhythmSimilarity(sourceRhythms, targetRhythms);
  const similarity = intervalScore * 0.7 + rhythmScore * 0.3;

  return { similarity, intervalScore, rhythmScore };
};

const noteRef = (note) => ({
  scoreId: note.scoreId,
  partId: note.partId,
  measureNumber: note.measureNumber,
  measureArrayIndex: note.measureArrayIndex,
  noteIndex: note.noteIndex,
  staff: note.staff,
  voice: note.voice,
});

const findSimilarInScore = (sourceNotes, targetScore, { threshold = DEFAULT_THRESHOLD } = {}) => {
  const targetNotes = extractPitchedNotes(targetScore.xml_content, targetScore.id);
  if (targetNotes.length < sourceNotes.length) return [];

  const candidates = [];
  const windowLength = sourceNotes.length;
  for (let index = 0; index <= targetNotes.length - windowLength; index += 1) {
    const windowNotes = targetNotes.slice(index, index + windowLength);
    const scores = scoreSegments(sourceNotes, windowNotes);
    if (scores.similarity < threshold) continue;

    const start = windowNotes[0];
    const end = windowNotes[windowNotes.length - 1];
    candidates.push({
      targetScoreId: targetScore.id,
      targetSectionId: targetScore.section_id,
      targetSectionName: targetScore.section_name || targetScore.section?.name || null,
      startRef: noteRef(start),
      endRef: noteRef(end),
      startMeasureNumber: start.measureNumber,
      endMeasureNumber: end.measureNumber,
      similarity: Number(scores.similarity.toFixed(4)),
      intervalScore: Number(scores.intervalScore.toFixed(4)),
      rhythmScore: Number(scores.rhythmScore.toFixed(4)),
      noteCount: windowNotes.length,
    });
  }

  return candidates;
};

const MIN_SCAN_SOURCE_NOTES = 8;
const DEFAULT_SCAN_THRESHOLD = 0.78;
const DEFAULT_SCAN_WINDOW_SIZES = [8, 12, 16];
const DEFAULT_SCAN_LIMIT_PER_WINDOW = 1;
const DEFAULT_SCAN_MAX_HIGHLIGHTS = 20;

const normalizeScanOptions = (body = {}) => {
  const threshold =
    typeof body.threshold === "number" && Number.isFinite(body.threshold)
      ? Math.min(Math.max(body.threshold, 0), 1)
      : DEFAULT_SCAN_THRESHOLD;
  const windowSizes = Array.isArray(body.windowSizes)
    ? body.windowSizes.filter((n) => Number.isFinite(n) && n > 0).map((n) => Math.floor(n))
    : DEFAULT_SCAN_WINDOW_SIZES;
  const limitPerWindow =
    typeof body.limitPerWindow === "number" && Number.isFinite(body.limitPerWindow)
      ? Math.min(Math.max(Math.floor(body.limitPerWindow), 1), 10)
      : DEFAULT_SCAN_LIMIT_PER_WINDOW;
  const maxHighlights =
    typeof body.maxHighlights === "number" && Number.isFinite(body.maxHighlights)
      ? Math.min(Math.max(Math.floor(body.maxHighlights), 1), 100)
      : DEFAULT_SCAN_MAX_HIGHLIGHTS;
  const targetSectionIds = Array.isArray(body.targetSectionIds)
    ? body.targetSectionIds.filter((value) => typeof value === "string" && value.trim())
    : null;
  return { threshold, windowSizes, limitPerWindow, maxHighlights, targetSectionIds };
};

const sourceRangeOverlapRatio = (a, b) => {
  const overlapStart = Math.max(a.sourceStartMeasureNumber, b.sourceStartMeasureNumber);
  const overlapEnd = Math.min(a.sourceEndMeasureNumber, b.sourceEndMeasureNumber);
  const overlapLength = Math.max(0, overlapEnd - overlapStart + 1);
  const aLength = a.sourceEndMeasureNumber - a.sourceStartMeasureNumber + 1;
  const bLength = b.sourceEndMeasureNumber - b.sourceStartMeasureNumber + 1;
  const minLength = Math.min(aLength, bLength);
  return minLength > 0 ? overlapLength / minLength : 0;
};

const pruneScanHighlights = (highlights) => {
  const sorted = [...highlights].sort((a, b) => {
    const simDiff = b.similarity - a.similarity;
    if (Math.abs(simDiff) > 0.0001) return simDiff;
    return b.noteCount - a.noteCount;
  });
  const kept = [];
  for (const candidate of sorted) {
    const overlapsExisting = kept.some(
      (existing) => sourceRangeOverlapRatio(candidate, existing) >= 0.6,
    );
    if (!overlapsExisting) {
      kept.push(candidate);
    }
  }
  return kept;
};

const measureRangeOverlapRatio = (aStart, aEnd, bStart, bEnd) => {
  const overlapStart = Math.max(aStart, bStart);
  const overlapEnd = Math.min(aEnd, bEnd);
  const overlapLength = Math.max(0, overlapEnd - overlapStart + 1);
  const aLength = aEnd - aStart + 1;
  const bLength = bEnd - bStart + 1;
  const minLength = Math.min(aLength, bLength);
  return minLength > 0 ? overlapLength / minLength : 0;
};

const globalRangeOverlapRatio = (a, b) => {
  if (a.leftScoreId !== b.leftScoreId || a.rightScoreId !== b.rightScoreId) return 0;
  const leftOverlap = measureRangeOverlapRatio(
    a.leftStartMeasureNumber,
    a.leftEndMeasureNumber,
    b.leftStartMeasureNumber,
    b.leftEndMeasureNumber,
  );
  const rightOverlap = measureRangeOverlapRatio(
    a.rightStartMeasureNumber,
    a.rightEndMeasureNumber,
    b.rightStartMeasureNumber,
    b.rightEndMeasureNumber,
  );
  return Math.min(leftOverlap, rightOverlap);
};

const pruneGlobalScanHighlights = (highlights) => {
  const sorted = [...highlights].sort((a, b) => {
    const simDiff = b.similarity - a.similarity;
    if (Math.abs(simDiff) > 0.0001) return simDiff;
    return b.noteCount - a.noteCount;
  });
  const kept = [];
  for (const candidate of sorted) {
    const overlapsExisting = kept.some(
      (existing) => globalRangeOverlapRatio(candidate, existing) >= 0.6,
    );
    if (!overlapsExisting) {
      kept.push(candidate);
    }
  }
  return kept;
};

const normalizeSearchOptions = (body = {}) => {
  const threshold =
    typeof body.threshold === "number" && Number.isFinite(body.threshold)
      ? Math.min(Math.max(body.threshold, 0), 1)
      : DEFAULT_THRESHOLD;
  const limit =
    typeof body.limit === "number" && Number.isFinite(body.limit)
      ? Math.min(Math.max(Math.floor(body.limit), 1), 50)
      : DEFAULT_LIMIT;
  const targetSectionIds = Array.isArray(body.targetSectionIds)
    ? body.targetSectionIds.filter((value) => typeof value === "string" && value.trim())
    : null;

  return { threshold, limit, targetSectionIds };
};

const listPieceScoresWithXml = async (sourceScore, membership, targetSectionIds) => {
  ensureSupabaseReady();

  let query = supabase
    .from("scores")
    .select(SCORE_COLUMNS_WITH_SECTION)
    .eq("project_id", sourceScore.project_id)
    .eq("piece_id", sourceScore.piece_id)
    .order("created_at", { ascending: true });

  if (targetSectionIds && targetSectionIds.length > 0) {
    query = query.in("section_id", targetSectionIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError("Failed to fetch piece scores", 500, error);
  }

  return (data || [])
    .filter((score) => score.id !== sourceScore.id)
    .filter((score) => score.xml_content && scoreService.canViewScore(score, membership))
    .map((score) => ({
      ...score,
      section_name: score.sections?.name || null,
    }));
};

const listProjectPieceScoresWithXml = async (projectId, pieceId, membership, targetSectionIds) => {
  ensureSupabaseReady();

  let query = supabase
    .from("scores")
    .select(SCORE_COLUMNS_WITH_SECTION)
    .eq("project_id", projectId)
    .eq("piece_id", pieceId)
    .order("created_at", { ascending: true });

  if (targetSectionIds && targetSectionIds.length > 0) {
    query = query.in("section_id", targetSectionIds);
  }

  const { data, error } = await query;
  if (error) {
    throw new AppError("Failed to fetch piece scores", 500, error);
  }

  return (data || [])
    .filter((score) => score.xml_content && scoreService.canViewScore(score, membership))
    .map((score) => ({
      ...score,
      section_name: score.sections?.name || null,
    }));
};

const findSimilarPassages = async (sourceScore, membership, body = {}) => {
  scoreService.assertCanViewScore(sourceScore, membership);
  if (!sourceScore.xml_content) {
    throw new AppError("Source score does not have inline MusicXML content", 400);
  }

  const { threshold, limit, targetSectionIds } = normalizeSearchOptions(body);
  const sourceNotes = extractPitchedNotes(sourceScore.xml_content, sourceScore.id);
  const sourceSegment = extractRange(sourceNotes, body.sourceRange);
  const targetScores = await listPieceScoresWithXml(sourceScore, membership, targetSectionIds);
  const candidates = targetScores.flatMap((targetScore) =>
    findSimilarInScore(sourceSegment, targetScore, { threshold }),
  );

  return candidates
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
};

const scanSourceScoreAgainstTargets = (
  sourceScore,
  targetScores,
  { threshold, windowSizes, limitPerWindow },
) => {
  const sourceNotes = extractPitchedNotes(sourceScore.xml_content, sourceScore.id);

  if (sourceNotes.length < MIN_SCAN_SOURCE_NOTES) {
    return [];
  }

  if (targetScores.length === 0) return [];

  const targetNotesCache = new Map(
    targetScores.map((t) => [t.id, extractPitchedNotes(t.xml_content, t.id)]),
  );

  const allHighlights = [];

  for (const windowSize of windowSizes) {
    if (windowSize > sourceNotes.length) continue;

    for (let i = 0; i <= sourceNotes.length - windowSize; i++) {
      const sourceWindow = sourceNotes.slice(i, i + windowSize);
      const sourceStart = sourceWindow[0];
      const sourceEnd = sourceWindow[windowSize - 1];

      for (const targetScore of targetScores) {
        const targetNotes = targetNotesCache.get(targetScore.id);
        if (!targetNotes || targetNotes.length < windowSize) continue;

        const windowCandidates = [];
        for (let j = 0; j <= targetNotes.length - windowSize; j++) {
          const targetWindow = targetNotes.slice(j, j + windowSize);
          const scores = scoreSegments(sourceWindow, targetWindow);
          if (scores.similarity < threshold) continue;
          windowCandidates.push({ targetWindow, scores });
        }

        windowCandidates.sort((a, b) => b.scores.similarity - a.scores.similarity);
        const best = windowCandidates.slice(0, limitPerWindow);

        for (const { targetWindow, scores } of best) {
          const targetStart = targetWindow[0];
          const targetEnd = targetWindow[windowSize - 1];
          allHighlights.push({
            sourceScoreId: sourceScore.id,
            sourceStartRef: noteRef(sourceStart),
            sourceEndRef: noteRef(sourceEnd),
            sourceStartMeasureNumber: sourceStart.measureNumber,
            sourceEndMeasureNumber: sourceEnd.measureNumber,
            targetScoreId: targetScore.id,
            targetSectionId: targetScore.section_id,
            targetSectionName: targetScore.section_name || null,
            targetStartRef: noteRef(targetStart),
            targetEndRef: noteRef(targetEnd),
            targetStartMeasureNumber: targetStart.measureNumber,
            targetEndMeasureNumber: targetEnd.measureNumber,
            similarity: Number(scores.similarity.toFixed(4)),
            intervalScore: Number(scores.intervalScore.toFixed(4)),
            rhythmScore: Number(scores.rhythmScore.toFixed(4)),
            noteCount: windowSize,
          });
        }
      }
    }
  }

  return allHighlights;
};

const scanWholeScoreSimilarPassages = async (sourceScore, membership, body = {}) => {
  scoreService.assertCanViewScore(sourceScore, membership);
  if (!sourceScore.xml_content) {
    throw new AppError("Source score does not have inline MusicXML content", 400);
  }

  const { threshold, windowSizes, limitPerWindow, maxHighlights, targetSectionIds } =
    normalizeScanOptions(body);
  const targetScores = await listPieceScoresWithXml(sourceScore, membership, targetSectionIds);
  const allHighlights = scanSourceScoreAgainstTargets(sourceScore, targetScores, {
    threshold,
    windowSizes,
    limitPerWindow,
  });

  const pruned = pruneScanHighlights(allHighlights);
  return pruned.slice(0, maxHighlights);
};

const toGlobalHighlight = (highlight, leftScore, rightScore) => ({
  leftScoreId: highlight.sourceScoreId,
  leftSectionId: leftScore.section_id,
  leftSectionName: leftScore.section_name || null,
  leftStartMeasureNumber: highlight.sourceStartMeasureNumber,
  leftEndMeasureNumber: highlight.sourceEndMeasureNumber,
  leftStartRef: highlight.sourceStartRef,
  leftEndRef: highlight.sourceEndRef,
  rightScoreId: highlight.targetScoreId,
  rightSectionId: rightScore.section_id,
  rightSectionName: rightScore.section_name || null,
  rightStartMeasureNumber: highlight.targetStartMeasureNumber,
  rightEndMeasureNumber: highlight.targetEndMeasureNumber,
  rightStartRef: highlight.targetStartRef,
  rightEndRef: highlight.targetEndRef,
  similarity: highlight.similarity,
  intervalScore: highlight.intervalScore,
  rhythmScore: highlight.rhythmScore,
  noteCount: highlight.noteCount,
});

const scanPieceSimilarPassages = async (projectId, pieceId, membership, body = {}) => {
  const { threshold, windowSizes, limitPerWindow, maxHighlights, targetSectionIds } =
    normalizeScanOptions(body);
  const scores = await listProjectPieceScoresWithXml(
    projectId,
    pieceId,
    membership,
    targetSectionIds,
  );

  if (scores.length < 2) return [];

  const allHighlights = [];
  for (let i = 0; i < scores.length - 1; i += 1) {
    const leftScore = scores[i];
    if (!leftScore.xml_content) continue;

    for (let j = i + 1; j < scores.length; j += 1) {
      const rightScore = scores[j];
      if (!rightScore.xml_content) continue;

      const pairHighlights = scanSourceScoreAgainstTargets(leftScore, [rightScore], {
        threshold,
        windowSizes,
        limitPerWindow,
      });
      for (const highlight of pairHighlights) {
        allHighlights.push(toGlobalHighlight(highlight, leftScore, rightScore));
      }
    }
  }

  return pruneGlobalScanHighlights(allHighlights).slice(0, maxHighlights);
};

module.exports = {
  findSimilarPassages,
  scanWholeScoreSimilarPassages,
  scanPieceSimilarPassages,
  _helpers: {
    extractPitchedNotes,
    extractRange,
    scoreSegments,
    findSimilarInScore,
    intervals,
    rhythmRatios,
    MIN_SOURCE_NOTES,
    normalizeScanOptions,
    sourceRangeOverlapRatio,
    pruneScanHighlights,
    measureRangeOverlapRatio,
    globalRangeOverlapRatio,
    pruneGlobalScanHighlights,
    MIN_SCAN_SOURCE_NOTES,
  },
};
