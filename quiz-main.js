import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, runTransaction, onSnapshot, getDoc, setDoc, deleteDoc, addDoc, serverTimestamp, query, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const params = new URLSearchParams(window.location.search);
const quizIdFromUrl = params.get("id");

console.log("Quiz ID from URL:", quizIdFromUrl);

const colorMap = {
  emerald: "bg-emerald-500 hover:bg-emerald-600",
  red: "bg-red-500 hover:bg-red-600",
  slate: "bg-slate-500 hover:bg-slate-600",
  yellow: "bg-yellow-400 hover:bg-yellow-500",
  sky: "bg-sky-400 hover:bg-sky-500"
};

function loadQuizzes() {
  const quizContainer = document.getElementById("quiz-container");
  if (!quizContainer) {
    console.error("Critical: Quiz container element not found in HTML!");
    return;
  }

  quizContainer.innerHTML = `<p class="text-center text-slate-500 dark:text-slate-400">퀴즈를 불러오는 중입니다...</p>`;

  const collectionPath = "questions";
  const q = collection(db, collectionPath);

  onSnapshot(q, 
    (snapshot) => {
      snapshot.docChanges().forEach((change, index) => {
        console.log("Firestore change:", change.type, change.doc.id);

        if (index === 0 && quizContainer.querySelector('p')?.textContent.includes('퀴즈를 불러오는 중입니다...')) {
            quizContainer.innerHTML = '';
        }

        const quiz = change.doc.data();
        const quizId = change.doc.id;
        const user = auth.currentUser;

        if (change.type === "added") {
            const existingCard = document.querySelector(`[data-quiz-id="${quizId}"]`);
            if (!existingCard) {
                const quizCard = createQuizCard(quizId, quiz);
                quizContainer.appendChild(quizCard);

                if (quizCard.querySelector('.like-button')) {
                  setupLikeListener(quizId, user ? user.uid : null);
                }
                if (quizCard.querySelector('.comment-toggle-button')) {
                  setupCommentListener(quizId);
                }
            }
        }

        if (change.type === "modified") {
            const existingCard = document.querySelector(`[data-quiz-id="${quizId}"]`);
            if (existingCard) {
                const newCard = createQuizCard(quizId, quiz);
                quizContainer.replaceChild(newCard, existingCard);

                if (newCard.querySelector('.like-button')) {
                  setupLikeListener(quizId, user ? user.uid : null);
                }
                if (newCard.querySelector('.comment-toggle-button')) {
                  setupCommentListener(quizId);
                }
            }
        }

        if (change.type === "removed") {
            const existingCard = document.querySelector(`[data-quiz-id="${quizId}"]`);
            if (existingCard) {
                quizContainer.removeChild(existingCard);
            }
        }
      });

      if (snapshot.empty) {
        quizContainer.innerHTML = `<p class="text-center text-slate-500 dark:text-slate-400">표시할 퀴즈가 없습니다.</p>`;
        return;
      }

      const user = auth.currentUser;
      if(user) {
        restoreUserVotes(user);
      }
    },
    (error) => {
      console.error("Realtime subscription error:", error);
      quizContainer.innerHTML = `<p class="text-center text-red-500">퀴즈를 실시간으로 불러오는 중 오류가 발생했습니다. 개발자 콘솔을 확인해주세요.</p>`;
    }
  );
}

async function handleVote(quizId, optionId) {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
        if (confirm("로그인이 필요합니다. 로그인하시겠습니까?")) {
            openModal();
        }
        return;
    }

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

        if (quizIdFromUrl) {
            await loadSingleQuiz(quizIdFromUrl);
        }

        if (auth.currentUser) {
            restoreUserVotes(auth.currentUser);
        }

    } catch (e) {
        console.error("Transaction failed: ", e);
        alert(`투표 처리 중 오류가 발생했습니다: ${e}`);
    }
}

async function loadSingleQuiz(quizId) {
    console.log("Loading single quiz:", quizId);

    const container = document.getElementById("single-quiz-container");

    if (!container) {
        console.error("Single quiz container not found");
        return;
    }

    const quizRef = doc(db, "questions", quizId);
    const quizSnap = await getDoc(quizRef);

    console.log("Quiz snapshot:", quizSnap);

    if (!quizSnap.exists()) {
        container.innerHTML = "<p class='text-center text-red-500'>퀴즈를 찾을 수 없습니다.</p>";
        return;
    }

    const quiz = quizSnap.data();

    console.log("Quiz data:", quiz);

    const titleElement = document.getElementById("detail-title");

    if (titleElement && quiz.title) {
        titleElement.textContent = quiz.title;
    }

    const optionsContainer = document.getElementById("detail-options");

    if (optionsContainer && Array.isArray(quiz.options)) {
        optionsContainer.innerHTML = "";
        quiz.options.forEach((option) => {
            const button = document.createElement("button");
            button.className =
                "vote-option-btn w-full text-left px-4 py-3 rounded-lg border border-slate-300 hover:bg-slate-50 transition";
            button.dataset.optionId = option.id;
            button.dataset.quizId = quizId;
            button.textContent = option.label;
            button.addEventListener("click", async () => {
                const quizId = button.dataset.quizId;
                const optionId = button.dataset.optionId;

                const allButtons = optionsContainer.querySelectorAll(".vote-option-btn");
                allButtons.forEach(btn => {
                    btn.classList.remove("ring-2","ring-emerald-500","ring-offset-2");
                });
                button.classList.add("ring-2","ring-emerald-500","ring-offset-2");

                await handleVote(quizId, optionId);
            });
            optionsContainer.appendChild(button);
        });

        const auth = getAuth();
        const user = auth.currentUser;

        if (user) {
            const voteRef = doc(db, "questions", quizId, "userVotes", user.uid);
            const voteSnap = await getDoc(voteRef);

            if (voteSnap.exists()) {
                const selectedOption = voteSnap.data().selectedOption;
                const selectedBtn = optionsContainer.querySelector(
                    `[data-option-id="${selectedOption}"]`
                );

                if (selectedBtn) {
                    selectedBtn.classList.add("ring-2","ring-emerald-500","ring-offset-2");
                }
            }
        }
    }

    const resultsContainer = document.getElementById("detail-results");

    if (resultsContainer && Array.isArray(quiz.options)) {

        resultsContainer.innerHTML = "";

        const votes = quiz.vote || {};

        const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);

        quiz.options.forEach(option => {

            const count = votes[option.id] || 0;

            const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);

            const wrapper = document.createElement("div");
            wrapper.className = "space-y-1";

            const label = document.createElement("div");
            label.className = "flex justify-between text-sm text-slate-600";

            label.innerHTML = `
                <span>${option.label}</span>
                <span>${percent}% (${count})</span>
            `;

            const bar = document.createElement("div");
            bar.className = "w-full bg-slate-200 rounded h-3";

            const fill = document.createElement("div");
            fill.className = "bg-emerald-500 h-3 rounded";
            fill.style.width = percent + "%";

            bar.appendChild(fill);

            wrapper.appendChild(label);
            wrapper.appendChild(bar);

            resultsContainer.appendChild(wrapper);

        });

    }

    const participationContainer = document.getElementById("detail-participation");

    if (participationContainer) {

        const participants = quiz.participants || [];

        const maxParticipants = quiz.participantLimit || 0;

        const current = participants.length;

        const percent = maxParticipants === 0 ? 0 : Math.round((current / maxParticipants) * 100);

        const bar = document.getElementById("participation-bar");
        const text = document.getElementById("participation-text");

        if (bar) {
            bar.style.width = percent + "%";
        }

        if (text) {
            text.textContent = `${current} / ${maxParticipants} 참여`;
        }

        if (maxParticipants === 0) {
            participationContainer.classList.add("hidden");
        } else {
            participationContainer.classList.remove("hidden");
        }

    }

    container.innerHTML = "";

    const quizCard = createQuizCard(quizId, quiz);

    container.appendChild(quizCard);
}

function createQuizCard(quizId, quiz) {
    console.log("createQuizCard RUNNING for:", quizId);

    // Defensive code for options
    if (!quiz.options || !Array.isArray(quiz.options)) {
        console.warn("INVALID OPTIONS STRUCTURE:", quiz);
        quiz.options = [];
    }

    const quizCard = document.createElement("div");
    quizCard.className = "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden w-full max-w-4xl mx-auto mb-4";
    quizCard.dataset.quizId = quizId;

    quizCard.innerHTML = `
      <div class="quiz-header p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer">
          <div class="flex items-center gap-4">
              <i class="arrow-icon fas fa-chevron-down text-slate-400 transition-transform duration-300"></i>
              <h3 class="font-bold text-lg sm:text-xl leading-snug text-slate-900 dark:text-white">${quiz.title}</h3>
          </div>
          <div class="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">${
              quiz.options.map(option => `
                  <button 
                      class="vote-option-btn w-full sm:w-auto px-4 py-2 rounded-lg text-white font-semibold transition-all hover:opacity-90 ${colorMap[option.color] || 'bg-slate-500 hover:bg-slate-600'}"
                      data-option-id="${option.id}"
                  >
                      ${option.label}
                  </button>
              `).join('')
          }</div>
      </div>
      <div class="quiz-body max-h-0 overflow-hidden transition-all duration-500 ease-in-out">
          <div class="px-6 pb-6 pt-0">
              <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">${quiz.description || ''}</p>
              ${generateParticipationRateHTML(quiz)}
          </div>
      </div>
    `;

    // Restore the template logic but keep it safe
    const template = document.getElementById('quiz-card-extra-template');
    if (template) {
        const clone = template.content.cloneNode(true);
        quizCard.appendChild(clone);
    } else {
        console.error('CRITICAL: quiz-card-extra-template not found!');
        const debugDiv = document.createElement("div");
        debugDiv.style.background = "red";
        debugDiv.style.color = "white";
        debugDiv.style.padding = "10px";
        debugDiv.innerText = "DEBUG: TEMPLATE NOT FOUND!";
        quizCard.appendChild(debugDiv);
    }

    return quizCard;
}

function generateParticipationRateHTML(quiz) {
    // Defensive code for options
    if (!quiz.options || !Array.isArray(quiz.options)) {
        quiz.options = [];
    }

    const voteData = quiz.vote ?? {};
    const initialVotes = {};
    quiz.options.forEach(option => {
        initialVotes[option.id] = voteData[option.id] || 0;
    });

    const totalVotes = Object.values(initialVotes).reduce((sum, val) => sum + val, 0);

    const barSegments = quiz.options.map(option => {
        const percentage = totalVotes > 0 ? (initialVotes[option.id] / totalVotes) * 100 : 0;
        return `<div class="${colorMap[option.color] || 'bg-slate-500'} h-2.5" style="width: ${percentage.toFixed(1)}%"></div>`;
    }).join('');

    const percentageTexts = quiz.options.map(option => {
        const percentage = totalVotes > 0 ? ((initialVotes[option.id] / totalVotes) * 100).toFixed(1) : "0.0";
        return `<span class="font-bold text-${option.color}-500">${option.label}: ${percentage}%</span>`;
    }).join('');

    return `
        <div class="participation-rate mt-4" data-votes='${JSON.stringify(initialVotes)}'>
            <div class="multi-bar w-full flex rounded-full overflow-hidden bg-slate-200 dark:bg-slate-700 h-2.5">
                ${barSegments}
            </div>
            <div class="percentage-row text-xs text-slate-500 dark:text-slate-400 mt-2 flex justify-between">
                ${percentageTexts}
            </div>
        </div>
    `;
}

async function restoreUserVotes(user) {
    const quizCards = document.querySelectorAll('[data-quiz-id]');
    const votePromises = [];

    quizCards.forEach(card => {
        const quizId = card.dataset.quizId;
        const userVoteRef = doc(db, `questions/${quizId}/userVotes/${user.uid}`);

        votePromises.push(
            getDoc(userVoteRef).then(userVoteSnap => {
                const buttons = card.querySelectorAll('.vote-option-btn');

                // Reset all buttons first
                buttons.forEach(btn => {
                    btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400', 'ring-red-400', 'ring-slate-400');
                });

                if (userVoteSnap.exists()) {
                    const selectedOptionId = userVoteSnap.data().selectedOption;
                    buttons.forEach(btn => {
                        if (btn.dataset.optionId === selectedOptionId) {
                            let ringColorClass = btn.classList.contains('bg-emerald-500') ? 'ring-emerald-400' : (btn.classList.contains('bg-red-500') ? 'ring-red-400' : 'ring-slate-400');
                            btn.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', ringColorClass);
                        } else {
                            btn.classList.add('opacity-50');
                        }
                    });
                }
            }).catch(error => {
                console.error(`Failed to restore vote for quiz ${quizId}:`, error);
            })
        );
    });

    await Promise.all(votePromises);
}

async function loadComments(quizId) {
    const commentList = document.getElementById("comment-list");
    if (!commentList) return;

    commentList.innerHTML = "";

    const commentsRef = collection(db, "questions", quizId, "comments");
    const q = query(commentsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const auth = getAuth();

    snapshot.forEach(docSnap => {
        const data = docSnap.data();
        const commentEl = document.createElement("div");
        commentEl.className = "border rounded-lg p-3 text-sm";

        let deleteButtonHTML = "";
        if (auth.currentUser && data.uid === auth.currentUser.uid) {
            deleteButtonHTML = `
                <button class="comment-delete text-xs text-red-500" data-comment-id="${docSnap.id}">
                    삭제
                </button>
            `;
        }

        commentEl.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <div class="text-slate-800">${data.text}</div>
                    <div class="text-xs text-slate-400 mt-1">${data.nickname || "익명"}</div>
                </div>
                ${deleteButtonHTML}
            </div>
        `;
        commentList.appendChild(commentEl);
    });

    commentList.querySelectorAll(".comment-delete").forEach(btn => {
        btn.addEventListener("click", async () => {
            const commentId = btn.dataset.commentId;
            const commentRef = doc(db, "questions", quizId, "comments", commentId);
            await deleteDoc(commentRef);
            await loadComments(quizId);
        });
    });
}

// --- Like and Comment Functions ---

function setupLikeListener(quizId, currentUserId) {
    const quizCard = document.querySelector(`[data-quiz-id="${quizId}"]`);
    if (!quizCard) return;

    const likeButton = quizCard.querySelector('.like-button');
    if (!likeButton) return;
    const likeCountSpan = quizCard.querySelector('.like-count');
    const likeIcon = likeButton.querySelector('i');

    onSnapshot(collection(db, `questions/${quizId}/likes`), (snapshot) => {
        if(likeCountSpan) likeCountSpan.textContent = snapshot.size;

        let userHasLiked = false;
        if (currentUserId) {
            snapshot.forEach(doc => {
                if (doc.id === currentUserId) {
                    userHasLiked = true;
                }
            });
        }

        if (likeIcon) {
            if (userHasLiked) {
                likeIcon.classList.remove('far', 'fa-heart');
                likeIcon.classList.add('fas', 'fa-heart', 'text-red-500');
            } else {
                likeIcon.classList.remove('fas', 'fa-heart', 'text-red-500');
                likeIcon.classList.add('far', 'fa-heart');
            }
        }
    });
}

function setupCommentListener(quizId) {
    const quizCard = document.querySelector(`[data-quiz-id="${quizId}"]`);
    if (!quizCard) return;

    const commentsList = quizCard.querySelector('.comments-list');
    const commentCountSpan = quizCard.querySelector('.comment-count');
    if (!commentsList || !commentCountSpan) return;

    const commentsQuery = query(collection(db, `questions/${quizId}/comments`), orderBy('createdAt', 'desc'), limit(20));
    onSnapshot(commentsQuery, (snapshot) => {
        commentCountSpan.textContent = snapshot.size;
        commentsList.innerHTML = ''; // Clear old comments
        if (snapshot.empty) {
            commentsList.innerHTML = `<p class="text-xs text-slate-400 dark:text-slate-500 text-center">아직 댓글이 없습니다.</p>`;
        } else {
            snapshot.forEach(doc => {
                const comment = doc.data();
                const commentElement = createCommentElement(doc.id, comment);
                commentsList.appendChild(commentElement);
            });
        }
    });
}

function createCommentElement(commentId, comment) {
    const div = document.createElement('div');
    div.className = 'flex items-start gap-3 text-sm';
    const createdAt = comment.createdAt?.toDate().toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short'}) || '';

    div.innerHTML = `
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-500 dark:text-slate-400">
            ${(comment.authorDisplayName || 'U').charAt(0)}
        </div>
        <div class="flex-1">
            <p class="font-semibold text-slate-800 dark:text-slate-200">${comment.authorDisplayName || 'Anonymous'} <span class="text-xs font-normal text-slate-400 dark:text-slate-500 ml-1">${createdAt}</span></p>
            <p class="text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">${comment.content}</p>
        </div>
    `;
    return div;
}

function createCommentForm(quizId) {
    const form = document.createElement('form');
    form.className = 'comment-form flex items-start gap-2';
    form.innerHTML = `
        <textarea name="comment" placeholder="댓글을 입력하세요..." class="flex-1 px-3 py-2 text-sm rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal transition" rows="1"></textarea>
        <button type="submit" class="px-3 py-2 rounded-md bg-teal text-pm-navy font-semibold text-sm transition-opacity hover:opacity-90">등록</button>
    `;
    form.addEventListener('submit', (e) => handleCommentSubmit(e, quizId));
    return form;
}

async function handleCommentSubmit(e, quizId) {
    e.preventDefault();
    const form = e.target;
    const textarea = form.querySelector('textarea');
    const content = textarea.value.trim();

    if (!content) return;

    const user = auth.currentUser;
    if (!user) {
        alert('댓글을 작성하려면 로그인이 필요합니다.');
        return;
    }

    try {
        await addDoc(collection(db, `questions/${quizId}/comments`), {
            content: content,
            authorUid: user.uid,
            authorDisplayName: user.displayName || '익명',
            createdAt: serverTimestamp()
        });
        textarea.value = '';
        textarea.style.height = 'auto';
    } catch (error) {
        console.error("Error adding comment: ", error);
        alert('댓글 등록에 실패했습니다.');
    }
}

async function handleLike(quizId) {
    const user = auth.currentUser;
    if (!user) {
        alert('좋아요를 누르려면 로그인이 필요합니다.');
        return;
    }

    const likeRef = doc(db, `questions/${quizId}/likes`, user.uid);

    try {
        const docSnap = await getDoc(likeRef);
        if (docSnap.exists()) {
            await deleteDoc(likeRef);
        } else {
            await setDoc(likeRef, {
                createdAt: serverTimestamp()
            });
        }
    } catch (error) {
        console.error("Error toggling like: ", error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (quizIdFromUrl) {
        const listContainer = document.getElementById("quiz-container");
        const detailContainer = document.getElementById("quiz-detail-container");

        if (listContainer) {
            listContainer.style.display = "none";
        }

        if (detailContainer) {
            detailContainer.classList.remove("hidden");
        }

        loadSingleQuiz(quizIdFromUrl);
        loadComments(quizIdFromUrl);

        const commentInput = document.getElementById("comment-input");
        const commentSubmit = document.getElementById("comment-submit");

        if (commentSubmit) {
            commentSubmit.addEventListener("click", async () => {
                const auth = getAuth();
                const user = auth.currentUser;

                if (!user) {
                    alert("로그인이 필요합니다.");
                    return;
                }

                const text = commentInput.value.trim();
                if (!text) return;

                const commentsRef = collection(db, "questions", quizIdFromUrl, "comments");

                await addDoc(commentsRef, {
                    text: text,
                    uid: user.uid,
                    nickname: user.displayName || "익명",
                    createdAt: serverTimestamp()
                });

                commentInput.value = "";

                await loadComments(quizIdFromUrl);
            });
        }
    } else {
        loadQuizzes();
    }

    const quizContainer = document.getElementById('quiz-container');
    if (quizContainer) {
        quizContainer.addEventListener('click', (event) => {
            const voteButton = event.target.closest('.vote-option-btn');
            const likeButton = event.target.closest('.like-button');
            const commentToggleButton = event.target.closest('.comment-toggle-button');

            if (likeButton) {
                const quizId = likeButton.closest('[data-quiz-id]').dataset.quizId;
                handleLike(quizId);
                return;
            }

            if (commentToggleButton) {
                const commentsSection = commentToggleButton.closest('.shadow-sm').querySelector('.comments-section');
                if (commentsSection) {
                    commentsSection.style.display = commentsSection.style.display === 'none' || commentsSection.style.display === '' ? 'block' : 'none';
                }
                return;
            }

            if (voteButton) {
                const card = voteButton.closest('.shadow-sm');
                if (!card) return;

                const auth = getAuth();
                const user = auth.currentUser;

                if (!user) {
                    if (confirm("로그인이 필요합니다. 로그인하시겠습니까?")) {
                        openModal();
                    }
                    return; // Stop any further action
                }

                const allOptionButtons = card.querySelectorAll('.vote-option-btn');
                const previouslySelectedButton = card.querySelector('.vote-option-btn.ring-2');
                const clickedOptionId = voteButton.dataset.optionId;

                // Optimistic UI update for button styles
                if (voteButton === previouslySelectedButton) {
                    allOptionButtons.forEach(btn => btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400', 'ring-red-400', 'ring-slate-400'));
                } else {
                    allOptionButtons.forEach(btn => {
                        btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400', 'ring-red-400', 'ring-slate-400');
                        if (btn !== voteButton) btn.classList.add('opacity-50');
                    });
                    let ringColorClass = voteButton.classList.contains('bg-emerald-500') ? 'ring-emerald-400' : (voteButton.classList.contains('bg-red-500') ? 'ring-red-400' : 'ring-slate-400');
                    voteButton.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', ringColorClass);
                }
                
                // Update Firestore using a transaction
                (async () => {
                    try {
                        const quizRef = doc(db, "questions", card.dataset.quizId);
                        const userVoteRef = doc(db, "questions", card.dataset.quizId, "userVotes", user.uid);

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

                        if (auth.currentUser) {
                            restoreUserVotes(auth.currentUser);
                        }

                    } catch (e) {
                        console.error("Transaction failed: ", e);
                        // TODO: Revert optimistic UI changes if the transaction fails
                    }
                })();
                
                return; // Prevent accordion toggle
            }

            const header = event.target.closest('.quiz-header');
            if (header) {
                const card = header.closest('.shadow-sm');
                const body = card.querySelector('.quiz-body');
                const icon = header.querySelector('.arrow-icon');

                if (body.style.maxHeight) {
                    body.style.maxHeight = null;
                    icon.classList.remove('rotate-180');
                } else {
                    body.style.maxHeight = body.scrollHeight + 'px';
                    icon.classList.add('rotate-180');
                }
            }
        });
    }

    // --- Theme Toggle --- //
    const themeToggle = document.getElementById('theme-toggle');
    if(themeToggle) {
        const html = document.documentElement;
        const icon = themeToggle.querySelector('i');
        const savedTheme = localStorage.getItem('theme') || 'light';
        html.classList.add(savedTheme);
        if (savedTheme === 'dark') {
            icon.classList.remove('fa-moon');
            icon.classList.add('fa-sun');
        } else {
            icon.classList.remove('fa-sun');
            icon.classList.add('fa-moon');
        }
        themeToggle.addEventListener('click', () => {
            if (html.classList.contains('dark')) {
                html.classList.remove('dark'); html.classList.add('light'); localStorage.setItem('theme', 'light');
                icon.classList.remove('fa-sun'); icon.classList.add('fa-moon');
            } else {
                html.classList.remove('light'); html.classList.add('dark'); localStorage.setItem('theme', 'dark');
                icon.classList.remove('fa-moon'); icon.classList.add('fa-sun');
            }
        });
    }

    // --- Tab & Accordion Functionality --- //
    const categoryTabs = document.getElementById('category-tabs');
    if (categoryTabs) {
        categoryTabs.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-button')) return;

            const buttons = categoryTabs.querySelectorAll('tab-button');
            buttons.forEach(btn => {
                btn.classList.remove('active', 'bg-emerald-500', 'text-white');
                btn.classList.add('text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-100', 'dark:hover:bg-slate-700');
            });
            
            e.target.classList.add('active', 'bg-emerald-500', 'text-white');
            e.target.classList.remove('text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-100', 'dark:hover:bg-slate-700');
        });
    }

    // --- Modal elements & Auth buttons ---
    const loginModal = document.getElementById('login-modal');
    const loginModalButton = document.getElementById('login-modal-button');
    const loginModalCloseButton = document.getElementById('login-modal-close-button');
    const logoutButton = document.getElementById('logout-button');
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    const showRegisterLink = document.getElementById('show-register-view-link');
    const showLoginLink = document.getElementById('show-login-view-link');

    // --- Modal Control ---
    function openModal() {
        if(loginModal) loginModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if(loginModal) loginModal.classList.remove('show');
        document.body.style.overflow = '';
    }

    if(loginModalButton) loginModalButton.addEventListener('click', openModal);
    if(loginModalCloseButton) loginModalCloseButton.addEventListener('click', closeModal);
    if(loginModal) loginModal.addEventListener('click', (e) => { 
        if (e.target === loginModal) closeModal();
    });

    // --- Tab Switching ---
    if(showRegisterLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            if(loginView) loginView.style.display = 'none';
            if(registerView) registerView.style.display = 'block';
        });
    }
    if(showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            if(registerView) registerView.style.display = 'none';
            if(loginView) loginView.style.display = 'block';
        });
    }

    function updateCommentFormVisibility(quizId, user) {
        const quizCard = document.querySelector(`[data-quiz-id="${quizId}"]`);
        if (!quizCard) return;
        const container = quizCard.querySelector('.comment-form-container');
        if (!container) return;
        container.innerHTML = '';
        if (user) {
            container.appendChild(createCommentForm(quizId));
        }
    }

    // --- Auth State Listener & UI Update ---
    onAuthStateChanged(auth, (user) => {
        const loginButton = document.getElementById('login-modal-button');
        const logoutButton = document.getElementById('logout-button');
        const userProfileInfo = document.getElementById('user-profile-info');
        const userNickname = document.getElementById('user-nickname');
        const userPoints = document.getElementById('user-points');

        if (user) {
            loginButton.classList.add('hidden');
            logoutButton.classList.remove('hidden');
            userProfileInfo.classList.remove('hidden');
            userProfileInfo.classList.add('flex');

            const userRef = doc(db, "userProfiles", user.uid);
            onSnapshot(userRef, (doc) => {
                if (doc.exists()) {
                    const userData = doc.data();
                    userNickname.textContent = userData.displayName || "사용자";
                    userPoints.textContent = `${userData.points || 0} P`;
                } else {
                    userNickname.textContent = user.displayName || "사용자";
                    userPoints.textContent = "0 P";
                }
            });
            restoreUserVotes(user);
            
            // Update all cards for new auth state
            document.querySelectorAll('[data-quiz-id]').forEach(card => {
                const quizId = card.dataset.quizId;
                updateCommentFormVisibility(quizId, user);
                // Re-initialize like listeners with the user's UID
                setupLikeListener(quizId, user.uid);
            });

        } else {
            loginButton.classList.remove('hidden');
            logoutButton.classList.add('hidden');
            userProfileInfo.classList.add('hidden');
            userProfileInfo.classList.remove('flex');

            document.querySelectorAll('.vote-option-btn').forEach(btn => {
                btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400', 'ring-red-400', 'ring-slate-400');
            });

            document.querySelectorAll('.comment-form-container').forEach(container => {
                container.innerHTML = '';
            });

            // Re-initialize like listeners without a user UID
            document.querySelectorAll('[data-quiz-id]').forEach(card => {
                const quizId = card.dataset.quizId;
                setupLikeListener(quizId, null);
            });
        }
    });

    // --- Logout Logic ---
    if(logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
            } catch (error) {
                console.error('Logout Error:', error);
                alert('로그아웃 중 오류가 발생했습니다.');
            }
        });
    }
});
