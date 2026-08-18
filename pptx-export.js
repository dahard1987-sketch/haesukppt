(() => {
  "use strict";

  const COLOR = {
    ink: "111318",
    muted: "808795",
    accent: "C4171D",
    accentSoft: "FBEAEC",
    correct: "1A7A4C",
    correctSoft: "DFF3E7"
  };

  const SLIDE_W = 13.33;
  const SLIDE_H = 7.5;
  const MARGIN_X = 0.9;
  const CONTENT_W = SLIDE_W - MARGIN_X * 2;
  const BODY_W = CONTENT_W - 0.22;
  const TOP_Y = 0.7;
  const BOTTOM_Y = 6.9;

  // A sentence can accumulate one wrong answer per student -- with a full
  // class that can be a lot. Rather than growing the slide forever, only
  // this many are ever shown on screen at once: once a batch of this size
  // has been revealed, the next click clears the slate and starts a fresh
  // batch from there, instead of rolling old ones off one at a time.
  const MAX_VISIBLE_WRONG = 5;

  // Real point/inch text metrics, not guessed character-per-line ratios.
  // Korean (Malgun Gothic) glyphs are close to full-width (~1em advance);
  // treating them as narrower than that is what previously caused text to
  // wrap onto more lines than the box was sized for, and overlap the
  // element below it. Better to slightly over-estimate line count (a bit
  // of extra whitespace) than under-estimate it (overlapping text).
  const PT_TO_IN = 1 / 72;
  const LINE_HEIGHT_MULT = 1.3;
  const CHAR_WIDTH_RATIO = { latinBold: 0.62, korean: 1.0 };

  const FONT = { english: 26, label: 11, body: 18, comment: 13 };
  const FONT_FLOOR = { english: 15, label: 9, body: 12, comment: 9 };

  // Gaps are explicit offsets applied when positioning the next element, not
  // padding folded silently into a box's own height (that was the earlier
  // bug: the "gap" was reserved but never actually used to push anything
  // down, so text ended up flush against text with no visible breathing room).
  const HEADER_GAP = 0.05; // label/number -> its own body text
  const COMMENT_GAP = 0.08; // wrong-answer body -> its comment
  const ROW_GAP = 0.2; // space after one row before the next begins

  function lineHeightIn(fontPt) {
    return fontPt * LINE_HEIGHT_MULT * PT_TO_IN;
  }

  function charsPerLine(boxWidthIn, fontPt, widthRatio) {
    return Math.max(6, Math.floor(boxWidthIn / (fontPt * PT_TO_IN * widthRatio)));
  }

  function scaledFont(base, floor, scale) {
    return Math.max(floor, Math.round(base * scale));
  }

  function flattenMarkup(nodes, style) {
    let runs = [];
    nodes.forEach(node => {
      if (node.type === "text") {
        if (node.value) runs.push({ text: node.value, style: { ...style } });
        return;
      }
      const nextStyle = { ...style };
      if (node.tag === "strong") nextStyle.bold = true;
      if (node.tag === "em") nextStyle.italic = true;
      if (node.tag === "u") nextStyle.underline = true;
      if (node.tag === "mark" && node.className === "wrong-part") {
        nextStyle.wrongPart = true;
      }
      runs = runs.concat(flattenMarkup(node.children, nextStyle));
    });
    return runs;
  }

  function textToRuns(text, baseOptions) {
    const tree = window.Markup.parseMarkup(text);
    const flat = flattenMarkup(tree, {});
    const runs = flat.length ? flat : [{ text: "", style: {} }];
    return runs.map(run => {
      const options = { ...baseOptions };
      if (run.style.bold) options.bold = true;
      if (run.style.italic) options.italic = true;
      if (run.style.underline) options.underline = { style: "sng" };
      if (run.style.wrongPart) {
        options.color = COLOR.accent;
        options.strike = "sngStrike";
        options.highlight = COLOR.accentSoft;
      }
      return { text: run.text, options };
    });
  }

  function estimateLines(text, cpl) {
    const plain = window.Markup.stripMarkup(text || "");
    if (!plain) return 1;
    return Math.max(1, Math.ceil(plain.length / cpl));
  }

  // Measures how tall an english-sentence row needs to be at a given scale.
  function measureEnglish(text, scale) {
    const fontPt = scaledFont(FONT.english, FONT_FLOOR.english, scale);
    const lines = estimateLines(text, charsPerLine(CONTENT_W, fontPt, CHAR_WIDTH_RATIO.latinBold));
    const numberH = 0.3 * scale;
    const headerGap = HEADER_GAP * scale;
    const bodyH = lines * lineHeightIn(fontPt);
    return { fontPt, lines, numberH, headerGap, bodyH, total: numberH + headerGap + bodyH + ROW_GAP * scale };
  }

  // Measures an answer block (label + body + optional comment) at a given scale.
  function measureAnswerBlock(bodyText, comment, scale) {
    const labelH = 0.28 * scale;
    const headerGap = HEADER_GAP * scale;
    const bodyFontPt = scaledFont(FONT.body, FONT_FLOOR.body, scale);
    const bodyLines = estimateLines(bodyText, charsPerLine(BODY_W, bodyFontPt, CHAR_WIDTH_RATIO.korean));
    const bodyH = bodyLines * lineHeightIn(bodyFontPt);

    let commentFontPt = 0;
    let commentGap = 0;
    let commentH = 0;
    if (comment) {
      commentFontPt = scaledFont(FONT.comment, FONT_FLOOR.comment, scale);
      const commentLines = estimateLines(comment, charsPerLine(BODY_W, commentFontPt, CHAR_WIDTH_RATIO.korean));
      commentGap = COMMENT_GAP * scale;
      commentH = commentLines * lineHeightIn(commentFontPt);
    }

    return {
      bodyFontPt,
      commentFontPt,
      labelH,
      headerGap,
      bodyH,
      commentGap,
      commentH,
      total: labelH + headerGap + bodyH + commentGap + commentH + ROW_GAP * scale
    };
  }

  // Answers revealed so far, within the current batch of MAX_VISIBLE_WRONG --
  // e.g. with 9 wrong answers and a cap of 4: reveals 1-4 fill the first
  // batch, the 5th reveal clears the slate and starts batch two (5-8), the
  // 9th clears again and starts batch three (just 9). Sizing is based on
  // the whole set regardless, so the box never has to resize as content
  // rotates through it.
  function visibleWindow(wrongAnswers, revealedCount) {
    if (revealedCount <= 0) return [];
    const cap = Math.min(wrongAnswers.length, MAX_VISIBLE_WRONG);
    const batchStart = Math.floor((revealedCount - 1) / cap) * cap;
    return wrongAnswers.slice(batchStart, revealedCount);
  }

  // Builds the full row list for a slide group. English/divider rows are
  // structural and always visible. Each sentence gets a fixed number of
  // wrong-answer "slots" (capped at MAX_VISIBLE_WRONG) whose position never
  // moves; which wrong answer occupies a slot depends on the reveal stage
  // (see visibleWindow). The model answer is always the sentence's last step.
  function buildRows(sentences) {
    const rows = [];
    let step = 0;
    sentences.forEach((sentence, sentenceIndex) => {
      if (sentenceIndex > 0) rows.push({ kind: "divider", step: 0 });
      rows.push({ kind: "english", sentence, step: 0 });

      const sentenceStepStart = step;
      const slotCount = Math.min(sentence.wrongAnswers.length, MAX_VISIBLE_WRONG);
      for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
        rows.push({ kind: "wrongSlot", sentence, slotIndex, sentenceStepStart });
      }

      step += sentence.wrongAnswers.length;
      step += 1;
      rows.push({ kind: "model", sentence, step });
    });
    return { rows, totalSteps: step };
  }

  // Natural (unscaled) height a row needs -- for wrongSlot this is sized
  // for whichever answer could ever occupy it, not just the first one.
  function naturalHeight(row) {
    if (row.kind === "divider") return 0.28;
    if (row.kind === "english") return measureEnglish(row.sentence.english, 1).total;
    if (row.kind === "wrongSlot") {
      return row.sentence.wrongAnswers.reduce(
        (max, w) => Math.max(max, measureAnswerBlock(w.text, w.comment, 1).total),
        measureAnswerBlock("", null, 1).total
      );
    }
    if (row.kind === "model") return measureAnswerBlock(row.sentence.model, null, 1).total;
    return 0.3;
  }

  // Computes a fixed y/height for every row up front, so a row never moves
  // between the reveal-stage slides of the same group -- only new rows
  // appear below what's already there, and slot contents rotate in place.
  // If the natural (fully-legible) sizes don't all fit in the available
  // height, every row is scaled down together (font size included) so
  // content shrinks uniformly instead of overflowing its box.
  function layoutRows(sentences) {
    const { rows, totalSteps } = buildRows(sentences);
    rows.forEach(row => { row.naturalHeight = naturalHeight(row); });

    const naturalTotal = rows.reduce((sum, row) => sum + row.naturalHeight, 0);
    const usableHeight = BOTTOM_Y - TOP_Y;
    const floorScale = FONT_FLOOR.body / FONT.body;
    const scale = Math.max(floorScale, Math.min(1, usableHeight / naturalTotal));

    const contentHeight = rows.reduce((sum, row) => {
      if (row.kind === "divider") return sum + row.naturalHeight;
      if (row.kind === "english") return sum + measureEnglish(row.sentence.english, scale).total;
      if (row.kind === "wrongSlot") {
        const h = row.sentence.wrongAnswers.reduce(
          (max, w) => Math.max(max, measureAnswerBlock(w.text, w.comment, scale).total),
          measureAnswerBlock("", null, scale).total
        );
        return sum + h;
      }
      if (row.kind === "model") return sum + measureAnswerBlock(row.sentence.model, null, scale).total;
      return sum;
    }, 0);
    const verticalOffset = Math.max(0, (usableHeight - contentHeight) / 2) * 0.4;

    let cursorY = TOP_Y + verticalOffset;
    rows.forEach(row => {
      row.scale = scale;
      if (row.kind === "english") row.height = measureEnglish(row.sentence.english, scale).total;
      else if (row.kind === "wrongSlot") {
        row.height = row.sentence.wrongAnswers.reduce(
          (max, w) => Math.max(max, measureAnswerBlock(w.text, w.comment, scale).total),
          measureAnswerBlock("", null, scale).total
        );
      } else if (row.kind === "model") row.height = measureAnswerBlock(row.sentence.model, null, scale).total;
      else row.height = row.naturalHeight;
      row.y = cursorY;
      cursorY += row.height;
    });

    return { rows, totalSteps };
  }

  function addBar(pptx, slide, x, y, h, color) {
    slide.addShape(pptx.ShapeType.rect, {
      x,
      y,
      w: 0.04,
      h,
      fill: { color },
      line: { type: "none" }
    });
  }

  function renderAnswerBlock(pptx, slide, { y, color, label, bodyText, comment, scale, isModel }) {
    const measured = measureAnswerBlock(bodyText, comment, scale);
    addBar(pptx, slide, MARGIN_X, y + 0.04, measured.total - ROW_GAP * scale - 0.08, color);

    slide.addText(label, {
      x: MARGIN_X + 0.22,
      y,
      w: CONTENT_W - 0.22,
      h: measured.labelH,
      fontSize: scaledFont(FONT.label, FONT_FLOOR.label, scale),
      bold: true,
      color,
      charSpacing: 1.2,
      fontFace: "Arial",
      fit: "shrink",
      wrap: false
    });

    const bodyY = y + measured.labelH + measured.headerGap;
    const bodyOptions = isModel
      ? { fontFace: "Malgun Gothic", fontSize: measured.bodyFontPt, color: COLOR.correct, bold: true, highlight: COLOR.correctSoft }
      : { fontFace: "Malgun Gothic", fontSize: measured.bodyFontPt, color: COLOR.ink };
    slide.addText(textToRuns(bodyText, bodyOptions), {
      x: MARGIN_X + 0.22,
      y: bodyY,
      w: BODY_W,
      h: measured.bodyH,
      valign: "top",
      wrap: true
    });

    if (comment) {
      slide.addText(textToRuns(comment, { fontFace: "Malgun Gothic", fontSize: measured.commentFontPt, italic: true, color: COLOR.muted }), {
        x: MARGIN_X + 0.22,
        y: bodyY + measured.bodyH + measured.commentGap,
        w: BODY_W,
        h: measured.commentH,
        valign: "top",
        wrap: true
      });
    }
  }

  function renderRow(pptx, slide, row, stage) {
    const { kind, y, scale } = row;

    if (kind === "divider") {
      slide.addShape(pptx.ShapeType.line, {
        x: MARGIN_X,
        y: y + row.height / 2,
        w: CONTENT_W,
        h: 0,
        line: { color: "E8E9ED", width: 0.75 }
      });
      return;
    }

    if (kind === "english") {
      const measured = measureEnglish(row.sentence.english, scale);
      slide.addText(String(row.sentence.number), {
        x: MARGIN_X,
        y,
        w: 0.5,
        h: measured.numberH,
        fontSize: 12,
        color: COLOR.muted,
        fontFace: "Menlo"
      });
      slide.addText(textToRuns(row.sentence.english, { fontFace: "Arial", fontSize: measured.fontPt, bold: true, color: COLOR.ink }), {
        x: MARGIN_X,
        y: y + measured.numberH + measured.headerGap,
        w: CONTENT_W,
        h: measured.bodyH,
        valign: "top",
        wrap: true
      });
      return;
    }

    if (kind === "wrongSlot") {
      const revealed = Math.min(Math.max(0, stage - row.sentenceStepStart), row.sentence.wrongAnswers.length);
      const window = visibleWindow(row.sentence.wrongAnswers, revealed);
      const wrong = window[row.slotIndex];
      if (!wrong) return;
      renderAnswerBlock(pptx, slide, {
        y,
        scale,
        label: wrong.name || "오답",
        color: COLOR.accent,
        bodyText: wrong.text,
        comment: wrong.comment
      });
      return;
    }

    if (kind === "model" && stage >= row.step) {
      renderAnswerBlock(pptx, slide, {
        y,
        scale,
        label: "정답",
        color: COLOR.correct,
        bodyText: row.sentence.model,
        comment: null,
        isModel: true
      });
    }
  }

  function addCounter(slide, current, total) {
    slide.addText(`${current} / ${total}`, {
      x: SLIDE_W - 1.3,
      y: SLIDE_H - 0.42,
      w: 1,
      h: 0.28,
      fontSize: 10,
      color: COLOR.muted,
      align: "right",
      fontFace: "Arial"
    });
  }

  function studentLabel(student, index) {
    const name = (student.name || "").trim();
    return name || `학생 ${index + 1}`;
  }

  function collectWrongAnswers(sentence, students) {
    return (students || [])
      .map((student, index) => ({ student, index, answer: student.answers && student.answers[sentence.id] }))
      .filter(({ answer }) => answer && answer.text && answer.text.trim())
      .map(({ student, index, answer }) => ({
        text: answer.text,
        comment: answer.comment || "",
        name: studentLabel(student, index)
      }));
  }

  async function exportLesson(lesson) {
    const pptx = new window.PptxGenJS();
    pptx.defineLayout({ name: "REVIEW_SLIDES", width: SLIDE_W, height: SLIDE_H });
    pptx.layout = "REVIEW_SLIDES";
    pptx.author = "복습 슬라이드 스튜디오";
    pptx.title = "복습 슬라이드";

    const sentencesWithAnswers = (lesson.sentences || []).map(sentence => ({
      ...sentence,
      wrongAnswers: collectWrongAnswers(sentence, lesson.students)
    }));
    const slideGroups = window.Slides.groupSentencesIntoSlides(sentencesWithAnswers);
    if (!slideGroups.length) {
      throw new Error("문장이 없습니다.");
    }

    const groupLayouts = slideGroups.map(group => layoutRows(group.sentences));
    const totalPhysicalSlides = groupLayouts.reduce((sum, g) => sum + g.totalSteps + 1, 0);

    let physicalIndex = 0;
    groupLayouts.forEach(({ rows, totalSteps }) => {
      for (let stage = 0; stage <= totalSteps; stage += 1) {
        physicalIndex += 1;
        const slide = pptx.addSlide();
        slide.background = { color: "FFFFFF" };
        rows.forEach(row => renderRow(pptx, slide, row, stage));
        addCounter(slide, physicalIndex, totalPhysicalSlides);
      }
    });

    const now = new Date();
    const pad = value => String(value).padStart(2, "0");
    const fileName = `복습슬라이드-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}.pptx`;
    await pptx.writeFile({ fileName });
  }

  window.PptxExport = Object.freeze({ exportLesson });
})();
