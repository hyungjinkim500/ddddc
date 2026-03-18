import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, getAuth, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, onSnapshot, getDoc, setDoc, deleteDoc, addDoc, serverTimestamp, query, orderBy, getDocs, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { handleVote } from './vote-system.js';
import { handleDetailLike, restoreDetailLikeState } from './modules/likes.js';
import { updatePopularityScore } from './quiz-main.js';

const params = new URLSearchParams(window.location.search);
const postId = params.get('id');

let imageGallery = [];
let currentImageIndex = 0;

function updateImageCounter() {
    const counter = document.getElementById('image-counter');
    if (!counter) return;
    counter.textContent = (currentImageIndex + 1) + ' / ' + imageGallery.length;
}

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

async function loadPost(postId) {
    const container = document.getElementById('detail-container');
    if (!container) return;

    const postRef = doc(db, 'questions', postId);

    if (sessionStorage.getItem('viewed_' + postId) !== 'true') {
        await updateDoc(postRef, { views: increment(1) });
        sessionStorage.setItem('viewed_' + postId, 'true');
    }

    onSnapshot(postRef, async (snap) => {
        if (!snap.exists()) {
            container.innerHTML = "<p class='text-center text-red-500'>게시물을 찾을 수 없습니다.</p>";
            return;
        }

        const post = snap.data();

        // 카테고리
        const categoryEl = document.getElementById('detail-category');
        if (categoryEl && post.category) {
            try {
                const catSnap = await getDoc(doc(db, 'categories', post.category));
                categoryEl.textContent = catSnap.exists() ? catSnap.data().name : post.category;
            } catch {
                categoryEl.textContent = post.category;
            }
        }

        // 제목
        const titleEl = document.getElementById('detail-title');
        if (titleEl) titleEl.textContent = post.title || '';

        // 설명
        const descEl = document.getElementById('detail-description');
        if (descEl) descEl.textContent = post.description || '';

        // 작성자
        const authorEl = document.getElementById('detail-author');
        if (authorEl) authorEl.textContent = post.creatorName || '익명';

        // 작성시간
        const createdAtEl = document.getElementById('detail-created-at');
        if (createdAtEl && post.createdAt && post.createdAt.toDate) {
            const d = post.createdAt.toDate();
            createdAtEl.textContent = d.toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })
                + ' ' + d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
        }

        // 조회수
        const viewCountEl = document.getElementById('detail-view-count');
        if (viewCountEl) viewCountEl.textContent = '조회 ' + (post.views || 0);

        // 댓글수
        const commentCountEl = document.getElementById('detail-comment-count');
        if (commentCountEl) commentCountEl.textContent = '댓글 ' + (post.commentsCount || 0);

        // 이미지
        const imgContainer = document.getElementById('detail-images');
        if (imgContainer) {
            imgContainer.innerHTML = '';
            if (Array.isArray(post.imageUrls) && post.imageUrls.length > 0) {
                imageGallery = post.imageUrls;
                post.imageUrls.forEach(url => {
                    const img = document.createElement('img');
                    img.src = url;
                    img.loading = 'lazy';
                    img.className = 'w-full rounded-lg object-cover max-h-[400px] cursor-zoom-in';
                    img.addEventListener('click', () => {
                        const modal = document.getElementById('image-modal');
                        if (!modal) return;
                        const modalImg = modal.querySelector('img');
                        currentImageIndex = imageGallery.indexOf(url);
                        if (modalImg) modalImg.src = url;
                        modal.classList.remove('hidden');
                        updateImageCounter();
                    });
                    imgContainer.appendChild(img);
                });
            }
        }

        // 참여율 (superquiz만)
        const participationContainer = document.getElementById('detail-participation');
        if (participationContainer) {
            const maxParticipants = post.participantLimit || 0;
            const current = (post.participants || []).length;
            const percent = maxParticipants === 0 ? 0 : Math.round((current / maxParticipants) * 100);
            const bar = document.getElementById('participation-bar');
            if (bar) bar.style.width = percent + '%';
            const text = document.getElementById('participation-text');
            if (text) text.textContent = `${current} / ${maxParticipants} 참여`;
            if (maxParticipants === 0) {
                participationContainer.classList.add('hidden');
            } else {
                participationContainer.classList.remove('hidden');
            }
        }

        // 투표 결과 바
        const resultsContainer = document.getElementById('detail-results');
        if (resultsContainer && Array.isArray(post.options)) {
            resultsContainer.innerHTML = '';
            const votes = post.vote || {};
            const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
            post.options.forEach(option => {
                const count = votes[option.id] || 0;
                const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
                const wrapper = document.createElement('div');
                wrapper.className = 'space-y-1';
                wrapper.innerHTML = `
                    <div class="flex justify-between text-sm text-slate-600">
                        <span>${option.label}</span>
                        <span>${percent}% (${count})</span>
                    </div>
                    <div class="w-full bg-slate-200 rounded h-3">
                        <div class="bg-[#169976] h-3 rounded" style="width:${percent}%"></div>
                    </div>
                `;
                resultsContainer.appendChild(wrapper);
            });
        }

        // 투표 버튼
        const optionsContainer = document.getElementById('detail-options');
        if (optionsContainer && Array.isArray(post.options)) {
            optionsContainer.innerHTML = '';
            post.options.forEach(option => {
                const btn = document.createElement('button');
                btn.className = 'vote-option-btn w-full text-left px-4 py-3 rounded-lg border border-slate-300 hover:bg-slate-50 transition';
                btn.dataset.optionId = option.id;
                btn.dataset.quizId = postId;
                btn.textContent = option.label;
                btn.addEventListener('click', async () => {
                    const allBtns = optionsContainer.querySelectorAll('.vote-option-btn');
                    allBtns.forEach(b => b.classList.remove('ring-2', 'ring-[#169976]', 'ring-offset-2'));
                    btn.classList.add('ring-2', 'ring-[#169976]', 'ring-offset-2');
                    const success = await handleVote(postId, option.id);
                    if (success) {
                        await updatePopularityScore(postId);
                        const auth = getAuth();
                        if (auth.currentUser) restoreUserVotes(auth.currentUser);
                    }
                });
                optionsContainer.appendChild(btn);
            });
        }

        // 좋아요 버튼
        const likeButton = document.getElementById('detail-like-button');
        if (likeButton && !likeButton.querySelector('#like-icon-outline')) {
            likeButton.innerHTML = '<svg id="like-icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"/></svg><svg id="like-icon-filled" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-red-500 hidden"><path d="M12 21s-8.5-4.6-8.5-11.1C3.5 6.4 5.9 4 8.8 4c1.9 0 3.6 1 4.2 2.6C13.6 5 15.3 4 17.2 4 20.1 4 22.5 6.4 22.5 9.9 22.5 16.4 12 21 12 21z"/></svg>';
            likeButton.className = 'px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 transition';
            likeButton.onclick = () => handleDetailLike(postId);
        }

        // 좋아요 수
        const likeCountEl = document.getElementById('detail-like-count');
        if (likeCountEl) likeCountEl.textContent = post.likesCount || 0;

        // 공유 버튼
        const shareBtn = document.getElementById('detail-share-button');
        if (shareBtn) {
            shareBtn.onclick = () => {
                navigator.clipboard.writeText(window.location.href).then(() => {
                    alert('링크가 복사되었습니다!');
                });
            };
        }

        // 좋아요 상태 복원
        const auth = getAuth();
        if (auth.currentUser) {
            restoreUserVotes(auth.currentUser);
            await restoreDetailLikeState(postId, auth.currentUser.uid);
        }

        // 좋아요 수 스타일
        const likeCount = document.getElementById('detail-like-count');
        if (likeCount) likeCount.className = 'ml-2 text-sm text-slate-600';
    });
}

async function loadComments(postId) {
    const commentList = document.getElementById('comment-list');
    if (!commentList) return;
    commentList.innerHTML = '';

    const commentsRef = collection(db, 'questions', postId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const auth = getAuth();

    const commentCountEl = document.getElementById('comment-count');
    if (commentCountEl) commentCountEl.textContent = `댓글 (${snapshot.size})`;

    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        let timeText = '';
        if (data.createdAt && data.createdAt.toDate) {
            const created = data.createdAt.toDate();
            const diff = Math.floor((new Date() - created) / 1000);
            if (diff < 60) timeText = '방금 전';
            else if (diff < 3600) timeText = Math.floor(diff / 60) + '분 전';
            else if (diff < 86400) timeText = Math.floor(diff / 3600) + '시간 전';
            else timeText = Math.floor(diff / 86400) + '일 전';
        }

        let deleteButtonHTML = '';
        if (auth.currentUser && data.uid === auth.currentUser.uid) {
            deleteButtonHTML = `<button class="comment-delete text-xs text-red-500" data-comment-id="${docSnap.id}">삭제</button>`;
        }

        const commentEl = document.createElement('div');
        commentEl.className = 'border rounded-lg p-3 text-sm';
        commentEl.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <div class="text-slate-800 break-all">${data.text}</div>
                    <div class="text-xs text-slate-400 mt-1">${data.nickname || '익명'} · ${timeText}</div>
                    <button class="comment-reply text-xs text-sky-500 mt-1" data-comment-id="${docSnap.id}">답글</button>
                </div>
                ${deleteButtonHTML}
            </div>
        `;
        commentList.appendChild(commentEl);

        // 답글 로드
        const repliesContainer = document.createElement('div');
        repliesContainer.className = 'mt-2';
        commentEl.appendChild(repliesContainer);

        const repliesRef = collection(db, 'questions', postId, 'comments', docSnap.id, 'replies');
        const repliesSnapshot = await getDocs(query(repliesRef, orderBy('createdAt', 'asc')));

        repliesSnapshot.forEach(replyDoc => {
            const replyData = replyDoc.data();
            let replyTime = '';
            if (replyData.createdAt && replyData.createdAt.toDate) {
                const diff = Math.floor((new Date() - replyData.createdAt.toDate()) / 1000);
                if (diff < 60) replyTime = '방금 전';
                else if (diff < 3600) replyTime = Math.floor(diff / 60) + '분 전';
                else if (diff < 86400) replyTime = Math.floor(diff / 3600) + '시간 전';
                else replyTime = Math.floor(diff / 86400) + '일 전';
            }
            let replyDeleteHTML = '';
            if (auth.currentUser && replyData.uid === auth.currentUser.uid) {
                replyDeleteHTML = `<button class="reply-delete text-xs text-red-500" data-reply-id="${replyDoc.id}" data-comment-id="${docSnap.id}">삭제</button>`;
            }
            const replyEl = document.createElement('div');
            replyEl.className = 'ml-6 mt-2 text-sm border-l-2 border-slate-200 pl-3';
            replyEl.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <div class="text-slate-800 break-all">${replyData.text}</div>
                        <div class="text-xs text-slate-400 mt-1">${replyData.nickname || '익명'} · ${replyTime}</div>
                    </div>
                    ${replyDeleteHTML}
                </div>
            `;
            repliesContainer.appendChild(replyEl);
        });
    }

    // 댓글 삭제
    commentList.querySelectorAll('.comment-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const commentRef = doc(db, 'questions', postId, 'comments', btn.dataset.commentId);
            await deleteDoc(commentRef);
            await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(-1) });
            await loadComments(postId);
            await updatePopularityScore(postId);
        });
    });

    // 답글 삭제
    commentList.querySelectorAll('.reply-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const replyRef = doc(db, 'questions', postId, 'comments', btn.dataset.commentId, 'replies', btn.dataset.replyId);
            await deleteDoc(replyRef);
            await loadComments(postId);
        });
    });

    // 답글 작성
    commentList.querySelectorAll('.comment-reply').forEach(btn => {
        btn.addEventListener('click', () => {
            const existing = btn.closest('.border').querySelector('.reply-input');
            if (existing) { existing.closest('.mt-2').remove(); return; }
            const commentId = btn.dataset.commentId;
            const replyBox = document.createElement('div');
            replyBox.className = 'mt-2 w-full';
            replyBox.innerHTML = `
                <div class="flex gap-2">
                    <input type="text" placeholder="답글을 입력하세요" class="reply-input flex-1 border rounded-lg px-3 py-1 text-sm"/>
                    <button class="reply-submit bg-sky-500 text-white px-3 py-1 rounded text-sm">작성</button>
                </div>
                <div class="text-xs text-slate-400 mt-1 text-right reply-char-count">0 / 200</div>
            `;
            btn.closest('.border').appendChild(replyBox);
            const input = replyBox.querySelector('.reply-input');
            const charCount = replyBox.querySelector('.reply-char-count');
            input.addEventListener('input', () => {
                charCount.textContent = input.value.length + ' / 200';
                charCount.classList.toggle('text-red-500', input.value.length > 200);
            });
            replyBox.querySelector('.reply-submit').addEventListener('click', async () => {
                const user = getAuth().currentUser;
                if (!user) { alert('로그인이 필요합니다.'); return; }
                const text = input.value.trim();
                if (!text || text.length > 200) return;
                await addDoc(collection(db, 'questions', postId, 'comments', commentId, 'replies'), {
                    text, uid: user.uid, nickname: user.displayName || '익명', createdAt: serverTimestamp()
                });
                await loadComments(postId);
            });
        });
    });
}

async function loadHeader() {
    const container = document.getElementById('header-container');
    if (!container) return;
    const res = await fetch('/components/header.html');
    const html = await res.text();
    container.innerHTML = html;
    if (window.initializeHeader) window.initializeHeader();
}

async function renderCategoryNavbar() {
    const navbar = document.getElementById('category-tabs');
    if (!navbar) return;
    const { db } = await import('./firebase-config.js');
    const { collection, query, orderBy, getDocs } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const q = query(collection(db, 'categories'), orderBy('order'));
    const snapshot = await getDocs(q);
    navbar.innerHTML = '';
    const default_class = 'tab-button px-4 py-2 rounded-full text-sm font-medium text-slate-600 hover:bg-slate-100';
    snapshot.forEach(docSnap => {
        const btn = document.createElement('a');
        btn.href = `category.html?cat=${docSnap.id}`;
        btn.textContent = docSnap.data().name;
        btn.className = default_class;
        navbar.appendChild(btn);
    });
    const homeBtn = document.createElement('a');
    homeBtn.href = 'quiz.html';
    homeBtn.textContent = '홈';
    homeBtn.className = default_class;
    navbar.insertBefore(homeBtn, navbar.firstChild);
    navbar.classList.remove('invisible');
}

document.addEventListener('DOMContentLoaded', async () => {
    await loadHeader();
    await renderCategoryNavbar();

    if (!postId) {
        document.getElementById('detail-container').innerHTML = '<p class="text-center text-slate-500">게시물 ID가 없습니다.</p>';
        return;
    }

    await loadPost(postId);
    await loadComments(postId);

    // 댓글 입력
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
            const user = getAuth().currentUser;
            if (!user) { alert('로그인이 필요합니다.'); return; }
            const text = commentInput.value.trim();
            if (!text || text.length > 200) return;
            await addDoc(collection(db, 'questions', postId, 'comments'), {
                text, uid: user.uid, nickname: user.displayName || '익명', createdAt: serverTimestamp()
            });
            await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(1) });
            commentInput.value = '';
            await loadComments(postId);
            await updatePopularityScore(postId);
        });
    }

    // 이미지 모달
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
            if (e.key === 'ArrowLeft') { currentImageIndex = (currentImageIndex - 1 + imageGallery.length) % imageGallery.length; }
            if (e.key === 'ArrowRight') { currentImageIndex = (currentImageIndex + 1) % imageGallery.length; }
            if (e.key === 'Escape') { imageModal.classList.add('hidden'); return; }
            imageModal.querySelector('img').src = imageGallery[currentImageIndex];
            updateImageCounter();
        });
    }

    // 로그인 상태
    onAuthStateChanged(auth, async (user) => {
        const loginButton = document.getElementById('login-modal-button');
        const logoutButton = document.getElementById('logout-button');
        const userProfileInfo = document.getElementById('user-profile-info');
        const userNickname = document.getElementById('user-nickname');
        const userPoints = document.getElementById('user-points');

        if (user) {
            if (loginButton) loginButton.classList.add('hidden');
            if (logoutButton) logoutButton.classList.remove('hidden');
            if (userProfileInfo) { userProfileInfo.classList.remove('hidden'); userProfileInfo.classList.add('flex'); }

            const userRef = doc(db, 'userProfiles', user.uid);
            onSnapshot(userRef, (docSnap) => {
                if (!docSnap.exists()) return;
                const data = docSnap.data();
                if (userNickname) userNickname.textContent = data.displayName || '사용자';
                if (userPoints) userPoints.textContent = `${data.points || 0} P`;
                const avatar = document.getElementById('user-avatar');
                if (avatar && data.photoURL) avatar.src = data.photoURL;
            });

            restoreUserVotes(user);
            await restoreDetailLikeState(postId, user.uid);
        } else {
            if (loginButton) loginButton.classList.remove('hidden');
            if (logoutButton) logoutButton.classList.add('hidden');
            if (userProfileInfo) { userProfileInfo.classList.add('hidden'); userProfileInfo.classList.remove('flex'); }
        }
    });
});
