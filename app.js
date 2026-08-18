(() => {
  "use strict";

  const exportBtn = document.getElementById("exportPptxBtn");

  const editor = window.Editor.create({ onChange: scheduleAutosave });

  editor.setLesson(window.Storage.loadDraft());

  let autosaveTimer = null;
  function scheduleAutosave(lesson) {
    if (autosaveTimer) clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(() => {
      window.Storage.saveDraft(lesson);
    }, 500);
  }

  window.addEventListener("beforeunload", () => {
    if (!autosaveTimer) return;
    clearTimeout(autosaveTimer);
    window.Storage.saveDraft(editor.getLesson());
  });

  document.getElementById("addSentenceBtn").addEventListener("click", () => editor.addSentence());
  document.getElementById("addSentenceBottomBtn").addEventListener("click", () => editor.addSentence());

  exportBtn.addEventListener("click", async () => {
    const lesson = editor.getLesson();
    if (!lesson.sentences.length) {
      window.alert("먼저 문장을 추가해 주세요.");
      return;
    }
    const originalLabel = exportBtn.textContent;
    exportBtn.disabled = true;
    exportBtn.textContent = "만드는 중…";
    try {
      await window.PptxExport.exportLesson(lesson);
    } catch (error) {
      window.alert(`PPT를 만들지 못했습니다: ${error.message}`);
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = originalLabel;
    }
  });
})();
