import { auth, db } from './firebase-config.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, addDoc, deleteDoc, getDocs, query, orderBy, updateDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { updatePopularityScore } from './quiz-main.js';
import { notifyComment, notifyReply } from './notifications.js';

function getOptionLabel(votedOption, postType, postOptions) {
    if (postType !== 'pix') return '';
    if (!votedOption) return '(미투표)';
    const opt = (postOptions || []).find(o => o.id === votedOption);
    const label = opt?.label || '';
    if (!label) return '';
    return '(' + (label.length > 5 ? label.slice(0, 5) + '..' : label) + ')';
}

async function createReplyEl(replyData, replyId, commentId, postId, postTitle, auth, postType, postOptions) {
    let replyDeleteHTML = '';
    if (auth.currentUser && replyData.uid === auth.currentUser.uid) {
        replyDeleteHTML = `<button class="reply-delete text-xs text-red-500" data-reply-id="${replyId}" data-comment-id="${commentId}">삭제</button>`;
    }
    let replyBgClass = '';
    if (postType !== 'pix') {
        if (replyData.votedOption === 'option_1') replyBgClass = 'bg-green-50 dark:bg-green-900/20';
        else if (replyData.votedOption === 'option_2') replyBgClass = 'bg-orange-50 dark:bg-orange-900/20';
    }
    const replyOptionLabel = getOptionLabel(replyData.votedOption, postType, postOptions);

    const replyEl = document.createElement('div');
    replyEl.className = `ml-6 mt-2 text-sm border-l-2 border-slate-200 pl-3 rounded-r-lg ${replyBgClass}`;
    replyEl.dataset.replyId = replyId;
    replyEl.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <div class="text-slate-800 dark:text-slate-200 break-all">${replyData.text}</div>
                <div class="text-xs text-slate-400 mt-1"><a href="profile-view.html?uid=${replyData.uid || ''}" class="hover:underline">${replyData.nickname || '익명'}</a>${replyOptionLabel ? ' <span class="text-[#169976]">' + replyOptionLabel + '</span>' : ''} · 방금 전</div>
                <div class="flex items-center gap-3 mt-1">
                    <button class="reply-like-btn text-xs text-slate-400 flex items-center gap-0.5">👍 <span class="like-count">${replyData.likes || 0}</span></button>
                    <button class="reply-dislike-btn text-xs text-slate-400 flex items-center gap-0.5">👎 <span class="dislike-count">${replyData.dislikes || 0}</span></button>
                </div>
            </div>
            ${replyDeleteHTML}
        </div>
    `;

    // 답글 좋아요/싫어요 상태 복원
    const replyLikeBtn = replyEl.querySelector('.reply-like-btn');
    const replyDislikeBtn = replyEl.querySelector('.reply-dislike-btn');
    const replyCurrentUser = getAuth().currentUser;
    if (replyCurrentUser) {
        try {
            const { doc: fsDoc, getDoc: fsGetDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
            const likeSnap = await fsGetDoc(fsDoc(db, 'questions', postId, 'comments', commentId, 'replies', replyId, 'commentLikes', replyCurrentUser.uid));
            if (likeSnap.exists()) {
                const t = likeSnap.data().type;
                if (t === 'like') replyLikeBtn.classList.replace('text-slate-400', 'text-[#169976]');
                if (t === 'dislike') replyDislikeBtn.classList.replace('text-slate-400', 'text-red-400');
            }
        } catch(e) {}
    }

    async function handleReplyReaction(type) {
        const user = getAuth().currentUser;
        if (!user) { window.openModal?.(); return; }
        const { doc: fsDoc, getDoc: fsGetDoc, setDoc: fsSetDoc, deleteDoc: fsDeleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        const likeRef = fsDoc(db, 'questions', postId, 'comments', commentId, 'replies', replyId, 'commentLikes', user.uid);
        const replyRef = fsDoc(db, 'questions', postId, 'comments', commentId, 'replies', replyId);
        const snap = await fsGetDoc(likeRef);
        const existing = snap.exists() ? snap.data().type : null;

        const likeCountEl = replyLikeBtn.querySelector('.like-count');
        const dislikeCountEl = replyDislikeBtn.querySelector('.dislike-count');

        if (existing === type) {
            await fsDeleteDoc(likeRef);
            await updateDoc(replyRef, { [type === 'like' ? 'likes' : 'dislikes']: increment(-1) });
            if (type === 'like') { likeCountEl.textContent = Math.max(0, parseInt(likeCountEl.textContent) - 1); replyLikeBtn.classList.replace('text-[#169976]', 'text-slate-400'); }
            else { dislikeCountEl.textContent = Math.max(0, parseInt(dislikeCountEl.textContent) - 1); replyDislikeBtn.classList.replace('text-red-400', 'text-slate-400'); }
        } else {
            if (existing) {
                await updateDoc(replyRef, { [existing === 'like' ? 'likes' : 'dislikes']: increment(-1) });
                if (existing === 'like') { likeCountEl.textContent = Math.max(0, parseInt(likeCountEl.textContent) - 1); replyLikeBtn.classList.replace('text-[#169976]', 'text-slate-400'); }
                else { dislikeCountEl.textContent = Math.max(0, parseInt(dislikeCountEl.textContent) - 1); replyDislikeBtn.classList.replace('text-red-400', 'text-slate-400'); }
            }
            await fsSetDoc(likeRef, { type });
            await updateDoc(replyRef, { [type === 'like' ? 'likes' : 'dislikes']: increment(1) });
            if (type === 'like') { likeCountEl.textContent = parseInt(likeCountEl.textContent) + 1; replyLikeBtn.classList.replace('text-slate-400', 'text-[#169976]'); }
            else { dislikeCountEl.textContent = parseInt(dislikeCountEl.textContent) + 1; replyDislikeBtn.classList.replace('text-slate-400', 'text-red-400'); }
        }
    }

    let replyReactionInProgress = false;
    replyLikeBtn.addEventListener('click', async () => {
        if (replyReactionInProgress) return;
        replyReactionInProgress = true;
        await handleReplyReaction('like');
        replyReactionInProgress = false;
    });
    replyDislikeBtn.addEventListener('click', async () => {
        if (replyReactionInProgress) return;
        replyReactionInProgress = true;
        await handleReplyReaction('dislike');
        replyReactionInProgress = false;
    });

    replyEl.querySelector('.reply-delete')?.addEventListener('click', async () => {
        const replyRef = doc(db, 'questions', postId, 'comments', commentId, 'replies', replyId);
        await deleteDoc(replyRef);
        await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(-1) });
        replyEl.remove();
        updateTotalCount(-1);
    });

    return replyEl;
}

function updateTotalCount(delta) {
    const el = document.getElementById('detail-comment-count');
    if (!el) return;
    const current = parseInt(el.textContent.replace(/[()]/g, '')) || 0;
    el.textContent = '(' + Math.max(0, current + delta) + ')';
}

function updateReplyBadge(btn, delta) {
    let badge = btn.querySelector('.reply-count-badge');
    if (!badge) {
        if (delta <= 0) return;
        badge = document.createElement('span');
        badge.className = 'reply-count-badge';
        btn.appendChild(document.createTextNode(' '));
        btn.appendChild(badge);
    }
    const current = parseInt(badge.textContent.replace(/[()]/g, '')) || 0;
    const next = Math.max(0, current + delta);
    badge.textContent = `(${next})`;
}

export async function loadComments(postId, postTitle, postType = '', postOptions = []) {
    const commentList = document.getElementById('comment-list');
    if (!commentList) return;
    commentList.innerHTML = '';

    const commentsRef = collection(db, 'questions', postId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const auth = getAuth();

    // 댓글 데이터 수집
    let commentDocs = snapshot.docs;

    // 정렬 함수
    function sortComments(docs, sortVal) {
        const arr = [...docs];
        if (sortVal === 'oldest') {
            arr.sort((a, b) => {
                const tA = a.data().createdAt?.toDate?.() || 0;
                const tB = b.data().createdAt?.toDate?.() || 0;
                return tA - tB;
            });
        } else if (sortVal === 'top') {
            arr.sort((a, b) => {
                const scoreA = (a.data().likes || 0) - (a.data().dislikes || 0);
                const scoreB = (b.data().likes || 0) - (b.data().dislikes || 0);
                return scoreB - scoreA;
            });
        } else { // latest
            arr.sort((a, b) => {
                const tA = a.data().createdAt?.toDate?.() || 0;
                const tB = b.data().createdAt?.toDate?.() || 0;
                return tB - tA;
            });
        }
        return arr;
    }

    // 렌더링 함수 (정렬된 docs 기준으로 댓글 목록 재구성)
    async function renderComments(docs) {
        commentList.innerHTML = '';

        const replyCountMap = {};
        await Promise.all(docs.map(async docSnap => {
            const repliesRef = collection(db, 'questions', postId, 'comments', docSnap.id, 'replies');
            const repliesSnapshot = await getDocs(query(repliesRef, orderBy('createdAt', 'asc')));
            replyCountMap[docSnap.id] = { count: repliesSnapshot.size, docs: repliesSnapshot.docs };
        }));

        const totalReplies = Object.values(replyCountMap).reduce((a, b) => a + b.count, 0);
        const totalCount = docs.length + totalReplies;
        const commentCountEl = document.getElementById('detail-comment-count');
        if (commentCountEl) commentCountEl.textContent = '(' + totalCount + ')';

        for (const docSnap of docs) {
            const data = docSnap.data();
            const timeText = formatTime(data.createdAt);
            const replyCount = replyCountMap[docSnap.id]?.count || 0;
            const replyDocs = replyCountMap[docSnap.id]?.docs || [];

            let deleteButtonHTML = '';
            if (auth.currentUser && data.uid === auth.currentUser.uid) {
                deleteButtonHTML = `<button class="comment-delete text-xs text-red-500" data-comment-id="${docSnap.id}">삭제</button>`;
            }

            let bgClass = 'bg-white dark:bg-slate-800';
            if (postType !== 'pix') {
                if (data.votedOption === 'option_1') bgClass = 'bg-green-50 dark:bg-green-900/20 border-green-200';
                else if (data.votedOption === 'option_2') bgClass = 'bg-orange-50 dark:bg-orange-900/20 border-orange-200';
            }
            const optionLabel = getOptionLabel(data.votedOption, postType, postOptions);

            const commentEl = document.createElement('div');
            commentEl.className = `border rounded-lg p-3 text-sm ${bgClass}`;
            commentEl.dataset.commentId = docSnap.id;
            commentEl.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                         <div class="text-slate-800 dark:text-slate-200 break-all">${data.text}</div>
                         <div class="text-xs text-slate-400 mt-1"><a href="profile-view.html?uid=${data.uid || ''}" class="hover:underline">${data.nickname || '익명'}</a>${optionLabel ? ' <span class="text-[#169976]">' + optionLabel + '</span>' : ''} · ${timeText}</div>
                        <div class="flex items-center gap-3 mt-1">
                            <button class="comment-reply text-xs text-sky-500" data-comment-id="${docSnap.id}">답글${replyCount > 0 ? ` <span class="reply-count-badge">(${replyCount})</span>` : ''}</button>
                            <button class="comment-like-btn text-xs text-slate-400 flex items-center gap-0.5" data-comment-id="${docSnap.id}">👍 <span class="like-count">${data.likes || 0}</span></button>
                            <button class="comment-dislike-btn text-xs text-slate-400 flex items-center gap-0.5" data-comment-id="${docSnap.id}">👎 <span class="dislike-count">${data.dislikes || 0}</span></button>
                        </div>
                    </div>
                    ${deleteButtonHTML}
                </div>
            `;
            commentList.appendChild(commentEl);

            const repliesContainer = document.createElement('div');
            repliesContainer.className = 'mt-2 hidden';
            repliesContainer.dataset.repliesFor = docSnap.id;
            commentEl.appendChild(repliesContainer);

            for (const replyDoc of replyDocs) {
                const replyEl = await createReplyEl(replyDoc.data(), replyDoc.id, docSnap.id, postId, postTitle, auth, postType, postOptions);
                repliesContainer.appendChild(replyEl);
            }

            const replyBox = document.createElement('div');
            replyBox.className = 'mt-2 ml-6 reply-input-box';
            replyBox.innerHTML = `
                <div class="flex gap-2">
                    <input type="text" placeholder="답글을 입력하세요" class="reply-input flex-1 border rounded-lg px-3 py-1 text-sm dark:bg-slate-800 dark:border-slate-600"/>
                    <button class="reply-submit bg-sky-500 text-white px-3 py-1 rounded text-sm">작성</button>
                </div>
                <div class="text-xs text-slate-400 mt-1 text-right reply-char-count">0 / 200</div>
            `;
            repliesContainer.appendChild(replyBox);

            const replyInput = replyBox.querySelector('.reply-input');
            const charCount = replyBox.querySelector('.reply-char-count');
            replyInput.addEventListener('input', () => {
                charCount.textContent = replyInput.value.length + ' / 200';
                charCount.classList.toggle('text-red-500', replyInput.value.length > 200);
            });

            replyBox.querySelector('.reply-submit').addEventListener('click', async (e) => {
                const submitBtn = e.currentTarget;
                if (submitBtn.disabled) return;
                submitBtn.disabled = true;
                const user = getAuth().currentUser;
                if (!user) { alert('로그인이 필요합니다.'); submitBtn.disabled = false; return; }
                const text = replyInput.value.trim();
                if (!text || text.length > 200) { submitBtn.disabled = false; return; }

                let votedOption = null;
                try {
                    const { doc: fsDoc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
                    const voteSnap = await getDoc(fsDoc(db, `questions/${postId}/userVotes/${user.uid}`));
                    if (voteSnap.exists()) votedOption = voteSnap.data().selectedOption;
                } catch (e) {}

                const replyData = {
                    text, uid: user.uid, nickname: user.displayName || '익명', createdAt: serverTimestamp(),
                    ...(votedOption && { votedOption })
                };
                const replyRef = await addDoc(collection(db, 'questions', postId, 'comments', docSnap.id, 'replies'), replyData);
                await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(1) });
                notifyReply(postId, data.uid, user.uid, user.displayName || '익명').catch(() => {});

                const newReplyEl = await createReplyEl({ ...replyData, createdAt: null }, replyRef.id, docSnap.id, postId, postTitle, auth, postType, postOptions);
                repliesContainer.insertBefore(newReplyEl, replyBox);

                replyInput.value = '';
                charCount.textContent = '0 / 200';
                updateTotalCount(1);

                const replyBtn = commentEl.querySelector('.comment-reply');
                updateReplyBadge(replyBtn, 1);
                submitBtn.disabled = false;
            });

            commentEl.querySelector('.comment-delete')?.addEventListener('click', async () => {
                const repliesRef = collection(db, 'questions', postId, 'comments', docSnap.id, 'replies');
                const repliesSnap = await getDocs(repliesRef);
                const replyCount = repliesSnap.size;
                await deleteDoc(doc(db, 'questions', postId, 'comments', docSnap.id));
                await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(-(1 + replyCount)) });
                updateTotalCount(-(1 + replyCount));
                commentEl.remove();
                await updatePopularityScore(postId);
            });

            commentEl.querySelector('.comment-reply').addEventListener('click', () => {
                const isHidden = repliesContainer.classList.contains('hidden');
                repliesContainer.classList.toggle('hidden', !isHidden);
                if (!isHidden) return;
                replyInput.focus();
            });

            // 좋아요/싫어요 상태 복원 및 클릭 핸들러
            const likeBtn = commentEl.querySelector('.comment-like-btn');
            const dislikeBtn = commentEl.querySelector('.comment-dislike-btn');

            // 내 상태 복원
            const currentUser = getAuth().currentUser;
            if (currentUser) {
                try {
                    const { doc: fsDoc, getDoc: fsGetDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
                    const likeSnap = await fsGetDoc(fsDoc(db, 'questions', postId, 'comments', docSnap.id, 'commentLikes', currentUser.uid));
                    if (likeSnap.exists()) {
                        const t = likeSnap.data().type;
                        if (t === 'like') likeBtn.classList.replace('text-slate-400', 'text-[#169976]');
                        if (t === 'dislike') dislikeBtn.classList.replace('text-slate-400', 'text-red-400');
                    }
                } catch(e) {}
            }

            async function handleCommentReaction(type) {
                const user = getAuth().currentUser;
                if (!user) { window.openModal?.(); return; }
                const { doc: fsDoc, getDoc: fsGetDoc, setDoc: fsSetDoc, deleteDoc: fsDeleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
                const likeRef = fsDoc(db, 'questions', postId, 'comments', docSnap.id, 'commentLikes', user.uid);
                const commentRef = fsDoc(db, 'questions', postId, 'comments', docSnap.id);
                const snap = await fsGetDoc(likeRef);
                const existing = snap.exists() ? snap.data().type : null;

                const likeCountEl = likeBtn.querySelector('.like-count');
                const dislikeCountEl = dislikeBtn.querySelector('.dislike-count');

                if (existing === type) {
                    // 취소
                    await fsDeleteDoc(likeRef);
                    await updateDoc(commentRef, { [type === 'like' ? 'likes' : 'dislikes']: increment(-1) });
                    if (type === 'like') { likeCountEl.textContent = Math.max(0, parseInt(likeCountEl.textContent) - 1); likeBtn.classList.replace('text-[#169976]', 'text-slate-400'); }
                    else { dislikeCountEl.textContent = Math.max(0, parseInt(dislikeCountEl.textContent) - 1); dislikeBtn.classList.replace('text-red-400', 'text-slate-400'); }
                } else {
                    // 반대 취소 후 적용
                    if (existing) {
                        await updateDoc(commentRef, { [existing === 'like' ? 'likes' : 'dislikes']: increment(-1) });
                        if (existing === 'like') { likeCountEl.textContent = Math.max(0, parseInt(likeCountEl.textContent) - 1); likeBtn.classList.replace('text-[#169976]', 'text-slate-400'); }
                        else { dislikeCountEl.textContent = Math.max(0, parseInt(dislikeCountEl.textContent) - 1); dislikeBtn.classList.replace('text-red-400', 'text-slate-400'); }
                    }
                    await fsSetDoc(likeRef, { type });
                    await updateDoc(commentRef, { [type === 'like' ? 'likes' : 'dislikes']: increment(1) });
                    if (type === 'like') { likeCountEl.textContent = parseInt(likeCountEl.textContent) + 1; likeBtn.classList.replace('text-slate-400', 'text-[#169976]'); }
                    else { dislikeCountEl.textContent = parseInt(dislikeCountEl.textContent) + 1; dislikeBtn.classList.replace('text-slate-400', 'text-red-400'); }
                }
            }

            let commentReactionInProgress = false;
            likeBtn.addEventListener('click', async () => {
                if (commentReactionInProgress) return;
                commentReactionInProgress = true;
                await handleCommentReaction('like');
                commentReactionInProgress = false;
            });
            dislikeBtn.addEventListener('click', async () => {
                if (commentReactionInProgress) return;
                commentReactionInProgress = true;
                await handleCommentReaction('dislike');
                commentReactionInProgress = false;
            });
        }
    }

    // 정렬 필터 이벤트
    const commentSortEl = document.getElementById('comment-sort');
    if (commentSortEl && !commentSortEl._initialized) {
        commentSortEl._initialized = true;
        commentSortEl.addEventListener('change', () => {
            renderComments(sortComments(commentDocs, commentSortEl.value));
        });
    }

    await renderComments(sortComments(commentDocs, commentSortEl?.value || 'latest'));
}

export async function submitComment(postId, postTitle, postType = '', postOptions = []) {
    const user = getAuth().currentUser;
    if (!user) { alert('로그인이 필요합니다.'); return; }
    const commentInput = document.getElementById('comment-input');
    if (!commentInput) return;
    const text = commentInput.value.trim();
    if (!text || text.length > 200) return;

    let votedOption = null;
    try {
        const { doc: fsDoc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        const voteSnap = await getDoc(fsDoc(db, `questions/${postId}/userVotes/${user.uid}`));
        if (voteSnap.exists()) votedOption = voteSnap.data().selectedOption;
    } catch (e) {}

    const commentData = {
        text,
        uid: user.uid,
        nickname: user.displayName || '익명',
        createdAt: serverTimestamp(),
        ...(votedOption && { votedOption })
    };

    await addDoc(collection(db, 'questions', postId, 'comments'), commentData);
    notifyComment(postId, user.uid, user.displayName || '익명').catch(() => {});
    await addDoc(collection(db, 'allComments'), {
        ...commentData,
        questionId: postId,
        questionTitle: postTitle || ''
    });
    await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(1) });

    commentInput.value = '';

    // Re-load comments to show the new one and apply sorting
    loadComments(postId, postTitle, postType, postOptions);
    await updatePopularityScore(postId);
}

function formatTime(timestamp) {
    if (!timestamp || !timestamp.toDate) return '';
    const diff = Math.floor((new Date() - timestamp.toDate()) / 1000);
    if (diff < 60) return '방금 전';
    if (diff < 3600) return Math.floor(diff / 60) + '분 전';
    if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
    return Math.floor(diff / 86400) + '일 전';
}
