import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const colorMap = {
  emerald: "bg-emerald-500 hover:bg-emerald-600",
  red: "bg-red-500 hover:bg-red-600",
  slate: "bg-slate-500 hover:bg-slate-600"
};

async function loadQuizzes() {
  const quizContainer = document.getElementById("quiz-container");
  if (!quizContainer) {
    console.error("Critical: Quiz container element not found in HTML!");
    return;
  }

  quizContainer.innerHTML = `<p class="text-center text-slate-500 dark:text-slate-400">퀴즈를 불러오는 중입니다...</p>`;

  try {
    const collectionPath = "quizzes/quiz1/quizzes";
    const quizSnapshot = await getDocs(collection(db, collectionPath));

    if (quizSnapshot.empty) {
      quizContainer.innerHTML = `<p class="text-center text-slate-500 dark:text-slate-400">표시할 퀴즈가 없습니다.</p>`;
      return;
    }

    quizContainer.innerHTML = "";

    quizSnapshot.forEach((doc) => {
      const quiz = doc.data();

      if (!quiz.title || !Array.isArray(quiz.options) || quiz.options.length < 2) {
        console.warn('Skipping invalid quiz data:', doc.id, quiz);
        return;
      }

      const quizCard = document.createElement("div");
      quizCard.className = "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm overflow-hidden";
      
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
      quizContainer.appendChild(quizCard);
    });

  } catch (error) {
    console.error("Firestore Error: Failed to load quizzes.", error);
    quizContainer.innerHTML = `<p class="text-center text-red-500">퀴즈를 불러오는 중 오류가 발생했습니다. 개발자 콘솔을 확인해주세요.</p>`;
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

document.addEventListener('DOMContentLoaded', () => {
    loadQuizzes();

    const quizContainer = document.getElementById('quiz-container');
    if (quizContainer) {
        quizContainer.addEventListener('click', (event) => {
            const voteButton = event.target.closest('.vote-option-btn');
            if (voteButton) {
                const card = voteButton.closest('.shadow-sm');
                if (!card) return;

                const allOptionButtons = card.querySelectorAll('.vote-option-btn');
                const previouslySelectedButton = card.querySelector('.vote-option-btn.ring-2');
                const participationContainer = card.querySelector('[data-votes]');
                let votes = JSON.parse(participationContainer.dataset.votes);
                const clickedOptionId = voteButton.dataset.optionId;

                // Case 1: 이미 선택된 버튼을 다시 클릭 -> 투표 취소
                if (voteButton === previouslySelectedButton) {
                    votes[clickedOptionId]--;
                    allOptionButtons.forEach(btn => btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400', 'ring-red-400', 'ring-slate-400'));
                
                // Case 2: 새 버튼을 선택 (혹은 다른 버튼으로 변경)
                } else {
                    // 이전에 투표한 내역이 있으면 먼저 해당 투표 수를 1 감소
                    if (previouslySelectedButton) {
                        const previousOptionId = previouslySelectedButton.dataset.optionId;
                        votes[previousOptionId]--;
                    }
                    // 새로 클릭한 버튼의 투표 수를 1 증가
                    votes[clickedOptionId]++;

                    // 스타일 업데이트
                    allOptionButtons.forEach(btn => {
                        btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400', 'ring-red-400', 'ring-slate-400');
                        if (btn !== voteButton) btn.classList.add('opacity-50');
                    });
                    let ringColorClass = voteButton.classList.contains('bg-emerald-500') ? 'ring-emerald-400' : (voteButton.classList.contains('bg-red-500') ? 'ring-red-400' : 'ring-slate-400');
                    voteButton.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', ringColorClass);
                }

                // 공통 로직: 데이터 속성 및 참여율 UI 업데이트
                participationContainer.dataset.votes = JSON.stringify(votes);

                const totalVotes = Object.values(votes).reduce((sum, v) => sum + v, 0);

                const options = Array.from(allOptionButtons).map(btn => ({
                    id: btn.dataset.optionId,
                    label: btn.textContent.trim(),
                    color: btn.classList.contains('bg-emerald-500') ? 'emerald' : (btn.classList.contains('bg-red-500') ? 'red' : 'slate')
                }));

                const barSegments = options.map(option => {
                    const percentage = totalVotes > 0 ? (votes[option.id] / totalVotes) * 100 : 0;
                    return `<div class="${colorMap[option.color] || 'bg-slate-500'} h-2.5" style="width: ${percentage.toFixed(1)}%"></div>`;
                }).join('');

                const percentageTexts = options.map(option => {
                    const percentage = totalVotes > 0 ? ((votes[option.id] / totalVotes) * 100).toFixed(1) : "0.0";
                    return `<span class="font-bold text-${option.color}-500">${option.label}: ${percentage}%</span>`;
                }).join('');

                card.querySelector('.multi-bar').innerHTML = barSegments;
                card.querySelector('.percentage-row').innerHTML = percentageTexts;
                
                return; // 중요: 아코디언 토글 방지
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

            const buttons = categoryTabs.querySelectorAll('.tab-button');
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
    onAuthStateChanged(auth, (user) => {
        if (user) {
            console.log('User is logged in:', user.email);
            if(loginModalButton) loginModalButton.classList.add('hidden');
            if(logoutButton) logoutButton.classList.remove('hidden');
            closeModal();
        } else {
            console.log('User is logged out.');
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
