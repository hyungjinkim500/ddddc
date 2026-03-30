import { db } from './firebase-config.js';
import { collection, query, where, orderBy, getDocs, doc, setDoc, increment, limit } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { formatTime } from './modules/quiz-card.js';

// ── 상태 ──────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);
let currentKeyword = params.get('q') || '';

const PAGE_SIZE = 25;
let allResults = [];
let currentPage = 1;

// ── 유틸 ──────────────────────────────────────────────
function getPostTypeBadge(type) {
    if (type === 'quiz') return 'PIX';
    if (type === 'superquiz') return 'PIX';
    return 'POST';
}

function getBadgeColor(type) {
    if (type === 'quiz' || type === 'superquiz') return 'text-[#169976]';
    return 'text-slate-500';
}

// ── 뷰 전환 ───────────────────────────────────────────
function showMainView() {
    document.getElementById('explore-main-content').classList.remove('hidden');
    document.getElementById('search-results-wrap').classList.remove('visible');
    document.getElementById('explore-search-input').value = '';
    currentKeyword = '';
    // URL 파라미터 제거
    const url = new URL(window.location.href);
    url.searchParams.delete('q');
    window.history.replaceState({}, '', url);
}

function showResultsView(keyword) {
    document.getElementById('explore-main-content').classList.add('hidden');
    document.getElementById('search-results-wrap').classList.add('visible');
    document.getElementById('search-keyword-display').textContent = keyword;
    document.getElementById('explore-search-input').value = keyword;
    // URL 업데이트
    const url = new URL(window.location.href);
    url.searchParams.set('q', keyword);
    window.history.replaceState({}, '', url);
}

// ── 카테고리 로드 ──────────────────────────────────────
async function loadCategories() {
    const filterCategory = document.getElementById('filter-category');
    if (!filterCategory) return;
    try {
        const snap = await getDocs(query(collection(db, 'categories'), orderBy('order')));
        snap.forEach(d => {
            const opt = document.createElement('option');
            opt.value = d.id;
            opt.textContent = d.data().name;
            filterCategory.appendChild(opt);
        });
        filterCategory.classList.add('hidden');
    } catch (e) {
        console.error('카테고리 로드 실패:', e);
        filterCategory.classList.add('hidden');
    }
}

// ── 인기 검색어 ────────────────────────────────────────
async function loadTrendingKeywords() {
    const container = document.getElementById('trending-keywords');
    if (!container) return;

    try {
        const q = query(collection(db, 'searchLogs'), orderBy('count', 'desc'), limit(10));
        const snapshot = await getDocs(q);

        const keywords = [];
        snapshot.forEach(d => keywords.push(d.data().keyword));

        container.innerHTML = '';

        if (keywords.length === 0) {
            container.innerHTML = '<p class="text-sm text-slate-400">아직 인기 검색어가 없어요</p>';
            return;
        }

        keywords.forEach((keyword, idx) => {
            const btn = document.createElement('button');
            btn.className = 'trend-tag';
            const displayText = keyword.length > 8 ? keyword.substring(0, 8) + '...' : keyword;
            btn.innerHTML = `<span class="text-[#169976] font-bold text-xs">${idx + 1}</span> #${displayText}`;
            btn.addEventListener('click', () => handleSearch(keyword));
            container.appendChild(btn);
        });
    } catch (e) {
        console.error('인기 검색어 로드 실패:', e);
        const container = document.getElementById('trending-keywords');
        if (container) container.innerHTML = '<p class="text-sm text-slate-400">불러오기 실패</p>';
    }
}

// ── 검색 로깅 ──────────────────────────────────────────
async function logSearch(keyword) {
    if (!keyword) return;
    try {
        const logRef = doc(db, 'searchLogs', keyword.toLowerCase());
        await setDoc(logRef, {
            keyword: keyword.toLowerCase(),
            count: increment(1),
            lastSearched: new Date()
        }, { merge: true });
    } catch (e) {
        console.error('검색 로그 실패:', e);
    }
}

// ── 검색 실행 ──────────────────────────────────────────
async function handleSearch(keyword) {
    const trimmed = keyword.trim();
    if (!trimmed) return;

    currentKeyword = trimmed;
    showResultsView(trimmed);

    await Promise.all([
        performSearch(trimmed),
        logSearch(trimmed)
    ]);
}

async function performSearch(searchTerm) {
    const container = document.getElementById('search-results-container');
    if (!container) return;

    // 로딩 스켈레톤
    container.innerHTML = `
        <div class="space-y-2">
            ${Array(5).fill(`
                <div class="result-item">
                    <div class="skeleton h-4 w-3/4 mb-2"></div>
                    <div class="skeleton h-3 w-1/2"></div>
                </div>
            `).join('')}
        </div>
    `;

    try {
        const qPrefix = query(
            collection(db, 'questions'),
            where('title', '>=', searchTerm),
            where('title', '<=', searchTerm + '\uf8ff')
        );
        const qAll = query(collection(db, 'questions'));
        const [snapPrefix, snapAll] = await Promise.all([getDocs(qPrefix), getDocs(qAll)]);

        const seen = new Set();
        const merged = [];
        for (const d of [...snapPrefix.docs, ...snapAll.docs]) {
            if (seen.has(d.id)) continue;
            const data = d.data();
            const titleMatch = (data.title || '').includes(searchTerm);
            const descMatch = (data.description || '').includes(searchTerm);
            if (titleMatch || descMatch) {
                seen.add(d.id);
                merged.push({ id: d.id, ...data });
            }
        }
        allResults = merged;
        currentPage = 1;
        renderPage();
    } catch (e) {
        console.error('검색 실패:', e);
        container.innerHTML = '<p class="text-slate-400 text-center py-8 text-sm">검색 중 오류가 발생했습니다.</p>';
    }
}

// ── 결과 렌더링 ────────────────────────────────────────
function renderPage() {
    const container = document.getElementById('search-results-container');
    const paginationEl = document.getElementById('pagination');
    const resultCountEl = document.getElementById('result-count');
    const filterSort = document.getElementById('filter-sort');
    const filterCategory = document.getElementById('filter-category');

    if (!container) return;

    let filtered = [...allResults];

    // 카테고리 필터
    const catVal = filterCategory?.value;
    if (catVal) filtered = filtered.filter(p => p.category === catVal);

    // 정렬
    const sortVal = filterSort?.value;
    if (sortVal === 'popular') {
        filtered.sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0));
    } else {
        filtered.sort((a, b) => {
            const tA = a.createdAt?.toDate?.() || 0;
            const tB = b.createdAt?.toDate?.() || 0;
            return tB - tA;
        });
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    if (resultCountEl) resultCountEl.textContent = `총 ${filtered.length}개`;
    container.innerHTML = '';

    if (pageItems.length === 0) {
        container.innerHTML = `
            <div class="text-center py-12">
                <i class="fas fa-search text-3xl text-slate-300 dark:text-slate-600 mb-3"></i>
                <p class="text-slate-400 text-sm">검색 결과가 없습니다</p>
            </div>
        `;
        if (paginationEl) paginationEl.innerHTML = '';
        return;
    }

    pageItems.forEach(post => {
        const badge = getPostTypeBadge(post.type);
        const badgeColor = getBadgeColor(post.type);
        const item = document.createElement('a');
        item.href = `post.html?id=${post.id}`;
        item.className = 'result-item';
        item.innerHTML = `
            <div class="flex items-center gap-2">
                <span class="text-xs font-bold ${badgeColor} flex-shrink-0">[${badge}]</span>
                <span class="flex-1 truncate text-sm font-semibold text-slate-800 dark:text-slate-100">${post.title || '제목 없음'}</span>
            </div>
            <div class="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                <span>♥ ${post.likesCount || 0}</span>
                <span>💬 ${post.commentsCount || 0}</span>
                <span>조회 ${post.views || 0}</span>
                <span class="ml-auto">${formatTime(post.createdAt)}</span>
            </div>
        `;
        container.appendChild(item);
    });

    renderPagination(totalPages);
}

function renderPagination(totalPages) {
    const el = document.getElementById('pagination');
    if (!el) return;
    el.innerHTML = '';
    if (totalPages <= 1) return;

    const createBtn = (text, page, isDisabled = false, isActive = false) => {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.disabled = isDisabled;
        if (isActive) btn.classList.add('active-page');
        btn.addEventListener('click', () => {
            currentPage = page;
            renderPage();
            document.getElementById('explore-main')?.scrollTo(0, 0);
        });
        return btn;
    };

    el.appendChild(createBtn('이전', currentPage - 1, currentPage === 1));
    for (let i = 1; i <= totalPages; i++) {
        el.appendChild(createBtn(i, i, false, i === currentPage));
    }
    el.appendChild(createBtn('다음', currentPage + 1, currentPage === totalPages));
}

// ── 테마 초기화 ────────────────────────────────────────
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(savedTheme);
}

// ── 초기화 ─────────────────────────────────────────────
function init() {
    initTheme();

    const searchInput = document.getElementById('explore-search-input');
    const searchBtn = document.getElementById('explore-search-btn');
    const backBtn = document.getElementById('back-to-explore');
    const filterSort = document.getElementById('filter-sort');
    const filterCategory = document.getElementById('filter-category');

    // 검색 실행
    searchBtn?.addEventListener('click', () => handleSearch(searchInput?.value || ''));
    searchInput?.addEventListener('keydown', e => {
        if (e.key === 'Enter') handleSearch(searchInput.value);
    });

    // 뒤로가기 (메인으로)
    backBtn?.addEventListener('click', showMainView);

    // 필터 변경
    filterSort?.addEventListener('change', () => { currentPage = 1; renderPage(); });
    filterCategory?.addEventListener('change', () => { currentPage = 1; renderPage(); });

    // 인기 검색어 로드
    loadTrendingKeywords();
    loadCategories();

    // URL에 검색어가 있으면 바로 검색 결과 표시
    if (currentKeyword) {
        showResultsView(currentKeyword);
        performSearch(currentKeyword);
        // logSearch는 직접 URL 입력 시엔 카운트 안 올림 (의도적)
    }
}

document.addEventListener('DOMContentLoaded', init);
