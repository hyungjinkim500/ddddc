import { auth } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// --- Registration Logic ---
const registerForm = document.getElementById('register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = registerForm.email.value;
        const password = registerForm.password.value;
        const passwordConfirm = registerForm['password-confirm'].value;

        if (password !== passwordConfirm) {
            alert('비밀번호가 일치하지 않습니다.');
            return;
        }

        try {
            await createUserWithEmailAndPassword(auth, email, password);
            alert('회원가입 성공! 자동으로 로그인됩니다.');
            // onAuthStateChanged in quiz-main.js will handle the UI update
        } catch (error) {
            handleAuthError(error);
        }
    });
}

// --- Login Logic ---
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginForm.email.value;
        const password = loginForm.password.value;

        try {
            await signInWithEmailAndPassword(auth, email, password);
            // onAuthStateChanged in quiz-main.js will handle the UI update
        } catch (error) {
            handleAuthError(error);
        }
    });
}

// --- Error Handler ---
function handleAuthError(error) {
    console.error(`Authentication error: ${error.code}`, error.message);
    switch (error.code) {
        case 'auth/email-already-in-use':
            alert('이미 사용 중인 이메일입니다.');
            break;
        case 'auth/weak-password':
            alert('비밀번호는 6자리 이상이어야 합니다.');
            break;
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
            alert('이메일 또는 비밀번호가 잘못되었습니다.');
            break;
        case 'auth/invalid-email':
            alert('유효하지 않은 이메일 형식입니다.');
            break;
        default:
            alert(`인증 중 오류가 발생했습니다: ${error.message}`);
            break;
    }
}
