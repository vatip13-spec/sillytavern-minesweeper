import { SlashCommandParser } from '../../../slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../../../slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument } from '../../../slash-commands/SlashCommandArgument.js';
import { CELL_STATE, GAME_STATUS, MinesweeperGame } from './game.js';

const MODULE_NAME = 'st_classic_minesweeper';

const DIFFICULTIES = Object.freeze({
    beginner: Object.freeze({ label: '초급', rows: 9, columns: 9, mines: 10 }),
    intermediate: Object.freeze({ label: '중급', rows: 16, columns: 16, mines: 40 }),
});

const DEFAULT_COLORS = Object.freeze({
    background: '#c0c0c0',
    panel: '#c0c0c0',
    closed: '#c0c0c0',
    open: '#c0c0c0',
    light: '#ffffff',
    shadow: '#808080',
    dark: '#000000',
    text: '#000000',
    displayBackground: '#000000',
    displayText: '#ff0000',
    flag: '#ff0000',
    mine: '#000000',
    number1: '#0000ff',
    number2: '#008000',
    number3: '#ff0000',
    number4: '#000080',
});

const COLOR_FIELDS = Object.freeze([
    ['background', '창 배경'],
    ['panel', '상단 패널'],
    ['closed', '닫힌 칸'],
    ['open', '열린 칸'],
    ['light', '밝은 테두리'],
    ['shadow', '어두운 테두리'],
    ['dark', '가장 어두운 테두리'],
    ['text', '글자'],
    ['displayBackground', '카운터 배경'],
    ['displayText', '카운터 글자'],
    ['flag', '깃발'],
    ['mine', '지뢰'],
    ['number1', '숫자 1'],
    ['number2', '숫자 2'],
    ['number3', '숫자 3'],
    ['number4', '숫자 4 이상'],
]);

const DEFAULT_SETTINGS = Object.freeze({
    theme: 'classic',
    difficulty: 'beginner',
    showFloatingButton: true,
    floatingPosition: null,
    customThemes: [],
});

const SETTINGS_TEMPLATE = `
<div id="stcm-settings" class="stcm-settings">
    <div class="inline-drawer">
        <div class="inline-drawer-toggle inline-drawer-header">
            <b>💣 Classic Minesweeper</b>
            <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
        </div>
        <div class="inline-drawer-content">
            <label class="checkbox_label" for="stcm-show-floating">
                <input id="stcm-show-floating" type="checkbox">
                <span>플로팅 버튼 표시</span>
            </label>
            <label for="stcm-theme-select">테마</label>
            <select id="stcm-theme-select" class="text_pole"></select>
            <div id="stcm-custom-toolbar" class="stcm-settings-row">
                <button id="stcm-theme-new" class="menu_button" type="button">새 테마</button>
                <button id="stcm-theme-copy" class="menu_button" type="button">복제</button>
                <button id="stcm-theme-delete" class="menu_button" type="button">삭제</button>
            </div>
            <div id="stcm-custom-editor" hidden>
                <label for="stcm-theme-name">테마 이름</label>
                <input id="stcm-theme-name" class="text_pole" type="text" maxlength="40">
                <div id="stcm-color-grid" class="stcm-color-grid"></div>
            </div>
            <div class="stcm-settings-row">
                <button id="stcm-theme-export" class="menu_button" type="button">테마 내보내기</button>
                <button id="stcm-theme-import" class="menu_button" type="button">테마 불러오기</button>
                <input id="stcm-theme-file" type="file" accept="application/json,.json" hidden>
            </div>
            <small>게임 열기: <code>/minesweeper</code> 또는 <code>/ms</code></small>
        </div>
    </div>
</div>`;

let settings;
let initialized = false;
let slashRegistered = false;
let panelOpen = false;
let inputMode = 'reveal';
let game;
let timerInterval = null;
let elapsedMs = 0;
let timerStartedAt = null;
let longPressTimer = null;
let longPressTriggered = false;
let suppressClickUntil = 0;

function context() {
    return SillyTavern.getContext();
}

function clone(value) {
    return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function getSettings() {
    const { extensionSettings } = context();
    if (!extensionSettings[MODULE_NAME]) extensionSettings[MODULE_NAME] = clone(DEFAULT_SETTINGS);
    const stored = extensionSettings[MODULE_NAME];

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (!Object.hasOwn(stored, key)) stored[key] = clone(value);
    }
    if (!DIFFICULTIES[stored.difficulty]) stored.difficulty = 'beginner';
    if (!Array.isArray(stored.customThemes)) stored.customThemes = [];
    return stored;
}

function saveSettings() {
    context().saveSettingsDebounced();
}

function makeId() {
    return `theme-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function createUi() {
    if (document.getElementById('stcm-root')) return;

    const root = document.createElement('div');
    root.id = 'stcm-root';
    root.innerHTML = `
        <button id="stcm-floating-button" type="button" aria-label="지뢰찾기 열기" title="지뢰찾기 열기">💣</button>
        <section id="stcm-window" role="dialog" aria-modal="false" aria-label="클래식 지뢰찾기" hidden>
            <div class="stcm-titlebar">
                <span class="stcm-titlebar-icon" aria-hidden="true">💣</span>
                <strong>지뢰찾기</strong>
                <button id="stcm-close" type="button" aria-label="닫기" title="닫기">×</button>
            </div>
            <div class="stcm-menubar" role="toolbar" aria-label="난이도 선택">
                <button type="button" data-difficulty="beginner">초급</button>
                <button type="button" data-difficulty="intermediate">중급</button>
            </div>
            <div class="stcm-game-frame">
                <div class="stcm-statusbar">
                    <output id="stcm-mine-counter" class="stcm-counter" aria-label="남은 지뢰">010</output>
                    <button id="stcm-face" class="stcm-face" type="button" aria-label="새 게임" title="새 게임">🙂</button>
                    <output id="stcm-timer" class="stcm-counter" aria-label="경과 시간">000</output>
                </div>
                <div id="stcm-board-wrap" class="stcm-board-wrap">
                    <div id="stcm-board" class="stcm-board" role="grid" aria-label="지뢰찾기 게임판"></div>
                </div>
                <div class="stcm-touch-controls" aria-label="모바일 조작 모드">
                    <button type="button" data-input-mode="reveal" aria-pressed="true">칸 열기</button>
                    <button type="button" data-input-mode="flag" aria-pressed="false">깃발</button>
                </div>
            </div>
        </section>`;
    document.body.append(root);

    root.querySelector('#stcm-floating-button').addEventListener('click', event => {
        if (event.currentTarget.dataset.dragged === 'true') {
            event.currentTarget.dataset.dragged = 'false';
            return;
        }
        togglePanel();
    });
    root.querySelector('#stcm-close').addEventListener('click', closePanel);
    root.querySelector('#stcm-face').addEventListener('click', () => startNewGame(settings.difficulty));
    root.querySelectorAll('[data-difficulty]').forEach(button => {
        button.addEventListener('click', () => startNewGame(button.dataset.difficulty));
    });
    root.querySelectorAll('[data-input-mode]').forEach(button => {
        button.addEventListener('click', () => setInputMode(button.dataset.inputMode));
    });

    const board = root.querySelector('#stcm-board');
    board.addEventListener('click', handleBoardClick);
    board.addEventListener('contextmenu', handleBoardContextMenu);
    board.addEventListener('pointerdown', handleBoardPointerDown);
    board.addEventListener('pointerup', cancelLongPress);
    board.addEventListener('pointercancel', cancelLongPress);
    board.addEventListener('pointerleave', cancelLongPress);

    makeFloatingButtonDraggable(root.querySelector('#stcm-floating-button'));
    window.addEventListener('resize', () => {
        placeFloatingButton();
        updateCellSize();
    }, { passive: true });
}

function makeFloatingButtonDraggable(button) {
    let drag = null;

    button.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const rect = button.getBoundingClientRect();
        drag = {
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            moved: false,
        };
        button.setPointerCapture(event.pointerId);
    });

    button.addEventListener('pointermove', event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 6) drag.moved = true;
        if (!drag.moved) return;

        const size = button.offsetWidth || 48;
        const left = Math.min(Math.max(8, event.clientX - drag.offsetX), window.innerWidth - size - 8);
        const top = Math.min(Math.max(8, event.clientY - drag.offsetY), window.innerHeight - size - 8);
        button.style.left = `${left}px`;
        button.style.top = `${top}px`;
        button.style.right = 'auto';
        button.style.bottom = 'auto';
    });

    button.addEventListener('pointerup', event => {
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (drag.moved) {
            button.dataset.dragged = 'true';
            const rect = button.getBoundingClientRect();
            settings.floatingPosition = {
                x: rect.left / Math.max(1, window.innerWidth - rect.width),
                y: rect.top / Math.max(1, window.innerHeight - rect.height),
            };
            saveSettings();
        }
        drag = null;
    });
}

function placeFloatingButton() {
    const button = document.getElementById('stcm-floating-button');
    if (!button) return;
    button.hidden = !settings.showFloatingButton;
    const position = settings.floatingPosition;
    if (!position || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
        button.style.left = 'auto';
        button.style.top = 'auto';
        button.style.right = '16px';
        button.style.bottom = '96px';
        return;
    }

    const size = button.offsetWidth || 48;
    const left = Math.min(Math.max(8, position.x * (window.innerWidth - size)), window.innerWidth - size - 8);
    const top = Math.min(Math.max(8, position.y * (window.innerHeight - size)), window.innerHeight - size - 8);
    button.style.left = `${left}px`;
    button.style.top = `${top}px`;
    button.style.right = 'auto';
    button.style.bottom = 'auto';
}

function openPanel() {
    if (!initialized) {
        void initialize().then(openPanel);
        return;
    }
    if (panelOpen) return;
    panelOpen = true;
    document.getElementById('stcm-window').hidden = false;
    document.getElementById('stcm-floating-button').setAttribute('aria-label', '지뢰찾기 닫기');
    resumeTimer();
    updateCellSize();
    renderAll();
}

function closePanel() {
    if (!initialized || !panelOpen) return;
    panelOpen = false;
    pauseTimer();
    document.getElementById('stcm-window').hidden = true;
    document.getElementById('stcm-floating-button').setAttribute('aria-label', '지뢰찾기 열기');
}

function togglePanel() {
    panelOpen ? closePanel() : openPanel();
}

function startNewGame(difficultyKey = 'beginner') {
    const difficulty = DIFFICULTIES[difficultyKey] ?? DIFFICULTIES.beginner;
    settings.difficulty = DIFFICULTIES[difficultyKey] ? difficultyKey : 'beginner';
    saveSettings();
    elapsedMs = 0;
    timerStartedAt = null;
    stopTimerInterval();
    game = new MinesweeperGame(difficulty.rows, difficulty.columns, difficulty.mines);
    buildBoard();
    updateCellSize();
    renderAll();
}

function buildBoard() {
    const board = document.getElementById('stcm-board');
    const fragment = document.createDocumentFragment();
    board.replaceChildren();
    board.style.setProperty('--stcm-columns', String(game.columns));

    for (let index = 0; index < game.size; index += 1) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'stcm-cell';
        cell.dataset.index = String(index);
        cell.setAttribute('role', 'gridcell');
        cell.setAttribute('aria-label', '닫힌 칸');
        fragment.append(cell);
    }
    board.append(fragment);
}

function updateCellSize() {
    if (!game) return;
    const board = document.getElementById('stcm-board');
    if (!board) return;
    const available = Math.max(280, Math.min(window.innerWidth - 18, 680));
    const maximum = game.columns === 9 ? 30 : 24;
    const minimum = game.columns === 9 ? 24 : 18;
    const size = Math.max(minimum, Math.min(maximum, Math.floor((available - 18) / game.columns)));
    board.style.setProperty('--stcm-cell-size', `${size}px`);
}

function beginTimerIfNeeded() {
    if (game.status !== GAME_STATUS.RUNNING || timerStartedAt !== null || !panelOpen) return;
    timerStartedAt = Date.now();
    startTimerInterval();
}

function pauseTimer() {
    if (timerStartedAt !== null) {
        elapsedMs += Date.now() - timerStartedAt;
        timerStartedAt = null;
    }
    stopTimerInterval();
    renderTimer();
}

function resumeTimer() {
    if (game?.status !== GAME_STATUS.RUNNING || timerStartedAt !== null) return;
    timerStartedAt = Date.now();
    startTimerInterval();
}

function finishTimer() {
    pauseTimer();
}

function startTimerInterval() {
    if (timerInterval !== null) return;
    timerInterval = window.setInterval(renderTimer, 250);
}

function stopTimerInterval() {
    if (timerInterval === null) return;
    window.clearInterval(timerInterval);
    timerInterval = null;
}

function currentElapsedSeconds() {
    const live = timerStartedAt === null ? 0 : Date.now() - timerStartedAt;
    return Math.min(999, Math.floor((elapsedMs + live) / 1000));
}

function formatCounter(value) {
    const clamped = Math.max(-99, Math.min(999, value));
    return clamped < 0 ? `-${String(Math.abs(clamped)).padStart(2, '0')}` : String(clamped).padStart(3, '0');
}

function cellFromEvent(event) {
    return event.target.closest('.stcm-cell');
}

function handleBoardClick(event) {
    const cell = cellFromEvent(event);
    if (!cell || Date.now() < suppressClickUntil) return;
    const index = Number(cell.dataset.index);
    if (inputMode === 'flag') performFlag(index);
    else performReveal(index);
}

function handleBoardContextMenu(event) {
    const cell = cellFromEvent(event);
    if (!cell) return;
    event.preventDefault();
    if (Date.now() < suppressClickUntil) return;
    performFlag(Number(cell.dataset.index));
}

function handleBoardPointerDown(event) {
    if (event.pointerType === 'mouse' || event.button !== 0) return;
    const cell = cellFromEvent(event);
    if (!cell) return;
    longPressTriggered = false;
    const index = Number(cell.dataset.index);
    longPressTimer = window.setTimeout(() => {
        longPressTriggered = true;
        suppressClickUntil = Date.now() + 700;
        performFlag(index);
        if (navigator.vibrate) navigator.vibrate(20);
    }, 480);
}

function cancelLongPress() {
    if (longPressTimer !== null) window.clearTimeout(longPressTimer);
    longPressTimer = null;
    if (longPressTriggered) suppressClickUntil = Date.now() + 700;
}

function performReveal(index) {
    const before = game.status;
    if (!game.reveal(index)) return;
    if (before === GAME_STATUS.READY && game.status === GAME_STATUS.RUNNING) beginTimerIfNeeded();
    if (game.status === GAME_STATUS.WON || game.status === GAME_STATUS.LOST) finishTimer();
    renderAll();
}

function performFlag(index) {
    if (!game.toggleFlag(index)) return;
    renderAll();
}

function setInputMode(mode) {
    inputMode = mode === 'flag' ? 'flag' : 'reveal';
    document.querySelectorAll('#stcm-window [data-input-mode]').forEach(button => {
        button.setAttribute('aria-pressed', String(button.dataset.inputMode === inputMode));
    });
}

function renderAll() {
    if (!game) return;
    renderBoard();
    renderCounters();
    renderTimer();
    renderFace();
    renderDifficulty();
}

function renderBoard() {
    const cells = document.querySelectorAll('#stcm-board .stcm-cell');
    cells.forEach((cell, index) => {
        const state = game.states[index];
        const value = game.values[index];
        const isMine = value === -1;
        cell.className = 'stcm-cell';
        cell.textContent = '';
        cell.disabled = false;

        if (game.status === GAME_STATUS.LOST && state === CELL_STATE.FLAGGED && !isMine) {
            cell.classList.add('is-open', 'is-wrong-flag');
            cell.textContent = '×';
            cell.setAttribute('aria-label', '잘못 표시한 깃발');
        } else if (state === CELL_STATE.FLAGGED) {
            cell.classList.add('is-flagged');
            cell.textContent = '⚑';
            cell.setAttribute('aria-label', '깃발이 꽂힌 칸');
        } else if (state === CELL_STATE.OPEN) {
            cell.classList.add('is-open');
            if (isMine) {
                cell.classList.add(index === game.explodedIndex ? 'is-exploded' : 'is-mine');
                cell.textContent = '✹';
                cell.setAttribute('aria-label', index === game.explodedIndex ? '폭발한 지뢰' : '지뢰');
            } else if (value > 0) {
                cell.classList.add(`number-${Math.min(value, 4)}`);
                cell.textContent = String(value);
                cell.setAttribute('aria-label', `주변 지뢰 ${value}개`);
            } else {
                cell.setAttribute('aria-label', '빈 칸');
            }
        } else if (game.status === GAME_STATUS.LOST && isMine) {
            cell.classList.add('is-open', 'is-mine');
            cell.textContent = '✹';
            cell.setAttribute('aria-label', '지뢰');
        } else {
            cell.setAttribute('aria-label', '닫힌 칸');
        }
    });
}

function renderCounters() {
    document.getElementById('stcm-mine-counter').textContent = formatCounter(game.mineCount - game.flaggedCount);
}

function renderTimer() {
    const timer = document.getElementById('stcm-timer');
    if (timer) timer.textContent = formatCounter(currentElapsedSeconds());
}

function renderFace() {
    const face = document.getElementById('stcm-face');
    if (!face) return;
    face.textContent = game.status === GAME_STATUS.WON ? '😎' : game.status === GAME_STATUS.LOST ? '😵' : '🙂';
}

function renderDifficulty() {
    document.querySelectorAll('#stcm-window [data-difficulty]').forEach(button => {
        button.classList.toggle('is-active', button.dataset.difficulty === settings.difficulty);
    });
}

function selectedCustomTheme() {
    if (!settings.theme.startsWith('custom:')) return null;
    const id = settings.theme.slice('custom:'.length);
    return settings.customThemes.find(theme => theme.id === id) ?? null;
}

function normalizeColors(colors = {}) {
    const normalized = {};
    for (const key of Object.keys(DEFAULT_COLORS)) {
        const value = colors[key];
        normalized[key] = typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : DEFAULT_COLORS[key];
    }
    return normalized;
}

function applyTheme() {
    const root = document.getElementById('stcm-root');
    if (!root) return;
    root.dataset.theme = settings.theme === 'inherit' ? 'inherit' : settings.theme === 'classic' ? 'classic' : 'custom';

    for (const key of Object.keys(DEFAULT_COLORS)) root.style.removeProperty(`--stcm-${key}`);
    const custom = selectedCustomTheme();
    if (!custom) return;
    custom.colors = normalizeColors(custom.colors);
    for (const [key, value] of Object.entries(custom.colors)) root.style.setProperty(`--stcm-${key}`, value);
}

function createSettingsUi() {
    if (document.getElementById('stcm-settings')) return;
    const host = document.getElementById('extensions_settings2') ?? document.getElementById('extensions_settings');
    if (!host) return;
    host.insertAdjacentHTML('beforeend', SETTINGS_TEMPLATE);
    bindSettingsUi();
    renderSettingsUi();
}

function bindSettingsUi() {
    document.getElementById('stcm-show-floating').addEventListener('change', event => {
        settings.showFloatingButton = event.target.checked;
        saveSettings();
        placeFloatingButton();
    });
    document.getElementById('stcm-theme-select').addEventListener('change', event => {
        settings.theme = event.target.value;
        saveSettings();
        applyTheme();
        renderSettingsUi();
    });
    document.getElementById('stcm-theme-new').addEventListener('click', createCustomTheme);
    document.getElementById('stcm-theme-copy').addEventListener('click', duplicateSelectedTheme);
    document.getElementById('stcm-theme-delete').addEventListener('click', deleteSelectedTheme);
    document.getElementById('stcm-theme-export').addEventListener('click', exportSelectedTheme);
    document.getElementById('stcm-theme-import').addEventListener('click', () => document.getElementById('stcm-theme-file').click());
    document.getElementById('stcm-theme-file').addEventListener('change', importThemeFile);
    document.getElementById('stcm-theme-name').addEventListener('input', event => {
        const theme = selectedCustomTheme();
        if (!theme) return;
        theme.name = event.target.value.slice(0, 40) || '사용자 테마';
        saveSettings();
        renderThemeSelect();
    });

    const colorGrid = document.getElementById('stcm-color-grid');
    for (const [key, label] of COLOR_FIELDS) {
        const wrapper = document.createElement('label');
        wrapper.className = 'stcm-color-field';
        wrapper.innerHTML = `<span>${label}</span><input type="color" data-color-key="${key}">`;
        wrapper.querySelector('input').addEventListener('input', event => {
            const theme = selectedCustomTheme();
            if (!theme) return;
            theme.colors[key] = event.target.value;
            saveSettings();
            applyTheme();
        });
        colorGrid.append(wrapper);
    }
}

function renderThemeSelect() {
    const select = document.getElementById('stcm-theme-select');
    if (!select) return;
    select.replaceChildren();
    select.add(new Option('Windows Classic', 'classic'));
    select.add(new Option('현재 실리태번 테마 따라가기', 'inherit'));
    for (const theme of settings.customThemes) select.add(new Option(theme.name, `custom:${theme.id}`));
    if (![...select.options].some(option => option.value === settings.theme)) settings.theme = 'classic';
    select.value = settings.theme;
}

function renderSettingsUi() {
    const showFloating = document.getElementById('stcm-show-floating');
    if (!showFloating) return;
    showFloating.checked = settings.showFloatingButton;
    renderThemeSelect();

    const theme = selectedCustomTheme();
    document.getElementById('stcm-custom-editor').hidden = !theme;
    document.getElementById('stcm-theme-delete').disabled = !theme;
    document.getElementById('stcm-theme-name').value = theme?.name ?? '';
    document.querySelectorAll('#stcm-color-grid [data-color-key]').forEach(input => {
        input.value = theme?.colors?.[input.dataset.colorKey] ?? DEFAULT_COLORS[input.dataset.colorKey];
    });
}

function createCustomTheme() {
    const theme = { id: makeId(), name: `사용자 테마 ${settings.customThemes.length + 1}`, colors: clone(DEFAULT_COLORS) };
    settings.customThemes.push(theme);
    settings.theme = `custom:${theme.id}`;
    saveSettings();
    applyTheme();
    renderSettingsUi();
}

function duplicateSelectedTheme() {
    const source = selectedCustomTheme();
    const colors = source ? source.colors : DEFAULT_COLORS;
    const name = source ? `${source.name} 복사본` : 'Windows Classic 복사본';
    const theme = { id: makeId(), name, colors: normalizeColors(clone(colors)) };
    settings.customThemes.push(theme);
    settings.theme = `custom:${theme.id}`;
    saveSettings();
    applyTheme();
    renderSettingsUi();
}

function deleteSelectedTheme() {
    const theme = selectedCustomTheme();
    if (!theme || !window.confirm(`“${theme.name}” 테마를 삭제할까요?`)) return;
    settings.customThemes = settings.customThemes.filter(item => item.id !== theme.id);
    settings.theme = 'classic';
    saveSettings();
    applyTheme();
    renderSettingsUi();
}

function exportSelectedTheme() {
    const selected = selectedCustomTheme();
    const payload = selected
        ? { format: 'st-classic-minesweeper-theme', version: 1, name: selected.name, colors: normalizeColors(selected.colors) }
        : { format: 'st-classic-minesweeper-theme', version: 1, name: 'Windows Classic', colors: clone(DEFAULT_COLORS) };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${payload.name.replace(/[\\/:*?"<>|]/g, '_')}.json`;
    link.click();
    URL.revokeObjectURL(url);
}

async function importThemeFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
        const payload = JSON.parse(await file.text());
        if (payload.format !== 'st-classic-minesweeper-theme' || typeof payload.name !== 'string' || !payload.colors) {
            throw new Error('지원하지 않는 테마 파일입니다.');
        }
        const theme = { id: makeId(), name: payload.name.slice(0, 40) || '불러온 테마', colors: normalizeColors(payload.colors) };
        settings.customThemes.push(theme);
        settings.theme = `custom:${theme.id}`;
        saveSettings();
        applyTheme();
        renderSettingsUi();
        context().toastr?.success?.('지뢰찾기 테마를 불러왔습니다.');
    } catch (error) {
        console.error('[Classic Minesweeper] Theme import failed.', error);
        context().toastr?.error?.(error.message || '테마를 불러오지 못했습니다.');
    }
}

function registerSlashCommand() {
    if (slashRegistered) return;
    slashRegistered = true;
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'minesweeper',
        aliases: ['ms', '지뢰찾기'],
        callback: (_namedArgs, unnamedArgs) => {
            const action = String(Array.isArray(unnamedArgs) ? unnamedArgs[0] ?? '' : unnamedArgs ?? '').trim().toLowerCase();
            if (action === 'open' || action === '열기') openPanel();
            else if (action === 'close' || action === '닫기') closePanel();
            else if (action === 'new' || action === '새게임') {
                void initialize().then(() => {
                    openPanel();
                    startNewGame(settings.difficulty);
                });
            } else if (action === 'beginner' || action === '초급') {
                void initialize().then(() => {
                    openPanel();
                    startNewGame('beginner');
                });
            } else if (action === 'intermediate' || action === '중급') {
                void initialize().then(() => {
                    openPanel();
                    startNewGame('intermediate');
                });
            } else togglePanel();
            return '';
        },
        unnamedArgumentList: [
            SlashCommandArgument.fromProps({
                description: 'open, close, new, beginner, intermediate 중 하나',
                typeList: [ARGUMENT_TYPE.STRING],
                isRequired: false,
                enumList: ['open', 'close', 'new', 'beginner', 'intermediate'],
            }),
        ],
        helpString: `
            <div>클래식 지뢰찾기를 열거나 닫습니다.</div>
            <div><code>/minesweeper</code>, <code>/ms new</code>, <code>/ms beginner</code>, <code>/ms intermediate</code></div>
        `,
    }));
}

async function initialize() {
    if (initialized) return;
    initialized = true;
    settings = getSettings();
    createUi();
    startNewGame(settings.difficulty);
    applyTheme();
    placeFloatingButton();
    createSettingsUi();
}

export function onActivate() {
    registerSlashCommand();
    const { eventSource, event_types } = context();
    eventSource.on(event_types.APP_READY, () => {
        window.setTimeout(() => void initialize(), 0);
    });
}
