import { db, auth } from '../firebase-config.js';
import { doc, getDoc, setDoc, deleteDoc, updateDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// 카드 좋아요 아이콘 상태 업데이트
export async function restoreLikeState(quizId, userId) {
    const card = document.querySelector(`[data-quiz-id="${quizId}"]`);
    if (!card) return;

    const likeButton = card.querySelector('.like-button');
    if (!likeButton) return;

    const likeIcon = likeButton.querySelector('i');
    if (!likeIcon) return;

    if (!userId) {
        likeIcon.classList.remove('fas', 'text-red-500');
        likeIcon.classList.add('far');
        return;
    }

    try {
        const likeRef = doc(db, `questions/${quizId}/likes`, userId);
        const snap = await getDoc(likeRef);
        if (snap.exists()) {
            likeIcon.classList.remove('far');
            likeIcon.classList.add('fas', 'text-red-500');
        } else {
            likeIcon.classList.remove('fas', 'text-red-500');
            likeIcon.classList.add('far');
        }
    } catch (e) {
        console.error('restoreLikeState error:', e);
    }
}

// 모든 카드 좋아요 상태 일괄 복원
export async function restoreAllLikeStates(userId) {
    const cards = document.querySelectorAll('[data-quiz-id]');
    await Promise.all(
        Array.from(cards).map(card => restoreLikeState(card.dataset.quizId, userId))
    );
}

// 카드 좋아요 토글 (카드용 - i 태그 기반)
export async function handleCardLike(quizId, targetCard) {
    if (handleCardLike._processing?.[quizId]) return;
    if (!handleCardLike._processing) handleCardLike._processing = {};
    handleCardLike._processing[quizId] = true;

    try {
        const auth = getAuth();
        const user = auth.currentUser;
        if (!user) {
            alert('좋아요를 누르려면 로그인이 필요합니다.');
            return;
        }

        const card = targetCard || document.querySelector(`[data-quiz-id="${quizId}"]`);
        if (!card) return;

        const quizRef = doc(db, 'questions', quizId);
        const likeRef = doc(db, `questions/${quizId}/likes`, user.uid);

        const snap = await getDoc(likeRef);
        const isLiked = snap.exists();

        // 같은 quizId 가진 모든 카드 UI 동기화
        const allCards = document.querySelectorAll(`[data-quiz-id="${quizId}"]`);
        allCards.forEach(c => {
            const btn = c.querySelector('.like-button');
            const icon = btn?.querySelector('i');
            const countEl = c.querySelector('.like-count');
            if (icon) {
                if (isLiked) {
                    icon.classList.remove('fas', 'text-red-500');
                    icon.classList.add('far');
                } else {
                    icon.classList.remove('far');
                    icon.classList.add('fas', 'text-red-500');
                }
            }
            if (countEl) {
                const current = parseInt(countEl.textContent) || 0;
                countEl.textContent = isLiked ? Math.max(0, current - 1) : current + 1;
            }
        });

        if (isLiked) {
            await deleteDoc(likeRef);
            await updateDoc(quizRef, { likesCount: increment(-1) });
        } else {
            await setDoc(likeRef, { createdAt: serverTimestamp() });
            await updateDoc(quizRef, { likesCount: increment(1) });
        }

    } catch (e) {
        console.error('handleCardLike error:', e);
    } finally {
        handleCardLike._processing[quizId] = false;
    }
}

// 상세페이지 좋아요 토글 (SVG 아이콘 기반)
export async function handleDetailLike(quizId) {
    const auth = getAuth();
    const user = auth.currentUser;
    if (!user) {
        alert('좋아요를 누르려면 로그인이 필요합니다.');
        return;
    }

    const outline = document.getElementById('like-icon-outline');
    const filled = document.getElementById('like-icon-filled');

    const quizRef = doc(db, 'questions', quizId);
    const likeRef = doc(db, `questions/${quizId}/likes`, user.uid);

    try {
        const snap = await getDoc(likeRef);
        if (snap.exists()) {
            if (outline && filled) {
                outline.classList.remove('hidden');
                filled.classList.add('hidden');
            }
            await deleteDoc(likeRef);
            await updateDoc(quizRef, { likesCount: increment(-1) });
        } else {
            if (outline && filled) {
                outline.classList.add('hidden');
                filled.classList.remove('hidden');
            }
            await setDoc(likeRef, { createdAt: serverTimestamp() });
            await updateDoc(quizRef, { likesCount: increment(1) });
        }
    } catch (e) {
        console.error('handleDetailLike error:', e);
    }
}

// 상세페이지 좋아요 아이콘 상태 복원
export async function restoreDetailLikeState(quizId, userId) {
    if (!userId) return;
    const likeRef = doc(db, `questions/${quizId}/likes`, userId);
    try {
        const snap = await getDoc(likeRef);
        const outline = document.getElementById('like-icon-outline');
        const filled = document.getElementById('like-icon-filled');
        if (outline && filled) {
            if (snap.exists()) {
                outline.classList.add('hidden');
                filled.classList.remove('hidden');
            } else {
                outline.classList.remove('hidden');
                filled.classList.add('hidden');
            }
        }
    } catch (e) {
        console.error('restoreDetailLikeState error:', e);
    }
}
