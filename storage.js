(function attachStorage(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Storage = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createStorage() {
  "use strict";

  const DRAFT_KEY = "review-slide-studio-draft-v2";
  const DATA_VERSION = 2;

  function createId(prefix) {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
    return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function createEmptySentence(overrides = {}) {
    return {
      id: createId("sentence"),
      startsNewSlide: true,
      english: "",
      model: "",
      ...overrides
    };
  }

  function createEmptyStudent(overrides = {}) {
    return {
      id: createId("student"),
      name: "",
      answers: {},
      ...overrides
    };
  }

  function createEmptyLesson() {
    return {
      version: DATA_VERSION,
      updatedAt: new Date().toISOString(),
      sentences: [],
      students: []
    };
  }

  function sanitizeSentence(raw) {
    if (!raw || typeof raw !== "object") return createEmptySentence();
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : createId("sentence"),
      startsNewSlide: raw.startsNewSlide !== false,
      english: typeof raw.english === "string" ? raw.english : "",
      model: typeof raw.model === "string" ? raw.model : ""
    };
  }

  function sanitizeAnswer(raw) {
    if (!raw || typeof raw !== "object") return null;
    const text = typeof raw.text === "string" ? raw.text : "";
    const comment = typeof raw.comment === "string" ? raw.comment : "";
    if (!text && !comment) return null;
    return { text, comment };
  }

  function sanitizeStudent(raw) {
    if (!raw || typeof raw !== "object") return createEmptyStudent();
    const answers = {};
    if (raw.answers && typeof raw.answers === "object") {
      Object.keys(raw.answers).forEach(sentenceId => {
        const answer = sanitizeAnswer(raw.answers[sentenceId]);
        if (answer) answers[sentenceId] = answer;
      });
    }
    return {
      id: typeof raw.id === "string" && raw.id ? raw.id : createId("student"),
      name: typeof raw.name === "string" ? raw.name : "",
      answers
    };
  }

  function sanitizeLesson(raw) {
    if (!raw || typeof raw !== "object") return createEmptyLesson();
    return {
      version: DATA_VERSION,
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
      sentences: Array.isArray(raw.sentences) ? raw.sentences.map(sanitizeSentence) : [],
      students: Array.isArray(raw.students) ? raw.students.map(sanitizeStudent) : []
    };
  }

  function readJSON(key) {
    try {
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      return null;
    }
  }

  function writeJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      // Private browsing can disable storage; caller keeps working in-memory.
      return false;
    }
  }

  function loadDraft() {
    return sanitizeLesson(readJSON(DRAFT_KEY));
  }

  function saveDraft(lesson) {
    return writeJSON(DRAFT_KEY, sanitizeLesson(lesson));
  }

  return Object.freeze({
    DRAFT_KEY,
    createId,
    createEmptySentence,
    createEmptyStudent,
    createEmptyLesson,
    sanitizeLesson,
    loadDraft,
    saveDraft
  });
});
