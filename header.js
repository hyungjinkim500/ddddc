import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { doc, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

export async function loadHeader() {
    const container = document.getElementById("header-container");
    if (!container) return;
    const res = await fetch("/components/header.html");
    const html = await res.text();
    container.innerHTML = html;
    initializeHeader();
    initAuthUI();
}

function initializeHeader() {
    // 테마 토글
    const themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
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

    // 아바타 드롭다운
    const avatar = document.getElementById("user-avatar");
    const menu = document.getElementById("user-menu");
    if (avatar && menu) {
        avatar.addEventListener("click", (e) => {
            e.stopPropagation();
            menu.classList.toggle("hidden");
        });
        document.addEventListener("click", (e) => {
            if (!menu.contains(e.target) && !avatar.contains(e.target)) {
                menu.classList.add("hidden");
            }
        });
    }

    // 모달 제어
    const loginModal = document.getElementById('login-modal');
    const loginModalButton = document.getElementById('login-modal-button');
    const loginModalCloseButton = document.getElementById('login-modal-close-button');

    function openModal() {
        if (loginModal) loginModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }
    function closeModal() {
        if (loginModal) loginModal.classList.remove('show');
        document.body.style.overflow = '';
    }

    if (loginModalButton) loginModalButton.addEventListener('click', openModal);
    if (loginModalCloseButton) loginModalCloseButton.addEventListener('click', closeModal);
    if (loginModal) loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) closeModal();
    });

    window.openModal = openModal;
    window.closeModal = closeModal;
}

function initAuthUI() {
    // 캐시된 아바타 즉시 표시
    const cachedAvatar = localStorage.getItem("userAvatar");
    const avatar = document.getElementById("user-avatar");
    if (cachedAvatar && avatar) avatar.src = cachedAvatar;

    onAuthStateChanged(auth, (user) => {
        const loginButton = document.getElementById('login-modal-button');
        const logoutButton = document.getElementById('logout-button');
        const userProfileInfo = document.getElementById('user-profile-info');
        const userNickname = document.getElementById('user-nickname');
        const userPoints = document.getElementById('user-points');
        const headerAvatar = document.getElementById("user-avatar");

        if (user) {
            if (loginButton) loginButton.classList.add('hidden');
            if (logoutButton) logoutButton.classList.remove('hidden');
            if (userProfileInfo) { userProfileInfo.classList.remove('hidden'); userProfileInfo.classList.add('flex'); }

            const userRef = doc(db, "userProfiles", user.uid);
            onSnapshot(userRef, (docSnap) => {
                if (!docSnap.exists()) return;
                const data = docSnap.data();
                if (headerAvatar && data.photoURL) headerAvatar.src = data.photoURL;
                if (userNickname) userNickname.textContent = data.displayName || "사용자";
                if (userPoints) userPoints.textContent = `${data.points || 0} P`;
            });
        } else {
            if (loginButton) loginButton.classList.remove('hidden');
            if (logoutButton) logoutButton.classList.add('hidden');
            if (userProfileInfo) { userProfileInfo.classList.add('hidden'); userProfileInfo.classList.remove('flex'); }
            if (headerAvatar) headerAvatar.removeAttribute('src');
        }
    });
}
