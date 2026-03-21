import { auth, db } from './firebase-config.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, addDoc, deleteDoc, getDocs, query, orderBy, updateDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { updatePopularityScore } from './quiz-main.js';

export async function loadComments(postId, postTitle) {
    const commentList = document.getElementById('comment-list');
    if (!commentList) return;
    commentList.innerHTML = '';

    const commentsRef = collection(db, 'questions', postId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    const auth = getAuth();

    // 전체 댓글+답글 수 계산
    let totalCount = 0;
    const replyCountMap = {};
    for (const docSnap of snapshot.docs) {
        totalCount++;
        const repliesRef = collection(db, 'questions', postId, 'comments', docSnap.id, 'replies');
        const repliesSnapshot = await getDocs(query(repliesRef, orderBy('createdAt', 'asc')));
        replyCountMap[docSnap.id] = { count: repliesSnapshot.size, docs: repliesSnapshot.docs };
        totalCount += repliesSnapshot.size;
    }

    const commentCountEl = document.getElementById('detail-comment-count');
    if (commentCountEl) commentCountEl.textContent = '댓글 ' + totalCount;

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
        commentEl.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <div class="text-slate-800 dark:text-slate-200 break-all">${data.text}</div>
                    <div class="text-xs text-slate-400 mt-1">${data.nickname || '익명'} · ${timeText}</div>
                    <button class="comment-reply text-xs text-sky-500 mt-1" data-comment-id="${docSnap.id}">
                        답글${replyCount > 0 ? ` <span class="reply-count-badge">(${replyCount})</span>` : ''}
                    </button>
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
            const replyData = replyDoc.data();
            const replyTime = formatTime(replyData.createdAt);
            let replyDeleteHTML = '';
            if (auth.currentUser && replyData.uid === auth.currentUser.uid) {
                replyDeleteHTML = `<button class="reply-delete text-xs text-red-500" data-reply-id="${replyDoc.id}" data-comment-id="${docSnap.id}">삭제</button>`;
            }
            let replyBgClass = '';
            if (replyData.votedOption === 'option_1') replyBgClass = 'bg-green-50 dark:bg-green-900/20';
            else if (replyData.votedOption === 'option_2') replyBgClass = 'bg-orange-50 dark:bg-orange-900/20';
            const replyEl = document.createElement('div');
            replyEl.className = `ml-6 mt-2 text-sm border-l-2 border-slate-200 pl-3 rounded-r-lg ${replyBgClass}`;
            replyEl.innerHTML = `
                <div class="flex justify-between items-start">
                    <div>
                        <div class="text-slate-800 dark:text-slate-200 break-all">${replyData.text}</div>
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
            const commentId = btn.dataset.commentId;
            // 답글 수 먼저 파악
            const repliesRef = collection(db, 'questions', postId, 'comments', commentId, 'replies');
            const repliesSnap = await getDocs(repliesRef);
            const replyCount = repliesSnap.size;

            const commentRef = doc(db, 'questions', postId, 'comments', commentId);
            await deleteDoc(commentRef);
            await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(-(1 + replyCount)) });
            await loadComments(postId, postTitle);
            await updatePopularityScore(postId);
        });
    });

    // 답글 삭제
    commentList.querySelectorAll('.reply-delete').forEach(btn => {
        btn.addEventListener('click', async () => {
            const replyRef = doc(db, 'questions', postId, 'comments', btn.dataset.commentId, 'replies', btn.dataset.replyId);
            await deleteDoc(replyRef);
            await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(-1) });
            await loadComments(postId, postTitle);
        });
    });

    // 답글 펼치기/접기 + 입력창
    commentList.querySelectorAll('.comment-reply').forEach(btn => {
        btn.addEventListener('click', () => {
            const commentId = btn.dataset.commentId;
            const commentEl = btn.closest('.border');
            const repliesContainer = commentEl.querySelector(`[data-replies-for="${commentId}"]`);
            if (!repliesContainer) return;

            const isHidden = repliesContainer.classList.contains('hidden');

            if (isHidden) {
                // 펼치기
                repliesContainer.classList.remove('hidden');
                // 입력창이 없으면 추가
                if (!repliesContainer.querySelector('.reply-input-box')) {
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
                        let votedOption = null;
                        try {
                            const { doc: fsDoc, getDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
                            const voteSnap = await getDoc(fsDoc(db, `questions/${postId}/userVotes/${user.uid}`));
                            if (voteSnap.exists()) votedOption = voteSnap.data().selectedOption;
                        } catch (e) {}
                        await addDoc(collection(db, 'questions', postId, 'comments', commentId, 'replies'), {
                            text, uid: user.uid, nickname: user.displayName || '익명', createdAt: serverTimestamp(),
                            ...(votedOption && { votedOption })
                        });
                        await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(1) });
                        await loadComments(postId, postTitle);
                    });
                }
            } else {
                // 접기
                repliesContainer.classList.add('hidden');
            }
        });
    });
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

    await addDoc(collection(db, 'questions', postId, 'comments'), commentData);
    await addDoc(collection(db, 'allComments'), {
        ...commentData,
        questionId: postId,
        questionTitle: postTitle || ''
    });

    await updateDoc(doc(db, 'questions', postId), { commentsCount: increment(1) });
    commentInput.value = '';
    await loadComments(postId, postTitle);
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
