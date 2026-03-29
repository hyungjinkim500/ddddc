import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, getDoc, updateDoc, increment, setDoc, deleteDoc, collection, getDocs, query, where, writeBatch, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { handleVote } from './vote-system.js';
import { updatePopularityScore } from './quiz-main.js';
import { loadComments, submitComment } from './comments.js';

const params = new URLSearchParams(window.location.search);
const postId = params.get('id');

async function deletePostWithSubcollections(postId) {
    const batch = writeBatch(db);

    // comments + replies + commentLikes 삭제
    const commentsSnap = await getDocs(collection(db, 'questions', postId, 'comments'));
    for (const commentDoc of commentsSnap.docs) {
        // 댓글 좋아요 삭제
        const commentLikesSnap = await getDocs(collection(db, 'questions', postId, 'comments', commentDoc.id, 'commentLikes'));
        commentLikesSnap.docs.forEach(l => batch.delete(l.ref));

        // 답글 + 답글 좋아요 삭제
        const repliesSnap = await getDocs(collection(db, 'questions', postId, 'comments', commentDoc.id, 'replies'));
        for (const replyDoc of repliesSnap.docs) {
            const replyLikesSnap = await getDocs(collection(db, 'questions', postId, 'comments', commentDoc.id, 'replies', replyDoc.id, 'commentLikes'));
            replyLikesSnap.docs.forEach(l => batch.delete(l.ref));
            batch.delete(replyDoc.ref);
        }
        batch.delete(commentDoc.ref);
    }

    // likes 삭제
    const likesSnap = await getDocs(collection(db, 'questions', postId, 'likes'));
    likesSnap.docs.forEach(d => batch.delete(d.ref));

    // userVotes 삭제
    const votesSnap = await getDocs(collection(db, 'questions', postId, 'userVotes'));
    votesSnap.docs.forEach(d => batch.delete(d.ref));

    // 게시글 본문 삭제
    batch.delete(doc(db, 'questions', postId));

    await batch.commit();

    // allComments에서 해당 게시글 댓글 삭제 (batch 500건 제한 별도 처리)
    const allCommentsSnap = await getDocs(query(collection(db, 'allComments'), where('questionId', '==', postId)));
    if (!allCommentsSnap.empty) {
        const batch2 = writeBatch(db);
        allCommentsSnap.docs.forEach(d => batch2.delete(d.ref));
        await batch2.commit();
    }
}

let imageGallery = [];
let currentImageIndex = 0;
let _myVote = null; // 내 투표 캐시
let _postCache = null; // 게시글 데이터 캐시 (즉시 UI용)
let _voteInProgress = false; // 투표 진행 중 플래그

function applyVoteLocalUI(optionId, isCancel) {
    if (!_postCache) return;
    const local = JSON.parse(JSON.stringify(_postCache));
    const voteObj = local.vote || {};
    if (isCancel) {
        if (voteObj[optionId] > 0) voteObj[optionId]--;
        local.participants = (local.participants || []).filter(p => p !== 'me');
    } else {
        if (_myVote && voteObj[_myVote] > 0) voteObj[_myVote]--;
        voteObj[optionId] = (voteObj[optionId] || 0) + 1;
        local.participants = [...(local.participants || []), 'me'];
    }
    local.vote = voteObj;
    _postCache = local;
    updateVoteBarUI(local);

    // 인원수 즉시 반영
    const maxP = local.participantLimit || 0;
    const totalVotes = Object.values(voteObj).reduce((a, b) => a + b, 0);
    const curP = (local.participants || []).length;
    const voteStatEl = document.getElementById('detail-vote-stat');
    if (voteStatEl) {
        voteStatEl.querySelector('span').textContent = maxP > 0 ? `${curP}/${maxP}` : totalVotes > 0 ? `${totalVotes}명` : '0명';
    }
    if (maxP > 0) {
        const bar = document.getElementById('participation-bar');
        const text = document.getElementById('participation-text');
        if (bar) bar.style.width = Math.round(curP / maxP * 100) + '%';
        if (text) text.textContent = `${curP} / ${maxP} 참여`;
    }
}

function updateImageCounter() {
    const counter = document.getElementById('image-counter');
    if (!counter) return;
    counter.textContent = (currentImageIndex + 1) + ' / ' + imageGallery.length;
}

function getVotePercent(post) {
    const options = post.options || [];
    const votes = post.vote || {};
    const total = Object.values(votes).reduce((a, b) => a + b, 0);
    return options.map(opt => ({
        id: opt.id,
        label: opt.label || opt.text || '',
        count: votes[opt.id] || 0,
        percent: total > 0 ? Math.round((votes[opt.id] || 0) / total * 100) : 50
    }));
}

async function restoreUserVotes(user) {
    if (!user || !postId) return;
    const userVoteRef = doc(db, `questions/${postId}/userVotes/${user.uid}`);
    const snap = await getDoc(userVoteRef).catch(() => null);
    _myVote = snap?.exists() ? snap.data().selectedOption : null;
    applyVoteButtonUI(_myVote);

    // pix 타입: 복원 시 퍼센트도 표시
    if (_myVote && _postCache && _postCache.type === 'pix') {
        const voteObj = _postCache.vote || {};
        const total = Object.values(voteObj).reduce((a, b) => a + b, 0);
        document.querySelectorAll('.vote-option-btn').forEach((btn) => {
            const optId = btn.dataset.optionId;
            const cnt = voteObj[optId] || 0;
            const pct = total > 0 ? Math.round(cnt / total * 100) : 0;
            const fill = btn.querySelector('.pix-bg-fill');
            const pctEl = btn.querySelector('.pix-pct');
            if (fill) {
                fill.style.width = pct + '%';
                fill.style.background = (optId === _myVote) ? 'rgba(22,153,118,0.2)' : 'rgba(148,163,184,0.2)';
            }
            if (pctEl) {
                pctEl.textContent = pct + '%';
                if (total > 0) pctEl.classList.remove('hidden');
                pctEl.className = pctEl.className.replace(/text-\S+/g, '').trim();
                pctEl.classList.add((optId === _myVote) ? 'text-[#169976]' : 'text-slate-400');
            }
        });
    }
}

function applyVoteButtonUI(selectedId) {
    document.querySelectorAll('.vote-option-btn').forEach(btn => {
        btn.classList.remove('opacity-50', 'ring-[3px]', 'ring-inset', 'ring-[#169976]', 'ring-orange-400');
        if (!selectedId) return;
        if (btn.dataset.optionId === selectedId) {
            btn.classList.add('ring-[3px]', 'ring-inset',
                btn.classList.contains('border-orange-400') ? 'ring-orange-400' : 'ring-[#169976]'
            );
        } else {
            btn.classList.add('opacity-50');
        }
    });
}

function buildPostImageGrid(urls) {
    const n = urls.length;
    const wrapper = document.createElement('div');

    const makeImg = (url, idx) => {
        const img = document.createElement('img');
        img.src = url;
        img.loading = 'lazy';
        img.className = 'w-full h-full object-cover cursor-zoom-in rounded-lg';
        img.addEventListener('click', () => {
            const modal = document.getElementById('image-modal');
            if (!modal) return;
            currentImageIndex = idx;
            modal.querySelector('img').src = url;
            modal.classList.remove('hidden');
            updateImageCounter();
        });
        return img;
    };

    if (n === 1) {
        wrapper.className = 'w-full overflow-hidden rounded-xl';
        wrapper.style.height = '224px';
        wrapper.appendChild(makeImg(urls[0], 0));
    } else if (n === 2) {
        wrapper.className = 'grid grid-cols-2 gap-1 overflow-hidden rounded-xl';
        wrapper.style.height = '224px';
        urls.forEach((u, i) => { const d = document.createElement('div'); d.className = 'overflow-hidden h-full'; d.appendChild(makeImg(u, i)); wrapper.appendChild(d); });
    } else if (n === 3) {
        wrapper.className = 'grid gap-1 overflow-hidden rounded-xl';
        wrapper.style.height = '224px';
        wrapper.style.gridTemplateColumns = '1fr 1fr';
        wrapper.style.gridTemplateRows = '1fr 1fr';
        const left = document.createElement('div');
        left.className = 'overflow-hidden';
        left.style.gridRow = 'span 2';
        left.appendChild(makeImg(urls[0], 0));
        wrapper.appendChild(left);
        [1, 2].forEach(i => { const d = document.createElement('div'); d.className = 'overflow-hidden'; d.appendChild(makeImg(urls[i], i)); wrapper.appendChild(d); });
    } else {
        wrapper.className = 'grid grid-cols-2 gap-1 overflow-hidden rounded-xl';
        wrapper.style.height = '224px';
        urls.slice(0, 4).forEach((u, i) => { const d = document.createElement('div'); d.className = 'overflow-hidden'; d.style.height = 'calc(224px / 2 - 2px)'; d.appendChild(makeImg(u, i)); wrapper.appendChild(d); });
    }
    return wrapper;
}

function updateVoteBarUI(post) {
    const options = getVotePercent(post);
    if (options.length < 2) return;

    if (post.type === 'pix') {
        const voteObj = post.vote || {};
        const total = Object.values(voteObj).reduce((a, b) => a + b, 0);
        document.querySelectorAll('.vote-option-btn').forEach((btn) => {
            const optId = btn.dataset.optionId;
            const cnt = voteObj[optId] || 0;
            const pct = total > 0 ? Math.round(cnt / total * 100) : 0;
            const fill = btn.querySelector('.pix-bg-fill');
            const pctEl = btn.querySelector('.pix-pct');
            if (fill) {
                fill.style.width = pct + '%';
                fill.style.background = (optId === _myVote) ? 'rgba(22,153,118,0.2)' : 'rgba(148,163,184,0.2)';
            }
            if (pctEl) {
                pctEl.textContent = pct + '%';
                if (total > 0) pctEl.classList.remove('hidden');
                pctEl.className = pctEl.className.replace(/text-\S+/g, '').trim();
                pctEl.classList.add((optId === _myVote) ? 'text-[#169976]' : 'text-slate-400');
            }
        });
    } else {
        const barA = document.getElementById('vote-bar-a');
        const barB = document.getElementById('vote-bar-b');
        if (barA) { barA.style.width = options[0].percent + '%'; barA.textContent = options[0].percent + '%'; }
        if (barB) { barB.textContent = options[1].percent + '%'; }
    }
}

function setLikeUI(isLiked) {
    const btn = document.getElementById('detail-like-button');
    if (!btn) return;
    const icon = btn.querySelector('i');
    if (icon) {
        icon.className = isLiked ? 'fas fa-heart text-lg text-red-500' : 'far fa-heart text-lg';
    }
}

async function loadPost(postId) {
    const postRef = doc(db, 'questions', postId);

    if (sessionStorage.getItem('viewed_' + postId) !== 'true') {
        try {
            await updateDoc(postRef, { views: increment(1) });
            sessionStorage.setItem('viewed_' + postId, 'true');
        } catch (e) {
            // 비로그인 시 권한 에러 무시
        }
    }

    // 최초 1회 getDoc으로 전체 렌더링
    const snap = await getDoc(postRef);
    {
        if (!snap.exists()) {
            document.getElementById('detail-container').innerHTML = "<p class='text-center text-red-500 py-8'>게시물을 찾을 수 없습니다.</p>";
            return;
        }

        const post = snap.data();
        _postCache = post;
        const isPix = post.type === 'quiz' || post.type === 'superquiz' || post.type === 'pix';

        // 카테고리 (캐싱)
        const categoryEl = document.getElementById('detail-category');
        if (categoryEl && post.category && !categoryEl.textContent) {
            try {
                const cacheKey = 'cat_' + post.category;
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    categoryEl.textContent = cached;
                } else {
                    const catSnap = await getDoc(doc(db, 'categories', post.category));
                    const name = catSnap.exists() ? catSnap.data().name : post.category;
                    sessionStorage.setItem(cacheKey, name);
                    categoryEl.textContent = name;
                }
            } catch { categoryEl.textContent = post.category; }
        }

        // 제목
        const titleEl = document.getElementById('detail-title');
        if (titleEl) titleEl.textContent = post.title || '';

        // 본문
        const descEl = document.getElementById('detail-description');
        if (descEl) descEl.textContent = post.description || '';

        // 작성자
        const authorEl = document.getElementById('detail-author');
        if (authorEl) {
            authorEl.innerHTML = '';
            const authorLink = document.createElement('a');
            authorLink.href = `profile-view.html?uid=${post.creatorId || ''}`;
            authorLink.className = 'hover:underline';
            authorLink.textContent = post.creatorName || '익명';
            authorEl.appendChild(authorLink);
        }

        // 작성자 프사
        const avatarEl = document.getElementById('detail-author-avatar');
        if (avatarEl && post.creatorPhotoURL) avatarEl.src = post.creatorPhotoURL;

        // 작성시간
        const createdAtEl = document.getElementById('detail-created-at');
        if (createdAtEl && post.createdAt?.toDate) {
            const d = post.createdAt.toDate();
            createdAtEl.textContent = d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        }

        // 조회수 / 댓글수
        const viewEl = document.getElementById('detail-view-count');
        if (viewEl) viewEl.textContent = '조회 ' + (post.views || 0);
        const commentMetaEl = document.getElementById('detail-comment-count-meta');
        if (commentMetaEl) commentMetaEl.textContent = '댓글 ' + (post.commentsCount || 0);

        // 이미지 그리드 (최초 1회만 렌더링)
        const imgContainer = document.getElementById('detail-images');
        if (imgContainer && imgContainer.children.length === 0) {
            if (Array.isArray(post.imageUrls) && post.imageUrls.length > 0) {
                imageGallery = post.imageUrls;
                imgContainer.style.overflow = 'hidden';
                const grid = buildPostImageGrid(post.imageUrls);
                imgContainer.appendChild(grid);
            }
        }

        // 투표인원 현황
        const maxP = post.participantLimit || 0;
        const votes = post.vote || {};
        const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);

        const participationContainer = document.getElementById('detail-participation');

        if (maxP > 0) {
            // 참가자 제한 있음 → 참여 bar 표시
            if (participationContainer) {
                const cur = (post.participants || []).length;
                const bar = document.getElementById('participation-bar');
                if (bar) bar.style.width = (Math.round(cur / maxP * 100)) + '%';
                const text = document.getElementById('participation-text');
                if (text) text.textContent = `${cur} / ${maxP} 참여`;
                participationContainer.classList.remove('hidden');
            }
        } else {
            // 참가자 제한 없음
            if (participationContainer) participationContainer.classList.add('hidden');
        }

        // PIX 투표 UI
        const voteArea = document.getElementById('detail-vote-area');
        const optionsContainer = document.getElementById('detail-options');
        if (isPix && Array.isArray(post.options) && post.options.length >= 2 && voteArea && optionsContainer) {
            voteArea.classList.remove('hidden');
            if (post.type === 'pix') {
                document.getElementById('vote-bar-a')?.parentElement?.classList.add('hidden');
            }
            updateVoteBarUI(post);

            const shouldBuildButtons = optionsContainer.children.length === 0;
            if (shouldBuildButtons) {
                optionsContainer.innerHTML = '';

                if (post.type === 'pix') {
                    optionsContainer.className = 'space-y-2';
                } else {
                    optionsContainer.className = 'grid grid-cols-2 gap-2';
                }

                const colors = [
                    { border: 'border-[#169976]', text: 'text-[#169976]', hover: 'hover:bg-[#169976]', ring: 'ring-[#169976]' },
                    { border: 'border-orange-400', text: 'text-orange-500', hover: 'hover:bg-orange-400', ring: 'ring-orange-400' }
                ];

                // quiz 타입 옵션 이미지 있으면 투표바 위에 표시
                const hasOptionImages = post.type === 'quiz' && post.options.some(o => o.imageUrl);
                if (hasOptionImages) {
                    const imgGrid = document.createElement('div');
                    imgGrid.className = 'grid grid-cols-2 gap-2 mb-3';
                    post.options.slice(0, 2).forEach((option, i) => {
                        const imgWrap = document.createElement('div');
                        imgWrap.className = 'relative overflow-hidden rounded-xl bg-slate-200 dark:bg-slate-600';
                        imgWrap.style.aspectRatio = '1 / 1';
                        if (option.imageUrl) {
                            const img = document.createElement('img');
                            img.src = option.imageUrl;
                            img.className = 'w-full h-full object-cover';
                            imgWrap.appendChild(img);
                        }
                        const labelOverlay = document.createElement('div');
                        labelOverlay.className = 'absolute bottom-0 left-0 right-0 bg-black/40 text-white text-xs font-bold text-center py-1.5';
                        labelOverlay.textContent = option.label;
                        imgWrap.appendChild(labelOverlay);
                        imgGrid.appendChild(imgWrap);
                    });
                    voteArea.insertBefore(imgGrid, voteArea.firstChild);
                }

                post.options.forEach((option, i) => {
                    const btn = document.createElement('button');
                    btn.dataset.optionId = option.id;

                    if (post.type === 'pix') {
                        btn.className = 'vote-option-btn relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-600 flex items-center gap-3 px-3 py-3 text-left w-full';
                        btn.style.minHeight = '52px';
                        const fillDiv = document.createElement('div');
                        fillDiv.className = 'pix-bg-fill absolute inset-0 bg-[#169976]/20 transition-all duration-500';
                        fillDiv.style.width = '0%';
                        btn.appendChild(fillDiv);
                        if (option.imageUrl) {
                            const imgWrap = document.createElement('div');
                            imgWrap.className = 'relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0';
                            const img = document.createElement('img');
                            img.src = option.imageUrl;
                            img.className = 'w-full h-full object-cover';
                            imgWrap.appendChild(img);
                            btn.appendChild(imgWrap);
                        }
                        const labelSpan = document.createElement('span');
                        labelSpan.className = 'relative font-semibold text-slate-800 dark:text-slate-100 text-sm flex-1';
                        labelSpan.textContent = option.label;
                        btn.appendChild(labelSpan);
                        const pctSpan = document.createElement('span');
                        pctSpan.className = 'pix-pct relative font-bold text-[#169976] text-sm hidden';
                        btn.appendChild(pctSpan);
                    } else {
                        const c = colors[i] || colors[0];
                        btn.className = `vote-option-btn border-2 ${c.border} ${c.text} font-bold py-3 rounded-xl text-sm ${c.hover} hover:text-white transition`;
                        btn.textContent = option.label;
                    }

                    btn.addEventListener('click', async () => {
                        if (btn.disabled) return;
                        const allBtns = document.querySelectorAll('.vote-option-btn');
                        allBtns.forEach(b => b.disabled = true);
                        const currentUser = auth.currentUser;
                        if (!currentUser) { window.openModal?.(); allBtns.forEach(b => b.disabled = false); return; }

                        const optionId = option.id;
                        const isSelected = _myVote === optionId;
                        const newSelected = isSelected ? null : optionId;

                        // ① 로컬 캐시 즉시 조작
                        const cached = JSON.parse(JSON.stringify(_postCache || {}));
                        const voteObjLocal = _postCache?.vote ? { ..._postCache.vote } : {};
                        if (isSelected) {
                            if (voteObjLocal[optionId] > 0) voteObjLocal[optionId]--;
                        } else {
                            if (_myVote && voteObjLocal[_myVote] > 0) voteObjLocal[_myVote]--;
                            voteObjLocal[optionId] = (voteObjLocal[optionId] || 0) + 1;
                        }
                        if (_postCache) _postCache = { ..._postCache, vote: voteObjLocal };
                        _myVote = newSelected;

                        // ② 즉시 UI 반영
                        applyVoteButtonUI(newSelected);
                        const total = Object.values(voteObjLocal).reduce((a, b) => a + b, 0);

                        // quiz 타입: 결과 바 즉시 업데이트
                        if (_postCache && (_postCache.type === 'quiz' || _postCache.type === 'superquiz')) {
                            const opts = (_postCache.options || []);
                            const pctA = total > 0 ? Math.round((voteObjLocal[opts[0]?.id] || 0) / total * 100) : 50;
                            const pctB = 100 - pctA;
                            const barA = document.getElementById('vote-bar-a');
                            const barB = document.getElementById('vote-bar-b');
                            if (barA) { barA.style.width = pctA + '%'; barA.textContent = pctA + '%'; }
                            if (barB) { barB.textContent = pctB + '%'; }
                        }

                        allBtns.forEach(b => {
                            const oid = b.dataset.optionId;
                            const cnt = voteObjLocal[oid] || 0;
                            const pct = total > 0 ? Math.round(cnt / total * 100) : 0;
                            const fill = b.querySelector('.pix-bg-fill');
                            const pctEl = b.querySelector('.pix-pct');
                            if (fill) {
                                fill.style.width = pct + '%';
                                fill.style.background = (oid === newSelected) ? 'rgba(22,153,118,0.2)' : 'rgba(148,163,184,0.2)';
                            }
                            if (pctEl) {
                                pctEl.textContent = pct + '%';
                                if (total > 0) pctEl.classList.remove('hidden');
                                pctEl.className = pctEl.className.replace(/text-\S+/g, '').trim();
                                pctEl.classList.add((oid === newSelected) ? 'text-[#169976]' : 'text-slate-400');
                            }
                        });

                        // ③ 서버 저장 백그라운드
                        handleVote(postId, optionId).then(success => {
                            if (success === null) return;
                            if (!success) {
                                _postCache = JSON.parse(JSON.stringify(cached));
                                _myVote = isSelected ? optionId : null;
                                applyVoteButtonUI(_myVote);
                            } else {
                                updatePopularityScore(postId);
                            }
                        });

                        allBtns.forEach(b => b.disabled = false);
                    });
                    optionsContainer.appendChild(btn);
                });
            }

            const user = auth.currentUser;
            if (user && !optionsContainer._votesRestored) {
                optionsContainer._votesRestored = true;
                await restoreUserVotes(user);
            }

            // 투표 기한 만료 시 버튼 비활성화
            if (post.expiresAt) {
                const expiresAt = post.expiresAt.toDate ? post.expiresAt.toDate() : new Date(post.expiresAt);
                if (new Date() > expiresAt) {
                    document.querySelectorAll('.vote-option-btn').forEach(btn => {
                        btn.disabled = true;
                        btn.classList.add('opacity-50', 'cursor-not-allowed');
                    });
                    const expiredMsg = document.createElement('p');
                    expiredMsg.className = 'text-xs text-slate-400 text-center mt-2';
                    expiredMsg.textContent = '투표가 종료되었습니다.';
                    optionsContainer.appendChild(expiredMsg);
                }
            }

        } else {
            const resultsContainer = document.getElementById('detail-results');
            if (resultsContainer && Array.isArray(post.options)) {
                resultsContainer.innerHTML = '';
                const votes = post.vote || {};
                const total = Object.values(votes).reduce((a, b) => a + b, 0);
                post.options.forEach(option => {
                    const count = votes[option.id] || 0;
                    const pct = total === 0 ? 0 : Math.round(count / total * 100);
                    const wrapper = document.createElement('div');
                    wrapper.className = 'space-y-1';
                    wrapper.innerHTML = `
                        <div class="flex justify-between text-sm text-slate-600 dark:text-slate-300">
                            <span>${option.label}</span>
                            <span>${pct}% (${count})</span>
                        </div>
                        <div class="w-full bg-slate-200 rounded h-2">
                            <div class="bg-[#169976] h-2 rounded transition-all" style="width:${pct}%"></div>
                        </div>`;
                    resultsContainer.appendChild(wrapper);
                });
            }
        }

        // 투표인원 표시
        const voteStatEl = document.getElementById('detail-vote-stat');
        if (voteStatEl && isPix) {
            const maxP2 = post.participantLimit || 0;
            const curP2 = (post.participants || []).length;
            const voteObj2 = post.vote || {};
            const totalVotes2 = Object.values(voteObj2).reduce((a, b) => a + b, 0);
            voteStatEl.classList.remove('hidden');
            voteStatEl.querySelector('span').textContent = maxP2 > 0 ? `${curP2}/${maxP2}` : totalVotes2 > 0 ? `${totalVotes2}명` : '0명';
        }

        // 좋아요 수
        const likeCountEl = document.getElementById('detail-like-count');
        if (likeCountEl) likeCountEl.textContent = post.likesCount || 0;

        // 좋아요 버튼 (최초 1회만 초기화)
        const likeButton = document.getElementById('detail-like-button');
        if (likeButton && !likeButton._initialized) {
            likeButton._initialized = true;
            const user = auth.currentUser;
            if (user) {
                const likeRef = doc(db, `questions/${postId}/likes/${user.uid}`);
                const likeSnap = await getDoc(likeRef);
                setLikeUI(likeSnap.exists());
            }
            likeButton.addEventListener('click', async () => {
                if (likeButton.disabled) return;
                likeButton.disabled = true;
                const user = auth.currentUser;
                if (!user) { window.openModal?.(); likeButton.disabled = false; return; }
                const likeRef = doc(db, `questions/${postId}/likes/${user.uid}`);
                const likeSnap = await getDoc(likeRef);
                const postRef = doc(db, 'questions', postId);
                const isLiked = likeSnap.exists();
                // 즉시 UI 반영
                setLikeUI(!isLiked);
                const likeCountEl = document.getElementById('detail-like-count');
                if (likeCountEl) likeCountEl.textContent = (parseInt(likeCountEl.textContent) || 0) + (isLiked ? -1 : 1);
                // 서버 저장
                if (isLiked) {
                    await deleteDoc(likeRef);
                    await updateDoc(postRef, { likesCount: increment(-1) });
                } else {
                    await setDoc(likeRef, { userId: user.uid, createdAt: new Date() });
                    await updateDoc(postRef, { likesCount: increment(1) });
                }
                likeButton.disabled = false;
            });
        }

        // 공유 버튼
        const shareBtn = document.getElementById('detail-share-button');
        if (shareBtn && !shareBtn._initialized) {
            shareBtn._initialized = true;
            shareBtn.onclick = () => {
                const ogUrl = `https://us-central1-dddc-hyungjin-0726.cloudfunctions.net/getPostOg?id=${postId}`;
                navigator.clipboard.writeText(ogUrl).then(() => alert('링크가 복사되었습니다!'));
            };
        }

        // 더보기 버튼 표시 (onAuthStateChanged보다 onSnapshot이 늦을 경우 대비)
        const currentUser = auth.currentUser;
        if (currentUser && post.creatorId === currentUser.uid) {
            const moreBtn = document.getElementById('post-more-btn');
            const moreMenu = document.getElementById('post-more-menu');
            if (moreBtn) {
                moreBtn.classList.remove('hidden');
                if (!moreBtn._initialized) {
                    moreBtn._initialized = true;
                    moreBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        moreMenu.classList.toggle('hidden');
                    });
                    document.addEventListener('click', () => moreMenu.classList.add('hidden'));
                }
                const editBtn = document.getElementById('post-edit-btn');
                if (editBtn && !editBtn._initialized) {
                    editBtn._initialized = true;
                    editBtn.addEventListener('click', () => {
                        window.location.href = `create-post.html?edit=true&id=${postId}`;
                    });
                }
                const deleteBtn = document.getElementById('post-delete-btn');
                if (deleteBtn && !deleteBtn._initialized) {
                    deleteBtn._initialized = true;
                    deleteBtn.addEventListener('click', async () => {
                        if (!confirm('게시글을 삭제할까요?')) return;
                        try {
                            await deletePostWithSubcollections(postId);
                            window.location.replace('index.html');
                        } catch (e) {
                            alert('삭제 중 오류가 발생했습니다.');
                        }
                    });
                }
            }
        }
    }

    // onSnapshot으로 실시간 투표 수 반영 (vote, participants 변경 감지)
    onSnapshot(postRef, (snapLive) => {
        if (!snapLive.exists()) return;
        const live = snapLive.data();
        _postCache = { ..._postCache, vote: live.vote, participants: live.participants };

        // 투표 바/퍼센트 UI 업데이트
        updateVoteBarUI(_postCache);

        // 투표인원 수 업데이트
        const voteStatEl = document.getElementById('detail-vote-stat');
        const maxP = live.participantLimit || 0;
        const voteObj = live.vote || {};
        const totalVotes = Object.values(voteObj).reduce((a, b) => a + b, 0);
        const curP = (live.participants || []).length;
        if (voteStatEl) {
            voteStatEl.querySelector('span').textContent = maxP > 0 ? `${curP}/${maxP}` : totalVotes > 0 ? `${totalVotes}명` : '0명';
        }
        if (maxP > 0) {
            const bar = document.getElementById('participation-bar');
            const text = document.getElementById('participation-text');
            if (bar) bar.style.width = Math.round(curP / maxP * 100) + '%';
            if (text) text.textContent = `${curP} / ${maxP} 참여`;
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    if (!postId) {
        document.getElementById('detail-container').innerHTML = '<p class="text-center text-slate-500 py-8">게시물 ID가 없습니다.</p>';
        return;
    }

    const postSnap = await getDoc(doc(db, 'questions', postId));
    const postTitle = postSnap.exists() ? (postSnap.data().title || '') : '';

    await loadPost(postId);
    const postOptions = _postCache?.options || [];
    const postType = _postCache?.type || '';
    await loadComments(postId, postTitle, postType, postOptions);

    const commentInput = document.getElementById('comment-input');
    const commentLength = document.getElementById('comment-length');
    const commentSubmit = document.getElementById('comment-submit');

    if (commentInput && commentLength) {
        commentInput.addEventListener('input', () => {
            commentLength.textContent = commentInput.value.length + ' / 200';
        });
        commentInput.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                commentSubmit?.click();
            }
        });
    }

    if (commentSubmit) {
        commentSubmit.addEventListener('click', async () => {
            if (commentSubmit.disabled) return;
            commentSubmit.disabled = true;

            const user = auth.currentUser;
            if (!user) { window.openModal?.(); commentSubmit.disabled = false; return; }

            // PIX 게시글이고 무투표댓글 비허용 시 투표 여부 체크
            const postSnap2 = await getDoc(doc(db, 'questions', postId));
            if (postSnap2.exists()) {
                const postData = postSnap2.data();
                const isPix = postData.type === 'quiz' || postData.type === 'superquiz' || postData.type === 'pix';
                const allowNoVote = postData.allowNoVoteComment === true;
                if (isPix && !allowNoVote) {
                    const voteSnap = await getDoc(doc(db, `questions/${postId}/userVotes/${user.uid}`));
                    if (!voteSnap.exists()) {
                        alert('이 게시글은 투표 후 댓글을 작성할 수 있습니다.');
                        commentSubmit.disabled = false;
                        return;
                    }
                }
            }
            await submitComment(postId, postTitle, postType, postOptions);
            commentSubmit.disabled = false;
        });
    }

    const imageModal = document.getElementById('image-modal');
    if (imageModal) {
        document.getElementById('image-modal-close')?.addEventListener('click', () => imageModal.classList.add('hidden'));
        imageModal.addEventListener('click', e => { if (e.target === imageModal) imageModal.classList.add('hidden'); });
        document.getElementById('image-prev')?.addEventListener('click', () => {
            currentImageIndex = (currentImageIndex - 1 + imageGallery.length) % imageGallery.length;
            imageModal.querySelector('img').src = imageGallery[currentImageIndex];
            updateImageCounter();
        });
        document.getElementById('image-next')?.addEventListener('click', () => {
            currentImageIndex = (currentImageIndex + 1) % imageGallery.length;
            imageModal.querySelector('img').src = imageGallery[currentImageIndex];
            updateImageCounter();
        });
        document.addEventListener('keydown', e => {
            if (imageModal.classList.contains('hidden') || imageGallery.length === 0) return;
            if (e.key === 'ArrowLeft') currentImageIndex = (currentImageIndex - 1 + imageGallery.length) % imageGallery.length;
            if (e.key === 'ArrowRight') currentImageIndex = (currentImageIndex + 1) % imageGallery.length;
            if (e.key === 'Escape') { imageModal.classList.add('hidden'); return; }
            imageModal.querySelector('img').src = imageGallery[currentImageIndex];
            updateImageCounter();
        });
    }

    onAuthStateChanged(auth, async (user) => {
        const headerLoginBtn = document.getElementById('header-login-btn');
        const headerUserArea = document.getElementById('header-user-area');
        const headerAvatar = document.getElementById('header-avatar');

        if (user) {
            if (headerLoginBtn) headerLoginBtn.classList.add('hidden');
            if (headerUserArea) { headerUserArea.classList.remove('hidden'); headerUserArea.classList.add('flex'); }
            // 프사 로드
            getDoc(doc(db, 'userProfiles', user.uid)).then(snap => {
                if (snap.exists() && snap.data().photoURL && headerAvatar) {
                    headerAvatar.src = snap.data().photoURL;
                }
            });
            if (headerAvatar) {
                headerAvatar.onclick = () => window.location.href = 'mypage.html';
            }

            // 본인 게시글 여부 확인 → 더보기 버튼 표시
            const moreBtn = document.getElementById('post-more-btn');
            const moreMenu = document.getElementById('post-more-menu');
            if (moreBtn && _postCache && _postCache.creatorId === user.uid) {
                moreBtn.classList.remove('hidden');

                // 드롭다운 열기/닫기
                if (!moreBtn._initialized) {
                    moreBtn._initialized = true;
                    moreBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        moreMenu.classList.toggle('hidden');
                    });
                    document.addEventListener('click', () => moreMenu.classList.add('hidden'));
                }

                // 수정 버튼
                const editBtn = document.getElementById('post-edit-btn');
                if (editBtn && !editBtn._initialized) {
                    editBtn._initialized = true;
                    editBtn.addEventListener('click', () => {
                        window.location.href = `create-post.html?edit=true&id=${postId}`;
                    });
                }

                // 삭제 버튼
                const deleteBtn = document.getElementById('post-delete-btn');
                if (deleteBtn && !deleteBtn._initialized) {
                    deleteBtn._initialized = true;
                    deleteBtn.addEventListener('click', async () => {
                        if (!confirm('게시글을 삭제할까요?')) return;
                        try {
                            await deletePostWithSubcollections(postId);
                            window.location.replace('index.html');
                        } catch (e) {
                            alert('삭제 중 오류가 발생했습니다.');
                        }
                    });
                }
            }
        } else {
            if (headerLoginBtn) {
                headerLoginBtn.classList.remove('hidden');
                headerLoginBtn.onclick = () => window.openModal?.();
            }
            if (headerUserArea) { headerUserArea.classList.add('hidden'); headerUserArea.classList.remove('flex'); }
        }
    });
});
