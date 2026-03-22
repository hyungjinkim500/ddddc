import { db, auth } from './firebase-config.js';
import { collection, query, orderBy, limit, startAfter, getDocs, where, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
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

// 이미지 모달 (전역 1개)
function ensureImageModal() {
    if (document.getElementById('feed-image-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'feed-image-modal';
    modal.className = 'hidden fixed inset-0 bg-black/90 z-[200] flex items-center justify-center';
    modal.innerHTML = `
        <button id="fim-close" class="absolute top-4 right-5 text-white text-3xl font-bold z-10">×</button>
        <button id="fim-prev" class="absolute left-4 text-white text-4xl font-bold z-10">‹</button>
        <img id="fim-img" class="max-h-[90vh] max-w-[90vw] rounded-lg select-none">
        <button id="fim-next" class="absolute right-4 text-white text-4xl font-bold z-10">›</button>
        <div id="fim-counter" class="absolute bottom-5 text-white text-sm"></div>
    `;
    document.body.appendChild(modal);

    let gallery = [], idx = 0;

    window._openFeedImageModal = (urls, startIdx) => {
        gallery = urls; idx = startIdx;
        document.getElementById('fim-img').src = gallery[idx];
        document.getElementById('fim-counter').textContent = gallery.length > 1 ? (idx+1)+' / '+gallery.length : '';
        modal.classList.remove('hidden');
    };

    document.getElementById('fim-close').onclick = () => modal.classList.add('hidden');
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });

    const move = (d) => {
        idx = (idx + d + gallery.length) % gallery.length;
        document.getElementById('fim-img').src = gallery[idx];
        document.getElementById('fim-counter').textContent = gallery.length > 1 ? (idx+1)+' / '+gallery.length : '';
    };
    document.getElementById('fim-prev').onclick = () => move(-1);
    document.getElementById('fim-next').onclick = () => move(1);
    document.addEventListener('keydown', e => {
        if (modal.classList.contains('hidden')) return;
        if (e.key === 'ArrowLeft') move(-1);
        if (e.key === 'ArrowRight') move(1);
        if (e.key === 'Escape') modal.classList.add('hidden');
    });
}

function buildImageGrid(urls, postId) {
    ensureImageModal();
    const n = urls.length;

    const wrap = document.createElement('div');
    wrap.className = 'overflow-hidden rounded-xl';
    wrap.style.height = '208px';

    const makeImg = (url, idx) => {
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';
        img.className = 'object-cover cursor-pointer w-full h-full rounded-lg';
        img.addEventListener('click', () => window._openFeedImageModal(urls, idx));
        return img;
    };

    const makeCell = (url, idx, extraStyle = '') => {
        const d = document.createElement('div');
        d.className = 'overflow-hidden h-full';
        if (extraStyle) d.style.cssText = extraStyle;
        d.appendChild(makeImg(url, idx));
        return d;
    };

    if (n === 1) {
        wrap.appendChild(makeCell(urls[0], 0));
    } else if (n === 2) {
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-1 h-full';
        urls.forEach((u, i) => grid.appendChild(makeCell(u, i)));
        wrap.appendChild(grid);
    } else if (n === 3) {
        const grid = document.createElement('div');
        grid.className = 'grid gap-1 h-full';
        grid.style.gridTemplateColumns = '1fr 1fr';
        grid.style.gridTemplateRows = '1fr 1fr';
        const left = makeCell(urls[0], 0, 'grid-row: span 2;');
        left.style.gridRow = 'span 2';
        grid.appendChild(left);
        grid.appendChild(makeCell(urls[1], 1));
        grid.appendChild(makeCell(urls[2], 2));
        wrap.appendChild(grid);
    } else {
        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-1 h-full';
        urls.forEach((u, i) => {
            const d = makeCell(u, i);
            d.style.height = 'calc(208px / 2 - 2px)';
            grid.appendChild(d);
        });
        wrap.appendChild(grid);
    }

    return wrap;
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

function updateCardVoteUI(card, data, uid, selectedOptionId = null) {
    const options = getVotePercent(data);
    if (options.length < 2) return;

    // 선택한 옵션 ID 가져오기 (인자로 없으면 data.vote 기반으로 추론 불가 → 그냥 퍼센트만 업데이트)
    const barA = card.querySelector('.vote-bar-a');
    const barB = card.querySelector('.vote-bar-b');
    const btnA = card.querySelectorAll('.vote-option-btn')[0];
    const btnB = card.querySelectorAll('.vote-option-btn')[1];

    if (barA) barA.style.width = options[0].percent + '%';
    if (barA) barA.textContent = options[0].percent + '%';
    if (barB) barB.textContent = options[1].percent + '%';

    // 투표인원수 실시간 업데이트
    const voteObj2 = data.vote || {};
    const totalVotes2 = Object.values(voteObj2).reduce((a, b) => a + b, 0);
    const maxP2 = data.participantLimit || 0;
    const curP2 = (data.participants || []).length;
    const voteCountEl = card.querySelector('.vote-count-display');
    if (voteCountEl) {
        voteCountEl.textContent = maxP2 > 0 ? `${curP2}/${maxP2}` : totalVotes2 > 0 ? `${totalVotes2}명` : '0명';
    }
    if (maxP2 > 0) {
        const barFill = card.querySelector('.participation-bar-fill');
        const barText = card.querySelector('.participation-bar-text');
        if (barFill) barFill.style.width = `${Math.round(curP2 / maxP2 * 100)}%`;
        if (barText) barText.textContent = `${curP2} / ${maxP2} 참여`;
    }

    // 버튼 강조 항상 초기화 먼저
    [btnA, btnB].forEach(btn => {
        if (!btn) return;
        btn.classList.remove('opacity-50', 'ring-[3px]', 'ring-inset', 'ring-[#169976]', 'ring-orange-400');
    });

    // 투표한 버튼 강조 (내부 테두리 방식)
    if (selectedOptionId) {
        [btnA, btnB].forEach(btn => {
            if (!btn) return;
            if (btn.dataset.optionId === selectedOptionId) {
                btn.classList.add('ring-[3px]', 'ring-inset',
                    btn.classList.contains('border-orange-400') ? 'ring-orange-400' : 'ring-[#169976]'
                );
            } else {
                btn.classList.add('opacity-50');
            }
        });
    }
}

function createFeedCard(id, data) {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-slate-800 overflow-hidden border-b border-slate-100 dark:border-slate-700 w-full';
    card.dataset.quizId = id;

    const isPix = data.type === 'quiz' || data.type === 'superquiz';
    const options = getVotePercent(data);
    const optA = options[0] || { label: '', percent: 50 };
    const optB = options[1] || { label: '', percent: 50 };
    const timeText = formatTime(data.createdAt);
    const likesCount = data.likesCount || 0;
    const commentsCount = data.commentsCount || 0;

    const maxP = data.participantLimit || 0;
    const voteObj = data.vote || {};
    const totalVotes = Object.values(voteObj).reduce((a, b) => a + b, 0);
    const curP = (data.participants || []).length;

    let voteHTML = '';
    if (isPix && options.length >= 2) {
        const participationBar = maxP > 0 ? `
            <div class="w-full bg-slate-200 rounded h-1.5 mt-1">
                <div class="participation-bar-fill bg-[#169976] h-1.5 rounded transition-all" style="width:${Math.round(curP / maxP * 100)}%"></div>
            </div>
            <div class="participation-bar-text text-xs text-slate-400 mt-0.5">${curP} / ${maxP} 참여</div>
        ` : '';

        voteHTML = `
        <div class="px-4 pb-1 pt-3 mt-1">
            <!-- 결과 바 -->
            <div class="relative h-5 rounded-lg overflow-hidden flex" style="background:#e2e8f0;">
                <div class="vote-bar-a h-full flex items-center justify-start pl-2 font-bold text-slate-700 text-xs transition-all duration-500"
                    style="width:${optA.percent}%; background:rgba(22, 153, 118, 0.3); min-width:20px;">
                    ${optA.percent}%
                </div>
                <div class="vote-bar-b h-full flex items-center justify-end pr-2 font-bold text-slate-700 text-xs transition-all duration-500 flex-1"
                    style="background:rgba(249, 115, 22, 0.3);">
                    ${optB.percent}%
                </div>
            </div>
            ${participationBar}
            <!-- 투표 버튼 -->
            <div class="grid grid-cols-2 gap-2 mt-2 mb-2">
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
        <a href="post.html?id=${id}" class="block px-4 pb-3">
            <p class="font-bold text-slate-900 dark:text-white text-base leading-snug">${data.title || ''}</p>
            ${data.description ? `<p class="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">${data.description}</p>` : ''}
        </a>
        <!-- 이미지 그리드 자리 -->
        ${data.imageUrls?.length > 0 ? `<div class="px-3 pb-3 img-grid-slot"></div>` : ''}
        <!-- 투표 영역 -->
        ${voteHTML}
        <!-- 하단 액션 -->
        <div class="flex items-center gap-4 px-4 py-3 border-t border-slate-100 dark:border-slate-700">
            <button class="like-button flex items-center gap-1.5 text-slate-400 hover:text-red-500 transition">
                <i class="far fa-heart text-base"></i>
                <span class="like-count text-sm">${likesCount}</span>
            </button>
            <a href="post.html?id=${id}" class="flex items-center gap-1.5 text-slate-400 hover:text-sky-500 transition">
                <i class="far fa-comment text-base"></i>
                <span class="text-sm">${commentsCount}</span>
            </a>
            ${isPix ? `<span class="flex items-center gap-1 text-slate-400 text-sm">
                <i class="fas fa-poll text-base"></i>
                <span class="vote-count-display">${maxP > 0 ? `${curP}/${maxP}` : totalVotes > 0 ? `${totalVotes}명` : '0명'}</span>
            </span>` : ''}
            <button class="share-btn flex items-center gap-1.5 text-slate-400 hover:text-slate-600 transition ml-auto" data-id="${id}" data-title="${data.title || ''}">
                <i class="fas fa-share-alt text-base"></i>
            </button>
        </div>
    `;

    // 이미지 그리드 DOM 직접 삽입
    const imgSlot = card.querySelector('.img-grid-slot');
    if (imgSlot && data.imageUrls?.length > 0) {
        imgSlot.appendChild(buildImageGrid(data.imageUrls, id));
    }

    // 좋아요
    card.querySelector('.like-button').addEventListener('click', () => {
        handleCardLike(id, card);
    });

    // 공유
    card.querySelector('.share-btn').addEventListener('click', (e) => {
        const btn = e.currentTarget;
        const url = `${location.origin}${location.pathname.replace('index.html', '')}post.html?id=${btn.dataset.id}`;
        navigator.clipboard?.writeText(url).then(() => alert('링크가 복사됐어요!'));
    });

    // 투표 버튼
    card.querySelectorAll('.vote-option-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            const allBtns = card.querySelectorAll('.vote-option-btn');
            allBtns.forEach(b => b.disabled = true);
            const user = auth.currentUser;
            if (!user) {
                document.getElementById('login-modal-button')?.click();
                allBtns.forEach(b => b.disabled = false);
                return;
            }
            const optionId = btn.dataset.optionId;

            // 현재 선택 상태 파악 (낙관적 UI용)
            const isSelected = btn.classList.contains('ring-[3px]');
            const newSelected = isSelected ? null : optionId;

            // ① 즉시 UI 업데이트 (서버 응답 안 기다림)
            updateCardVoteUI(card, card._cachedData || {options: []}, user.uid, newSelected);

            // ② 서버 저장 (백그라운드)
            const success = await handleVote(id, optionId);
            if (success) {
                // ③ getDoc 1번만 - 실제 데이터로 보정
                const snap = await getDoc(doc(db, 'questions', id));
                if (snap.exists()) {
                    card._cachedData = snap.data();
                    updateCardVoteUI(card, snap.data(), user.uid, newSelected);
                }
                // popularityScore는 UI와 무관 → 백그라운드
                updatePopularityScore(id);
            } else {
                // 실패 시 원래 상태로 복원
                const snap = await getDoc(doc(db, 'questions', id));
                if (snap.exists()) updateCardVoteUI(card, data, user.uid, isSelected ? optionId : null);
            }
            allBtns.forEach(b => b.disabled = false);
        });
    });

    // 이미지 슬라이드 마우스 드래그
    const slideInner = card.querySelector('.img-slide-inner');
    if (slideInner) {
        let isDown = false;
        let startX = 0;
        let scrollLeft = 0;
        slideInner.addEventListener('mousedown', (e) => {
            isDown = true;
            slideInner.style.cursor = 'grabbing';
            startX = e.pageX - slideInner.offsetLeft;
            scrollLeft = slideInner.scrollLeft;
        });
        document.addEventListener('mouseup', () => { if (isDown) { isDown = false; slideInner.style.cursor = 'grab'; } });
        document.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - slideInner.offsetLeft;
            slideInner.scrollLeft = scrollLeft - (x - startX) * 1.5;
        });
    }

    // 카드 데이터 캐시 저장
    card._cachedData = data;

    // 로드 시 투표 상태 복원
    if (auth.currentUser) {
        getDoc(doc(db, `questions/${id}/userVotes/${auth.currentUser.uid}`)).then(voteSnap => {
            if (voteSnap.exists()) {
                updateCardVoteUI(card, data, auth.currentUser.uid, voteSnap.data().selectedOption);
            }
        });
    }

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

    // feed-container 자체 스크롤
    container.addEventListener('scroll', () => {
        if (container.scrollTop + container.clientHeight >= container.scrollHeight - 200) {
            loadFeed();
        }
    });

    // window 스크롤 (feed-container가 전체 높이일 때)
    window.addEventListener('scroll', () => {
        if (window.innerHeight + window.scrollY >= document.body.scrollHeight - 200) {
            loadFeed();
        }
    });
}

function initAuthUI() {
    onAuthStateChanged(auth, (user) => {
        const loginBtn = document.getElementById('login-modal-button');
        const userArea = document.getElementById('header-user-area');
        const avatar = document.getElementById('header-avatar');
        if (user) {
            window._currentUser = user;
            if (loginBtn) loginBtn.classList.add('hidden');
            if (userArea) { userArea.classList.remove('hidden'); userArea.classList.add('flex'); }
            // userProfiles에서 최신 프로필 사진 조회
            getDoc(doc(db, 'userProfiles', user.uid)).then(snap => {
                if (snap.exists() && snap.data().photoURL) {
                    const photoURL = snap.data().photoURL;
                    localStorage.setItem('userAvatar', photoURL);
                    if (avatar) avatar.src = photoURL;
                } else {
                    localStorage.removeItem('userAvatar');
                    if (avatar) avatar.src = '';
                }
            });
        } else {
            window._currentUser = null;
            localStorage.removeItem('userAvatar');
            if (loginBtn) loginBtn.classList.remove('hidden');
            if (userArea) { userArea.classList.add('hidden'); userArea.classList.remove('flex'); }
            if (avatar) avatar.src = '';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initInfiniteScroll();
    initAuthUI();
    loadFeed(true);

    // 퀵서치는 index.html 인라인 스크립트에서 처리
    document.getElementById('header-avatar')?.addEventListener('click', () => {
        window.location.href = 'mypage.html';
    });

    // --- 숨쉬는 헤더 기능 (Hide-on-Scroll) ---
    const feedContainer = document.getElementById('feed-container');
    const feedTabs = document.getElementById('feed-tabs');
    
    if (feedContainer && feedTabs) {
        let lastScrollTop = 0;
        const delta = 5; // 최소 스크롤 인식 거리

        feedContainer.addEventListener('scroll', () => {
            const st = feedContainer.scrollTop;

            // 스크롤 위치가 최상단 근처면 탭 무조건 보이기
            if (st < delta) {
                feedTabs.classList.remove('hidden-tab');
                feedTabs.classList.add('visible-tab');
                lastScrollTop = st;
                return;
            }

            // 아래로 스크롤 중이면 탭 숨기기
            if (st > lastScrollTop && st > feedTabs.offsetHeight) {
                feedTabs.classList.add('hidden-tab');
                feedTabs.classList.remove('visible-tab');
            } 
            // 위로 스크롤 중이면 탭 보이기
            else if (st < lastScrollTop) {
                feedTabs.classList.remove('hidden-tab');
                feedTabs.classList.add('visible-tab');
            }

            lastScrollTop = st;
        });
    }
});
