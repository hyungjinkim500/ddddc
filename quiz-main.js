import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, runTransaction, onSnapshot, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const colorMap = {
  emerald: "bg-emerald-500 hover:bg-emerald-600",
  red: "bg-red-500 hover:bg-red-600",
  slate: "bg-slate-500 hover:bg-slate-600"
};

let isInitialLoad = true;

function loadQuizzes() {
  const quizContainer = document.getElementById("quiz-container");
  if (!quizContainer) {
    console.error("Critical: Quiz container element not found in HTML!");
    return;
  }

  quizContainer.innerHTML = `<p class="text-center text-slate-500 dark:text-slate-400">퀴즈를 불러오는 중입니다...</p>`;

  const collectionPath = "quizzes/quiz1/quizzes";
  const q = collection(db, collectionPath);

  onSnapshot(q, 
    (snapshot) => {
      if (isInitialLoad && snapshot.empty) {
        quizContainer.innerHTML = `<p class="text-center text-slate-500 dark:text-slate-400">표시할 퀴즈가 없습니다.</p>`;
        isInitialLoad = false;
        return;
      }

      if (isInitialLoad) {
          quizContainer.innerHTML = ""; // Clear "Loading..." message only on initial load
          isInitialLoad = false;
      }

      snapshot.docChanges().forEach((change) => {
        const quiz = change.doc.data();
        const quizId = change.doc.id;

        if (change.type === "added") {
            if (!quiz.title || !Array.isArray(quiz.options) || quiz.options.length < 2) {
                console.warn('Skipping invalid quiz data:', quizId, quiz);
                return;
            }
            const quizCard = createQuizCard(quizId, quiz);
            quizContainer.appendChild(quizCard);
        }

        if (change.type === "modified") {
            const quizCard = quizContainer.querySelector(`[data-quiz-id="${quizId}"]`);
            if (quizCard) {
                updateParticipationUI(quizCard, quiz);
            }
        }

        if (change.type === "removed") {
            const quizCard = quizContainer.querySelector(`[data-quiz-id="${quizId}"]`);
            if (quizCard) {
                quizCard.remove();
            }
        }
      });

      // After initial load or changes, restore user votes if logged in
      const user = auth.currentUser;
      if(user) {
        restoreUserVotes(user);
      }
    },
    (error) => {
      console.error("Realtime subscription error:", error);
      quizContainer.innerHTML = `<p class="text-center text-red-500">퀴즈를 실시간으로 불러오는 중 오류가 발생했습니다. 개발자 콘솔을 확인해주세요.</p>`;
      isInitialLoad = false;
    }
  );
}

function createQuizCard(quizId, quiz) {
    const quizCard = document.createElement("div");
    quizCard.className = "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden";
    quizCard.dataset.quizId = quizId;

    quizCard.innerHTML = `
      <div class="quiz-header p-6 flex justify-between items-center cursor-pointer">
          <div class="flex items-center gap-4">
              <i class="arrow-icon fas fa-chevron-down text-slate-400 transition-transform duration-300"></i>
              <h3 class="font-bold text-lg text-slate-900 dark:text-white">${quiz.title}</h3>
          </div>
          <div class="flex gap-2">${
              quiz.options.map(option => `
                  <button 
                      class="vote-option-btn px-4 py-2 rounded-lg text-white font-semibold transition-all hover:opacity-90 ${colorMap[option.color] || 'bg-slate-500 hover:bg-slate-600'}"
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
    return quizCard;
}

function updateParticipationUI(quizCard, quiz) {
    const participationRateElement = quizCard.querySelector('.participation-rate');
    if (participationRateElement) {
        const newParticipationHTML = generateParticipationRateHTML(quiz);
        // Create a temporary element to hold the new HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newParticipationHTML;
        const newElement = tempDiv.firstElementChild;

        if (newElement) {
            participationRateElement.replaceWith(newElement);
        }       
    }
}

function generateParticipationRateHTML(quiz) {
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
    for (const card of quizCards) {
        const quizId = card.dataset.quizId;
        const userVoteRef = doc(db, `quizzes/quiz1/quizzes/${quizId}/userVotes/${user.uid}`);
        
        try {
            const userVoteSnap = await getDoc(userVoteRef);
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
        } catch (error) {
            console.error(`Failed to restore vote for quiz ${quizId}:`, error);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadQuizzes();

    const quizContainer = document.getElementById('quiz-container');
    if (quizContainer) {
        quizContainer.addEventListener('click', (event) => {
            const voteButton = event.target.closest('.vote-option-btn');
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
                        const quizRef = doc(db, "quizzes/quiz1/quizzes", card.dataset.quizId);
                        const userVoteRef = doc(db, "quizzes/quiz1/quizzes", card.dataset.quizId, "userVotes", user.uid);

                        await runTransaction(db, async (transaction) => {
                            const quizDoc = await transaction.get(quizRef);
                            if (!quizDoc.exists()) {
                                throw "Quiz document does not exist!";
                            }

                            const userVoteDoc = await transaction.get(userVoteRef);
                            const data = quizDoc.data();
                            const voteData = data.vote ?? {};
                            const updatedVotes = { ...voteData };

                            let previousOptionId = null;
                            if (userVoteDoc.exists()) {
                                previousOptionId = userVoteDoc.data().selectedOption;
                            }

                            if (previousOptionId === clickedOptionId) {
                                // Deselecting the same option
                                updatedVotes[clickedOptionId] = Math.max(0, (updatedVotes[clickedOptionId] || 0) - 1);
                                transaction.delete(userVoteRef);
                            } else {
                                // Selecting a new option or switching vote
                                if (previousOptionId) {
                                    updatedVotes[previousOptionId] = Math.max(0, (updatedVotes[previousOptionId] || 0) - 1);
                                }
                                updatedVotes[clickedOptionId] = (updatedVotes[clickedOptionId] || 0) + 1;
                                transaction.set(userVoteRef, { selectedOption: clickedOptionId });
                            }

                            transaction.update(quizRef, { vote: updatedVotes });
                        });

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

    // --- Auth State Listener & UI Update ---
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            console.log('User is logged in:', user.email);
            if(loginModalButton) loginModalButton.classList.add('hidden');
            if(logoutButton) logoutButton.classList.remove('hidden');
            closeModal();
            await restoreUserVotes(user);
        } else {
            console.log('User is logged out.');
            document.querySelectorAll('.vote-option-btn').forEach(btn => {
                btn.classList.remove(
                    'opacity-50', 
                    'ring-2', 
                    'ring-offset-2', 
                    'dark:ring-offset-slate-800', 
                    'ring-emerald-400', 
                    'ring-red-400', 
                    'ring-slate-400'
                );
            });
            if(loginModalButton) loginModalButton.classList.remove('hidden');
            if(logoutButton) logoutButton.classList.add('hidden');
        }
    });

    // --- Logout Logic ---
    if(logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
                // The onAuthStateChanged listener will handle the UI update.
            } catch (error) {
                console.error('Logout Error:', error);
                alert('로그아웃 중 오류가 발생했습니다.');
            }
        });
    }
});
