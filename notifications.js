import { db } from './firebase-config.js';
import { doc, getDoc, addDoc, collection, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// 알림 저장 공통 함수
async function saveNotification(receiverUid, data) {
    if (!receiverUid) return;
    try {
        await addDoc(collection(db, 'notifications', receiverUid, 'items'), {
            ...data,
            read: false,
            createdAt: serverTimestamp()
        });
    } catch (e) {
        console.error('알림 저장 실패:', e);
    }
}

// 투표 알림
// 1번째, 10번째, 100/200/300... 번째에만 알림
export async function notifyVote(quizId, senderUid, senderNickname) {
    try {
        const quizRef = doc(db, 'questions', quizId);
        const quizSnap = await getDoc(quizRef);
        if (!quizSnap.exists()) return;
        const quizData = quizSnap.data();
        const receiverUid = quizData.creatorId;
        if (!receiverUid || receiverUid === senderUid) return; // 본인 게시글 제외

        const totalVotes = Object.values(quizData.vote || {}).reduce((a, b) => a + b, 0);
        const postTitle = quizData.title || '게시글';

        let shouldNotify = false;
        if (totalVotes === 1) shouldNotify = true;
        else if (totalVotes === 10) shouldNotify = true;
        else if (totalVotes >= 100 && totalVotes % 100 === 0) shouldNotify = true;

        if (!shouldNotify) return;

        let message = '';
        if (totalVotes === 1) message = `${senderNickname}님이 투표했습니다`;
        else message = `${senderNickname}님 외 ${totalVotes - 1}명이 투표했습니다`;

        await saveNotification(receiverUid, {
            type: 'vote',
            senderUid,
            senderNickname,
            postId: quizId,
            postTitle,
            message
        });
    } catch (e) {
        console.error('투표 알림 실패:', e);
    }
}

// 좋아요 알림
// 1번째, 10번째, 100/200/300... 번째에만 알림
export async function notifyLike(quizId, senderUid, senderNickname) {
    try {
        const quizRef = doc(db, 'questions', quizId);
        const quizSnap = await getDoc(quizRef);
        if (!quizSnap.exists()) return;
        const quizData = quizSnap.data();
        const receiverUid = quizData.creatorId;
        if (!receiverUid || receiverUid === senderUid) return;

        const likesCount = quizData.likesCount || 0;
        const postTitle = quizData.title || '게시글';

        let shouldNotify = false;
        if (likesCount === 1) shouldNotify = true;
        else if (likesCount === 10) shouldNotify = true;
        else if (likesCount >= 100 && likesCount % 100 === 0) shouldNotify = true;

        if (!shouldNotify) return;

        let message = '';
        if (likesCount === 1) message = `${senderNickname}님이 좋아요를 눌렀습니다`;
        else message = `${senderNickname}님 외 ${likesCount - 1}명이 좋아요를 눌렀습니다`;

        await saveNotification(receiverUid, {
            type: 'like',
            senderUid,
            senderNickname,
            postId: quizId,
            postTitle,
            message
        });
    } catch (e) {
        console.error('좋아요 알림 실패:', e);
    }
}

// 댓글 알림 (내 게시글에 댓글)
export async function notifyComment(quizId, senderUid, senderNickname) {
    try {
        const quizRef = doc(db, 'questions', quizId);
        const quizSnap = await getDoc(quizRef);
        if (!quizSnap.exists()) return;
        const quizData = quizSnap.data();
        const receiverUid = quizData.creatorId;
        if (!receiverUid || receiverUid === senderUid) return;

        const postTitle = quizData.title || '게시글';
        await saveNotification(receiverUid, {
            type: 'comment',
            senderUid,
            senderNickname,
            postId: quizId,
            postTitle,
            message: `${senderNickname}님이 댓글을 남겼습니다`
        });
    } catch (e) {
        console.error('댓글 알림 실패:', e);
    }
}

// 답글 알림 (내 댓글에 답글)
export async function notifyReply(quizId, commentUid, senderUid, senderNickname) {
    try {
        if (!commentUid || commentUid === senderUid) return;
        const quizRef = doc(db, 'questions', quizId);
        const quizSnap = await getDoc(quizRef);
        if (!quizSnap.exists()) return;
        const postTitle = quizSnap.data().title || '게시글';

        await saveNotification(commentUid, {
            type: 'reply',
            senderUid,
            senderNickname,
            postId: quizId,
            postTitle,
            message: `${senderNickname}님이 답글을 남겼습니다`
        });
    } catch (e) {
        console.error('답글 알림 실패:', e);
    }
}
