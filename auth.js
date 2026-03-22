console.log("🚀 AUTH JS VERSION 2026-03-02-TEST");
import { 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app, auth, db } from './firebase-config.js';
import { doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// 리다이렉트 후 결과 처리 (DOMContentLoaded 밖에서 즉시 실행)
getRedirectResult(auth).then(async (result) => {
    if (!result?.user) return;
    const user = result.user;
    const userRef = doc(db, "userProfiles", user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
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
    window.location.reload();
}).catch((error) => {
    console.error('Redirect result error:', error);
});

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
    const avatar = document.getElementById("user-avatar");

    const cachedAvatar = localStorage.getItem("userAvatar");
    if (cachedAvatar && avatar) {
      const img = new Image();
      img.src = cachedAvatar;
      img.onload = () => {
        avatar.src = cachedAvatar;
      };
    }

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

                alert("회원가입이 완료되었습니다.");
                location.reload();
                
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
                await signInWithRedirect(auth, provider);
            } catch (error) {
                console.error('Google sign-in error:', error);
                alert('Google 로그인에 실패했습니다. 콘솔을 확인하세요.');
            }
        });
    }

    // Handle logout using event delegation
    document.addEventListener("click", async (e) => {
        if (e.target.closest("#logout-button")) {
            await signOut(auth);
            localStorage.removeItem("userAvatar");
            window.location.reload();
        }
    });

    // Listen for auth state changes
    onAuthStateChanged(auth, async (user) => {
        const themeToggleButton = document.getElementById('theme-toggle');
        const userProfileInfo = document.getElementById('user-profile-info');
        const loginModalButton = document.getElementById('login-modal-button');
        const buttonContainer = themeToggleButton ? themeToggleButton.parentElement : null;
        const createQuizButton = buttonContainer ? buttonContainer.querySelector('.btn-primary') : null;
        const existingNicknameDisplay = document.getElementById('user-nickname-display');

        if (existingNicknameDisplay) {
            existingNicknameDisplay.remove();
        }

        if (user) {
            if (loginModalButton) loginModalButton.classList.add('hidden');
            if (userProfileInfo) userProfileInfo.classList.remove('hidden');
            if (userProfileInfo) userProfileInfo.classList.add('flex');

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
              const userData = finalSnap.data();
              const displayName = userData.displayName;

              if (avatar && userData.photoURL) {
                const currentCache = localStorage.getItem("userAvatar");
                if (currentCache !== userData.photoURL) {
                  avatar.src = userData.photoURL;
                  localStorage.setItem("userAvatar", userData.photoURL);
                }
              }
              
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
            if (loginModalButton) {
                loginModalButton.classList.remove("hidden");
            }
            if (userProfileInfo) {
                userProfileInfo.classList.add("hidden");
                userProfileInfo.classList.remove("flex");
            }

            const avatar = document.getElementById("user-avatar");
            if (avatar) {
                avatar.removeAttribute("src");
            }

            const nicknameDisplay = document.getElementById("user-nickname-display");
            if (nicknameDisplay) {
                nicknameDisplay.remove();
            }
        }
    });
});

document.addEventListener("DOMContentLoaded", () => {

    const createQuizBtn = document.getElementById("create-quiz-btn");

    if (!createQuizBtn) return;

    createQuizBtn.addEventListener("click", (e) => {

        e.preventDefault();

        if (auth.currentUser) {
            window.location.href = "create-quiz.html";
        } else {
            alert("로그인이 필요한 서비스 입니다. 로그인해주세요.");
        }

    });

});