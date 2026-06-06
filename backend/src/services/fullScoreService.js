// Builds a conductor's full score by combining every section's part for a piece
// into a single multi-part score-partwise MusicXML. The combination is done on
// the fly (nothing is persisted): per-section scores are parsed, their parts are
// re-id'd to avoid collisions, renamed to their section, and merged under one
// part-list. Cross-instrument similarity hints are computed separately by
// melodySimilarityService and attached by the controller.

const supabase = require("../config/supabase");
const AppError = require("../utils/appError");
const scoreService = require("./scoreService");
const dom = require("../utils/musicXmlDom");

const ensureSupabaseReady = () => {
  if (!supabase) {
    throw new AppError("Supabase is not configured", 500);
  }
};

const findScorePartwise = (root) =>
  (root.children || []).find(
    (child) => child.type === "element" && child.name === "score-partwise",
  ) || null;

// Re-id a part subtree: rewrite `id` attributes that are exactly `oldId` or that
// are prefixed by `oldId-` (e.g. score-instrument id "P1-I1" → "P3-I1"). This
// keeps score-part ↔ part ↔ instrument references internally consistent after
// the part is renumbered in the merged document.
const remapIds = (node, oldId, newId) => {
  if (!node || node.type !== "element") return;
  const id = node.attrs && node.attrs.id;
  if (typeof id === "string") {
    if (id === oldId) {
      node.attrs.id = newId;
    } else if (id.startsWith(`${oldId}-`)) {
      node.attrs.id = `${newId}${id.slice(oldId.length)}`;
    }
  }
  (node.children || []).forEach((child) => remapIds(child, oldId, newId));
};

const setElementText = (parent, childName, text) => {
  let element = dom.findChild(parent, childName);
  if (!element) {
    element = { type: "element", name: childName, attrs: {}, children: [] };
    parent.children.unshift(element);
  }
  element.children = [{ type: "text", text }];
};

// Pure: combine [{ scoreId, sectionId, sectionName, sectionCode, xml }] (already
// in the desired part order) into one score-partwise. Returns the merged XML
// string plus a parts mapping so the frontend can locate each score's part.
const combineScoresIntoFullScore = (scoresInOrder, options = {}) => {
  const workTitle = options.workTitle || "Full Score";

  let base = null; // first successfully-parsed score-partwise (header donor)
  const mergedScoreParts = [];
  const mergedParts = [];
  const parts = [];

  for (const entry of scoresInOrder) {
    let root;
    try {
      root = dom.parse(entry.xml);
    } catch {
      continue; // skip unparseable scores rather than failing the whole export
    }

    const scorePartwise = findScorePartwise(root);
    if (!scorePartwise) continue;

    const partList = dom.findChild(scorePartwise, "part-list");
    const scoreParts = partList ? dom.findChildren(partList, "score-part") : [];
    const partElements = dom.findChildren(scorePartwise, "part");
    if (scoreParts.length === 0 || partElements.length === 0) continue;

    if (!base) base = scorePartwise;

    for (const scorePart of scoreParts) {
      const oldId = scorePart.attrs.id;
      const partElement = partElements.find((part) => part.attrs.id === oldId);
      if (!partElement) continue;

      const newId = `P${parts.length + 1}`;
      remapIds(scorePart, oldId, newId);
      remapIds(partElement, oldId, newId);
      scorePart.attrs.id = newId;
      partElement.attrs.id = newId;

      const label = entry.sectionName || `Part ${parts.length + 1}`;
      setElementText(scorePart, "part-name", label);
      if (dom.findChild(scorePart, "part-abbreviation")) {
        setElementText(scorePart, "part-abbreviation", label);
      }

      mergedScoreParts.push(scorePart);
      mergedParts.push(partElement);
      parts.push({
        scoreId: entry.scoreId,
        sectionId: entry.sectionId,
        sectionName: entry.sectionName || null,
        sectionCode: entry.sectionCode || null,
        partId: newId,
        partIndex: parts.length,
      });
    }
  }

  if (!base || mergedParts.length === 0) {
    throw new AppError("No combinable MusicXML parts were found for this piece", 422);
  }

  const out = {
    type: "element",
    name: "score-partwise",
    attrs: { version: base.attrs.version || "4.0" },
    children: [],
  };

  out.children.push({
    type: "element",
    name: "work",
    attrs: {},
    children: [
      { type: "element", name: "work-title", attrs: {}, children: [{ type: "text", text: workTitle }] },
    ],
  });
  out.children.push({
    type: "element",
    name: "movement-title",
    attrs: {},
    children: [{ type: "text", text: workTitle }],
  });

  // Reuse the donor score's identification + defaults so the merged score keeps
  // sane page scaling/layout when rendered.
  const identification = dom.findChild(base, "identification");
  if (identification) out.children.push(identification);
  const defaults = dom.findChild(base, "defaults");
  if (defaults) out.children.push(defaults);

  out.children.push({ type: "element", name: "part-list", attrs: {}, children: mergedScoreParts });
  mergedParts.forEach((part) => out.children.push(part));

  return { xml: dom.serialize(out), parts };
};

const buildPieceFullScore = async (projectId, pieceId, membership) => {
  ensureSupabaseReady();

  const { data: piece, error: pieceError } = await supabase
    .from("pieces")
    .select("id, project_id, title, composer")
    .eq("id", pieceId)
    .maybeSingle();
  if (pieceError) {
    throw new AppError("Failed to fetch piece", 500, pieceError);
  }
  if (!piece || piece.project_id !== projectId) {
    throw new AppError("Piece not found in this project", 404);
  }

  const { data, error } = await supabase
    .from("scores")
    .select(
      "id, project_id, piece_id, section_id, title, xml_content, sections(id, code, name, sort_order)",
    )
    .eq("project_id", projectId)
    .eq("piece_id", pieceId);
  if (error) {
    throw new AppError("Failed to fetch piece scores", 500, error);
  }

  const viewable = (data || [])
    .filter((score) => score.xml_content && scoreService.canViewScore(score, membership))
    .map((score) => ({
      scoreId: score.id,
      sectionId: score.section_id,
      sectionName: score.sections?.name || null,
      sectionCode: score.sections?.code || null,
      sortOrder: Number.isFinite(score.sections?.sort_order) ? score.sections.sort_order : 0,
      xml: score.xml_content,
    }))
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder ||
        String(a.sectionName || "").localeCompare(String(b.sectionName || "")),
    );

  if (viewable.length === 0) {
    throw new AppError("No viewable MusicXML scores found for this piece", 404);
  }

  const { xml, parts } = combineScoresIntoFullScore(viewable, { workTitle: piece.title });

  return {
    pieceId: piece.id,
    pieceTitle: piece.title,
    composer: piece.composer || null,
    xml,
    parts,
  };
};

module.exports = {
  buildPieceFullScore,
  _helpers: {
    combineScoresIntoFullScore,
    remapIds,
    findScorePartwise,
  },
};
