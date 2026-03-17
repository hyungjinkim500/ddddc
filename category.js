import { db } from './firebase-config.js';
import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs, startAfter } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { createQuizCard } from './modules/quiz-card.js';
import { handleCardLike, restoreAllLikeStates } from './modules/likes.js';
import { handleVote } from './vote-system.js';
import { updatePopularityScore } from './quiz-main.js';

const quizPageSize = 25;
const pageGroupSize = 10;
let currentPage = 1;
let totalPages = 1;
let pageCursors = [];
let hotQuizzes = [];
let hotCurrentPage = 0;
let categoryId;

const params = new URLSearchParams(window.location.search);

async function restoreUserVotes(user) {
    if (!user) return;
    const cards = document.querySelectorAll('[data-quiz-id]');
    await Promise.all(Array.from(cards).map(card => {
        const quizId = card.dataset.quizId;
        const userVoteRef = doc(db, `questions/${quizId}/userVotes/${user.uid}`);
        return getDoc(userVoteRef).then(snap => {
            const btns = card.querySelectorAll('.vote-option-btn');
            btns.forEach(btn => btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'ring-[#169976]', 'ring-red-400', 'ring-slate-400'));
            if (snap.exists()) {
                const selectedId = snap.data().selectedOption;
                btns.forEach(btn => {
                    if (btn.dataset.optionId === selectedId) {
                        btn.classList.add('ring-2', 'ring-offset-2', 'ring-[#169976]');
                    } else {
                        btn.classList.add('opacity-50');
                    }
                });
            }
        }).catch(() => {});
    }));
}

function formatBoardTime(date) {
    const now = new Date();
    const diff = now - date;
    const oneDay = 24 * 60 * 60 * 1000;
    if (diff < oneDay) {
        return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
    }
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${month}.${day}`;
}

async function loadCategory(catId) {
    categoryId = catId;
    pageCursors = [];
    const categoryTitleEl = document.getElementById('category-title');
    if (!categoryId) {
        if (categoryTitleEl) categoryTitleEl.textContent = '카테고리 ID가 없습니다.';
        return;
    }
    try {
        const categoryRef = doc(db, 'categories', categoryId);
        const categorySnap = await getDoc(categoryRef);
        if (categorySnap.exists()) {
            const categoryName = categorySnap.data().name;
            if (categoryTitleEl) categoryTitleEl.textContent = `${categoryName} 카테고리`;
            await Promise.all([
                loadCategoryQuizzes(categoryId),
                loadHotQuizzes(categoryId)
            ]);
        } else {
            if (categoryTitleEl) categoryTitleEl.textContent = '카테고리를 찾을 수 없습니다.';
        }
    } catch (error) {
        console.error('Error loading category:', error);
    }
}

async function loadCategoryQuizzes(categoryId) {
    const listEl = document.getElementById('category-quiz-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const countQuery = query(collection(db, 'questions'), where('category', '==', categoryId));
    const countSnapshot = await getDocs(countQuery);
    totalPages = Math.ceil(countSnapshot.size / quizPageSize);

    let q;
    if (currentPage === 1) {
        q = query(collection(db, 'questions'), where('category', '==', categoryId), orderBy('createdAt', 'desc'), limit(quizPageSize));
    } else {
        const prevCursor = pageCursors[currentPage - 2];
        q = query(collection(db, 'questions'), where('category', '==', categoryId), orderBy('createdAt', 'desc'), startAfter(prevCursor), limit(quizPageSize));
    }

    const snapshot = await getDocs(q);
    if (!snapshot.empty) {
        pageCursors[currentPage - 1] = snapshot.docs[snapshot.docs.length - 1];
    }

    snapshot.forEach(docSnap => {
        const quiz = docSnap.data();
        const quizId = docSnap.id;
        const views = quiz.views ?? 0;
        const comments = quiz.commentsCount ?? 0;
        const likes = quiz.likesCount ?? 0;
        let createdTime = '';
        if (quiz.createdAt && quiz.createdAt.toDate) {
            createdTime = formatBoardTime(quiz.createdAt.toDate());
        }
        const item = document.createElement('div');
        item.className = 'border rounded-lg p-4 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition cursor-pointer';
        item.addEventListener('click', () => { window.location.href = `quiz.html?id=${quizId}`; });
        item.innerHTML = `
            <div class="font-bold text-sm text-[#169976]">${quiz.type === 'superquiz' ? 'TOPIC' : quiz.type === 'quiz' ? 'PICK' : 'POST'}</div>
            <div class="text-lg font-semibold mt-1">${quiz.title || '제목 없음'}</div>
            <div class="text-xs text-slate-500 mt-2">
                ${quiz.creatorName || '익명'} | ♥ ${likes} | 조회 ${views} | 댓글 ${comments} | ${createdTime}
            </div>
        `;
        listEl.appendChild(item);
    });
    renderPagination();
}

function renderPagination() {
    const container = document.getElementById('page-numbers');
    if (!container) return;
    container.innerHTML = '';
    const startPage = Math.floor((currentPage - 1) / pageGroupSize) * pageGroupSize + 1;
    const endPage = Math.min(startPage + pageGroupSize - 1, totalPages);
    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = 'px-3 py-1 border rounded text-sm hover:bg-slate-100';
        if (i === currentPage) btn.classList.add('bg-slate-200');
        btn.addEventListener('click', () => { currentPage = i; loadCategoryQuizzes(categoryId); });
        container.appendChild(btn);
    }
}

async function loadHotQuizzes(categoryId) {
    hotQuizzes = [];
    hotCurrentPage = 0;
    const q = query(
        collection(db, 'questions'),
        where('category', '==', categoryId),
        where('type', 'in', ['quiz', 'superquiz']),
        orderBy('createdAt', 'desc'),
        limit(10)
    );
    const snapshot = await getDocs(q);
    snapshot.forEach(docSnap => {
        hotQuizzes.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderHotSlider();
    setupHotSliderButtons();
}

function renderHotSlider() {
    const slider = document.getElementById('hot-slider');
    if (!slider) return;
    slider.innerHTML = '';

    for (let i = 0; i < hotQuizzes.length; i += 5) {
        const page = document.createElement('div');
        page.className = 'hot-slider-page flex-shrink-0 w-full grid gap-4';
        page.style.gridTemplateColumns = 'repeat(5, minmax(0, 1fr))';

        const chunk = hotQuizzes.slice(i, i + 5);
        chunk.forEach(quiz => {
            const card = createQuizCard(quiz.id, quiz);
            card.style.width = '100%';
            card.style.minHeight = '220px';
            page.appendChild(card);
        });
        slider.appendChild(page);
    }

    updateHotSliderPosition();

    const auth = window._auth;
    if (auth?.currentUser) {
        restoreAllLikeStates(auth.currentUser.uid);
        restoreUserVotes(auth.currentUser);
    }
}

function updateHotSliderPosition() {
    const slider = document.getElementById('hot-slider');
    if (!slider) return;
    slider.style.transform = `translateX(-${hotCurrentPage * 100}%)`;

    const prevBtn = document.getElementById('hot-prev');
    const nextBtn = document.getElementById('hot-next');
    const pageCount = Math.ceil(hotQuizzes.length / 5);
    if (prevBtn) { prevBtn.disabled = hotCurrentPage === 0; prevBtn.style.opacity = hotCurrentPage === 0 ? '0.5' : '1'; }
    if (nextBtn) { nextBtn.disabled = hotCurrentPage >= pageCount - 1; nextBtn.style.opacity = hotCurrentPage >= pageCount - 1 ? '0.5' : '1'; }
}

function setupHotSliderButtons() {
    const prevBtn = document.getElementById('hot-prev');
    const nextBtn = document.getElementById('hot-next');
    if (prevBtn) {
        prevBtn.onclick = () => { if (hotCurrentPage > 0) { hotCurrentPage--; updateHotSliderPosition(); } };
    }
    if (nextBtn) {
        nextBtn.onclick = () => {
            const pageCount = Math.ceil(hotQuizzes.length / 5);
            if (hotCurrentPage < pageCount - 1) { hotCurrentPage++; updateHotSliderPosition(); }
        };
    }
}

async function loadHeader() {
    const container = document.getElementById('header-container');
    if (!container) return;
    const res = await fetch('/components/header.html');
    const html = await res.text();
    container.innerHTML = html;
    if (window.initializeHeader) window.initializeHeader();
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadHeader();

    const pagePrev = document.getElementById('page-prev');
    const pageNext = document.getElementById('page-next');
    if (pagePrev) pagePrev.addEventListener('click', () => { if (currentPage > 1) { currentPage--; loadCategoryQuizzes(categoryId); } });
    if (pageNext) pageNext.addEventListener('click', () => { if (currentPage < totalPages) { currentPage++; loadCategoryQuizzes(categoryId); } });

    loadCategory(params.get('cat'));

    // 카드 좋아요/투표 이벤트
    document.addEventListener('click', (event) => {
        const likeButton = event.target.closest('.like-button');
        if (likeButton) {
            const card = likeButton.closest('[data-quiz-id]');
            if (card) handleCardLike(card.dataset.quizId, card);
            return;
        }

        const voteButton = event.target.closest('.vote-option-btn');
        if (voteButton) {
            const card = voteButton.closest('[data-quiz-id]');
            if (!card) return;
            if (!auth.currentUser) { alert('로그인이 필요합니다.'); return; }
            const allBtns = card.querySelectorAll('.vote-option-btn');
            allBtns.forEach(btn => btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'ring-[#169976]', 'ring-red-400', 'ring-slate-400'));
            if (card.querySelector('.vote-option-btn.ring-2') !== voteButton) {
                allBtns.forEach(btn => { if (btn !== voteButton) btn.classList.add('opacity-50'); });
                voteButton.classList.add('ring-2', 'ring-offset-2', voteButton.classList.contains('bg-[#169976]') ? 'ring-[#169976]' : voteButton.classList.contains('bg-red-500') ? 'ring-red-400' : 'ring-slate-400');
            }
            (async () => {
                const success = await handleVote(card.dataset.quizId, voteButton.dataset.optionId);
                if (success) await updatePopularityScore(card.dataset.quizId);
            })();
        }
    });

    onAuthStateChanged(auth, async (user) => {
        const loginButton = document.getElementById('login-modal-button');
        const logoutButton = document.getElementById('logout-button');
        const userProfileInfo = document.getElementById('user-profile-info');
        const userNickname = document.getElementById('user-nickname');
        const userPoints = document.getElementById('user-points');

        if (user) {
            window._auth = { currentUser: user };
            if (loginButton) loginButton.classList.add('hidden');
            if (logoutButton) logoutButton.classList.remove('hidden');
            if (userProfileInfo) { userProfileInfo.classList.remove('hidden'); userProfileInfo.classList.add('flex'); }
            restoreAllLikeStates(user.uid);
            restoreUserVotes(user);
        } else {
            window._auth = null;
            if (loginButton) loginButton.classList.remove('hidden');
            if (logoutButton) logoutButton.classList.add('hidden');
            if (userProfileInfo) { userProfileInfo.classList.add('hidden'); userProfileInfo.classList.remove('flex'); }
            restoreAllLikeStates(null);
        }
    });
});
