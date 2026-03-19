import { db, auth } from './firebase-config.js';
import { collection, query, orderBy, limit, startAfter, getDocs, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { handleVote } from './vote-system.js';
import { handleCardLike } from './modules/likes.js';
import { updatePopularityScore } from './quiz-main.js';

const PAGE_SIZE = 10;
let currentTab = 'latest';
let lastDoc = null;
let loading = false;
let hasMore = true;

// 탭별 쿼리 설정
function buildQuery(tab, lastVisible) {
    const base = collection(db, 'questions');
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    let q;
    switch (tab) {
        case 'hot':
            q = lastVisible
                ? query(base, where('createdAt', '>=', oneDayAgo), orderBy('createdAt', 'desc'), orderBy('popularityScore', 'desc'), startAfter(lastVisible), limit(PAGE_SIZE))
                : query(base, where('createdAt', '>=', oneDayAgo), orderBy('createdAt', 'desc'), orderBy('popularityScore', 'desc'), limit(PAGE_SIZE));
            break;
        case 'weekly':
            q = lastVisible
                ? query(base, where('createdAt', '>=', sevenDaysAgo), orderBy('createdAt', 'desc'), orderBy('popularityScore', 'desc'), startAfter(lastVisible), limit(PAGE_SIZE))
                : query(base, where('createdAt', '>=', sevenDaysAgo), orderBy('createdAt', 'desc'), orderBy('popularityScore', 'desc'), limit(PAGE_SIZE));
            break;
        case 'pix-only':
            q = lastVisible
                ? query(base, where('type', 'in', ['quiz', 'superquiz']), orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(PAGE_SIZE))
                : query(base, where('type', 'in', ['quiz', 'superquiz']), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
            break;
        case 'most-comments':
            q = lastVisible
                ? query(base, where('type', 'in', ['quiz', 'superquiz']), orderBy('commentsCount', 'desc'), startAfter(lastVisible), limit(PAGE_SIZE))
                : query(base, where('type', 'in', ['quiz', 'superquiz']), orderBy('commentsCount', 'desc'), limit(PAGE_SIZE));
            break;
        case 'extreme':
            q = lastVisible
                ? query(base, where('type', 'in', ['quiz', 'superquiz']), orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(PAGE_SIZE))
                : query(base, where('type', 'in', ['quiz', 'superquiz']), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
            break;
        default: // latest
            q = lastVisible
                ? query(base, orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(PAGE_SIZE))
                : query(base, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    }
    return q;
}

function formatTime(timestamp) {
    if (!timestamp?.toDate) return '';
    const diff = Math.floor((new Date() - timestamp.toDate()) / 1000);
    if (diff < 60) return '방금 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    return Math.floor(diff / 86400) + '일 전';
}

function getVotePercent(data) {
    const options = data.options || [];
    const voteObj = data.vote || {};
    const totalVotes = options.reduce((sum, opt) => {
        const key = opt.id || opt.label || '';
        return sum + (opt.votes || voteObj[key] || 0);
    }, 0);
    return options.map(opt => {
        const key = opt.id || opt.label || '';
        const votes = opt.votes || voteObj[key] || 0;
        return {
            label: opt.label || opt.text || '',
            votes,
            percent: totalVotes > 0 ? Math.round(votes / totalVotes * 100) : 50
        };
    });
}

function createFeedCard(id, data) {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 overflow-hidden';
    card.dataset.quizId = id;

    const isPix = data.type === 'quiz' || data.type === 'superquiz';
    const options = getVotePercent(data);
    const optA = options[0] || { label: '', percent: 50 };
    const optB = options[1] || { label: '', percent: 50 };
    const timeText = formatTime(data.createdAt);
    const likesCount = data.likesCount || 0;
    const commentsCount = data.commentsCount || 0;

    let voteHTML = '';
    if (isPix && options.length >= 2) {
        voteHTML = `
        <div class="px-4 pb-1 pt-2">
            <!-- 결과 바 -->
            <div class="relative h-10 rounded-xl overflow-hidden flex mb-3" style="background:#e2e8f0;">
                <div class="h-full flex items-center justify-start pl-3 font-bold text-white text-sm transition-all duration-500"
                    style="width:${optA.percent}%; background:#169976; min-width:30px;">
                    ${optA.percent}%
                </div>
                <div class="h-full flex items-center justify-end pr-3 font-bold text-white text-sm transition-all duration-500 flex-1"
                    style="background:#f97316;">
                    ${optB.percent}%
                </div>
            </div>
            <!-- 투표 버튼 -->
            <div class="grid grid-cols-2 gap-2 mb-3">
                <button class="vote-option-btn border-2 border-[#169976] text-[#169976] font-bold py-2.5 rounded-xl text-sm hover:bg-[#169976] hover:text-white transition"
                    data-option-id="${data.options?.[0]?.id || 'A'}">
                    ${optA.label || 'A'}
                </button>
                <button class="vote-option-btn border-2 border-orange-400 text-orange-500 font-bold py-2.5 rounded-xl text-sm hover:bg-orange-400 hover:text-white transition"
                    data-option-id="${data.options?.[1]?.id || 'B'}">
                    ${optB.label || 'B'}
                </button>
            </div>
        </div>`;
    }

    card.innerHTML = `
        <!-- 작성자 + 시간 -->
        <div class="flex items-center gap-2 px-4 pt-4 pb-2">
            <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden flex-shrink-0">
                <img src="${data.creatorPhotoURL || ''}" onerror="this.style.display='none'" class="w-full h-full object-cover">
            </div>
            <div class="flex-1 min-w-0">
                <span class="text-sm font-semibold text-slate-800 dark:text-slate-100">${data.creatorName || '익명'}</span>
                <span class="text-xs text-slate-400 ml-2">${timeText}</span>
            </div>
            ${isPix ? '<span class="text-xs font-bold text-[#169976] bg-green-50 dark:bg-green-900/30 px-2 py-0.5 rounded-full">PIX</span>' : ''}
        </div>
        <!-- 제목 -->
        <a href="view.html?id=${id}" class="block px-4 pb-3">
            <p class="font-bold text-slate-900 dark:text-white text-base leading-snug">${data.title || ''}</p>
            ${data.description ? `<p class="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">${data.description}</p>` : ''}
        </a>
        <!-- 이미지 (있을 경우) -->
        ${data.imageUrls?.[0] ? `<img src="${data.imageUrls[0]}" class="w-full max-h-60 object-cover" loading="lazy">` : ''}
        <!-- 투표 영역 -->
        ${voteHTML}
        <!-- 하단 액션 -->
        <div class="flex items-center gap-4 px-4 py-3 border-t border-slate-100 dark:border-slate-700">
            <button class="like-button flex items-center gap-1.5 text-slate-400 hover:text-red-500 transition">
                <i class="far fa-heart text-base"></i>
                <span class="like-count text-sm">${likesCount}</span>
            </button>
            <a href="view.html?id=${id}" class="flex items-center gap-1.5 text-slate-400 hover:text-sky-500 transition">
                <i class="far fa-comment text-base"></i>
                <span class="text-sm">${commentsCount}</span>
            </a>
            <button class="share-btn flex items-center gap-1.5 text-slate-400 hover:text-slate-600 transition ml-auto" data-id="${id}" data-title="${data.title || ''}">
                <i class="fas fa-share-alt text-base"></i>
            </button>
        </div>
    `;

    // 좋아요
    card.querySelector('.like-button').addEventListener('click', () => {
        handleCardLike(id, card);
    });

    // 공유
    card.querySelector('.share-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const url = `${location.origin}${location.pathname.replace('index.html', '')}view.html?id=${btn.dataset.id}`;
        navigator.clipboard?.writeText(url).then(() => alert('링크가 복사됐어요!'));
    });

    // 투표 버튼
    card.querySelectorAll('.vote-option-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) { alert('로그인이 필요합니다.'); return; }
            const optionId = btn.dataset.optionId;
            const success = await handleVote(id, optionId);
            if (success) await updatePopularityScore(id);
        });
    });

    return card;
}

async function loadFeed(reset = false) {
    if (loading || (!hasMore && !reset)) return;
    loading = true;

    const loader = document.getElementById('feed-loader');
    const endMsg = document.getElementById('feed-end');
    const feedList = document.getElementById('feed-list');

    if (reset) {
        feedList.innerHTML = '';
        lastDoc = null;
        hasMore = true;
        if (endMsg) endMsg.classList.add('hidden');
    }

    if (loader) loader.classList.remove('hidden');

    try {
        const q = buildQuery(currentTab, lastDoc);
        const snap = await getDocs(q);

        snap.forEach(docSnap => {
            const card = createFeedCard(docSnap.id, docSnap.data());
            feedList.appendChild(card);
        });

        if (snap.docs.length > 0) lastDoc = snap.docs[snap.docs.length - 1];
        if (snap.docs.length < PAGE_SIZE) {
            hasMore = false;
            if (endMsg) endMsg.classList.remove('hidden');
        }
    } catch (e) {
        console.error('Feed load error:', e);
    }

    if (loader) loader.classList.add('hidden');
    loading = false;
}

function initTabs() {
    document.querySelectorAll('.feed-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.feed-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTab = btn.dataset.tab;
            loadFeed(true);
        });
    });
}

function initInfiniteScroll() {
    const container = document.getElementById('feed-container');
    if (!container) return;
    container.addEventListener('scroll', () => {
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 200) {
            loadFeed();
        }
    });
}

function initAuthUI() {
    onAuthStateChanged(auth, (user) => {
        const loginBtn = document.getElementById('header-login-btn');
        const userArea = document.getElementById('header-user-area');
        const avatar = document.getElementById('header-avatar');
        if (user) {
            if (loginBtn) loginBtn.classList.add('hidden');
            if (userArea) { userArea.classList.remove('hidden'); userArea.classList.add('flex'); }
            const cached = localStorage.getItem('userAvatar');
            if (avatar && cached) avatar.src = cached;
        } else {
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (userArea) { userArea.classList.add('hidden'); userArea.classList.remove('flex'); }
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initInfiniteScroll();
    initAuthUI();
    loadFeed(true);

    document.getElementById('header-search-btn')?.addEventListener('click', () => {
        window.location.href = 'search.html';
    });
    document.getElementById('header-avatar')?.addEventListener('click', () => {
        window.location.href = 'mypage.html';
    });
});
