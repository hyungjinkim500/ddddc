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

// 모달 HTML 동적 주입
function injectLoginModal() {
    if (document.getElementById('login-modal')) return;
    const modal = document.createElement('div');
    modal.innerHTML = `
<div id="login-modal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:1000;justify-content:center;align-items:center;">
  <div style="background:white;padding:2rem;border-radius:1rem;width:90%;max-width:400px;position:relative;max-height:90vh;overflow-y:auto;" class="dark:bg-slate-800">
    <button id="login-modal-close-button" style="position:absolute;top:12px;right:16px;font-size:24px;color:#94a3b8;background:none;border:none;cursor:pointer;">&times;</button>

    <!-- 로그인 화면 -->
    <div id="login-view">
      <h2 style="font-size:1.25rem;font-weight:700;text-align:center;margin-bottom:1rem;">로그인</h2>
      <form id="login-form" class="space-y-3">
        <input type="email" name="email" placeholder="이메일" class="w-full px-3 py-2 border rounded-lg text-sm dark:bg-slate-700 dark:border-slate-600" required>
        <input type="password" name="password" placeholder="비밀번호" class="w-full px-3 py-2 border rounded-lg text-sm dark:bg-slate-700 dark:border-slate-600" required>
        <button type="submit" class="w-full bg-[#169976] text-white py-2 rounded-lg font-bold text-sm">로그인</button>
      </form>
      <label style="display:flex;align-items:center;gap:6px;margin-top:8px;cursor:pointer;font-size:0.75rem;color:#64748b;">
        <input type="checkbox" id="remember-email" style="accent-color:#169976;">
        이메일 기억하기
      </label>
      <button id="google-login-button" class="w-full mt-3 border border-slate-300 py-2 rounded-lg text-sm font-semibold hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700 flex items-center justify-center gap-2">
        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" style="width:18px;height:18px;">
        구글로 로그인
      </button>
      <p style="text-align:center;font-size:0.75rem;margin-top:1rem;color:#64748b;">계정이 없으신가요? <a href="#" id="show-terms-view-link" style="color:#169976;font-weight:700;">회원가입</a></p>
    </div>

    <!-- 약관 동의 화면 -->
    <div id="terms-view" style="display:none;">
      <h2 style="font-size:1.25rem;font-weight:700;text-align:center;margin-bottom:0.5rem;">회원가입</h2>
      <p style="text-align:center;font-size:0.75rem;color:#64748b;margin-bottom:1rem;">서비스 이용을 위해 약관에 동의해주세요</p>
      <div style="border:1px solid #e2e8f0;border-radius:12px;padding:1rem;margin-bottom:1rem;">
        <label style="display:flex;align-items:center;gap:8px;font-weight:700;font-size:0.9rem;cursor:pointer;">
          <input type="checkbox" id="terms-all" style="width:18px;height:18px;accent-color:#169976;">
          전체 동의
        </label>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
          <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
            <input type="checkbox" id="terms-service" style="width:16px;height:16px;margin-top:2px;accent-color:#169976;" required>
            <div>
              <span style="font-size:0.85rem;font-weight:600;">픽스 이용약관 동의 (필수)</span>
              <div style="height:80px;overflow-y:auto;margin-top:6px;font-size:0.75rem;color:#64748b;border:1px solid #f1f5f9;border-radius:6px;padding:8px;line-height:1.6;">
                제1조 (목적) 본 약관은 픽스(이하 "회사")가 제공하는 집단지성 투표 플랫폼 서비스(이하 "서비스")의 이용과 관련하여 회사와 회원 간의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.<br><br>
                제2조 (정의) "회원"이란 본 약관에 동의하고 서비스를 이용하는 자를 말합니다.<br><br>
                제3조 (약관의 효력) 본 약관은 서비스 화면에 게시하거나 회원에게 공지함으로써 효력이 발생합니다.<br><br>
                제4조 (이용 제한) 회사는 회원이 본 약관을 위반하거나 서비스의 정상적인 운영을 방해한 경우 서비스 이용을 제한할 수 있습니다.<br><br>
                제5조 (면책조항) 회사는 천재지변, 불가항력 등으로 인한 서비스 중단에 대해 책임을 지지 않습니다.
              </div>
            </div>
          </label>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
          <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
            <input type="checkbox" id="terms-privacy" style="width:16px;height:16px;margin-top:2px;accent-color:#169976;" required>
            <div>
              <span style="font-size:0.85rem;font-weight:600;">개인정보 수집 및 이용 동의 (필수)</span>
              <div style="height:80px;overflow-y:auto;margin-top:6px;font-size:0.75rem;color:#64748b;border:1px solid #f1f5f9;border-radius:6px;padding:8px;line-height:1.6;">
                수집 항목: 이메일, 닉네임, 프로필 이미지, 서비스 이용 기록<br><br>
                수집 목적: 회원 식별, 서비스 제공, 부정이용 방지<br><br>
                보유 기간: 회원 탈퇴 시까지 (관련 법령에 따라 일정 기간 보관)<br><br>
                귀하는 개인정보 수집 및 이용에 동의하지 않을 권리가 있으며, 동의 거부 시 서비스 이용이 제한될 수 있습니다.
              </div>
            </div>
          </label>
        </div>
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:12px;">
          <label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer;">
            <input type="checkbox" id="terms-marketing" style="width:16px;height:16px;margin-top:2px;accent-color:#169976;">
            <div>
              <span style="font-size:0.85rem;font-weight:600;">프로모션 정보 수신 동의 (선택)</span>
              <p style="font-size:0.75rem;color:#94a3b8;margin-top:4px;">이벤트, 혜택 등 마케팅 정보를 받습니다.</p>
            </div>
          </label>
        </div>
      </div>
      <button id="terms-agree-btn" class="w-full mt-4 bg-[#169976] text-white py-2.5 rounded-xl font-bold text-sm">동의하고 계속하기</button>
      <p style="text-align:center;font-size:0.75rem;margin-top:0.75rem;color:#64748b;">이미 계정이 있으신가요? <a href="#" id="show-login-from-terms" style="color:#169976;font-weight:700;">로그인</a></p>
    </div>

    <!-- 회원가입 화면 -->
    <div id="register-view" style="display:none;">
      <h2 style="font-size:1.25rem;font-weight:700;text-align:center;margin-bottom:0.25rem;">회원정보 입력</h2>
      <p style="text-align:center;font-size:0.75rem;color:#64748b;margin-bottom:1rem;">몇 단계만 거치면 바로 참여할 수 있습니다!</p>
      <form id="register-form" class="space-y-3">
        <div>
          <div style="display:flex;gap:8px;">
            <input type="text" name="nickname" placeholder="닉네임" class="flex-1 px-3 py-2 border rounded-lg text-sm dark:bg-slate-700 dark:border-slate-600" required maxlength="20">
            <button type="button" id="check-nickname-btn" class="px-3 py-2 border border-[#169976] text-[#169976] rounded-lg text-xs font-bold whitespace-nowrap">중복확인</button>
          </div>
          <p id="nickname-check-msg" style="font-size:0.7rem;margin-top:4px;padding-left:4px;"></p>
        </div>
        <input type="email" name="email" placeholder="이메일" class="w-full px-3 py-2 border rounded-lg text-sm dark:bg-slate-700 dark:border-slate-600" required>
        <input type="password" name="password" placeholder="비밀번호 (8자 이상)" class="w-full px-3 py-2 border rounded-lg text-sm dark:bg-slate-700 dark:border-slate-600" required minlength="8">
        <div>
          <input type="password" name="password_confirm" placeholder="비밀번호 확인" class="w-full px-3 py-2 border rounded-lg text-sm dark:bg-slate-700 dark:border-slate-600" required>
          <p id="password-match-msg" style="font-size:0.7rem;margin-top:4px;padding-left:4px;"></p>
        </div>
        <button type="submit" id="register-submit-btn" class="w-full bg-[#169976] text-white py-2 rounded-lg font-bold text-sm">가입하기</button>
      </form>
      <p style="text-align:center;font-size:0.75rem;margin-top:0.75rem;color:#64748b;"><a href="#" id="back-to-terms" style="color:#169976;">이전 단계로 돌아가기</a></p>
    </div>
  </div>
</div>`;
    document.body.appendChild(modal.firstElementChild);
}

// (getRedirectResult 제거 - popup 방식으로 통일)

// window.openModal 즉시 등록 (DOMContentLoaded 기다리지 않음)
window.openModal = () => {
    const modal = document.getElementById('login-modal');
    if (modal) {
        modal.style.display = 'flex';
    } else {
        // 모달이 아직 없으면 주입 후 열기
        injectLoginModal();
        setTimeout(() => {
            const m = document.getElementById('login-modal');
            if (m) m.style.display = 'flex';
        }, 0);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    injectLoginModal();

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

    const showModal = () => loginModal.style.display = 'flex';
    const hideModal = () => loginModal.style.display = 'none';

    if (loginModalButton) loginModalButton.addEventListener('click', showModal);
    // post.html 헤더 로그인 버튼
    document.getElementById('header-login-btn')?.addEventListener('click', showModal);
    // mypage.html 로그인 버튼 (logout-link가 로그인 버튼으로 바뀐 경우는 profile.js에서 처리)
    if (loginModalCloseButton) loginModalCloseButton.addEventListener('click', hideModal);
    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) hideModal();
    });

    const termsView = document.getElementById('terms-view');
    const showTermsViewLink = document.getElementById('show-terms-view-link');
    const showLoginFromTerms = document.getElementById('show-login-from-terms');
    const backToTerms = document.getElementById('back-to-terms');
    
    const showLogin = () => {
        loginView.style.display = 'block';
        termsView.style.display = 'none';
        registerView.style.display = 'none';
    }

    const showTerms = () => {
        loginView.style.display = 'none';
        termsView.style.display = 'block';
        registerView.style.display = 'none';
    }

    const showRegister = () => {
        loginView.style.display = 'none';
        termsView.style.display = 'none';
        registerView.style.display = 'block';
    }

    if (showTermsViewLink) showTermsViewLink.addEventListener('click', (e) => { e.preventDefault(); showTerms(); });
    if (showLoginFromTerms) showLoginFromTerms.addEventListener('click', (e) => { e.preventDefault(); showLogin(); });
    if (backToTerms) backToTerms.addEventListener('click', (e) => { e.preventDefault(); showTerms(); });

    // 약관 동의 로직
    const termsAll = document.getElementById('terms-all');
    const termsService = document.getElementById('terms-service');
    const termsPrivacy = document.getElementById('terms-privacy');
    const termsMarketing = document.getElementById('terms-marketing');
    const termsAgreeBtn = document.getElementById('terms-agree-btn');

    termsAll.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        termsService.checked = isChecked;
        termsPrivacy.checked = isChecked;
        termsMarketing.checked = isChecked;
    });

    termsAgreeBtn.addEventListener('click', () => {
        if (termsService.checked && termsPrivacy.checked) {
            showRegister();
        } else {
            alert('필수 약관에 모두 동의해주세요.');
        }
    });

    // 회원가입 닉네임, 비밀번호 확인
    const nicknameInput = registerForm.nickname;
    const nicknameCheckBtn = document.getElementById('check-nickname-btn');
    const nicknameCheckMsg = document.getElementById('nickname-check-msg');
    const passwordInput = registerForm.password;
    const passwordConfirmInput = registerForm.password_confirm;
    const passwordMatchMsg = document.getElementById('password-match-msg');
    let isNicknameAvailable = false;

    nicknameCheckBtn.addEventListener('click', async () => {
        const nickname = nicknameInput.value.trim();
        if (!nickname || nickname.length < 2) {
            nicknameCheckMsg.textContent = '닉네임을 2자 이상 입력해주세요.';
            nicknameCheckMsg.style.color = 'red';
            return;
        }
        nicknameCheckMsg.textContent = '확인 중...';
        nicknameCheckMsg.style.color = '#94a3b8';
        try {
            const { getDocs, query, collection, where } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
            const snap = await getDocs(query(collection(db, 'userProfiles'), where('displayName', '==', nickname)));
            if (!snap.empty) {
                nicknameCheckMsg.textContent = '이미 사용 중인 닉네임입니다.';
                nicknameCheckMsg.style.color = 'red';
                isNicknameAvailable = false;
            } else {
                nicknameCheckMsg.textContent = '사용 가능한 닉네임입니다.';
                nicknameCheckMsg.style.color = '#169976';
                isNicknameAvailable = true;
            }
        } catch (e) {
            nicknameCheckMsg.textContent = '확인 중 오류가 발생했습니다.';
            nicknameCheckMsg.style.color = 'red';
        }
    });

    passwordConfirmInput.addEventListener('keyup', () => {
        if (passwordInput.value === passwordConfirmInput.value) {
            passwordMatchMsg.textContent = '비밀번호가 일치합니다.';
            passwordMatchMsg.style.color = 'green';
        } else {
            passwordMatchMsg.textContent = '비밀번호가 일치하지 않습니다.';
            passwordMatchMsg.style.color = 'red';
        }
    });

    // Handle registration
    if (registerForm) {
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!isNicknameAvailable) {
                alert('닉네임 중복 확인을 해주세요.');
                return;
            }
            if (passwordInput.value !== passwordConfirmInput.value) {
                alert('비밀번호가 일치하지 않습니다.');
                return;
            }

            const email = registerForm.email.value;
            const password = registerForm.password.value;
            const displayName = nicknameInput.value;

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
                    createdAt: serverTimestamp(),
                    agreedMarketing: termsMarketing.checked
                });

                alert("회원가입이 완료되었습니다.");
                location.reload();
                
            } catch (error) {
                console.error('Registration error:', error);
                alert(`회원가입에 실패했습니다: ${error.message}`);
            }
        });
    }

    // 저장된 이메일 불러오기
    const savedEmail = localStorage.getItem('savedEmail');
    const rememberEmailCheckbox = document.getElementById('remember-email');
    if (savedEmail && loginForm) {
        loginForm.email.value = savedEmail;
        if (rememberEmailCheckbox) rememberEmailCheckbox.checked = true;
    }

    // Handle login
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = loginForm.email.value;
            const password = loginForm.password.value;

            // 이메일 기억하기 처리
            if (rememberEmailCheckbox?.checked) {
                localStorage.setItem('savedEmail', email);
            } else {
                localStorage.removeItem('savedEmail');
            }

            try {
                await signInWithEmailAndPassword(auth, email, password);
                hideModal();
                if (window.location.pathname.includes('post.html') || window.location.pathname.includes('mypage.html')) {
                    window.location.reload();
                }
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
                const result = await signInWithPopup(auth, provider);
                if (result?.user) {
                    const userRef = doc(db, "userProfiles", result.user.uid);
                    const snap = await getDoc(userRef);
                    if (!snap.exists()) {
                        await setDoc(userRef, {
                            displayName: result.user.displayName || "사용자",
                            photoURL: result.user.photoURL || null,
                            points: 100,
                            winCount: 0,
                            totalParticipation: 0,
                            role: "user",
                            isBanned: false,
                            createdAt: serverTimestamp()
                        });
                    }
                    hideModal();
                     if (window.location.pathname.includes('post.html') || window.location.pathname.includes('mypage.html')) {
                        window.location.reload();
                    }
                }
            } catch (error) {
                if (error.code === 'auth/popup-closed-by-user') {
                    // 사용자가 직접 닫은 경우 - 조용히 무시
                    return;
                }
                console.error('Google sign-in error:', error);
                alert('Google 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.');
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

    // 알림 뱃지 업데이트
async function updateNotifBadge(uid) {
    try {
        const { collection, query, where, getCountFromServer } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        const q = query(collection(db, 'notifications', uid, 'items'), where('read', '==', false));
        const snap = await getCountFromServer(q);
        const count = snap.data().count || 0;
        const navAlarm = document.getElementById('nav-alarm');
        if (!navAlarm) return;
        let badge = navAlarm.querySelector('.notif-badge');
        if (count > 0) {
            if (!badge) {
                badge = document.createElement('span');
                badge.className = 'notif-badge absolute top-0 right-1 w-2.5 h-2.5 bg-red-500 rounded-full';
                navAlarm.style.position = 'relative';
                navAlarm.appendChild(badge);
            }
        } else {
            badge?.remove();
        }
    } catch (e) {
        console.error('알림 뱃지 오류:', e);
    }
}

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
            updateNotifBadge(user.uid);
            if (loginModalButton) loginModalButton.style.display = 'none';
            if (userProfileInfo) {
                 userProfileInfo.style.display = 'flex';
                 userProfileInfo.classList.remove('hidden'); // 혹시 모를 hidden 클래스 제거
            }

            const userRef = doc(db, "userProfiles", user.uid);
            const snap = await getDoc(userRef);

            if (!snap.exists() && (user.displayName || user.email)) { // 구글 로그인 최초 진입 시
                await setDoc(userRef, {
                    displayName: user.displayName || user.email.split('@')[0],
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
              } else if (avatar) {
                  avatar.src = '/images/default-avatar.png'; // 기본 아바타
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
            if (loginModalButton) loginModalButton.style.display = 'block';
            if (userProfileInfo) {
                userProfileInfo.style.display = 'none';
            }
            if (avatar) avatar.src = '/images/default-avatar.png'; // 로그아웃 시 기본 아바타
            localStorage.removeItem("userAvatar");
            const nicknameDisplay = document.getElementById("user-nickname-display");
            if (nicknameDisplay) nicknameDisplay.remove();
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
            document.getElementById('login-modal-button').click();
        }

    });

});
