// ==UserScript==
// @name         크랙 대화 저장
// @namespace    https://github.com/
// @version      1.0
// @description  크랙 채팅을 턴 범위를 지정해 txt로 저장합니다.
// @match        https://crack.wrtn.ai/*
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  // ================= 설정 (여기만 고치면 됩니다) =================
  const USER_SELECTOR = "여기에_유저_메시지_선택자";
  const AI_SELECTOR = "여기에_AI_메시지_선택자";
  // ===============================================================

  function collectTurns() {
    const nodes = document.querySelectorAll(USER_SELECTOR + ", " + AI_SELECTOR);
    const turns = [];
    let current = [];

    nodes.forEach((node) => {
      const isUser = node.matches(USER_SELECTOR);
      const text = node.innerText.trim();
      if (!text) return;

      current.push((isUser ? "[유저]\n" : "[AI]\n") + text);

      if (isUser) {
        turns.push(current);
        current = [];
      }
    });

    if (current.length > 0) turns.push(current);
    return turns;
  }

  function downloadText(filename, text) {
    const blob = new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function onSave(startInput, endInput, status) {
    if (USER_SELECTOR.includes("여기에") || AI_SELECTOR.includes("여기에")) {
      alert("스크립트 맨 위의 선택자 2개를 아직 안 채웠어요.");
      return;
    }

    const turns = collectTurns();
    if (turns.length === 0) {
      status.textContent = "메시지를 못 찾았어요. 선택자를 확인해 주세요.";
      return;
    }

    let start = parseInt(startInput.value, 10);
    let end = parseInt(endInput.value, 10);
    if (isNaN(start) || start < 1) start = 1;
    if (isNaN(end) || end > turns.length) end = turns.length;
    if (start > end) {
      status.textContent = "시작 턴이 끝 턴보다 클 수 없어요. (현재 " + turns.length + "턴)";
      return;
    }

    const selected = turns.slice(start - 1, end);
    const body = selected
      .map((turn, i) => "===== " + (start + i) + "턴 =====\n\n" + turn.join("\n\n"))
      .join("\n\n\n");

    downloadText("크랙_대화_" + start + "-" + end + "턴.txt", body);
    status.textContent = "저장 완료! (전체 " + turns.length + "턴 중 " + start + "~" + end + "턴)";
  }

  function createPanel() {
    const panel = document.createElement("div");
    panel.style.cssText =
      "position:fixed; right:20px; bottom:20px; z-index:2147483647;" +
      "background:#fff; color:#000; border:1px solid #888; border-radius:8px;" +
      "padding:10px; font-size:13px; box-shadow:0 2px 8px rgba(0,0,0,0.3);" +
      "font-family:sans-serif;";

    panel.innerHTML =
      '<div style="margin-bottom:6px;">' +
      '<input id="cs-start" type="number" min="1" value="1" style="width:50px;"> 턴부터 ' +
      '<input id="cs-end" type="number" min="1" value="10" style="width:50px;"> 턴까지' +
      "</div>" +
      '<button id="cs-save" style="width:100%; padding:6px; cursor:pointer;">txt로 저장</button>' +
      '<div id="cs-status" style="margin-top:6px; color:#555;"></div>';

    document.body.appendChild(panel);

    const startInput = panel.querySelector("#cs-start");
    const endInput = panel.querySelector("#cs-end");
    const status = panel.querySelector("#cs-status");
    panel.querySelector("#cs-save").addEventListener("click", () => {
      onSave(startInput, endInput, status);
    });
  }

  createPanel();
})();
