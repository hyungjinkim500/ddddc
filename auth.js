import { 
    getAuth,
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// FIX: Import the 'auth' instance directly from the config file
import { auth } from './firebase-config.js';

// REMOVED: No need to re-create the auth instance
// const auth = getAuth(app); 

document.addEventListener('DOMContentLoaded', () => {
    // Elements
    const loginModal = document.getElementById('login-modal');
    const loginModalButton = document.getElementById('login-modal-button');
    const loginModalCloseButton = document.getElementById('login-modal-close-button');
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const logoutButton = document.getElementById('logout-button');
    const googleLoginButton = document.getElementById('google-login-button');
    const betUpButton = document.getElementById('bet-up-button');
    const betDownButton = document.getElementById('bet-down-button');

    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    const showRegisterViewLink = document.getElementById('show-register-view-link');
    const showLoginViewLinkFromTerms = document.getElementById('show-login-view-link-from-terms');
    
    // Function to show the modal
    const showModal = () => loginModal.classList.add('show');

    // Function to hide the modal
    const hideModal = () => loginModal.classList.remove('show');

    // Show modal when login button is clicked
    if (loginModalButton) {
        loginModalButton.addEventListener('click', showModal);
    }
    
    // Hide modal when close button is clicked
    if (loginModalCloseButton) {
        loginModalCloseButton.addEventListener('click', hideModal);
    }

    // Hide modal when clicking outside of it
    if (loginModal) {
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) {
                hideModal();
            }
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
        registerForm.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log("Sign up clicked"); // DEBUG LOG

            const email = registerForm.email.value;
            const password = registerForm.password.value;

            createUserWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    console.log('Registered and signed in:', user);
                    alert('회원가입이 완료되었습니다.'); // SUCCESS ALERT
                    hideModal();
                })
                .catch((error) => {
                    console.error('Registration error:', error);
                    alert(`회원가입에 실패했습니다: ${error.message}`); // FAILURE ALERT
                });
        });
    }

    // Handle login
    if (loginForm) {
        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            console.log("Login clicked"); // DEBUG LOG
            
            const email = loginForm.email.value;
            const password = loginForm.password.value;

            signInWithEmailAndPassword(auth, email, password)
                .then((userCredential) => {
                    const user = userCredential.user;
                    console.log('Signed in:', user);
                    alert('로그인에 성공했습니다.'); // SUCCESS ALERT
                    hideModal();
                })
                .catch((error) => {
                    console.error('Login error:', error);
                    alert(`로그인에 실패했습니다: ${error.message}`); // FAILURE ALERT
                });
        });
    }

    // Handle Google Login
    if (googleLoginButton) {
        googleLoginButton.addEventListener('click', () => {
            console.log("Google button clicked"); 
            const provider = new GoogleAuthProvider();
            signInWithPopup(auth, provider)
                .then((result) => {
                    const user = result.user;
                    console.log('Google sign-in successful:', user);
                    hideModal();
                }).catch((error) => {
                    console.error('Google sign-in error:', error);
                });
        });
    }

    // Handle logout
    if (logoutButton) {
        logoutButton.addEventListener('click', () => {
            signOut(auth).then(() => {
                console.log('User signed out');
            }).catch((error) => {
                console.error('Sign out error:', error);
            });
        });
    }

    if(betUpButton) {
        betUpButton.addEventListener('click', () => {
            if (auth.currentUser) {
                console.log('Up-bet clicked by logged in user. Ready for next step.');
            } else {
                alert("로그인을 해주세요");
            }
        });
    }

    if(betDownButton) {
        betDownButton.addEventListener('click', () => {
            if (auth.currentUser) {
                console.log('Down-bet clicked by logged in user. Ready for next step.');
            } else {
                alert("로그인을 해주세요");
            }
        });
    }

    // Listen for auth state changes
    onAuthStateChanged(auth, (user) => {
        if (user) {
            if (loginModalButton) loginModalButton.classList.add('hidden');
            if (logoutButton) logoutButton.classList.remove('hidden');
        } else {
            if (loginModalButton) loginModalButton.classList.remove('hidden');
            if (logoutButton) logoutButton.classList.add('hidden');
        }
    });
});
