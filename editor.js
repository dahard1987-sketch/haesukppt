(() => {
  "use strict";

  function create({ onChange }) {
    let lesson = window.Storage.createEmptyLesson();
    let activeStudentId = "";

    const sentenceListEl = document.getElementById("sentenceList");
    const tabButtons = document.querySelectorAll(".editor-tab");
    const passagePanel = document.getElementById("passagePanel");
    const gradingPanel = document.getElementById("gradingPanel");
    const studentChipsEl = document.getElementById("studentChips");
    const gradingListEl = document.getElementById("gradingList");

    function notifyChange() {
      lesson.updatedAt = new Date().toISOString();
      if (typeof onChange === "function") onChange(lesson);
    }

    // ---- Passage tab (sentences) ----------------------------------------

    function renderSentenceCard(sentence, index) {
      const card = document.createElement("div");
      card.className = "sentence-card";
      card.dataset.id = sentence.id;

      if (index > 0) {
        const toggle = document.createElement("button");
        toggle.type = "button";
        toggle.className = "slide-toggle";
        const setLabel = () => {
          toggle.textContent = sentence.startsNewSlide !== false ? "── 새 슬라이드 ──" : "── 같은 슬라이드로 묶기 ──";
        };
        setLabel();
        toggle.addEventListener("click", () => {
          sentence.startsNewSlide = sentence.startsNewSlide === false;
          setLabel();
          notifyChange();
        });
        card.appendChild(toggle);
      }

      const body = document.createElement("div");
      body.className = "sentence-card-body";

      const numberEl = document.createElement("div");
      numberEl.className = "sentence-number";
      numberEl.textContent = String(index + 1);

      const fields = document.createElement("div");
      fields.className = "sentence-fields";

      const englishLabel = document.createElement("label");
      englishLabel.textContent = "영어 원문";
      const englishArea = document.createElement("textarea");
      englishArea.className = "field-english";
      englishArea.value = sentence.english;
      englishArea.addEventListener("input", () => {
        sentence.english = englishArea.value;
        notifyChange();
      });
      englishArea.addEventListener("keydown", event => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
          event.preventDefault();
          addSentence();
        }
      });

      const modelLabel = document.createElement("label");
      modelLabel.textContent = "모범 해석";
      const modelArea = document.createElement("textarea");
      modelArea.className = "field-model";
      modelArea.value = sentence.model;
      modelArea.addEventListener("input", () => {
        sentence.model = modelArea.value;
        notifyChange();
      });

      fields.append(englishLabel, englishArea, modelLabel, modelArea);

      const controls = document.createElement("div");
      controls.className = "sentence-card-controls";

      const moveUpBtn = document.createElement("button");
      moveUpBtn.type = "button";
      moveUpBtn.title = "위로 이동";
      moveUpBtn.textContent = "↑";
      moveUpBtn.addEventListener("click", () => {
        if (index === 0) return;
        const [item] = lesson.sentences.splice(index, 1);
        lesson.sentences.splice(index - 1, 0, item);
        notifyChange();
        renderSentenceList();
      });

      const moveDownBtn = document.createElement("button");
      moveDownBtn.type = "button";
      moveDownBtn.title = "아래로 이동";
      moveDownBtn.textContent = "↓";
      moveDownBtn.addEventListener("click", () => {
        if (index === lesson.sentences.length - 1) return;
        const [item] = lesson.sentences.splice(index, 1);
        lesson.sentences.splice(index + 1, 0, item);
        notifyChange();
        renderSentenceList();
      });

      const duplicateBtn = document.createElement("button");
      duplicateBtn.type = "button";
      duplicateBtn.title = "복제";
      duplicateBtn.textContent = "⧉";
      duplicateBtn.addEventListener("click", () => {
        const copy = window.Storage.sanitizeLesson({ sentences: [sentence] }).sentences[0];
        copy.id = window.Storage.createId("sentence");
        lesson.sentences.splice(index + 1, 0, copy);
        notifyChange();
        renderSentenceList();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.title = "삭제";
      deleteBtn.textContent = "×";
      deleteBtn.addEventListener("click", () => {
        lesson.sentences = lesson.sentences.filter(item => item.id !== sentence.id);
        notifyChange();
        renderSentenceList();
      });

      controls.append(moveUpBtn, moveDownBtn, duplicateBtn, deleteBtn);
      body.append(numberEl, fields, controls);
      card.appendChild(body);
      return card;
    }

    function renderSentenceList() {
      sentenceListEl.replaceChildren();
      lesson.sentences.forEach((sentence, index) => {
        sentenceListEl.appendChild(renderSentenceCard(sentence, index));
      });
    }

    function addSentence() {
      const sentence = window.Storage.createEmptySentence();
      lesson.sentences.push(sentence);
      notifyChange();
      renderSentenceList();
      const cards = sentenceListEl.querySelectorAll(".sentence-card");
      const lastCard = cards[cards.length - 1];
      if (lastCard) {
        const field = lastCard.querySelector(".field-english");
        if (field) field.focus();
      }
    }

    // ---- Grading tab (per-student answers) -------------------------------

    function activeStudent() {
      return lesson.students.find(student => student.id === activeStudentId) || null;
    }

    function updateAnswer(student, sentenceId, patch) {
      const current = student.answers[sentenceId] || { text: "", comment: "" };
      const next = { ...current, ...patch };
      if (!next.text && !next.comment) {
        delete student.answers[sentenceId];
      } else {
        student.answers[sentenceId] = next;
      }
      notifyChange();
    }

    function renderStudentChips() {
      studentChipsEl.replaceChildren();
      lesson.students.forEach((student, index) => {
        const chip = document.createElement("div");
        chip.className = "student-chip";
        chip.classList.toggle("active", student.id === activeStudentId);

        const nameInput = document.createElement("input");
        nameInput.className = "student-chip-name";
        nameInput.value = student.name;
        nameInput.placeholder = `학생 ${index + 1}`;
        nameInput.addEventListener("focus", () => selectStudent(student.id));
        nameInput.addEventListener("input", () => {
          student.name = nameInput.value;
          notifyChange();
        });

        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "student-chip-remove";
        removeBtn.textContent = "×";
        removeBtn.title = "학생 삭제";
        removeBtn.addEventListener("click", event => {
          event.stopPropagation();
          lesson.students = lesson.students.filter(item => item.id !== student.id);
          if (activeStudentId === student.id) {
            activeStudentId = lesson.students.length ? lesson.students[0].id : "";
          }
          notifyChange();
          renderStudentChips();
          renderGradingList();
        });

        chip.addEventListener("click", () => selectStudent(student.id));
        chip.append(nameInput, removeBtn);
        studentChipsEl.appendChild(chip);
      });
    }

    function selectStudent(id) {
      if (activeStudentId === id) return;
      activeStudentId = id;
      renderStudentChips();
      renderGradingList();
    }

    function renderGradingList() {
      gradingListEl.replaceChildren();
      const student = activeStudent();

      if (!lesson.sentences.length) {
        const empty = document.createElement("p");
        empty.className = "grading-empty";
        empty.textContent = "먼저 ① 원문 입력 탭에서 문장을 추가해 주세요.";
        gradingListEl.appendChild(empty);
        return;
      }

      if (!student) {
        const empty = document.createElement("p");
        empty.className = "grading-empty";
        empty.textContent = "학생을 추가하거나 선택해 주세요.";
        gradingListEl.appendChild(empty);
        return;
      }

      lesson.sentences.forEach((sentence, index) => {
        const row = document.createElement("div");
        row.className = "grade-row";

        const ref = document.createElement("div");
        ref.className = "grade-ref";
        const number = document.createElement("span");
        number.className = "grade-number";
        number.textContent = String(index + 1);
        const english = document.createElement("div");
        english.className = "grade-english";
        window.Markup.renderInline(english, sentence.english);
        const model = document.createElement("div");
        model.className = "grade-model";
        window.Markup.renderInline(model, sentence.model ? `→ ${sentence.model}` : "");
        ref.append(number, english, model);

        const input = document.createElement("div");
        input.className = "grade-input";

        const answer = student.answers[sentence.id] || { text: "", comment: "" };

        const textArea = document.createElement("textarea");
        textArea.className = "grade-text";
        textArea.placeholder = "이 학생의 오답 (맞았으면 비워두기, 틀린 부분은 [[이렇게]])";
        textArea.value = answer.text;

        const preview = document.createElement("div");
        preview.className = "grade-preview";
        window.Markup.renderInline(preview, answer.text);

        const commentInput = document.createElement("input");
        commentInput.className = "grade-comment";
        commentInput.placeholder = "코멘트 (선택)";
        commentInput.value = answer.comment;

        textArea.addEventListener("input", () => {
          updateAnswer(student, sentence.id, { text: textArea.value });
          window.Markup.renderInline(preview, textArea.value);
        });
        textArea.addEventListener("keydown", event => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            const rows = gradingListEl.querySelectorAll(".grade-text");
            const next = rows[index + 1];
            if (next) next.focus();
          }
        });
        commentInput.addEventListener("input", () => {
          updateAnswer(student, sentence.id, { comment: commentInput.value });
        });

        input.append(textArea, preview, commentInput);
        row.append(ref, input);
        gradingListEl.appendChild(row);
      });
    }

    function addStudent() {
      const student = window.Storage.createEmptyStudent();
      lesson.students.push(student);
      activeStudentId = student.id;
      notifyChange();
      renderStudentChips();
      renderGradingList();
      const firstField = gradingListEl.querySelector(".grade-text");
      if (firstField) firstField.focus();
    }

    document.getElementById("addStudentBtn").addEventListener("click", addStudent);

    // ---- Tabs --------------------------------------------------------------

    tabButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        tabButtons.forEach(b => b.classList.toggle("active", b === btn));
        const tab = btn.dataset.tab;
        passagePanel.hidden = tab !== "passage";
        gradingPanel.hidden = tab !== "grading";
        if (tab === "grading") {
          if (!activeStudentId && lesson.students.length) activeStudentId = lesson.students[0].id;
          renderStudentChips();
          renderGradingList();
        }
      });
    });

    // ---- Public API ----------------------------------------------------

    function getLesson() {
      return lesson;
    }

    function setLesson(nextLesson) {
      lesson = window.Storage.sanitizeLesson(nextLesson);
      activeStudentId = lesson.students.length ? lesson.students[0].id : "";
      renderSentenceList();
      renderStudentChips();
      renderGradingList();
    }

    renderSentenceList();
    renderStudentChips();
    renderGradingList();

    return Object.freeze({ getLesson, setLesson, addSentence });
  }

  window.Editor = Object.freeze({ create });
})();
