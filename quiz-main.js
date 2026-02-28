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

      // *** 수정된 부분: option -> options 로 유효성 검사 필드 이름 수정 ***
      if (!quiz.title || !Array.isArray(quiz.options) || quiz.options.length < 2) {
        console.warn('Skipping invalid quiz data:', doc.id, quiz);
        return;
      }

      const quizCard = document.createElement("div");
      quizCard.className = "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm";
      
      // *** 수정된 부분: option -> options 로 필드 이름 수정 ***
      quizCard.innerHTML = `
        <h3 class="font-bold text-lg mb-2 text-slate-900 dark:text-white">
          ${quiz.title}
        </h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
          ${quiz.description || ''}
        </p>
        <div class="flex gap-3">
          <button class="vote-up-btn px-4 py-2 rounded-lg bg-emerald-500 text-white font-semibold transition-all hover:opacity-90">${quiz.options[0]}</button>
          <button class="vote-down-btn px-4 py-2 rounded-lg bg-red-500 text-white font-semibold transition-all hover:opacity-90">${quiz.options[1]}</button>
        </div>
      `;
      quizContainer.appendChild(quizCard);
    });

  } catch (error) {
    console.error("Firestore Error: Failed to load quizzes.", error);
    quizContainer.innerHTML = `<p class="text-center text-red-500">퀴즈를 불러오는 중 오류가 발생했습니다. 개발자 콘솔을 확인해주세요.</p>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
    loadQuizzes();

    const quizContainer = document.getElementById('quiz-container');
    if (quizContainer) {
        quizContainer.addEventListener('click', (event) => {
            const button = event.target.closest('button');
            if (!button || (!button.classList.contains('vote-up-btn') && !button.classList.contains('vote-down-btn'))) {
                return;
            }

            const card = button.closest('.shadow-sm');
            if (!card) return;

            const upButton = card.querySelector('.vote-up-btn');
            const downButton = card.querySelector('.vote-down-btn');

            upButton.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400');
            downButton.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-red-400');

            if (button.classList.contains('vote-up-btn')) {
                console.log('상승 클릭');
                upButton.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400');
                downButton.classList.add('opacity-50');
            } else if (button.classList.contains('vote-down-btn')) {
                console.log('하락 클릭');
                downButton.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-red-400');
                upButton.classList.add('opacity-50');
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
