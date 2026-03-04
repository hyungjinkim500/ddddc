console.log("🚀 AUTH JS VERSION 2026-03-02-TEST");
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app, auth, db } from './firebase-config.js';
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {
    const loginModal = document.getElementById('login-modal');
    const loginModalButton = document.getElementById('login-modal-button');
    const loginModalCloseButton = document.getElementById('login-modal-close-button');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const logoutButton = document.getElementById('logout-button');
    const googleLoginButton = document.getElementById('google-login-button');
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    const showRegisterViewLink = document.getElementById('show-register-view-link');
    const showLoginViewLinkFromTerms = document.getElementById('show-login-view-link-from-terms');

    const showModal = () => loginModal.classList.add('show');
    const hideModal = () => loginModal.classList.remove('show');

    if (loginModalButton) loginModalButton.addEventListener('click', showModal);
    if (loginModalCloseButton) loginModalCloseButton.addEventListener('click', hideModal);
    if (loginModal) {
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) hideModal();
        });
    }

    const showLogin = () => {
        if(loginView) loginView.style.display = 'block';
        if(registerView) registerView.style.display = 'none';
    }

    const showRegister = () => {
        if(loginView) loginView.style.display = 'none';
        if(registerView) registerView.style.display = 'block';
    }
    
    if (showRegisterViewLink) {
        showRegisterViewLink.addEventListener('click', (e) => {
            e.preventDefault();
            showRegister();
        });
    }
    
    if (showLoginViewLinkFromTerms) {
        showLoginViewLinkFromTerms.addEventListener('click', (e) => {
            e.preventDefault();
            showLogin();
        });
    }

    // Handle registration
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = registerForm.email.value;
            const password = registerForm.password.value;
            const displayName = registerForm.nickname.value;

            try {
                const userCredential = await createUserWithEmailAndPassword(auth, email, password);
                const user = userCredential.user;
                await updateProfile(user, { displayName });

                await setDoc(doc(db, "userProfiles", user.uid), {
                    displayName: displayName,
                    photoURL: null,
                    points: 100,
                    winCount: 0,
                    totalParticipation: 0,
                    role: "user",
                    isBanned: false,
                    createdAt: serverTimestamp()
                });

                if (confirm("회원가입이 완료되었습니다.")) {
                    location.reload();
                }
                
            } catch (error) {
                console.error('Registration error:', error);
                alert(`회원가입에 실패했습니다: ${error.message}`);
            }
        });
    }

    // Handle login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = loginForm.email.value;
            const password = loginForm.password.value;

            try {
                await signInWithEmailAndPassword(auth, email, password);
                alert('로그인에 성공했습니다.');
                hideModal();
            } catch (error) {
                console.error('Login error:', error);
                alert('로그인에 실패했습니다. 콘솔을 확인하세요.');
            }
        });
    }

    // Handle Google Login
    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', async (e) => {
            e.preventDefault();
            const provider = new GoogleAuthProvider();
            try {
                await signInWithPopup(auth, provider);
                hideModal();
            } catch (error) {
                console.error('Google sign-in error:', error);
                alert('Google 로그인에 실패했습니다. 콘솔을 확인하세요.');
            }
        });
    }

    // Handle logout
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            signOut(auth).catch((error) => {
                console.error('Sign out error:', error);
            });
        });
    }

    // Listen for auth state changes
    onAuthStateChanged(auth, async (user) => {
        const themeToggleButton = document.getElementById('theme-toggle');
        const buttonContainer = themeToggleButton.parentElement;
        const createQuizButton = buttonContainer.querySelector('.btn-primary');
        const existingNicknameDisplay = document.getElementById('user-nickname-display');

        if (existingNicknameDisplay) {
            existingNicknameDisplay.remove();
        }

        if (user) {
            if (loginModalButton) loginModalButton.classList.add('hidden');
            if (logoutButton) logoutButton.classList.remove('hidden');

            const userRef = doc(db, "userProfiles", user.uid);
            const snap = await getDoc(userRef);

            if (!snap.exists() && user.displayName) {
                await setDoc(userRef, {
                    displayName: user.displayName || "사용자",
                    photoURL: user.photoURL || null,
                    points: 100,
                    winCount: 0,
                    totalParticipation: 0,
                    role: "user",
                    isBanned: false,
                    createdAt: serverTimestamp()
                });
            }

            const finalSnap = await getDoc(userRef);
            if (finalSnap.exists()) {
              const displayName = finalSnap.data().displayName;

              const nicknameDisplayElement = document.createElement('span');
              nicknameDisplayElement.id = 'user-nickname-display';
              nicknameDisplayElement.textContent = `${displayName}님`;
              nicknameDisplayElement.className =
                  'text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center whitespace-nowrap';

              if (buttonContainer && createQuizButton) {
                  buttonContainer.insertBefore(nicknameDisplayElement, createQuizButton);
              }
            }
        } else {
            if (loginModalButton) loginModalButton.classList.remove('hidden');
            if (logoutButton) logoutButton.classList.add('hidden');
        }
    });
});
