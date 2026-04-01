import { auth, db } from './firebase-config.js';
import {
    createUserWithEmailAndPassword,
    updateProfile,
    sendEmailVerification,
    signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    doc, setDoc, getDoc, getDocs,
    collection, query, where, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// 단계 전환
function showStep(n) {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById('step' + n).classList.add('active');
    document.getElementById('step-title').textContent = n === 1 ? '약관 동의 및 본인확인' : '정보 입력';
}

// 전체동의 체크박스
const allAgree = document.getElementById('all-agree');
const requiredChecks = document.querySelectorAll('.terms-required');
const chkMarketing = document.getElementById('chk-marketing');

allAgree.addEventListener('change', () => {
    const checked = allAgree.checked;
    requiredChecks.forEach(c => c.checked = checked);
    chkMarketing.checked = checked;
});

[...requiredChecks, chkMarketing].forEach(c => {
    c.addEventListener('change', () => {
        const allRequiredChecked = [...requiredChecks].every(x => x.checked);
        const marketingChecked = chkMarketing.checked;
        allAgree.checked = allRequiredChecked && marketingChecked;
    });
});

// 1단계 → 2단계
document.getElementById('step1-next-btn').addEventListener('click', () => {
    const allRequired = [...requiredChecks].every(c => c.checked);
    if (!allRequired) {
        alert('필수 약관에 모두 동의해주세요.');
        return;
    }
    showStep(2);
});

// 2단계 → 1단계
document.getElementById('back-to-step1').addEventListener('click', (e) => {
    e.preventDefault();
    showStep(1);
});

// 닉네임 중복확인
let isNicknameOk = false;
const BANNED_WORDS = ['씨발','시발','ㅅㅂ','존나','ㅈㄴ','병신','ㅂㅅ','새끼','ㅅㄲ','개새','미친','ㅁㅊ','꺼져','닥쳐','죽어','보지','ㅂㅈ','자지','ㅈㅈ','섹스','섹쓰','야동','포르노','강간','성교','음란','fuck','shit','bitch','ass','porn','sex','cock','pussy','dick'];
function containsBannedWord(text) {
    const lower = text.toLowerCase().replace(/\s/g, '');
    return BANNED_WORDS.some(w => lower.includes(w.toLowerCase()));
}

document.getElementById('check-nickname-btn').addEventListener('click', async () => {
    const nickname = document.getElementById('input-nickname').value.trim();
    const msg = document.getElementById('nickname-msg');
    if (nickname.length < 2) {
        msg.textContent = '닉네임을 2자 이상 입력해주세요.';
        msg.className = 'msg err';
        isNicknameOk = false;
        return;
    }
    if (containsBannedWord(nickname)) {
        msg.textContent = '사용할 수 없는 단어가 포함되어 있습니다.';
        msg.className = 'msg err';
        isNicknameOk = false;
        return;
    }
    msg.textContent = '확인 중...';
    msg.className = 'msg info';
    const snap = await getDocs(query(collection(db, 'userProfiles'), where('displayName', '==', nickname)));
    if (!snap.empty) {
        msg.textContent = '이미 사용 중인 닉네임입니다.';
        msg.className = 'msg err';
        isNicknameOk = false;
    } else {
        msg.textContent = '사용 가능한 닉네임입니다.';
        msg.className = 'msg ok';
        isNicknameOk = true;
    }
});

// 비밀번호 일치 확인
document.getElementById('input-password-confirm').addEventListener('input', () => {
    const pw = document.getElementById('input-password').value;
    const pw2 = document.getElementById('input-password-confirm').value;
    const msg = document.getElementById('password-msg');
    if (!pw2) { msg.textContent = ''; return; }
    if (pw === pw2) {
        msg.textContent = '비밀번호가 일치합니다.';
        msg.className = 'msg ok';
    } else {
        msg.textContent = '비밀번호가 일치하지 않습니다.';
        msg.className = 'msg err';
    }
});

// 이메일 중복 확인
let isEmailOk = false;
document.getElementById('check-email-btn').addEventListener('click', async () => {
    const email = document.getElementById('input-email').value.trim();
    const msg = document.getElementById('email-msg');
    if (!email) {
        msg.textContent = '이메일을 입력해주세요.';
        msg.className = 'msg err';
        isEmailOk = false;
        return;
    }
    const emailRegex = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;
    if (!emailRegex.test(email)) {
        msg.textContent = '올바른 이메일 형식이 아닙니다.';
        msg.className = 'msg err';
        isEmailOk = false;
        return;
    }
    msg.textContent = '확인 중...';
    msg.className = 'msg info';

    const tempPassword = 'TempCheck!!' + Math.random().toString(36).slice(2);
    try {
        const { createUserWithEmailAndPassword: _create, deleteUser } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
        const tempCred = await _create(auth, email, tempPassword);
        await deleteUser(tempCred.user);
        msg.textContent = '사용 가능한 이메일입니다.';
        msg.className = 'msg ok';
        isEmailOk = true;
    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            msg.textContent = '이미 사용 중인 이메일입니다.';
            msg.className = 'msg err';
        } else if (error.code === 'auth/invalid-email') {
            msg.textContent = '올바른 이메일 형식이 아닙니다.';
            msg.className = 'msg err';
        } else {
            msg.textContent = '확인 중 오류가 발생했습니다.';
            msg.className = 'msg err';
        }
        isEmailOk = false;
    }
});


// 가입하기
document.getElementById('register-btn').addEventListener('click', async () => {
    const nickname = document.getElementById('input-nickname').value.trim();
    const email = document.getElementById('input-email').value.trim();
    const password = document.getElementById('input-password').value;
    const password2 = document.getElementById('input-password-confirm').value;
    const birth = document.getElementById('input-birth').value || null;
    const gender = document.getElementById('input-gender').value || null;

    if (!isNicknameOk) { alert('닉네임 중복 확인을 해주세요.'); return; }
    if (!isEmailOk) { alert('이메일 중복 확인을 해주세요.'); return; }
    if (password.length < 8) { alert('비밀번호를 8자 이상 입력해주세요.'); return; }
    if (password !== password2) { alert('비밀번호가 일치하지 않습니다.'); return; }

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const user = userCredential.user;
        
        await updateProfile(user, { displayName: nickname });

        await setDoc(doc(db, 'userProfiles', user.uid), {
            email: email,
            displayName: nickname,
            photoURL: null,
            points: 100,
            winCount: 0,
            totalParticipation: 0,
            role: 'user',
            isBanned: false,
            createdAt: serverTimestamp(),
            agreedMarketing: document.getElementById('chk-marketing').checked,
            birth: birth,
            gender: gender
        });

        await sendEmailVerification(user);

        await signOut(auth);
        alert('가입이 완료됐습니다! 발송된 이메일을 확인하여 인증을 완료해주세요.');
        window.location.href = 'index.html';

    } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
            alert('이미 사용 중인 이메일입니다.');
        } else {
            alert('가입 중 오류가 발생했습니다: ' + error.message);
        }
    }
});

// 약관 모달
const termsModal = document.getElementById('terms-modal');
const termsModalTitle = document.getElementById('terms-modal-title');
const termsModalBody = document.getElementById('terms-modal-body');
const termsModalClose = document.getElementById('terms-modal-close');

const termsContents = {
    service: {
        title: '이용약관',
        body: `제1조 (목적) 본 약관은 픽스(PIX, 이하 "서비스")의 이용과 관련하여 서비스와 이용자의 권리, 의무 및 책임사항을 규정함을 목적으로 합니다.<br><br>
제2조 (용어의 정의)<br>
1. 회원: 본 약관에 동의하고 가입신청을 통해 서비스를 이용하는 이용자<br>
2. 기타 약관에서 정하지 아니한 용어는 관계 법령 및 일반 관례에 따릅니다.<br><br>
제3조 (약관의 효력 및 변경)<br>
1. 본 약관은 서비스를 이용하고자 하는 모든 회원에 대하여 효력이 발생합니다.<br>
2. 회사는 필요한 사유가 발생할 경우 관련 법령에 위배되지 않는 범위 안에서 약관을 개정할 수 있으며, 변경 시 시행일 7일 전 공지합니다.<br><br>
제4조 (회원 가입과 제한)<br>
1. 회원으로 가입하고자 하는 이용자는 회사가 요구하는 양식에 따라 필요한 정보를 입력하여 이용 신청을 합니다.<br>
2. 등록 내용에 허위·기재누락·오기가 있거나, 법령 또는 약관 위반 시 가입이 제한될 수 있습니다.<br><br>
제5조 (회원 탈퇴 및 자격 상실)<br>
1. 회원은 언제든지 서비스 내 탈퇴 신청을 할 수 있으며, 회사는 개인정보처리방침에 따라 즉시 처리합니다.<br>
2. 탈퇴 시 게시판에 등록된 게시글 및 댓글은 삭제되지 않으므로, 삭제를 원하실 경우 탈퇴 전 직접 삭제해 주세요.<br><br>
제6조 (서비스 제공)<br>
회사는 회원에게 투표 게시글(PIX, 밸런스게임), 댓글, 좋아요, 탐색·검색, 마이페이지 등의 서비스를 제공합니다.<br><br>
제7조 (회원의 의무)<br>
이용자는 다음 행위를 하여서는 안 됩니다.<br>
1. 허위 정보 등록<br>
2. 타인의 저작권 등 지적재산권 침해<br>
3. 타인의 명예 손상 또는 업무 방해<br>
4. 외설·폭력적 정보 게시<br>
5. 서비스 운영 방해 행위<br>
6. 기타 관계 법령 위반 행위<br><br>
제8조 (게시물 저작권)<br>
1. 회원이 작성한 게시물의 저작권은 해당 게시물의 작성자에게 귀속합니다.<br>
2. 게시물로 인한 법적 책임은 해당 게시자에게 있습니다.<br><br>
제9조 (면책조항)<br>
회사는 천재지변, 불가항력, 해킹 등으로 인한 서비스 중단에 대해 책임을 지지 않습니다.<br><br>
제10조 (분쟁해결)<br>
회사와 회원 간 분쟁에 대하여는 대한민국 법을 적용하며, 관할 법원은 민사소송법상 관할 법원으로 합니다.<br><br>
(시행일) 본 약관은 2026년 3월 29일부터 시행됩니다.`
    },
    privacy: {
        title: '개인정보 수집 및 이용동의',
        body: `픽스(PIX)는 이용자의 개인정보보호를 중요시하며, 『개인정보보호법』 및 『정보통신망 이용촉진 및 정보보호 등에 관한 법률』을 준수합니다.<br><br>
제1조 (수집하는 개인정보 항목)<br>
· (필수) 닉네임, 이메일주소, 비밀번호<br>
· (선택) 생년월일, 성별<br>
· (자동 수집) IP주소, 서비스 이용기록, 접속 로그<br><br>
제2조 (개인정보 수집 및 이용목적)<br>
1. 회원 식별 및 본인 확인, 부정이용 방지<br>
2. 서비스 제공 및 운영<br>
3. 고지사항 전달 및 민원 처리<br><br>
제3조 (개인정보 보유 및 이용기간)<br>
· 회원 탈퇴 시까지 보유 후 즉시 파기<br>
· 단, 관련 법령에 따라 일정 기간 보관이 필요한 경우 해당 기간 동안 보관<br>
· 접속 로그: 통신비밀보호법에 따라 3개월 보관<br><br>
제4조 (개인정보 제3자 제공)<br>
회사는 이용자의 사전 동의 없이 개인정보를 제3자에게 제공하지 않습니다. 다만, 법률에 특별한 규정이 있는 경우는 예외로 합니다.<br><br>
제5조 (이용자의 권리)<br>
이용자는 언제든지 본인의 개인정보 열람, 정정, 삭제, 처리정지를 요구할 수 있습니다.<br><br>
(시행일) 본 방침은 2026년 3월 29일부터 적용됩니다.`
    },
    youth: {
        title: '청소년보호정책',
        body: `픽스(PIX)는 청소년 유해정보로부터 청소년을 보호하고 건전한 인격체로 성장할 수 있도록 『정보통신망이용촉진 및 정보보호 등에 관한 법률』 및 『청소년보호법』에 근거하여 청소년보호정책을 수립·시행합니다.<br><br>
1. 청소년 보호를 위한 기본 원칙<br>
픽스는 청소년이 정신적·신체적으로 유해한 환경으로부터 보호받을 수 있도록 노력하며, 안전하게 서비스를 이용할 수 있는 환경을 조성합니다.<br><br>
2. 유해정보에 대한 접근 제한<br>
청소년 유해매체물에 대해 인증장치를 마련하여 청소년이 유해정보에 노출되지 않도록 사전예방 조치를 취합니다.<br><br>
3. 이용자 인식 제고<br>
서비스 이용약관을 통해 불건전한 행위 시 이용 제한 또는 민·형사상 책임이 발생할 수 있음을 고지합니다.<br><br>
4. 유해정보 피해상담 및 고충처리<br>
청소년 유해정보로 인한 피해상담 및 고충처리를 위한 담당자를 지정하여 운영합니다. 문의는 서비스 내 제휴·문의 채널을 통해 접수하실 수 있습니다.<br><br>
5. 본 정책은 2026년 3월 29일부터 적용됩니다.`
    },
    marketing: {
        title: '마케팅 목적의 개인정보 수집 및 이용 동의',
        body: `픽스(PIX)는 아래와 같이 마케팅 목적의 개인정보 수집 및 이용에 대해 안내드립니다.<br><br>
수집 항목: 이메일주소<br>
수집 목적: 이벤트, 혜택, 신규 기능 안내 등 프로모션 정보 발송<br>
보유 기간: 동의 철회 시까지<br><br>
※ 본 동의는 선택사항이며, 동의하지 않아도 서비스 이용에 불이익이 없습니다.<br>
※ 마케팅 수신 동의는 마이페이지에서 언제든지 철회할 수 있습니다.<br><br>
※ 주의: 홍보·마케팅에 대한 개인정보 이용 동의와 광고 수신 동의는 별개입니다. 본 동의는 개인정보 수집·이용에 관한 동의이며, 실제 광고 수신 여부는 별도로 설정하실 수 있습니다.`
    }
};

function openTermsModal(type) {
    const content = termsContents[type];
    if (!content) return;
    termsModalTitle.textContent = content.title;
    termsModalBody.innerHTML = content.body;
    termsModal.style.display = 'flex';
}

document.getElementById('view-service-btn').addEventListener('click', () => openTermsModal('service'));
document.getElementById('view-privacy-btn').addEventListener('click', () => openTermsModal('privacy'));
document.getElementById('view-youth-btn').addEventListener('click', () => openTermsModal('youth'));
document.getElementById('view-marketing-btn').addEventListener('click', () => openTermsModal('marketing'));

termsModalClose.addEventListener('click', () => termsModal.style.display = 'none');
termsModal.addEventListener('click', (e) => { if (e.target === termsModal) termsModal.style.display = 'none'; });
