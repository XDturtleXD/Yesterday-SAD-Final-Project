const DEFAULT_TITLE_RE = /^\s*(music21\s+fragment|fragment)\s*$/i;
const DEFAULT_COMPOSER_RE = /^\s*music21\s*$/i;

const SECTION_PART_NAMES = {
  first_violin: "Violin I",
  second_violin: "Violin II",
  viola: "Viola",
  cello: "Cello",
  double_bass: "Double Bass",
};

const CHINESE_SECTION_PART_NAMES = {
  小提琴第一部: "Violin I",
  小提琴第二部: "Violin II",
  中提琴: "Viola",
  大提琴: "Cello",
  低音提琴: "Double Bass",
};

const escapeXmlText = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const textContent = (value) =>
  String(value || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

const cleanText = (value) =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

const getRootOpenTagMatch = (xml) =>
  xml.match(/<score-(?:partwise|timewise)\b[^>]*>/i);

const insertAfterRootOpen = (xml, insertion) => {
  const root = getRootOpenTagMatch(xml);
  if (!root) return xml;
  const index = root.index + root[0].length;
  return `${xml.slice(0, index)}\n  ${insertion}${xml.slice(index)}`;
};

const insertBeforePartList = (xml, insertion) => {
  const partList = xml.match(/<part-list\b[^>]*>/i);
  if (!partList) return insertAfterRootOpen(xml, insertion);
  return `${xml.slice(0, partList.index)}  ${insertion}\n${xml.slice(partList.index)}`;
};

const replaceOrInsertWorkTitle = (xml, title) => {
  const escapedTitle = escapeXmlText(title);
  if (/<work-title\b[^>]*>[\s\S]*?<\/work-title>/i.test(xml)) {
    return xml.replace(
      /<work-title\b([^>]*)>[\s\S]*?<\/work-title>/i,
      `<work-title$1>${escapedTitle}</work-title>`,
    );
  }
  if (/<work\b[^>]*>[\s\S]*?<\/work>/i.test(xml)) {
    return xml.replace(/<work\b([^>]*)>/i, `<work$1>\n    <work-title>${escapedTitle}</work-title>`);
  }
  return insertAfterRootOpen(xml, `<work>\n    <work-title>${escapedTitle}</work-title>\n  </work>`);
};

const replaceOrInsertMovementTitle = (xml, title) => {
  const escapedTitle = escapeXmlText(title);
  if (/<movement-title\b[^>]*>[\s\S]*?<\/movement-title>/i.test(xml)) {
    return xml.replace(
      /<movement-title\b([^>]*)>[\s\S]*?<\/movement-title>/i,
      `<movement-title$1>${escapedTitle}</movement-title>`,
    );
  }

  const workEnd = xml.match(/<\/work>/i);
  if (workEnd) {
    const index = workEnd.index + workEnd[0].length;
    return `${xml.slice(0, index)}\n  <movement-title>${escapedTitle}</movement-title>${xml.slice(index)}`;
  }
  return insertAfterRootOpen(xml, `<movement-title>${escapedTitle}</movement-title>`);
};

const replaceOrInsertComposer = (xml, composerName) => {
  if (!composerName) {
    return xml.replace(
      /<creator\b([^>]*)\btype=(["'])composer\2([^>]*)>([\s\S]*?)<\/creator>/gi,
      (match, before, quote, after, content) =>
        DEFAULT_COMPOSER_RE.test(textContent(content)) ? "" : match,
    );
  }

  const escapedComposer = escapeXmlText(composerName);
  const composerTag = `<creator type="composer">${escapedComposer}</creator>`;
  const composerCreatorRe =
    /<creator\b([^>]*)\btype=(["'])composer\2([^>]*)>[\s\S]*?<\/creator>/i;

  if (composerCreatorRe.test(xml)) {
    return xml.replace(composerCreatorRe, composerTag);
  }
  if (/<identification\b[^>]*>[\s\S]*?<\/identification>/i.test(xml)) {
    return xml.replace(/<identification\b([^>]*)>/i, `<identification$1>\n    ${composerTag}`);
  }
  return insertBeforePartList(xml, `<identification>\n    ${composerTag}\n  </identification>`);
};

const updateCreditWords = (credit, value) =>
  credit.replace(
    /<credit-words\b([^>]*)>[\s\S]*?<\/credit-words>/i,
    `<credit-words$1>${escapeXmlText(value)}</credit-words>`,
  );

const replaceOrInsertTitleCredit = (xml, title) => {
  let replaced = false;
  const next = xml.replace(/<credit\b[^>]*>[\s\S]*?<\/credit>/gi, (credit) => {
    if (replaced || !/<credit-words\b/i.test(credit)) return credit;
    const wordsMatch = credit.match(/<credit-words\b[^>]*>([\s\S]*?)<\/credit-words>/i);
    const words = textContent(wordsMatch?.[1]);
    const isTitleCredit =
      /<credit-type\b[^>]*>\s*title\s*<\/credit-type>/i.test(credit) ||
      DEFAULT_TITLE_RE.test(words);
    if (!isTitleCredit) return credit;
    replaced = true;
    return updateCreditWords(credit, title);
  });

  if (replaced) return next;
  return insertBeforePartList(
    next,
    `<credit page="1">\n    <credit-type>title</credit-type>\n    <credit-words justify="center" valign="top">${escapeXmlText(title)}</credit-words>\n  </credit>`,
  );
};

const replaceOrInsertComposerCredit = (xml, composerName) => {
  let replaced = false;
  let next = xml.replace(/<credit\b[^>]*>[\s\S]*?<\/credit>/gi, (credit) => {
    if (!/<credit-words\b/i.test(credit)) return credit;
    const wordsMatch = credit.match(/<credit-words\b[^>]*>([\s\S]*?)<\/credit-words>/i);
    const words = textContent(wordsMatch?.[1]);
    const isComposerCredit =
      /<credit-type\b[^>]*>\s*composer\s*<\/credit-type>/i.test(credit) ||
      DEFAULT_COMPOSER_RE.test(words);

    if (!composerName) {
      return isComposerCredit && DEFAULT_COMPOSER_RE.test(words) ? "" : credit;
    }
    if (replaced || !isComposerCredit) return credit;
    replaced = true;
    return updateCreditWords(credit, composerName);
  });

  if (!composerName || replaced) return next;
  next = insertBeforePartList(
    next,
    `<credit page="1">\n    <credit-type>composer</credit-type>\n    <credit-words justify="right" valign="top">${escapeXmlText(composerName)}</credit-words>\n  </credit>`,
  );
  return next;
};

const replaceOrInsertPartNames = (xml, partName) => {
  if (!partName) return xml;
  const escapedPartName = escapeXmlText(partName);

  return xml.replace(/<score-part\b([^>]*)>[\s\S]*?<\/score-part>/i, (scorePart, attrs) => {
    let next = scorePart;
    if (/<part-name\b[^>]*>[\s\S]*?<\/part-name>/i.test(next)) {
      next = next.replace(
        /<part-name\b([^>]*)>[\s\S]*?<\/part-name>/i,
        `<part-name$1>${escapedPartName}</part-name>`,
      );
    } else {
      next = next.replace(/<score-part\b[^>]*>/i, `<score-part${attrs}>\n      <part-name>${escapedPartName}</part-name>`);
    }

    if (/<part-abbreviation\b[^>]*>[\s\S]*?<\/part-abbreviation>/i.test(next)) {
      next = next.replace(
        /<part-abbreviation\b([^>]*)>[\s\S]*?<\/part-abbreviation>/i,
        `<part-abbreviation$1>${escapedPartName}</part-abbreviation>`,
      );
    }

    next = next.replace(
      /<instrument-name\b([^>]*)>([\s\S]*?)<\/instrument-name>/gi,
      (match, instrumentAttrs, content) =>
        DEFAULT_COMPOSER_RE.test(textContent(content)) || textContent(content) === "Voice"
          ? `<instrument-name${instrumentAttrs}>${escapedPartName}</instrument-name>`
          : match,
    );

    return next;
  });
};

const resolvePartName = ({ section, scoreTitle }) => {
  const code = cleanText(section?.code);
  if (code && SECTION_PART_NAMES[code]) return SECTION_PART_NAMES[code];

  const sectionName = cleanText(section?.name);
  if (sectionName && CHINESE_SECTION_PART_NAMES[sectionName]) {
    return CHINESE_SECTION_PART_NAMES[sectionName];
  }
  if (sectionName) return sectionName;

  return cleanText(scoreTitle);
};

const normalizeMusicXmlMetadata = (
  xmlContent,
  { scoreTitle, pieceTitle, composerName, section } = {},
) => {
  if (typeof xmlContent !== "string" || !getRootOpenTagMatch(xmlContent)) {
    return xmlContent;
  }

  const title = cleanText(scoreTitle) || cleanText(pieceTitle);
  const composer = cleanText(composerName);
  const partName = resolvePartName({ section, scoreTitle });
  let xml = xmlContent;

  if (title) {
    xml = replaceOrInsertWorkTitle(xml, title);
    xml = replaceOrInsertMovementTitle(xml, title);
    xml = replaceOrInsertTitleCredit(xml, title);
  }

  xml = replaceOrInsertComposer(xml, composer);
  xml = replaceOrInsertComposerCredit(xml, composer);
  xml = replaceOrInsertPartNames(xml, partName);

  return xml;
};

module.exports = {
  normalizeMusicXmlMetadata,
  resolvePartName,
  _private: {
    escapeXmlText,
  },
};
