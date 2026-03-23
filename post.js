import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, onSnapshot, getDoc, updateDoc, increment, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { handleVote } from './vote-system.js';
import { updatePopularityScore } from './quiz-main.js';
import { loadComments, submitComment } from './comments.js';

const params = new URLSearchParams(window.location.search);
const postId = params.get('id');

let imageGallery = [];
let currentImageIndex = 0;
let _myVote = null; // 내 투표 캐시
let _postCache = null; // 게시글 데이터 캐시 (즉시 UI용)

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
    const barA = document.getElementById('vote-bar-a');
    const barB = document.getElementById('vote-bar-b');
    if (barA) { barA.style.width = options[0].percent + '%'; barA.textContent = options[0].percent + '%'; }
    if (barB) { barB.textContent = options[1].percent + '%'; }
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

    onSnapshot(postRef, async (snap) => {
        if (!snap.exists()) {
            document.getElementById('detail-container').innerHTML = "<p class='text-center text-red-500 py-8'>게시물을 찾을 수 없습니다.</p>";
            return;
        }

        const post = snap.data();
        _postCache = post;
        const isPix = post.type === 'quiz' || post.type === 'superquiz';

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
        if (authorEl) authorEl.textContent = post.creatorName || '익명';

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
            updateVoteBarUI(post);

            const shouldBuildButtons = optionsContainer.children.length === 0;
            if (shouldBuildButtons) {
                optionsContainer.innerHTML = '';
                const colors = [
                    { border: 'border-[#169976]', text: 'text-[#169976]', hover: 'hover:bg-[#169976]', ring: 'ring-[#169976]' },
                    { border: 'border-orange-400', text: 'text-orange-500', hover: 'hover:bg-orange-400', ring: 'ring-orange-400' }
                ];
                post.options.forEach((option, i) => {
                    const c = colors[i] || colors[0];
                    const btn = document.createElement('button');
                    btn.className = `vote-option-btn border-2 ${c.border} ${c.text} font-bold py-3 rounded-xl text-sm ${c.hover} hover:text-white transition`;
                    btn.dataset.optionId = option.id;
                    btn.textContent = option.label;
                    btn.addEventListener('click', async () => {
                        const user = auth.currentUser;
                        if (!user) { window.openModal?.(); return; }
                        if (btn.disabled) return;
                        btn.disabled = true;

                        const isSelected = _myVote === option.id;
                        const newSelected = isSelected ? null : option.id;

                        // ① 즉시 버튼 강조 + 바/인원수 반영 (서버 기다리지 않음)
                        applyVoteLocalUI(option.id, isSelected);
                        _myVote = newSelected;
                        applyVoteButtonUI(newSelected);

                        // ② 서버 저장 백그라운드
                        handleVote(postId, option.id).then(success => {
                            if (!success) {
                                // 실패 시 롤백
                                _myVote = isSelected ? option.id : null;
                                applyVoteButtonUI(_myVote);
                            } else {
                                updatePopularityScore(postId);
                            }
                        });

                        btn.disabled = false;
                    });
                    optionsContainer.appendChild(btn);
                });
            }

            const user = auth.currentUser;
            if (user) await restoreUserVotes(user);

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
                navigator.clipboard.writeText(window.location.href).then(() => alert('링크가 복사되었습니다!'));
            };
        }

        // 더보기 버튼 표시 (onAuthStateChanged보다 onSnapshot이 늦을 경우 대비)
        const currentUser = auth.currentUser;
        if (currentUser && post.creatorId === currentUser.uid) {
            const moreBtn = document.getElementById('post-more-btn');
            if (moreBtn) moreBtn.classList.remove('hidden');
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
    await loadComments(postId, postTitle);

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
                const isPix = postData.type === 'quiz' || postData.type === 'superquiz';
                const allowNoVote = postData.allowNoVoteComment === true;
                if (isPix && !allowNoVote) {
                    const voteSnap = await getDoc(doc(db, `questions/${postId}/userVotes/${user.uid}`));
                    if (!voteSnap.exists()) {
                        alert('이 게시글은 투표 후 댓글을 작성할 수 있습니다.');
                        return;
                    }
                }
            }
            await submitComment(postId, postTitle);
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
            await restoreUserVotes(user);

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
                            await deleteDoc(doc(db, 'questions', postId));
                            history.back();
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
