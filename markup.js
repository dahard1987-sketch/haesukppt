(function attachMarkup(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Markup = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createMarkup() {
  "use strict";

  const MARKUP_RULES = [
    { open: "**", close: "**", tag: "strong" },
    { open: "__", close: "__", tag: "u" },
    { open: "[[", close: "]]", tag: "mark", className: "wrong-part" },
    { open: "*", close: "*", tag: "em" }
  ];

  function findToken(text, token, fromIndex) {
    let index = text.indexOf(token, fromIndex);

    while (index !== -1 && token === "*") {
      const touchesAnotherAsterisk = text[index - 1] === "*" || text[index + 1] === "*";
      if (!touchesAnotherAsterisk) break;
      index = text.indexOf(token, index + 1);
    }

    return index;
  }

  function findNextMarkup(text, fromIndex) {
    let next = null;

    MARKUP_RULES.forEach(rule => {
      const start = findToken(text, rule.open, fromIndex);
      if (start === -1) return;

      const contentStart = start + rule.open.length;
      const end = findToken(text, rule.close, contentStart);
      if (end <= contentStart) return;

      if (
        !next ||
        start < next.start ||
        (start === next.start && rule.open.length > next.rule.open.length)
      ) {
        next = { rule, start, contentStart, end };
      }
    });

    return next;
  }

  function parseSegment(text) {
    const nodes = [];
    let cursor = 0;

    while (cursor < text.length) {
      const token = findNextMarkup(text, cursor);
      if (!token) {
        nodes.push({ type: "text", value: text.slice(cursor) });
        break;
      }

      if (token.start > cursor) {
        nodes.push({ type: "text", value: text.slice(cursor, token.start) });
      }

      nodes.push({
        type: "element",
        tag: token.rule.tag,
        className: token.rule.className || null,
        children: parseSegment(text.slice(token.contentStart, token.end))
      });

      cursor = token.end + token.rule.close.length;
    }

    return nodes;
  }

  function parseMarkup(source) {
    return parseSegment(String(source ?? ""));
  }

  function appendNodes(parent, nodes) {
    nodes.forEach(node => {
      if (node.type === "text") {
        parent.appendChild(document.createTextNode(node.value));
        return;
      }
      const element = document.createElement(node.tag);
      if (node.className) element.className = node.className;
      appendNodes(element, node.children);
      parent.appendChild(element);
    });
  }

  function renderInline(parent, source) {
    parent.replaceChildren();
    appendNodes(parent, parseMarkup(source));
  }

  function stripMarkup(source) {
    const text = String(source ?? "");
    let result = "";
    let cursor = 0;

    while (cursor < text.length) {
      const token = findNextMarkup(text, cursor);
      if (!token) {
        result += text.slice(cursor);
        break;
      }
      result += text.slice(cursor, token.start);
      result += stripMarkup(text.slice(token.contentStart, token.end));
      cursor = token.end + token.rule.close.length;
    }

    return result;
  }

  return Object.freeze({
    parseMarkup,
    renderInline,
    stripMarkup
  });
});
