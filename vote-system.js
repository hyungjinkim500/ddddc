import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, runTransaction, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';
import { notifyVote } from './notifications.js';

const _voteTimers = {};
const _pendingVote = {};
const _pendingResolvers = {};

export async function handleVote(quizId, optionId) {
    // 300ms debounce: 연타 시 마지막 클릭만 서버 전송, 이전 Promise는 null로 resolve
    _pendingVote[quizId] = optionId;

    // 이전 타이머 취소 + 이전 Promise null 처리
    if (_voteTimers[quizId]) {
        clearTimeout(_voteTimers[quizId]);
        if (_pendingResolvers[quizId]) {
            _pendingResolvers[quizId](null);
            delete _pendingResolvers[quizId];
        }
    }

    return new Promise(resolve => {
        _pendingResolvers[quizId] = resolve;
        _voteTimers[quizId] = setTimeout(async () => {
            delete _voteTimers[quizId];
            delete _pendingResolvers[quizId];
            const latestOptionId = _pendingVote[quizId];
            delete _pendingVote[quizId];
            const result = await _doHandleVote(quizId, latestOptionId);
            resolve(result);
        }, 300);
    });
}

async function _doHandleVote(quizId, optionId) {
    const auth = getAuth();
    const user = auth.currentUser;

    // The caller in quiz-main.js is responsible for user authentication checks.

    try {
        const quizRef = doc(db, "questions", quizId);
        const userVoteRef = doc(db, "questions", quizId, "userVotes", user.uid);

        await runTransaction(db, async (transaction) => {
            const quizDoc = await transaction.get(quizRef);
            if (!quizDoc.exists()) {
                throw "Quiz document does not exist!";
            }

            const data = quizDoc.data();

            // 투표 기한 만료 체크
            if (data.expiresAt) {
                const expiresAt = data.expiresAt.toDate ? data.expiresAt.toDate() : new Date(data.expiresAt);
                if (new Date() > expiresAt) {
                    throw "Vote expired";
                }
            }

            const entryFee = data.entryFee || 0;
            const participantLimit = data.participantLimit || 0;
            const participants = data.participants || [];

            const userProfileRef = doc(db, "userProfiles", user.uid);
            const userProfileDoc = await transaction.get(userProfileRef);
            const userPoints = userProfileDoc.data()?.points || 0;

            if (participantLimit > 0 && participants.length >= participantLimit && !participants.includes(user.uid)) {
                throw "Participant limit reached";
            }

            const userVoteDoc = await transaction.get(userVoteRef);
            const voteData = data.vote ?? {};
            const updatedVotes = { ...voteData };

            let previousOptionId = null;
            if (userVoteDoc.exists()) {
                previousOptionId = userVoteDoc.data().selectedOption;
            }

            let updatedParticipants = [...participants];
            const clickedOptionId = optionId;

            if (previousOptionId === clickedOptionId) {
                // Deselecting the same option
                updatedVotes[clickedOptionId] = Math.max(0, (updatedVotes[clickedOptionId] || 0) - 1);
                transaction.delete(userVoteRef);

                if (entryFee > 0 && previousOptionId) {
                    transaction.update(userProfileRef, {
                        points: userPoints + entryFee
                    });
                }
                // Remove user from participants
                updatedParticipants = updatedParticipants.filter(uid => uid !== user.uid);

            } else {
                // Selecting a new option or switching vote
                if (previousOptionId) {
                    updatedVotes[previousOptionId] = Math.max(0, (updatedVotes[previousOptionId] || 0) - 1);
                }
                updatedVotes[clickedOptionId] = (updatedVotes[clickedOptionId] || 0) + 1;
                transaction.set(userVoteRef, { selectedOption: clickedOptionId });

                if (entryFee > 0 && !participants.includes(user.uid)) {
                    if (userPoints < entryFee) {
                        throw "Not enough points";
                    }
                    transaction.update(userProfileRef, {
                        points: userPoints - entryFee
                    });
                }

                // Add user to participants if not already there
                if (!updatedParticipants.includes(user.uid)) {
                    updatedParticipants.push(user.uid);
                }
            }

            transaction.update(quizRef, { 
                vote: updatedVotes,
                participants: updatedParticipants
            });
        });

        // 투표 알림 (백그라운드)
        notifyVote(quizId, user.uid, user.displayName || '익명').catch(() => {});

        return true;

    } catch (e) {
        console.error("Transaction failed: ", e);
        return false;
    }
}
