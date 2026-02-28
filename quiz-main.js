import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

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
            <div class="flex gap-2">
                <button class="vote-up-btn px-4 py-2 rounded-lg bg-emerald-500 text-white font-semibold transition-all hover:opacity-90">${quiz.options[0]}</button>
                <button class="vote-down-btn px-4 py-2 rounded-lg bg-red-500 text-white font-semibold transition-all hover:opacity-90">${quiz.options[1]}</button>
            </div>
        </div>
        <div class="quiz-body max-h-0 overflow-hidden transition-all duration-500 ease-in-out">
            <div class="px-6 pb-6 pt-0">
                <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">${quiz.description || ''}</p>
                ${generateParticipationRateHTML(quiz.vote)}
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

function generateParticipationRateHTML(voteData) {
    const upVotes = voteData?.up || 0;
    const downVotes = voteData?.down || 0;
    const totalVotes = upVotes + downVotes;
    const upPercentage = totalVotes > 0 ? ((upVotes / totalVotes) * 100) : 0;

    return `
        <div class="participation-rate mt-4">
            <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5" data-up-votes="${upVotes}" data-down-votes="${downVotes}">
                <div class="progress-bar bg-emerald-500 h-2.5 rounded-full transition-all duration-300" style="width: ${upPercentage.toFixed(1)}%"></div>
            </div>
            <div class="text-xs text-slate-500 dark:text-slate-400 mt-2 flex justify-between">
                <span class="up-percentage font-bold text-emerald-500">상승: ${upPercentage.toFixed(1)}%</span>
                <span class="down-percentage font-bold text-red-500">하락: ${(100 - upPercentage).toFixed(1)}%</span>
            </div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    loadQuizzes();

    const quizContainer = document.getElementById('quiz-container');
    if (quizContainer) {
        quizContainer.addEventListener('click', (event) => {
            const voteButton = event.target.closest('.vote-up-btn, .vote-down-btn');
            if (voteButton) {
                const card = voteButton.closest('.shadow-sm');
                if (!card) return;

                const upButton = card.querySelector('.vote-up-btn');
                const downButton = card.querySelector('.vote-down-btn');

                // 상태 확인: 현재 버튼, 이전에 선택된 버튼
                const wasUpVoted = upButton.classList.contains('ring-2');
                const wasDownVoted = downButton.classList.contains('ring-2');
                const isVotingUp = voteButton.classList.contains('vote-up-btn');

                // UI 스타일링 (기존 로직)
                upButton.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400');
                downButton.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-red-400');

                if (isVotingUp) {
                    upButton.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400');
                    downButton.classList.add('opacity-50');
                } else {
                    downButton.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-red-400');
                    upButton.classList.add('opacity-50');
                }

                // --- 신규: 참여율 UI 실시간 업데이트 ---
                const participationContainer = card.querySelector('[data-up-votes]');
                let upVotes = parseInt(participationContainer.dataset.upVotes);
                let downVotes = parseInt(participationContainer.dataset.downVotes);
                
                // 투표 상태에 따라 로컬 투표 수 조정
                if (isVotingUp) { // 상승 클릭
                    if (!wasUpVoted) { // 이전에 상승 투표하지 않았을 경우만
                         upVotes++;
                         if (wasDownVoted) downVotes--; // 하락->상승으로 변경 시
                    }
                } else { // 하락 클릭
                    if (!wasDownVoted) { // 이전에 하락 투표하지 않았을 경우만
                        downVotes++;
                        if (wasUpVoted) upVotes--; // 상승->하락으로 변경 시
                    }
                }

                // 데이터 속성 업데이트 (최신 투표 수 저장)
                participationContainer.dataset.upVotes = upVotes;
                participationContainer.dataset.downVotes = downVotes;

                // 퍼센트 재계산 및 UI 업데이트
                const totalVotes = upVotes + downVotes;
                const upPercentage = totalVotes > 0 ? ((upVotes / totalVotes) * 100) : 0;
                const downPercentage = 100 - upPercentage;

                card.querySelector('.progress-bar').style.width = `${upPercentage.toFixed(1)}%`;
                card.querySelector('.up-percentage').textContent = `상승: ${upPercentage.toFixed(1)}%`;
                card.querySelector('.down-percentage').textContent = `하락: ${downPercentage.toFixed(1)}%`;
                
                return;
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
