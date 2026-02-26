import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

document.addEventListener('DOMContentLoaded', () => {
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
    const quizContainer = document.getElementById('quiz-container');
    if(categoryTabs && quizContainer) {
        const quizItems = quizContainer.querySelectorAll('.quiz-item');
        categoryTabs.addEventListener('click', (e) => {
            const targetButton = e.target.closest('.tab-button');
            if (!targetButton) return;
            categoryTabs.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
            targetButton.classList.add('active');
            const category = targetButton.dataset.category;
            quizItems.forEach(item => {
                item.style.display = (category === 'all' || item.dataset.category === category) ? 'block' : 'none';
            });
        });
        quizContainer.addEventListener('click', (e) => {
            const header = e.target.closest('.quiz-header');
            if (!header || e.target.closest('button')) return;
            const currentItem = header.parentElement;
            const details = header.nextElementSibling;
            const icon = header.querySelector('i.fa-chevron-down');
            const isOpening = !details.style.maxHeight;
            quizItems.forEach(item => {
                if (item !== currentItem) {
                    const otherDetails = item.querySelector('.quiz-details');
                    otherDetails.style.maxHeight = null; otherDetails.style.paddingTop = null; otherDetails.style.paddingBottom = null;
                    const otherIcon = item.querySelector('i.fa-chevron-down');
                    if (otherIcon) otherIcon.classList.remove('rotate-180');
                }
            });
            if (isOpening) {
                details.style.maxHeight = details.scrollHeight + "px";
                if (icon) icon.classList.add('rotate-180');
            } else {
                details.style.maxHeight = null;
                if (icon) icon.classList.remove('rotate-180');
            }
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
