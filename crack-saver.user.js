// ==UserScript==
// @name         로그 세이버
// @namespace    https://github.com/kimseonyeok/crack-saver
// @version      2.1.0
// @description  크랙(Crack) API를 이용한 전체 대화 턴 수집 및 텍스트 파일 저장
// @author       kimseonyeok
// @match        https://crack.wrtn.ai/*
// @updateURL    https://raw.githubusercontent.com/kimseonyeok/crack-saver/main/crack-saver.user.js
// @downloadURL  https://raw.githubusercontent.com/kimseonyeok/crack-saver/main/crack-saver.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const APP_NAME = "Crack Saver";
    const VERSION = "2.1.0";
    const API_BASE = 'https://crack-api.wrtn.ai/crack-gen/v3/chats';

    console.log(`[${APP_NAME} v${VERSION}] API 기반 스크립트가 실행되었습니다.`);

    // 1. 현재 에피소드 ID(Chat ID) 추출
    function getChatId() {
        const match = location.pathname.match(/\/episodes\/([a-f0-9]+)/);
        return match ? match[1] : null;
    }

    // 2. Access Token 추출
    function getAccessToken() {
        const match = document.cookie.match(/(^| )access_token=([^;]+)/);
        return match ? match[2] : null;
    }

    // 3. API 요청 헬퍼 함수
    async function apiRequest(method, path) {
        const chatId = getChatId();
        const token = getAccessToken();
        if (!chatId || !token) {
            console.error('Chat ID 또는 Access Token을 찾을 수 없습니다.');
            return null;
        }

        const url = `${API_BASE}/${chatId}${path}`;
        try {
            const response = await fetch(url, {
                method,
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });
            if (!response.ok) throw new Error(`API Error: ${response.status}`);
            return await response.json();
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    // ---------- 메시지 파싱 헬퍼 ----------
    function extractText(msg) {
        const c = msg.content ?? msg.text ?? msg.message ?? '';
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) {
            return c.map(p => typeof p === 'string' ? p : (p.text || p.content || '')).join('\n');
        }
        return JSON.stringify(c);
    }

    const isUserMsg = (m) => m.role === 'user' || m.type === 'user' || m.sender === 'user';

    function getTime(m) {
        const v = m.createdAt ?? m.created_at ?? m.timestamp ?? m.updatedAt ?? m.updated_at;
        if (v === undefined || v === null) return NaN;
        return typeof v === 'number' ? v : Date.parse(v);
    }

    // 4. API로 전체 메시지 수집 (원본 순서 그대로) + 가능하면 시간순 정렬
    async function fetchAllMessagesFromAPI() {
        const messages = [];
        let cursor = null;

        for (let i = 0; i < 100; i++) {
            const params = new URLSearchParams({
                limit: 50,
                orderBy: 'oldest',
                ...(cursor && { cursor })
            });

            const res = await apiRequest('GET', `/messages?${params}`);
            if (!res || !res.data || !res.data.messages) break;

            messages.push(...res.data.messages);

            const next = res.data.nextCursor;
            if (!next || next === cursor) break;
            cursor = next;
        }

        console.log('[Crack Saver] 총 메시지 수:', messages.length);
        console.log('[Crack Saver] 첫 메시지 원본:', messages[0]);

        // 타임스탬프가 전부 있으면 오래된 순으로 정렬
        let sortedByTime = false;
        if (messages.length > 1 && messages.every(m => !isNaN(getTime(m)))) {
            messages.sort((a, b) => getTime(a) - getTime(b));
            sortedByTime = true;
        }
        console.log('[Crack Saver] 타임스탬프 정렬 여부:', sortedByTime);

        return { messages, sortedByTime };
    }

    // 5. 메시지 -> 턴 (AI 메시지로 새 턴 시작, 뒤따르는 유저 메시지는 같은 턴)
    function buildTurns(messages) {
        const turns = [];
        for (const msg of messages) {
            const text = extractText(msg);
            if (isUserMsg(msg)) {
                if (turns.length === 0) turns.push({ ai: '', user: '' });
                const t = turns[turns.length - 1];
                t.user += (t.user ? '\n\n' : '') + text;
            } else {
                turns.push({ ai: text, user: '' });
            }
        }
        return turns;
    }

    // 6. 드래그 가능한 플로팅 버튼 생성
    function createDraggableButton() {
        if (document.getElementById('crack-saver-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'crack-saver-btn';
        btn.innerText = `💾 대화 저장하기 (API)`;

        Object.assign(btn.style, {
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: '99999',
            padding: '12px 18px',
            backgroundColor: '#6C5CE7',
            color: '#FFFFFF',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: 'bold',
            cursor: 'grab',
            boxShadow: '0 4px 10px rgba(0, 0, 0, 0.3)',
            userSelect: 'none'
        });

        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        btn.addEventListener('mousedown', (e) => {
            isDragging = true;
            btn.style.cursor = 'grabbing';
            startX = e.clientX;
            startY = e.clientY;

            const rect = btn.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            btn.style.bottom = 'auto';
            btn.style.right = 'auto';
            btn.style.left = `${initialLeft}px`;
            btn.style.top = `${initialTop}px`;

            e.preventDefault();
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            btn.style.left = `${initialLeft + dx}px`;
            btn.style.top = `${initialTop + dy}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                btn.style.cursor = 'grab';
            }
        });

        let clickStartTime = 0;
        btn.addEventListener('mousedown', () => { clickStartTime = Date.now(); });
        btn.addEventListener('click', () => {
            if (Date.now() - clickStartTime < 200) {
                openChatSelectorModal();
            }
        });

        document.body.appendChild(btn);
    }

    // 7. 모달 창 오픈 및 범위 지정 저장
    async function openChatSelectorModal() {
        const existingModal = document.getElementById('crack-saver-modal');
        if (existingModal) existingModal.remove();

        const loadingOverlay = document.createElement('div');
        loadingOverlay.id = 'crack-saver-modal';
        Object.assign(loadingOverlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.7)', zIndex: '100000',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            color: '#fff', fontSize: '16px', fontFamily: 'sans-serif'
        });
        loadingOverlay.innerHTML = `<div>⚡ API로 전체 대화 초고속 로딩 중...</div>`;
        document.body.appendChild(loadingOverlay);

        const { messages, sortedByTime } = await fetchAllMessagesFromAPI();
        loadingOverlay.remove();

        if (messages.length === 0) {
            alert("API를 통해 가져온 대화가 없습니다. 채팅방 안에서 실행 중인지 확인해주세요!");
            return;
        }

        // 타임스탬프로 정렬 못 했으면, "최신이 위" 증상 기준으로 기본 뒤집기 ON
        const defaultReverse = !sortedByTime;
        const maxTurn = buildTurns(messages).length;

        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'crack-saver-modal';
        Object.assign(modalOverlay.style, {
            position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.6)', zIndex: '100000',
            display: 'flex', justifyContent: 'center', alignItems: 'center'
        });

        const modalBox = document.createElement('div');
        Object.assign(modalBox.style, {
            width: '500px', backgroundColor: '#1E1E1E', color: '#FFFFFF',
            borderRadius: '12px', padding: '20px', display: 'flex',
            flexDirection: 'column', boxShadow: '0 10px 25px rgba(0,0,0,0.5)',
            fontFamily: 'sans-serif'
        });

        modalBox.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #444; padding-bottom: 10px; margin-bottom: 15px;">
                <h3 style="margin: 0; font-size: 18px;">💾 대화 턴 범위 지정 저장 (API)</h3>
                <button id="crack-close-btn" style="background: none; border: none; color: #aaa; font-size: 18px; cursor: pointer;">✕</button>
            </div>
            <div style="margin-bottom: 10px; font-size: 14px; color: #b2bec3;">
                API 감지된 전체 대화 턴: <b style="color: #6C5CE7; font-size: 16px;">1 ~ ${maxTurn}턴</b>
            </div>
            <label style="display: flex; align-items: center; gap: 8px; margin-bottom: 15px; font-size: 13px; color: #dfe6e9; cursor: pointer;">
                <input type="checkbox" id="crack-reverse" ${defaultReverse ? 'checked' : ''}>
                순서 뒤집기 (저장된 파일이 최신→과거로 나오면 체크 변경)
                <span style="color: #888;">${sortedByTime ? '· 시간순 자동 정렬됨' : '· 시간 정보 없음'}</span>
            </label>
            <div style="display: flex; gap: 10px; align-items: center; margin-bottom: 15px; background: #2A2A2A; padding: 15px; border-radius: 8px;">
                <div style="display: flex; flex-direction: column; gap: 5px; flex: 1;">
                    <label style="font-size: 12px; color: #aaa;">시작 턴</label>
                    <input type="number" id="crack-start-turn" value="1" min="1" max="${maxTurn}" style="padding: 8px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; font-size: 14px;">
                </div>
                <span style="margin-top: 20px; color: #aaa;">~</span>
                <div style="display: flex; flex-direction: column; gap: 5px; flex: 1;">
                    <label style="font-size: 12px; color: #aaa;">끝 턴</label>
                    <input type="number" id="crack-end-turn" value="${maxTurn}" min="1" max="${maxTurn}" style="padding: 8px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; font-size: 14px;">
                </div>
            </div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <button id="crack-download-range-btn" style="padding: 10px 20px; background: #6C5CE7; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%;">지정한 범위 txt 다운로드</button>
                <button id="crack-download-all-btn" style="padding: 10px 20px; background: #00B894; color: #fff; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; width: 100%;">🔥 전체 대화 한 번에 다운로드 (1 ~ ${maxTurn}턴)</button>
            </div>
        `;

        modalOverlay.appendChild(modalBox);
        document.body.appendChild(modalOverlay);

        modalBox.querySelector('#crack-close-btn').addEventListener('click', () => modalOverlay.remove());
        modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) modalOverlay.remove(); });

        // 체크박스 상태에 따라 순서를 적용한 턴 배열 생성
        function getOrderedTurns() {
            const reverse = modalBox.querySelector('#crack-reverse').checked;
            const ordered = reverse ? [...messages].reverse() : messages;
            return buildTurns(ordered);
        }

        function downloadTxt(turns, startIdx, endIdx, fileName) {
            let fileContent = "";
            for (let i = startIdx; i <= endIdx; i++) {
                const chat = turns[i];
                if (!chat) continue;
                fileContent += `${chat.ai}\n\n`;
                if (chat.user) {
                    fileContent += `=== [USER] ===\n\n${chat.user}\n\n`;
                }
                fileContent += `--------------------------------------------------\n\n`;
            }

            const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            modalOverlay.remove();
            alert("텍스트 파일이 성공적으로 저장되었습니다!");
        }

        modalBox.querySelector('#crack-download-range-btn').addEventListener('click', () => {
            const startVal = parseInt(modalBox.querySelector('#crack-start-turn').value);
            const endVal = parseInt(modalBox.querySelector('#crack-end-turn').value);
            const turns = getOrderedTurns();

            if (isNaN(startVal) || isNaN(endVal) || startVal < 1 || endVal > turns.length || startVal > endVal) {
                alert(`올바른 턴 범위를 입력해주세요! (1 ~ ${turns.length} 사이)`);
                return;
            }
            downloadTxt(turns, startVal - 1, endVal - 1, `crack-chat-turn-${startVal}-to-${endVal}-${Date.now()}.txt`);
        });

        modalBox.querySelector('#crack-download-all-btn').addEventListener('click', () => {
            const turns = getOrderedTurns();
            downloadTxt(turns, 0, turns.length - 1, `crack-chat-ALL-1-to-${turns.length}-${Date.now()}.txt`);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createDraggableButton);
    } else {
        createDraggableButton();
    }

})();
