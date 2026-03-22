import { auth, db } from './firebase-config.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, addDoc, deleteDoc, getDocs, query, orderBy, updateDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { updatePopularityScore } from './quiz-main.js';
import { notifyComment, notifyReply } from './notifications.js';

function createReplyEl(replyData, replyId, commentId, postId, postTitle, auth) {
    let replyDeleteHTML = '';
    if (auth.currentUser && replyData.uid === auth.currentUser.uid) {
        replyDeleteHTML = `<button class="reply-delete text-xs text-red-500" data-reply-id="${replyId}" data-comment-id="${commentId}">삭제</button>`;
    }
    let replyBgClass = '';
    if (replyData.votedOption === 'option_1') replyBgClass = 'bg-green-50 dark:bg-green-900/20';
    else if (replyData.votedOption === 'option_2') replyBgClass = 'bg-orange-50 dark:bg-orange-900/20';

    const replyEl = document.createElement('div');
    replyEl.className = `ml-6 mt-2 text-sm border-l-2 border-slate-200 pl-3 rounded-r-lg ${replyBgClass}`;
    replyEl.dataset.replyId = replyId;
    replyEl.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <div class="text-slate-800 dark:text-slate-200 break-all">${replyData.text}</div>
                <div class="text-xs text-slate-400 mt-1">${replyData.nickname || '익명'} · 방금 전</div>
            </div>
            ${replyDeleteHTML}
        </div>
    `;

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

export async function loadComments(postId, postTitle) {
    const commentList = document.getElementById('comment-list');
    if (!commentList) return;
    commentList.innerHTML = '';

    const commentsRef = collection(db, 'questions', postId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const auth = getAuth();

    // 답글 수만 병렬로 빠르게 조회 (내용은 클릭 시 로드)
    const replyCountMap = {};
    await Promise.all(snapshot.docs.map(async docSnap => {
        const repliesRef = collection(db, 'questions', postId, 'comments', docSnap.id, 'replies');
        const repliesSnapshot = await getDocs(query(repliesRef, orderBy('createdAt', 'asc')));
        replyCountMap[docSnap.id] = { count: repliesSnapshot.size, docs: repliesSnapshot.docs };
    }));

    const totalReplies = Object.values(replyCountMap).reduce((a, b) => a + b.count, 0);
    const totalCount = snapshot.size + totalReplies;

    const commentCountEl = document.getElementById('detail-comment-count');
    if (commentCountEl) commentCountEl.textContent = '(' + totalCount + ')';

    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const timeText = formatTime(data.createdAt);
        const replyCount = replyCountMap[docSnap.id]?.count || 0;
        const replyDocs = replyCountMap[docSnap.id]?.docs || [];

        let deleteButtonHTML = '';
        if (auth.currentUser && data.uid === auth.currentUser.uid) {
            deleteButtonHTML = `<button class="comment-delete text-xs text-red-500" data-comment-id="${docSnap.id}">삭제</button>`;
        }

        let bgClass = 'bg-white dark:bg-slate-800';
        if (data.votedOption === 'option_1') bgClass = 'bg-green-50 dark:bg-green-900/20 border-green-200';
        else if (data.votedOption === 'option_2') bgClass = 'bg-orange-50 dark:bg-orange-900/20 border-orange-200';

        const commentEl = document.createElement('div');
        commentEl.className = `border rounded-lg p-3 text-sm ${bgClass}`;
        commentEl.dataset.commentId = docSnap.id;
        commentEl.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <div class="text-slate-800 dark:text-slate-200 break-all">${data.text}</div>
                    <div class="text-xs text-slate-400 mt-1">${data.nickname || '익명'} · ${timeText}</div>
                    <button class="comment-reply text-xs text-sky-500 mt-1" data-comment-id="${docSnap.id}">답글${replyCount > 0 ? ` <span class="reply-count-badge">(${replyCount})</span>` : ''}</button>
                </div>
                ${deleteButtonHTML}
            </div>
        `;
        commentList.appendChild(commentEl);

        // 답글 컨테이너 (기본 숨김)
        const repliesContainer = document.createElement('div');
        repliesContainer.className = 'mt-2 hidden';
        repliesContainer.dataset.repliesFor = docSnap.id;
        commentEl.appendChild(repliesContainer);

        // 기존 답글 렌더링
        replyDocs.forEach(replyDoc => {
            repliesContainer.appendChild(createReplyEl(replyDoc.data(), replyDoc.id, docSnap.id, postId, postTitle, auth));
        });

        // 답글 입력창 (항상 repliesContainer 안에 미리 생성)
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
            // 답글 알림 (백그라운드, 원댓글 작성자에게)
            notifyReply(postId, data.uid, user.uid, user.displayName || '익명').catch(() => {});

            // DOM 직접 추가 (입력창 바로 위에 삽입)
            const newReplyEl = createReplyEl({ ...replyData, createdAt: null }, replyRef.id, docSnap.id, postId, postTitle, auth);
            repliesContainer.insertBefore(newReplyEl, replyBox);

            replyInput.value = '';
            charCount.textContent = '0 / 200';
            updateTotalCount(1);

            // 답글 수 뱃지 업데이트
            const replyBtn = commentEl.querySelector('.comment-reply');
            updateReplyBadge(replyBtn, 1);
            submitBtn.disabled = false;
        });

        // 댓글 삭제
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

        // 답글 펼치기/접기
        commentEl.querySelector('.comment-reply').addEventListener('click', () => {
            const isHidden = repliesContainer.classList.contains('hidden');
            repliesContainer.classList.toggle('hidden', !isHidden);
            if (!isHidden) return;
            replyInput.focus();
        });
    }
}

export async function submitComment(postId, postTitle) {
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

    const commentRef = await addDoc(collection(db, 'questions', postId, 'comments'), commentData);
    // 댓글 알림 (백그라운드)
    notifyComment(postId, user.uid, user.displayName || '익명').catch(() => {});
    await addDoc(collection(db, 'allComments'), {
        ...commentData,
        questionId: postId,
        questionTitle: postTitle || ''
    });
    await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(1) });

    commentInput.value = '';

    // DOM 직접 추가 (최신순이라 맨 위에)
    const commentList = document.getElementById('comment-list');
    const auth = getAuth();
    let bgClass = 'bg-white dark:bg-slate-800';
    if (votedOption === 'option_1') bgClass = 'bg-green-50 dark:bg-green-900/20 border-green-200';
    else if (votedOption === 'option_2') bgClass = 'bg-orange-50 dark:bg-orange-900/20 border-orange-200';

    const commentEl = document.createElement('div');
    commentEl.className = `border rounded-lg p-3 text-sm ${bgClass}`;
    commentEl.dataset.commentId = commentRef.id;
    commentEl.innerHTML = `
        <div class="flex justify-between items-start">
            <div>
                <div class="text-slate-800 dark:text-slate-200 break-all">${text}</div>
                <div class="text-xs text-slate-400 mt-1">${user.displayName || '익명'} · 방금 전</div>
                <button class="comment-reply text-xs text-sky-500 mt-1" data-comment-id="${commentRef.id}">답글</button>
            </div>
            <button class="comment-delete text-xs text-red-500" data-comment-id="${commentRef.id}">삭제</button>
        </div>
    `;

    const repliesContainer = document.createElement('div');
    repliesContainer.className = 'mt-2 hidden';
    repliesContainer.dataset.repliesFor = commentRef.id;
    commentEl.appendChild(repliesContainer);

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
        const sb = e.currentTarget;
        if (sb.disabled) return;
        sb.disabled = true;
        const u = getAuth().currentUser;
        if (!u) { alert('로그인이 필요합니다.'); sb.disabled = false; return; }
        const t = replyInput.value.trim();
        if (!t || t.length > 200) { sb.disabled = false; return; }
        let vo = null;
        try {
            const { doc: fsDoc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
            const vs = await getDoc(fsDoc(db, `questions/${postId}/userVotes/${u.uid}`));
            if (vs.exists()) vo = vs.data().selectedOption;
        } catch (e) {}
        const rd = { text: t, uid: u.uid, nickname: u.displayName || '익명', createdAt: serverTimestamp(), ...(vo && { votedOption: vo }) };
        const rRef = await addDoc(collection(db, 'questions', postId, 'comments', commentRef.id, 'replies'), rd);
        await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(1) });
        const newReplyEl = createReplyEl({ ...rd, createdAt: null }, rRef.id, commentRef.id, postId, postTitle, auth);
        repliesContainer.insertBefore(newReplyEl, replyBox);
        replyInput.value = '';
        charCount.textContent = '0 / 200';
        updateTotalCount(1);
        updateReplyBadge(commentEl.querySelector('.comment-reply'), 1);
        sb.disabled = false;
    });

    commentEl.querySelector('.comment-delete')?.addEventListener('click', async () => {
        await deleteDoc(doc(db, 'questions', postId, 'comments', commentRef.id));
        await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(-1) });
        updateTotalCount(-1);
        commentEl.remove();
        await updatePopularityScore(postId);
    });

    commentEl.querySelector('.comment-reply').addEventListener('click', () => {
        const isHidden = repliesContainer.classList.contains('hidden');
        repliesContainer.classList.toggle('hidden', !isHidden);
        if (!isHidden) return;
        replyInput.focus();
    });

    if (commentList) commentList.insertBefore(commentEl, commentList.firstChild);
    updateTotalCount(1);
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
