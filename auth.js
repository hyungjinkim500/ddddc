import { 
    getAuth,
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut,
    GoogleAuthProvider,
    signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { app } from './firebase-config.js';

const auth = getAuth(app);

// Elements
const loginModal = document.getElementById('login-modal');
const loginModalButton = document.getElementById('login-modal-button');
const loginModalCloseButton = document.getElementById('login-modal-close-button');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const logoutButton = document.getElementById('logout-button');

const loginView = document.getElementById('login-view');
const registerView = document.getElementById('register-view');
const showRegisterViewLink = document.getElementById('show-register-view-link');

const showLoginViewLinkFromTerms = document.getElementById('show-login-view-link-from-terms');

// --- UI Control ---

// Function to show the modal
const showModal = () => loginModal.classList.add('show');

// Function to hide the modal
const hideModal = () => loginModal.classList.remove('show');

// Show modal when login button is clicked
loginModalButton.addEventListener('click', showModal);

// Hide modal when close button is clicked
loginModalCloseButton.addEventListener('click', hideModal);

// Hide modal when clicking outside of it
loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) {
        hideModal();
    }
});

// Toggle between login and register views
const showLogin = () => {
    loginView.style.display = 'block';
    registerView.style.display = 'none';
}

const showRegister = () => {
    loginView.style.display = 'none';
    registerView.style.display = 'block';
}

showRegisterViewLink.addEventListener('click', (e) => {
    e.preventDefault();
    showRegister();
});

showLoginViewLinkFromTerms.addEventListener('click', (e) => {
    e.preventDefault();
    showLogin();
});


// --- Authentication Logic ---

// Handle registration
registerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = registerForm.email.value;
    const password = registerForm.password.value;
    const passwordConfirm = registerForm['password-confirm'].value;

    if (password !== passwordConfirm) {
        alert('Passwords do not match');
        return;
    }

    createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            // Signed in 
            const user = userCredential.user;
            console.log('Registered and signed in:', user);
            alert('회원가입이 완료되었습니다!');
            hideModal();
        })
        .catch((error) => {
            console.error('Registration error:', error);
            alert(`Error: ${error.message}`);
        });
});

// Handle login
loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = loginForm.email.value;
    const password = loginForm.password.value;

    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            // Signed in 
            const user = userCredential.user;
            console.log('Signed in:', user);
            hideModal();
        })
        .catch((error) => {
            console.error('Login error:', error);
            alert(`Error: ${error.message}`);
        });
});

// Handle Google Login
const googleLoginButton = document.getElementById('google-login-button');
googleLoginButton.addEventListener('click', () => {
    const provider = new GoogleAuthProvider();
    signInWithPopup(auth, provider)
        .then((result) => {
            // This gives you a Google Access Token. You can use it to access the Google API.
            const credential = GoogleAuthProvider.credentialFromResult(result);
            const token = credential.accessToken;
            // The signed-in user info.
            const user = result.user;
            console.log('Google sign-in successful:', user);
            hideModal();
        }).catch((error) => {
            // Handle Errors here.
            const errorCode = error.code;
            const errorMessage = error.message;
            // The email of the user's account used.
            const email = error.customData.email;
            // The AuthCredential type that was used.
            const credential = GoogleAuthProvider.credentialFromError(error);
            console.error('Google sign-in error:', errorCode, errorMessage);
        });
});

// Handle logout
logoutButton.addEventListener('click', () => {
    signOut(auth).then(() => {
        console.log('User signed out');
    }).catch((error) => {
        console.error('Sign out error:', error);
    });
});

// Listen for auth state changes
onAuthStateChanged(auth, (user) => {
    if (user) {
        // User is signed in
        loginModalButton.classList.add('hidden');
        logoutButton.classList.remove('hidden');
    } else {
        // User is signed out
        loginModalButton.classList.remove('hidden');
        logoutButton.classList.add('hidden');
    }
});
