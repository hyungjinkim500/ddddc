import { db } from './firebase-config.js';
import { collection, query, where, orderBy, getDocs, doc, setDoc, increment } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { formatTime } from './modules/quiz-card.js';
import { loadHeader } from './header.js';

const params = new URLSearchParams(window.location.search);
const keyword = params.get('q');

const PAGE_SIZE = 25;
let allResults = [];
let currentPage = 1;

function getPostTypeBadge(type) {
    if (type === 'quiz') return 'PICK';
    if (type === 'superquiz') return 'TOPIC';
    return 'POST';
}

async function loadCategories() {
    const filterCategory = document.getElementById('filter-category');
    if (!filterCategory) return;
    const snap = await getDocs(query(collection(db, 'categories'), orderBy('order')));
    snap.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.data().name;
        filterCategory.appendChild(opt);
    });
}

async function renderCategoryNavbar() {
    const navbar = document.getElementById('category-tabs');
    if (!navbar) return;
    const snap = await getDocs(query(collection(db, 'categories'), orderBy('order')));
    snap.forEach(docSnap => {
        const category = docSnap.data();
        const tab = document.createElement('a');
        tab.href = `category.html?cat=${docSnap.id}`;
        tab.className = 'whitespace-nowrap pb-2 px-1 border-b-2 border-transparent text-sm font-medium text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-200';
        tab.textContent = category.name;
        navbar.appendChild(tab);
    });
}


function renderPage() {
    const resultsContainer = document.getElementById('search-results-container');
    const paginationEl = document.getElementById('pagination');
    const resultCountEl = document.getElementById('result-count');
    const filterSort = document.getElementById('filter-sort');
    const filterCategory = document.getElementById('filter-category');

    if (!resultsContainer) return;

    let filtered = [...allResults];
    const catVal = filterCategory.value;
    if (catVal) {
        filtered = filtered.filter(p => p.category === catVal);
    }

    const sortVal = filterSort.value;
    if (sortVal === 'popular') {
        filtered.sort((a, b) => (b.popularityScore || 0) - (a.popularityScore || 0));
    } else { // 'latest'
        filtered.sort((a, b) => {
            const timeA = a.createdAt?.toDate?.() || 0;
            const timeB = b.createdAt?.toDate?.() || 0;
            return timeB - timeA;
        });
    }

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    resultCountEl.textContent = `총 ${filtered.length}개`;
    resultsContainer.innerHTML = '';

    if (pageItems.length === 0) {
        resultsContainer.innerHTML = '<p class="text-slate-500 text-center py-8">검색 결과가 없습니다.</p>';
        paginationEl.innerHTML = '';
        return;
    }

    pageItems.forEach(post => {
        const badge = getPostTypeBadge(post.type);
        const item = document.createElement('a');
        item.href = `view.html?id=${post.id}`;
        item.className = 'block border rounded-lg px-4 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition';
        item.innerHTML = `
            <div class="flex items-center gap-3 text-sm">
                <span class="text-xs font-bold text-[#169976]">[${badge}]</span>
                <span class="flex-1 truncate font-semibold text-slate-800 dark:text-slate-100">${post.title || '제목 없음'}</span>
                <span class="text-xs text-slate-500 dark:text-slate-400">♥ ${post.likesCount || 0}</span>
                <span class="text-xs text-slate-500 dark:text-slate-400">조회 ${post.views || 0}</span>
                <span class="text-xs text-slate-400 w-20 text-right">${formatTime(post.createdAt)}</span>
            </div>`;
        resultsContainer.appendChild(item);
    });

    renderPagination(totalPages, filtered.length);
}

function renderPagination(totalPages) {
    const paginationEl = document.getElementById('pagination');
    if (!paginationEl) return;
    paginationEl.innerHTML = '';
    if (totalPages <= 1) return;

    const createBtn = (text, page, isDisabled = false, isActive = false) => {
        const btn = document.createElement('button');
        btn.innerHTML = text;
        btn.disabled = isDisabled;
        btn.className = `px-3 py-1 border rounded text-sm transition ${isDisabled ? 'opacity-40 cursor-not-allowed' : 'hover:bg-slate-100 dark:hover:bg-slate-700'} ${isActive ? 'bg-slate-200 dark:bg-slate-600 font-bold' : 'bg-white dark:bg-slate-800'}`;
        btn.onclick = () => {
            currentPage = page;
            renderPage();
            window.scrollTo(0, 0);
        };
        return btn;
    };

    paginationEl.appendChild(createBtn('이전', currentPage - 1, currentPage === 1));

    for (let i = 1; i <= totalPages; i++) {
        paginationEl.appendChild(createBtn(i, i, false, i === currentPage));
    }

    paginationEl.appendChild(createBtn('다음', currentPage + 1, currentPage === totalPages));
}


async function performSearch(searchTerm) {
    const resultsContainer = document.getElementById('search-results-container');
    if (!searchTerm || !resultsContainer) return;

    resultsContainer.innerHTML = '<p class="text-slate-500 text-center py-8">검색 중...</p>';

    const q = query(
        collection(db, 'questions'),
        where('title', '>=', searchTerm),
        where('title', '<=', searchTerm + '\uf8ff')
    );
    const snapshot = await getDocs(q);
    allResults = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    currentPage = 1;
    renderPage();
}

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
        console.error("Error logging search:", e);
    }
}

function init() {
    const searchKeywordEl = document.getElementById('search-keyword');
    const filterSort = document.getElementById('filter-sort');
    const filterCategory = document.getElementById('filter-category');

    loadHeader().then(() => {
        const searchInput = document.getElementById('search-input');
        if (searchInput && keyword) {
            searchInput.value = keyword;
        }
    });
    
    if (searchKeywordEl && keyword) {
        searchKeywordEl.textContent = keyword;
    }

    if (filterSort) filterSort.addEventListener('change', () => { currentPage = 1; renderPage(); });
    if (filterCategory) filterCategory.addEventListener('change', () => { currentPage = 1; renderPage(); });

    if (keyword) {
        performSearch(keyword);
        logSearch(keyword);
    } else {
        const resultsContainer = document.getElementById('search-results-container');
        if (resultsContainer) {
            resultsContainer.innerHTML = '<p class="text-slate-500 text-center py-8">검색어를 입력해주세요.</p>';
        }
    }
    
    loadCategories();
    renderCategoryNavbar();
}

document.addEventListener('DOMContentLoaded', init);
