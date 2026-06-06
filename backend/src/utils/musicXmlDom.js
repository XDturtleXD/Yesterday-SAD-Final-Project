// Minimal, dependency-free MusicXML DOM: parse a MusicXML string into a small
// node tree and serialize it back. This is intentionally tiny — it exists so
// fullScoreService can merge several single-part scores into one multi-part
// score-partwise without pulling in a full XML library.
//
// Node shapes:
//   element: { type: "element", name, attrs: {}, children: [] }
//   text:    { type: "text", text, cdata?: true }
//
// Element names are namespace-stripped (MusicXML is unprefixed in practice).
// Insignificant whitespace-only text is dropped on parse, which is safe for
// MusicXML's element content model.

const decodeXmlEntities = (value) =>
  String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&"); // &amp; last so "&amp;lt;" round-trips correctly

const encodeXmlText = (value) =>
  String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const encodeXmlAttr = (value) => encodeXmlText(value).replace(/"/g, "&quot;");

const localName = (name) => String(name || "").split(":").pop();

const parseAttributes = (tagBody) => {
  const attrs = {};
  const attrPattern = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match;
  while ((match = attrPattern.exec(tagBody))) {
    attrs[match[1]] = decodeXmlEntities(match[2] ?? match[3] ?? "");
  }
  return attrs;
};

const parse = (xml) => {
  if (typeof xml !== "string" || xml.trim().length === 0) {
    throw new Error("MusicXML content is required");
  }

  const root = { type: "element", name: "__root__", attrs: {}, children: [] };
  const stack = [root];
  const tokenPattern =
    /<!\[CDATA\[[\s\S]*?\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!DOCTYPE[\s\S]*?>|<\/?[^>]+>|[^<]+/g;
  let match;
  while ((match = tokenPattern.exec(xml))) {
    const token = match[0];

    if (token.startsWith("<?") || token.startsWith("<!--") || token.startsWith("<!DOCTYPE")) {
      continue;
    }

    if (token.startsWith("<![CDATA[")) {
      stack[stack.length - 1].children.push({ type: "text", text: token.slice(9, -3), cdata: true });
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

const serializeNode = (node) => {
  if (!node) return "";
  if (node.type === "text") {
    return node.cdata ? `<![CDATA[${node.text}]]>` : encodeXmlText(node.text);
  }

  const attrs = Object.entries(node.attrs || {})
    .map(([key, value]) => ` ${key}="${encodeXmlAttr(value)}"`)
    .join("");

  if (!node.children || node.children.length === 0) {
    return `<${node.name}${attrs}/>`;
  }

  const inner = node.children.map(serializeNode).join("");
  return `<${node.name}${attrs}>${inner}</${node.name}>`;
};

const DEFAULT_DOCTYPE =
  "<!DOCTYPE score-partwise PUBLIC \"-//Recordare//DTD MusicXML 4.0 Partwise//EN\" \"http://www.musicxml.org/dtds/partwise.dtd\">";

const serialize = (rootElement, { doctype = DEFAULT_DOCTYPE } = {}) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n${doctype}\n${serializeNode(rootElement)}\n`;

const findChildren = (node, name) =>
  (node && node.children ? node.children : []).filter(
    (child) => child.type === "element" && child.name === name,
  );

const findChild = (node, name) => findChildren(node, name)[0] || null;

module.exports = {
  parse,
  serialize,
  serializeNode,
  findChild,
  findChildren,
  DEFAULT_DOCTYPE,
};
