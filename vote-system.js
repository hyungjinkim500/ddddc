import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, runTransaction, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db } from './firebase-config.js';

export async function handleVote(quizId, optionId) {
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
                transaction.set(userVoteRef, { selectedOption: clickedOptionId }, { merge: true });

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

        return true;

    } catch (e) {
        console.error("Transaction failed: ", e);
        alert(`투표 처리 중 오류가 발생했습니다: ${e}`);
        return false;
    }
}
