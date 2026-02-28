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
    // *** 중요: 실제 데이터가 있는 하위 컬렉션 경로로 수정 ***
    const collectionPath = "quizzes/quiz1/quizzes";
    const quizSnapshot = await getDocs(collection(db, collectionPath));

    if (quizSnapshot.empty) {
      quizContainer.innerHTML = `<p class="text-center text-slate-500 dark:text-slate-400">표시할 퀴즈가 없습니다.</p>`;
      return;
    }

    quizContainer.innerHTML = "";

    quizSnapshot.forEach((doc) => {
      const quiz = doc.data();
      const quizCard = document.createElement("div");
      quizCard.className = "bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-6 shadow-sm";
      
      quizCard.innerHTML = `
        <h3 class="font-bold text-lg mb-2 text-slate-900 dark:text-white">
          ${quiz.title}
        </h3>
        <p class="text-sm text-slate-500 dark:text-slate-400 mb-4">
          ${quiz.description}
        </p>
        <div class="flex gap-3">
          <button class="px-4 py-2 rounded-lg bg-emerald-500 text-white font-semibold">${quiz.options[0]}</button>
          <button class="px-4 py-2 rounded-lg bg-red-500 text-white font-semibold">${quiz.options[1]}</button>
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
