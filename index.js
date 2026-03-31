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
    const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000);
    switch (tab) {
        case 'today-pix':
            // 24시간내 인기점수 높은 순
            q = lastVisible
                ? query(base, where('createdAt', '>=', oneDayAgo), orderBy('popularityScore', 'desc'), startAfter(lastVisible), limit(PAGE_SIZE))
                : query(base, where('createdAt', '>=', oneDayAgo), orderBy('popularityScore', 'desc'), limit(PAGE_SIZE));
            break;
        case 'hot-topics':
            // 15일내 댓글 많은 순
            q = lastVisible
                ? query(base, where('createdAt', '>=', fifteenDaysAgo), orderBy('commentsCount', 'desc'), startAfter(lastVisible), limit(PAGE_SIZE))
                : query(base, where('createdAt', '>=', fifteenDaysAgo), orderBy('commentsCount', 'desc'), limit(PAGE_SIZE));
            break;
        case 'weekly':
            // 7일내 인기점수 높은 순
            q = lastVisible
                ? query(base, where('createdAt', '>=', sevenDaysAgo), orderBy('popularityScore', 'desc'), startAfter(lastVisible), limit(PAGE_SIZE))
                : query(base, where('createdAt', '>=', sevenDaysAgo), orderBy('popularityScore', 'desc'), limit(PAGE_SIZE));
            break;
        case 'balance':
            // 밸런스게임(quiz)만 최신순
            q = lastVisible
                ? query(base, where('type', '==', 'quiz'), orderBy('createdAt', 'desc'), startAfter(lastVisible), limit(PAGE_SIZE))
                : query(base, where('type', '==', 'quiz'), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
            break;
        case 'vote-rank':
            // 15일내 인기점수 높은 순
            q = lastVisible
                ? query(base, where('createdAt', '>=', fifteenDaysAgo), orderBy('popularityScore', 'desc'), startAfter(lastVisible), limit(PAGE_SIZE))
                : query(base, where('createdAt', '>=', fifteenDaysAgo), orderBy('popularityScore', 'desc'), limit(PAGE_SIZE));
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

    const CELL_H = 104; // 각 셀 높이 (px)
    const GAP = 2;

    const wrap = document.createElement('div');
    wrap.className = 'overflow-hidden rounded-xl';

    const makeImg = (url, idx) => {
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';
        img.className = 'object-cover cursor-pointer w-full h-full';
        img.addEventListener('click', () => window._openFeedImageModal(urls, idx));
        return img;
    };

    const makeCell = (url, idx) => {
        const d = document.createElement('div');
        d.style.cssText = `flex:1;height:${CELL_H}px;overflow:hidden;`;
        d.appendChild(makeImg(url, idx));
        return d;
    };

    if (n === 1) {
        // 1장: 전체 너비 × 208px
        wrap.style.height = '208px';
        const d = document.createElement('div');
        d.style.cssText = 'width:100%;height:100%;overflow:hidden;';
        d.appendChild(makeImg(urls[0], 0));
        wrap.appendChild(d);
    } else {
        // 2장: 상단 행만 / 3장: 상단+하단(좌만) / 4장: 상단+하단(좌우)
        const container = document.createElement('div');
        container.style.cssText = `display:flex;flex-direction:column;gap:${GAP}px;`;

        // 상단 행 (항상 2장)
        const topRow = document.createElement('div');
        topRow.style.cssText = `display:flex;gap:${GAP}px;`;
        topRow.appendChild(makeCell(urls[0], 0));
        topRow.appendChild(makeCell(urls[1], 1));
        container.appendChild(topRow);

        if (n >= 3) {
            // 하단 행
            const bottomRow = document.createElement('div');
            bottomRow.style.cssText = `display:flex;gap:${GAP}px;`;
            bottomRow.appendChild(makeCell(urls[2], 2));
            if (n === 4) {
                bottomRow.appendChild(makeCell(urls[3], 3));
            }
            container.appendChild(bottomRow);
        }

        wrap.appendChild(container);
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

    // pix 타입은 모든 버튼 처리
    const allVoteBtns = card.querySelectorAll('.vote-option-btn');
    allVoteBtns.forEach(btn => {
        btn.classList.remove('opacity-50', 'ring-[3px]', 'ring-inset', 'ring-[#169976]', 'ring-orange-400');
    });

    if (selectedOptionId) {
        allVoteBtns.forEach(btn => {
            if (!btn) return;
            if (btn.dataset.optionId === selectedOptionId) {
                const isOrange = btn.classList.contains('border-orange-400');
                btn.classList.add('ring-[3px]', 'ring-inset', isOrange ? 'ring-[#f6cdbe]' : 'ring-[#1fdfcb]');
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

    const isPix = data.type === 'quiz' || data.type === 'superquiz' || data.type === 'pix';
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

        if (data.type === 'pix') {
            const allOptions = data.options || [];
            const SHOW_LIMIT = 3;
            const hasMore = allOptions.length > SHOW_LIMIT;

            const pixOptionsHTML = allOptions.map((opt, i) => {
                const isHidden = i >= SHOW_LIMIT;
                return `
                <button class="vote-option-btn relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-600 flex items-center gap-3 px-3 py-2.5 text-left w-full${isHidden ? ' pix-extra-opt hidden' : ''}"
                    data-option-id="${opt.id}" style="min-height:52px;">
                    <div class="pix-bg-fill absolute inset-0 bg-[#08d9d6]/20 transition-all duration-500" style="width:0%"></div>
                    ${opt.imageUrl ? `<div class="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0"><img src="${opt.imageUrl}" class="w-full h-full object-cover"></div>` : ''}
                    <span class="relative font-semibold text-slate-800 dark:text-slate-100 text-sm flex-1">${opt.label || ''}</span>
                    <span class="pix-pct relative font-bold text-[#169976] text-sm hidden"></span>
                </button>`;
            }).join('');

            const toggleBtn = hasMore ? `
                <button class="pix-toggle-btn w-full text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 py-1 flex items-center justify-center gap-1 transition">
                    <span class="pix-toggle-label">옵션 더보기</span>
                    <i class="fas fa-chevron-down text-[10px] pix-toggle-icon"></i>
                </button>` : '';

            voteHTML = `
            <div class="px-4 pb-2 pt-2 space-y-2 pix-options-wrap">
                ${pixOptionsHTML}
                ${toggleBtn}
                ${participationBar}
            </div>`;
        } else {
            // 기존 quiz/superquiz: 2버튼 바 방식 유지
            const balanceImgHTML = (data.type === 'quiz' && data.options?.some(o => o.imageUrl)) ? `
            <div class="grid grid-cols-2 gap-2 px-3 pt-3">
                ${data.options.slice(0, 2).map(opt => `
                <div class="relative overflow-hidden rounded-xl bg-slate-200" style="aspect-ratio:1/1;">
                    ${opt.imageUrl ? `<img src="${opt.imageUrl}" class="w-full h-full object-cover">` : ''}
                    <div class="absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs font-bold text-center py-1">${opt.label}</div>
                </div>`).join('')}
            </div>` : '';

            voteHTML = `
            ${balanceImgHTML}
            <div class="px-4 pb-1 pt-3 mt-1">
                <!-- 결과 바 -->
                <div class="relative h-5 rounded-lg overflow-hidden flex" style="background:#e2e8f0;">
                    <div class="vote-bar-a h-full flex items-center justify-start pl-2 font-bold text-slate-700 text-xs transition-all duration-500"
                        style="width:${optA.percent}%; background:#d0ebe4; min-width:20px;">
                        ${optA.percent}%
                    </div>
                    <div class="vote-bar-b h-full flex items-center justify-end pr-2 font-bold text-slate-700 text-xs transition-all duration-500 flex-1"
                        style="background:rgba(249, 115, 22, 0.3);">
                        ${optB.percent}%
                    </div>
                </div>
                ${participationBar}
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
    }

    // 카드 클릭 시 스크롤 위치 저장
    card.addEventListener('click', () => {
        const container = document.getElementById('feed-container');
        if (container) {
            sessionStorage.setItem('feedScroll', container.scrollTop);
            sessionStorage.setItem('feedTab', currentTab);
        }
    }, true);

    card.innerHTML = `
        <!-- 작성자 + 시간 -->
        <div class="flex items-center gap-2 px-4 pt-4 pb-2">
            <div class="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-600 overflow-hidden flex-shrink-0">
                <img src="${data.creatorPhotoURL || ''}" onerror="this.style.display='none'" class="w-full h-full object-cover">
            </div>
            <div class="flex-1 min-w-0">
                <a href="profile-view.html?uid=${data.creatorId || ''}" class="text-sm font-semibold text-slate-800 dark:text-slate-100 hover:underline" onclick="event.stopPropagation()">${data.creatorName || '익명'}</a>
                <span class="text-xs text-slate-400 ml-2">${timeText}</span>
            </div>
            
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
        e.stopPropagation();
        const btn = e.currentTarget;
        const shareUrl = `https://pixkorea.com/post.html?id=${btn.dataset.id}`;
        navigator.clipboard?.writeText(shareUrl).then(() => alert('링크가 복사됐어요!'));
    });

    // PIX 더보기/접기 토글
    const toggleBtn = card.querySelector('.pix-toggle-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // 카드 전체 클릭 방지
            const extraOpts = card.querySelectorAll('.pix-extra-opt');
            const label = toggleBtn.querySelector('.pix-toggle-label');
            const icon = toggleBtn.querySelector('.pix-toggle-icon');
            const isExpanded = extraOpts.length > 0 && !extraOpts[0].classList.contains('hidden');

            extraOpts.forEach(opt => {
                opt.classList.toggle('hidden');
            });

            if (isExpanded) {
                label.textContent = '옵션 더보기';
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            } else {
                label.textContent = '옵션 접기';
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            }
        });
    }

    // 투표 버튼
    card.querySelectorAll('.vote-option-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            if (btn.disabled) return;
            const allBtns = card.querySelectorAll('.vote-option-btn');
            allBtns.forEach(b => b.disabled = true);
            const user = auth.currentUser;
            if (!user) {
                window.openModal?.();
                allBtns.forEach(b => b.disabled = false);
                return;
            }
            const optionId = btn.dataset.optionId;

            // 현재 선택 상태 파악
            const isSelected = btn.classList.contains('ring-[3px]');
            const newSelected = isSelected ? null : optionId;

            // ① 로컬 데이터 즉시 조작 (네트워크 0ms, getDoc 없음)
            const cached = card._cachedData || {};
            const localData = JSON.parse(JSON.stringify(cached));
            const voteObjLocal = localData.vote || {};
            if (isSelected) {
                // 투표 취소
                if (voteObjLocal[optionId] > 0) voteObjLocal[optionId]--;
                localData.participants = (localData.participants || []).filter(p => p !== user.uid);
                card._myVote = null;
            } else {
                // 기존 투표 캐시로 즉시 처리 (getDoc 없음)
                const prevId = card._myVote;
                if (prevId && voteObjLocal[prevId] > 0) voteObjLocal[prevId]--;
                voteObjLocal[optionId] = (voteObjLocal[optionId] || 0) + 1;
                if (!(localData.participants || []).includes(user.uid)) {
                    localData.participants = [...(localData.participants || []), user.uid];
                }
                card._myVote = optionId;
            }
            localData.vote = voteObjLocal;
            card._cachedData = localData;

            // ② 즉시 UI 반영 (서버 기다리지 않음)
            updateCardVoteUI(card, localData, user.uid, newSelected);

            // pix 타입: 버튼 내부 비율 즉시 업데이트
            if (localData.type === 'pix') {
                const voteObj = localData.vote || {};
                const total = Object.values(voteObj).reduce((a, b) => a + b, 0);
                card.querySelectorAll('.vote-option-btn').forEach((btn) => {
                    const optId = btn.dataset.optionId;
                    const cnt = voteObj[optId] || 0;
                    const pct = total > 0 ? Math.round(cnt / total * 100) : 0;
                    const fill = btn.querySelector('.pix-bg-fill');
                    const pctEl = btn.querySelector('.pix-pct');
                    if (fill) {
                        fill.style.width = pct + '%';
                        const isThisSelected = optId === newSelected;
                        fill.style.background = isThisSelected ? 'rgba(22,153,118,0.2)' : 'rgba(148,163,184,0.2)';
                    }
                    if (pctEl) {
                        pctEl.textContent = pct + '%';
                        if (total > 0) pctEl.classList.remove('hidden');
                        const isSelected = optId === newSelected;
                        pctEl.className = pctEl.className.replace(/text-\S+/g, '').trim();
                        pctEl.classList.add(isSelected ? 'text-[#2e3e4c]' : 'text-slate-400');
                    }
                });
            }

            // ③ 서버 저장 백그라운드 (UI 블로킹 없음)
            handleVote(id, optionId).then(success => {
                if (success === null) return; // debounce로 취소된 경우 무시
                if (!success) {
                    // 실패 시 롤백
                    card._cachedData = cached;
                    updateCardVoteUI(card, cached, user.uid, isSelected ? optionId : null);
                } else {
                    updatePopularityScore(id);
                }
            });
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
    
    // 투표 기한 만료 시 버튼 비활성화
    if (data.expiresAt) {
        const expiresAt = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
        if (new Date() > expiresAt) {
            card.querySelectorAll('.vote-option-btn').forEach(btn => {
                btn.disabled = true;
                btn.classList.add('opacity-50', 'cursor-not-allowed');
            });
            const toggleBtn = card.querySelector('.pix-toggle-btn');
            if (toggleBtn) toggleBtn.disabled = true;
            // 만료 안내 텍스트 추가
            const voteArea = card.querySelector('.pix-options-wrap') || card.querySelector('.grid.grid-cols-2.gap-2.mt-2');
            if (voteArea) {
                const expiredMsg = document.createElement('p');
                expiredMsg.className = 'text-xs text-slate-400 text-center mt-1';
                expiredMsg.textContent = '투표가 종료되었습니다.';
                voteArea.appendChild(expiredMsg);
            }
        }
    }

    // 카드 데이터 캐시 저장
    card._cachedData = data;

    // 로드 시 투표 상태 복원 + card._myVote에 캐시
    if (auth.currentUser) {
        getDoc(doc(db, `questions/${id}/userVotes/${auth.currentUser.uid}`)).then(voteSnap => {
            if (voteSnap.exists()) {
                const selectedOption = voteSnap.data().selectedOption;
                card._myVote = selectedOption;
                updateCardVoteUI(card, card._cachedData || data, auth.currentUser.uid, selectedOption);

                // pix 타입: 복원 시 퍼센트 표시
                if (data.type === 'pix') {
                    const voteObj = (card._cachedData || data).vote || {};
                    const total = Object.values(voteObj).reduce((a, b) => a + b, 0);
                    const selectedOption = voteSnap.data().selectedOption;
                    card.querySelectorAll('.vote-option-btn').forEach(btn => {
                        const oid = btn.dataset.optionId;
                        const cnt = voteObj[oid] || 0;
                        const pct = total > 0 ? Math.round(cnt / total * 100) : 0;
                        const fill = btn.querySelector('.pix-bg-fill');
                        const pctEl = btn.querySelector('.pix-pct');
                        if (fill) {
                            fill.style.width = pct + '%';
                            const isThisSelected = oid === selectedOption;
                            fill.style.background = isThisSelected ? 'rgba(22,153,118,0.2)' : 'rgba(148,163,184,0.2)';
                        }
                        if (pctEl) {
                            pctEl.textContent = pct + '%';
                            if (total > 0) pctEl.classList.remove('hidden');
                            const isSelected = oid === selectedOption;
                            pctEl.className = pctEl.className.replace(/text-\S+/g, '').trim();
                            pctEl.classList.add(isSelected ? 'text-[#2e3e4c]' : 'text-slate-400');
                        }
                    });
                }
            } else {
                card._myVote = null;
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

        const newIds = [];
        snap.forEach(docSnap => {
            const card = createFeedCard(docSnap.id, docSnap.data());
            feedList.appendChild(card);
            newIds.push(docSnap.id);
        });

        // 새로 추가된 카드 좋아요 상태 복원
        if (auth.currentUser && newIds.length > 0) {
            const { restoreLikeState } = await import('./modules/likes.js');
            await Promise.all(newIds.map(id => restoreLikeState(id, auth.currentUser.uid)));
        }

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
    const feedContainer = document.getElementById('feed-container');
    if (!feedContainer) return;

    // feed-container 자체 스크롤
    feedContainer.addEventListener('scroll', () => {
        if (feedContainer.scrollTop + feedContainer.clientHeight >= feedContainer.scrollHeight - 200) {
            loadFeed();
        }
        sessionStorage.setItem('feedScroll', feedContainer.scrollTop);
        sessionStorage.setItem('feedTab', currentTab);
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

    // 탭바 마우스 드래그 스크롤
    const feedTabsEl = document.getElementById('feed-tabs');
    if (feedTabsEl) {
        let isDown = false;
        let startX = 0;
        let scrollLeft = 0;
        feedTabsEl.addEventListener('mousedown', (e) => {
            isDown = true;
            feedTabsEl.style.cursor = 'grabbing';
            startX = e.pageX - feedTabsEl.offsetLeft;
            scrollLeft = feedTabsEl.scrollLeft;
        });
        document.addEventListener('mouseup', () => {
            isDown = false;
            feedTabsEl.style.cursor = '';
        });
        feedTabsEl.addEventListener('mousemove', (e) => {
            if (!isDown) return;
            e.preventDefault();
            const x = e.pageX - feedTabsEl.offsetLeft;
            feedTabsEl.scrollLeft = scrollLeft - (x - startX) * 1.5;
        });
    }

    initInfiniteScroll();
    initAuthUI();

    // 스크롤 위치 복원
    const savedTab = sessionStorage.getItem('feedTab');
    const savedScroll = sessionStorage.getItem('feedScroll');
    if (savedTab) {
        currentTab = savedTab;
        document.querySelectorAll('.feed-tab-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === savedTab);
        });
    }

    if (savedScroll) {
        // 뒤로가기로 돌아온 경우 → 피드 로드 후 스크롤 복원
        loadFeed(true).then(() => {
            const container = document.getElementById('feed-container');
            if (container) {
                // 카드 렌더링 완료 대기 후 복원
                const tryRestore = (attempts = 0) => {
                    const feedList = document.getElementById('feed-list');
                    if (feedList && feedList.children.length > 0) {
                        container.scrollTop = parseInt(savedScroll);
                        sessionStorage.removeItem('feedScroll');
                        sessionStorage.removeItem('feedTab');
                    } else if (attempts < 20) {
                        setTimeout(() => tryRestore(attempts + 1), 100);
                    }
                };
                tryRestore();
            }
        });
    } else {
        // 일반 진입
        loadFeed(true);
    }

    // 퀵서치는 index.html 인라인 스크립트에서 처리
    document.getElementById('header-avatar')?.addEventListener('click', () => {
        window.location.href = 'mypage.html';
    });

    // --- 숨쉬는 헤더 기능 (Hide-on-Scroll) ---
    const feedContainer = document.getElementById('feed-container');
    const feedTabsScroll = document.getElementById('feed-tabs');

    if (feedContainer && feedTabsScroll) {
        let lastScrollTop = 0;
        const delta = 5;

        feedContainer.addEventListener('scroll', () => {
            const st = feedContainer.scrollTop;

            if (st < delta) {
                feedTabsScroll.classList.remove('hidden-tab');
                feedTabsScroll.classList.add('visible-tab');
                lastScrollTop = st;
                return;
            }

            if (st > lastScrollTop && st > feedTabsScroll.offsetHeight) {
                feedTabsScroll.classList.add('hidden-tab');
                feedTabsScroll.classList.remove('visible-tab');
            } else if (st < lastScrollTop) {
                feedTabsScroll.classList.remove('hidden-tab');
                feedTabsScroll.classList.add('visible-tab');
            }

            lastScrollTop = st;
        });
    }
});
