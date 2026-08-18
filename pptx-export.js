(() => {
  "use strict";

  const COLOR = {
    ink: "111318",
    muted: "808795",
    accent: "C4171D",
    accentSoft: "FBEAEC",
    correct: "1A7A4C"
  };

  const SLIDE_W = 13.33;
  const SLIDE_H = 7.5;
  const MARGIN_X = 0.9;
  const CONTENT_W = SLIDE_W - MARGIN_X * 2;
  const TOP_Y = 0.7;
  const BOTTOM_Y = 6.9;

  // A sentence can accumulate one wrong answer per student -- with a full
  // class that can be a lot. Rather than growing the slide forever (and
  // shrinking every box into illegibility), only this many are ever shown
  // on screen at once; each new click still reveals the next student's
  // mistake, but the oldest one on screen rolls off to make room.
  const MAX_VISIBLE_WRONG = 4;

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

  function estimateLines(text, charsPerLine) {
    const plain = window.Markup.stripMarkup(text || "");
    if (!plain) return 1;
    return Math.max(1, Math.ceil(plain.length / charsPerLine));
  }

  // The last MAX_VISIBLE_WRONG answers revealed so far, oldest first --
  // used both to pick what's on screen and to size the box generously
  // (sizing is based on the whole set, so it never has to change size
  // when the content rotating through it changes).
  function visibleWindow(wrongAnswers, revealedCount) {
    const cap = Math.min(wrongAnswers.length, MAX_VISIBLE_WRONG);
    const start = Math.max(0, revealedCount - cap);
    return wrongAnswers.slice(start, revealedCount);
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

  function rowWeight(row) {
    if (row.kind === "divider") return 0.3;
    if (row.kind === "english") return 1.2 + 0.4 * estimateLines(row.sentence.english, 46);
    if (row.kind === "wrongSlot") {
      // Sized for whichever answer could end up here, not just the first one.
      const maxLines = row.sentence.wrongAnswers.reduce((max, w) => Math.max(max, estimateLines(w.text, 58)), 1);
      const anyComment = row.sentence.wrongAnswers.some(w => w.comment);
      return 1 + 0.4 * maxLines + (anyComment ? 0.65 : 0);
    }
    if (row.kind === "model") return 1 + 0.4 * estimateLines(row.sentence.model, 58);
    return 1;
  }

  // Computes a fixed y/height for every row up front, so a row never moves
  // between the reveal-stage slides of the same group -- only new rows
  // appear below what's already there, and slot contents rotate in place.
  function layoutRows(sentences) {
    const { rows, totalSteps } = buildRows(sentences);
    const totalWeight = rows.reduce((sum, row) => sum + rowWeight(row), 0);
    const usableHeight = BOTTOM_Y - TOP_Y;
    const contentHeight = Math.min(usableHeight, totalWeight * (usableHeight / totalWeight));
    const verticalOffset = Math.max(0, (usableHeight - contentHeight) / 2) * 0.4;

    let cursorY = TOP_Y + verticalOffset;
    rows.forEach(row => {
      row.height = (rowWeight(row) / totalWeight) * (usableHeight - verticalOffset);
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

  function renderAnswerBlock(pptx, slide, { y, height, label, color, bodyText, comment }) {
    addBar(pptx, slide, MARGIN_X, y + 0.04, height - 0.08, color);
    slide.addText(label, {
      x: MARGIN_X + 0.22,
      y,
      w: CONTENT_W - 0.22,
      h: 0.28,
      fontSize: 11,
      bold: true,
      color,
      charSpacing: 1.2,
      fontFace: "Arial",
      fit: "shrink",
      wrap: false
    });
    slide.addText(textToRuns(bodyText, { fontFace: "Malgun Gothic", fontSize: 19, color: COLOR.ink }), {
      x: MARGIN_X + 0.22,
      y: y + 0.3,
      w: CONTENT_W - 0.22,
      h: comment ? height - 0.65 : height - 0.3,
      valign: "top",
      fit: "shrink",
      wrap: true
    });
    if (comment) {
      slide.addText(textToRuns(comment, { fontFace: "Malgun Gothic", fontSize: 13, italic: true, color: COLOR.muted }), {
        x: MARGIN_X + 0.22,
        y: y + height - 0.35,
        w: CONTENT_W - 0.22,
        h: 0.35,
        valign: "top",
        fit: "shrink",
        wrap: true
      });
    }
  }

  function renderRow(pptx, slide, row, stage) {
    const { kind, y, height } = row;

    if (kind === "divider") {
      slide.addShape(pptx.ShapeType.line, {
        x: MARGIN_X,
        y: y + height / 2,
        w: CONTENT_W,
        h: 0,
        line: { color: "E8E9ED", width: 0.75 }
      });
      return;
    }

    if (kind === "english") {
      slide.addText(String(row.sentence.number), {
        x: MARGIN_X,
        y,
        w: 0.5,
        h: 0.28,
        fontSize: 12,
        color: COLOR.muted,
        fontFace: "Menlo"
      });
      slide.addText(textToRuns(row.sentence.english, { fontFace: "Arial", fontSize: 27, bold: true, color: COLOR.ink }), {
        x: MARGIN_X,
        y: y + 0.3,
        w: CONTENT_W,
        h: height - 0.3,
        valign: "top",
        fit: "shrink",
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
        height,
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
        height,
        label: "정답",
        color: COLOR.correct,
        bodyText: row.sentence.model,
        comment: null
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
