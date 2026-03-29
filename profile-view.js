import { db } from './firebase-config.js';
import { collection, query, where, orderBy, limit, startAfter, getDocs, getDoc, doc, getCountFromServer } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const params = new URLSearchParams(window.location.search);
const uid = params.get('uid');

const PAGE_SIZE = 10;
let _page = 0;
let _cursors = [null];
let _totalPages = 0;

async function init() {
    if (!uid) {
        document.getElementById('posts-container').innerHTML = '<p class="text-slate-400">잘못된 접근입니다.</p>';
        return;
    }

    // 프로필 정보 로드
    try {
        const snap = await getDoc(doc(db, 'userProfiles', uid));
        if (snap.exists()) {
            const data = snap.data();
            const nameEl = document.getElementById('profile-name');
            const imgEl = document.getElementById('profile-image');
            if (nameEl) nameEl.textContent = data.displayName || '사용자';
            if (imgEl && data.photoURL) imgEl.src = data.photoURL;
        }
    } catch (e) {
        console.error('프로필 로드 실패:', e);
    }

    await loadPosts(0);
}

async function loadPosts(page = 0) {
    const container = document.getElementById('posts-container');
    if (!container) return;
    container.innerHTML = '<p class="text-slate-400">불러오는 중...</p>';

    // 첫 로드 시 전체 수 조회
    if (page === 0) {
        _cursors = [null];
        const countSnap = await getCountFromServer(query(collection(db, 'questions'), where('creatorId', '==', uid)));
        _totalPages = Math.ceil(countSnap.data().count / PAGE_SIZE);
    }

    // 중간 커서 채우기
    for (let i = 0; i < page; i++) {
        if (!_cursors[i + 1]) {
            const prevCursor = _cursors[i];
            const fillQ = prevCursor
                ? query(collection(db, 'questions'), where('creatorId', '==', uid), orderBy('createdAt', 'desc'), startAfter(prevCursor), limit(PAGE_SIZE))
                : query(collection(db, 'questions'), where('creatorId', '==', uid), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
            const fillSnap = await getDocs(fillQ);
            if (fillSnap.docs.length > 0) _cursors[i + 1] = fillSnap.docs[fillSnap.docs.length - 1];
        }
    }

    const cursor = _cursors[page];
    const q = cursor
        ? query(collection(db, 'questions'), where('creatorId', '==', uid), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE))
        : query(collection(db, 'questions'), where('creatorId', '==', uid), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));

    const snap = await getDocs(q);
    container.innerHTML = '';

    if (snap.empty && page === 0) {
        container.innerHTML = '<p class="text-slate-400">작성한 글이 없습니다.</p>';
        return;
    }

    snap.forEach(docSnap => {
        const d = docSnap.data();
        const badge = d.type === 'pix' ? 'PIX' : d.type === 'quiz' ? 'PIX' : d.type === 'superquiz' ? 'PIX' : 'POST';
        const item = document.createElement('a');
        item.href = `post.html?id=${docSnap.id}`;
        item.className = 'block border rounded-lg px-4 py-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition';
        item.innerHTML = `<div class="flex items-center gap-2"><span class="text-xs font-bold text-[#169976]">[${badge}]</span><span class="flex-1 truncate text-sm text-slate-800 dark:text-slate-100">${d.title || '제목 없음'}</span><span class="text-xs text-slate-400">👁 ${d.views || 0}</span><span class="text-xs text-slate-400">♥ ${d.likesCount || 0}</span></div>`;
        container.appendChild(item);
    });

    if (snap.docs.length > 0) _cursors[page + 1] = snap.docs[snap.docs.length - 1];
    _page = page;

    // 페이지네이션
    if (_totalPages <= 1) return;
    const GROUP_SIZE = 10;
    const currentGroup = Math.floor(page / GROUP_SIZE);
    const groupStart = currentGroup * GROUP_SIZE;
    const groupEnd = Math.min(groupStart + GROUP_SIZE, _totalPages);

    const nav = document.createElement('div');
    nav.className = 'flex justify-center items-center gap-1 mt-4 flex-wrap';

    if (currentGroup > 0) {
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '〈';
        prevBtn.className = 'w-8 h-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
        prevBtn.addEventListener('click', () => loadPosts(groupStart - GROUP_SIZE));
        nav.appendChild(prevBtn);
    }

    for (let i = groupStart; i < groupEnd; i++) {
        const numBtn = document.createElement('button');
        numBtn.textContent = i + 1;
        const isActive = i === page;
        numBtn.className = isActive
            ? 'w-8 h-8 text-sm rounded-lg bg-[#169976] text-white font-bold'
            : 'w-8 h-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
        if (!isActive) numBtn.addEventListener('click', () => loadPosts(i));
        nav.appendChild(numBtn);
    }

    if (groupEnd < _totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.textContent = '〉';
        nextBtn.className = 'w-8 h-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
        nextBtn.addEventListener('click', () => loadPosts(groupEnd));
        nav.appendChild(nextBtn);
    }

    container.appendChild(nav);
}

document.addEventListener('DOMContentLoaded', init);