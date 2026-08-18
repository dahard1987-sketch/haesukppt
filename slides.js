(function attachSlides(root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Slides = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createSlides() {
  "use strict";

  function groupSentencesIntoSlides(sentences) {
    const list = Array.isArray(sentences) ? sentences : [];
    const slides = [];

    list.forEach((sentence, index) => {
      const beginsSlide = index === 0 || sentence.startsNewSlide !== false;
      if (beginsSlide || slides.length === 0) {
        slides.push({ sentences: [] });
      }
      slides[slides.length - 1].sentences.push({ ...sentence, number: index + 1 });
    });

    return slides;
  }

  function slideStepCount(slide) {
    return slide.sentences.reduce((sum, sentence) => sum + sentence.wrongAnswers.length + 1, 0);
  }

  return Object.freeze({
    groupSentencesIntoSlides,
    slideStepCount
  });
});
