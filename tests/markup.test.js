const assert = require("node:assert/strict");
const test = require("node:test");

const Markup = require("../markup.js");
const Slides = require("../slides.js");

function text(nodes) {
  return nodes.map(node => (node.type === "text" ? node.value : text(node.children))).join("");
}

test("parseMarkup keeps bold, italic, underline as before", () => {
  const nodes = Markup.parseMarkup("plain **bold** *italic* __underlined__");
  assert.equal(text(nodes), "plain bold italic underlined");
  assert.equal(nodes.find(n => n.tag === "strong").children[0].value, "bold");
  assert.equal(nodes.find(n => n.tag === "em").children[0].value, "italic");
  assert.equal(nodes.find(n => n.tag === "u").children[0].value, "underlined");
});

test("parseMarkup marks a wrong part with [[...]] as a highlighted span", () => {
  const nodes = Markup.parseMarkup("그는 [[피곤해서]] 계속 일했다.");
  const mark = nodes.find(n => n.tag === "mark");
  assert.ok(mark, "expected a mark node");
  assert.equal(mark.className, "wrong-part");
  assert.equal(text(mark.children), "피곤해서");
  assert.equal(text(nodes), "그는 피곤해서 계속 일했다.");
});

test("parseMarkup supports multiple wrong-part markers in one string", () => {
  const nodes = Markup.parseMarkup("그는 [[피곤해서]] 계속 [[일을 했다]]");
  const marks = nodes.filter(n => n.tag === "mark");
  assert.equal(marks.length, 2);
  assert.equal(text(marks[0].children), "피곤해서");
  assert.equal(text(marks[1].children), "일을 했다");
});

test("parseMarkup renders dangling/unmatched delimiters as literal text instead of crashing", () => {
  const nodes = Markup.parseMarkup("broken [[ marker and *dangling star");
  assert.equal(text(nodes), "broken [[ marker and *dangling star");
});

test("parseMarkup handles an empty string", () => {
  assert.deepEqual(Markup.parseMarkup(""), []);
  assert.deepEqual(Markup.parseMarkup(undefined), []);
});

test("stripMarkup removes all markers and keeps plain text", () => {
  assert.equal(Markup.stripMarkup("그는 [[피곤해서]] **계속** 일했다."), "그는 피곤해서 계속 일했다.");
});

test("groupSentencesIntoSlides keeps every sentence in one slide by default", () => {
  const sentences = [
    { startsNewSlide: true, english: "a", model: "a", wrongAnswers: [] },
    { startsNewSlide: true, english: "b", model: "b", wrongAnswers: [] },
    { startsNewSlide: true, english: "c", model: "c", wrongAnswers: [] }
  ];
  const slides = Slides.groupSentencesIntoSlides(sentences);
  assert.equal(slides.length, 3);
  assert.equal(slides[0].sentences[0].number, 1);
  assert.equal(slides[2].sentences[0].number, 3);
});

test("groupSentencesIntoSlides merges a sentence with startsNewSlide:false into the previous slide", () => {
  const sentences = [
    { startsNewSlide: true, english: "a", model: "a", wrongAnswers: [] },
    { startsNewSlide: false, english: "b", model: "b", wrongAnswers: [] },
    { startsNewSlide: true, english: "c", model: "c", wrongAnswers: [] }
  ];
  const slides = Slides.groupSentencesIntoSlides(sentences);
  assert.equal(slides.length, 2);
  assert.equal(slides[0].sentences.length, 2);
  assert.equal(slides[0].sentences.map(s => s.number).join(","), "1,2");
  assert.equal(slides[1].sentences[0].number, 3);
});

test("groupSentencesIntoSlides treats the first sentence as a new slide regardless of its flag", () => {
  const sentences = [
    { startsNewSlide: false, english: "a", model: "a", wrongAnswers: [] },
    { startsNewSlide: true, english: "b", model: "b", wrongAnswers: [] }
  ];
  const slides = Slides.groupSentencesIntoSlides(sentences);
  assert.equal(slides.length, 2);
  assert.equal(slides[0].sentences.length, 1);
});

test("groupSentencesIntoSlides handles an empty sentence list", () => {
  assert.deepEqual(Slides.groupSentencesIntoSlides([]), []);
});

test("slideStepCount counts every wrong answer plus the model answer", () => {
  const slide = {
    sentences: [
      { wrongAnswers: [{}, {}] },
      { wrongAnswers: [{}] }
    ]
  };
  assert.equal(Slides.slideStepCount(slide), 5);
});
