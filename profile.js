
import { auth, db, storage } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { doc, updateDoc, getDoc, collection, query, where, orderBy, limit, startAfter, getDocs, writeBatch, getCountFromServer } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { compressImage } from "./image-compress.js";

const PAGE_SIZE = 10;

// 프로필 사진 변경
const changePhotoBtn = document.getElementById("change-photo-btn");
const profileUpload = document.getElementById("profile-upload");

if (changePhotoBtn && profileUpload) {
    changePhotoBtn.addEventListener("click", () => { profileUpload.click(); });
}

profileUpload.addEventListener("change", async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) { alert("프로필 사진은 3MB 이하만 업로드 가능합니다."); return; }
    if (!file.type.startsWith("image/")) { alert("이미지 파일만 업로드 가능합니다."); return; }
    const user = auth.currentUser;
    if (!user) { alert("로그인이 필요합니다."); return; }
    try {
        const compressedFile = await compressImage(file);
        const storageRef = ref(storage, "profileImages/" + user.uid + "/profile.jpg");
        await uploadBytes(storageRef, compressedFile);
        const downloadURL = await getDownloadURL(storageRef);
        const userRef = doc(db, "userProfiles", user.uid);
        await updateDoc(userRef, { photoURL: downloadURL });
        const profileImage = document.getElementById("profile-image");
        if (profileImage) profileImage.src = downloadURL;
        localStorage.setItem("userAvatar", downloadURL);
        alert("프로필 사진이 변경되었습니다.");
    } catch (error) {
        alert("사진 업로드 중 오류가 발생했습니다.");
    }
});

// 탭 전환
function initTabs() {
    document.querySelectorAll('.my-tab-btn').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            document.querySelectorAll('.my-tab-btn').forEach(b => b.classList.remove('active'));
            tab.classList.add('active');
            showTab(tab.dataset.tab);
        });
    });
    // 첫 탭 자동 로드
    showTab('my-posts');
}

function showTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('tab-default')?.classList.add('hidden');
    const target = document.getElementById('tab-' + tabName);
    if (target) target.classList.remove('hidden');
    if (tabName === 'my-posts') loadMyPosts();
    if (tabName === 'my-votes') loadMyVotes();
    if (tabName === 'my-comments') loadMyComments();
    if (tabName === 'my-likes') loadMyLikes();
    if (tabName === 'my-points') loadMyPoints();
    if (tabName === 'change-nickname') initNicknameChange();
}

// 내 퀴즈/게시글
let _myPostsPage = 0;
let _myPostsCursors = [null];
let _myPostsTotalPages = 0;

async function loadMyPosts(page = 0) {
    const user = auth.currentUser;
    if (!user) return;
    const container = document.getElementById('tab-my-posts');
    if (!container) return;
    container.innerHTML = '<p class="text-slate-400">불러오는 중...</p>';

    // 첫 로드 시 전체 수 조회
    if (page === 0) {
        _myPostsCursors = [null];
        const countSnap = await getCountFromServer(query(collection(db, 'questions'), where('creatorId', '==', user.uid)));
        _myPostsTotalPages = Math.ceil(countSnap.data().count / PAGE_SIZE);
    }

    // 중간 커서가 없으면 순서대로 채우기
    for (let i = 0; i < page; i++) {
        if (!_myPostsCursors[i + 1]) {
            const prevCursor = _myPostsCursors[i];
            const fillQ = prevCursor
                ? query(collection(db, 'questions'), where('creatorId', '==', user.uid), orderBy('createdAt', 'desc'), startAfter(prevCursor), limit(PAGE_SIZE))
                : query(collection(db, 'questions'), where('creatorId', '==', user.uid), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
            const fillSnap = await getDocs(fillQ);
            if (fillSnap.docs.length > 0) {
                _myPostsCursors[i + 1] = fillSnap.docs[fillSnap.docs.length - 1];
            }
        }
    }

    let q;
    const cursor = _myPostsCursors[page];
    if (cursor) {
        q = query(collection(db, 'questions'), where('creatorId', '==', user.uid), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE));
    } else {
        q = query(collection(db, 'questions'), where('creatorId', '==', user.uid), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    }

    const snap = await getDocs(q);
    container.innerHTML = '';

    if (snap.empty && page === 0) {
        container.innerHTML = '<p class="text-slate-400">작성한 글이 없습니다.</p>';
        return;
    }

    snap.forEach(docSnap => {
        const d = docSnap.data();
        const badge = d.type === 'pix' ? 'PIX' : d.type === 'quiz' ? 'PICK' : d.type === 'superquiz' ? 'TOPIC' : 'POST';
        const item = document.createElement('a');
        item.href = `post.html?id=${docSnap.id}`;
        item.className = 'block border rounded-lg px-4 py-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition';
        item.innerHTML = `<div class="flex items-center gap-2"><span class="text-xs font-bold text-[#169976]">[${badge}]</span><span class="flex-1 truncate">${d.title || '제목 없음'}</span><span class="text-xs text-slate-400">👁 ${d.views || 0}</span><span class="text-xs text-slate-400">♥ ${d.likesCount || 0}</span></div>`;
        container.appendChild(item);
    });

    // 커서 저장
    if (snap.docs.length > 0) {
        _myPostsCursors[page + 1] = snap.docs[snap.docs.length - 1];
    }
    _myPostsPage = page;

    // 페이지 버튼
    if (_myPostsTotalPages <= 1) return;
    const GROUP_SIZE = 10;
    const currentGroup = Math.floor(page / GROUP_SIZE);
    const groupStart = currentGroup * GROUP_SIZE;
    const groupEnd = Math.min(groupStart + GROUP_SIZE, _myPostsTotalPages);

    const nav = document.createElement('div');
    nav.className = 'flex justify-center items-center gap-1 mt-4 flex-wrap';

    if (currentGroup > 0) {
        const prevGroupBtn = document.createElement('button');
        prevGroupBtn.textContent = '〈';
        prevGroupBtn.className = 'w-8 h-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
        prevGroupBtn.addEventListener('click', () => loadMyPosts(groupStart - GROUP_SIZE));
        nav.appendChild(prevGroupBtn);
    }

    for (let i = groupStart; i < groupEnd; i++) {
        const numBtn = document.createElement('button');
        numBtn.textContent = i + 1;
        const isActive = i === page;
        numBtn.className = isActive
            ? 'w-8 h-8 text-sm rounded-lg bg-[#169976] text-white font-bold'
            : 'w-8 h-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
        if (!isActive) numBtn.addEventListener('click', () => loadMyPosts(i));
        nav.appendChild(numBtn);
    }

    if (groupEnd < _myPostsTotalPages) {
        const nextGroupBtn = document.createElement('button');
        nextGroupBtn.textContent = '〉';
        nextGroupBtn.className = 'w-8 h-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
        nextGroupBtn.addEventListener('click', () => loadMyPosts(groupEnd));
        nav.appendChild(nextGroupBtn);
    }

    container.appendChild(nav);
}

// 내 투표 - questions/{id}/userVotes/{uid} 구조로 조회
async function loadMyVotes() {
    const user = auth.currentUser;
    if (!user) return;
    const container = document.getElementById('tab-my-votes');
    if (!container) return;
    container.innerHTML = '<p class="text-slate-400">불러오는 중...</p>';
    const postsSnap = await getDocs(query(collection(db, 'questions'), orderBy('createdAt', 'desc'), limit(100)));
    const results = [];
    await Promise.all(postsSnap.docs.map(async postDoc => {
        const voteRef = doc(db, `questions/${postDoc.id}/userVotes/${user.uid}`);
        const voteSnap = await getDoc(voteRef);
        if (voteSnap.exists()) {
            results.push({ postId: postDoc.id, title: postDoc.data().title || '제목 없음', selectedOption: voteSnap.data().selectedOption });
        }
    }));
    if (results.length === 0) { container.innerHTML = '<p class="text-slate-400">투표 기록이 없습니다.</p>'; return; }
    container.innerHTML = '';
    results.forEach(v => {
        const item = document.createElement('a');
        item.href = `post.html?id=${v.postId}`;
        item.className = 'block border rounded-lg px-4 py-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition';
        item.innerHTML = `<div class="flex items-center gap-2"><span class="flex-1 truncate">${v.title}</span><span class="text-xs text-[#169976] font-semibold">${v.selectedOption || ''}</span></div>`;
        container.appendChild(item);
    });
}

// 내 댓글
let _myCommentsPage = 0;
let _myCommentsCursors = [null];
let _myCommentsTotalPages = 0;

async function loadMyComments(page = 0) {
    const user = auth.currentUser;
    if (!user) return;
    const container = document.getElementById('tab-my-comments');
    if (!container) return;
    container.innerHTML = '<p class="text-slate-400">불러오는 중...</p>';

    if (page === 0) {
        _myCommentsCursors = [null];
        const countSnap = await getCountFromServer(query(collection(db, 'allComments'), where('uid', '==', user.uid)));
        _myCommentsTotalPages = Math.ceil(countSnap.data().count / PAGE_SIZE);
    }

    // 중간 커서 채우기
    for (let i = 0; i < page; i++) {
        if (!_myCommentsCursors[i + 1]) {
            const prevCursor = _myCommentsCursors[i];
            const fillQ = prevCursor
                ? query(collection(db, 'allComments'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'), startAfter(prevCursor), limit(PAGE_SIZE))
                : query(collection(db, 'allComments'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
            const fillSnap = await getDocs(fillQ);
            if (fillSnap.docs.length > 0) _myCommentsCursors[i + 1] = fillSnap.docs[fillSnap.docs.length - 1];
        }
    }

    const cursor = _myCommentsCursors[page];
    const q = cursor
        ? query(collection(db, 'allComments'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'), startAfter(cursor), limit(PAGE_SIZE))
        : query(collection(db, 'allComments'), where('uid', '==', user.uid), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));

    const snap = await getDocs(q);
    container.innerHTML = '';

    if (snap.empty && page === 0) { container.innerHTML = '<p class="text-slate-400">작성한 댓글이 없습니다.</p>'; return; }

    snap.forEach(docSnap => {
        const c = docSnap.data();
        const item = document.createElement('a');
        item.href = c.questionId ? `post.html?id=${c.questionId}` : '#';
        item.className = 'block border rounded-lg px-4 py-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition';
        item.innerHTML = `<div class="flex items-center gap-2"><span class="flex-1 truncate">${c.text || ''}</span><span class="text-xs text-slate-400 flex-shrink-0">→ ${(c.questionTitle || '').substring(0, 15)}...</span></div>`;
        container.appendChild(item);
    });

    if (snap.docs.length > 0) _myCommentsCursors[page + 1] = snap.docs[snap.docs.length - 1];
    _myCommentsPage = page;

    if (_myCommentsTotalPages <= 1) return;
    const GROUP_SIZE = 10;
    const currentGroup = Math.floor(page / GROUP_SIZE);
    const groupStart = currentGroup * GROUP_SIZE;
    const groupEnd = Math.min(groupStart + GROUP_SIZE, _myCommentsTotalPages);

    const nav = document.createElement('div');
    nav.className = 'flex justify-center items-center gap-1 mt-4 flex-wrap';

    if (currentGroup > 0) {
        const prevGroupBtn = document.createElement('button');
        prevGroupBtn.textContent = '〈';
        prevGroupBtn.className = 'w-8 h-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
        prevGroupBtn.addEventListener('click', () => loadMyComments(groupStart - GROUP_SIZE));
        nav.appendChild(prevGroupBtn);
    }

    for (let i = groupStart; i < groupEnd; i++) {
        const numBtn = document.createElement('button');
        numBtn.textContent = i + 1;
        const isActive = i === page;
        numBtn.className = isActive
            ? 'w-8 h-8 text-sm rounded-lg bg-[#169976] text-white font-bold'
            : 'w-8 h-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
        if (!isActive) numBtn.addEventListener('click', () => loadMyComments(i));
        nav.appendChild(numBtn);
    }

    if (groupEnd < _myCommentsTotalPages) {
        const nextGroupBtn = document.createElement('button');
        nextGroupBtn.textContent = '〉';
        nextGroupBtn.className = 'w-8 h-8 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700';
        nextGroupBtn.addEventListener('click', () => loadMyComments(groupEnd));
        nav.appendChild(nextGroupBtn);
    }

    container.appendChild(nav);
}


// 좋아요한 글 - questions/{id}/likes/{uid} 구조로 조회
async function loadMyLikes() {
    const user = auth.currentUser;
    if (!user) return;
    const container = document.getElementById('tab-my-likes');
    if (!container) return;
    container.innerHTML = '<p class="text-slate-400">불러오는 중...</p>';
    const postsSnap = await getDocs(query(collection(db, 'questions'), orderBy('createdAt', 'desc'), limit(100)));
    const results = [];
    await Promise.all(postsSnap.docs.map(async postDoc => {
        const likeRef = doc(db, `questions/${postDoc.id}/likes/${user.uid}`);
        const likeSnap = await getDoc(likeRef);
        if (likeSnap.exists()) results.push({ postId: postDoc.id, title: postDoc.data().title || '제목 없음' });
    }));
    if (results.length === 0) { container.innerHTML = '<p class="text-slate-400">좋아요한 글이 없습니다.</p>'; return; }
    container.innerHTML = '';
    results.forEach(l => {
        const item = document.createElement('a');
        item.href = `post.html?id=${l.postId}`;
        item.className = 'block border rounded-lg px-4 py-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition';
        item.innerHTML = `<div class="flex items-center gap-2"><span class="flex-1 truncate">${l.title}</span><span class="text-red-400">♥</span></div>`;
        container.appendChild(item);
    });
}

// 내 포인트
async function loadMyPoints() {
    const user = auth.currentUser;
    if (!user) return;
    const container = document.getElementById('my-points-summary');
    if (!container) return;
    const snap = await getDoc(doc(db, 'userProfiles', user.uid));
    const points = snap.exists() ? (snap.data().points || 0) : 0;
    container.innerHTML = `<p class="text-2xl font-bold text-[#169976]">${points} P</p><p class="text-slate-400 text-sm mt-1">현재 보유 포인트</p>`;
}

// 닉네임 변경 (1년 1회 제한)
function initNicknameChange() {
    const btn = document.getElementById('change-nickname-btn');
    const input = document.getElementById('new-nickname-input');
    const msg = document.getElementById('nickname-change-msg');
    if (!btn || !input || !msg) return;
    btn.onclick = async () => {
        const user = auth.currentUser;
        if (!user) return;
        const newNickname = input.value.trim();
        if (!newNickname || newNickname.length < 2) { msg.textContent = '닉네임은 2자 이상이어야 합니다.'; msg.className = 'text-sm text-center text-red-500'; return; }
        const userRef = doc(db, 'userProfiles', user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
            const data = snap.data();
            if (data.nicknameChangedAt) {
                const lastChanged = data.nicknameChangedAt.toDate();
                const oneYear = 365 * 24 * 60 * 60 * 1000;
                if (Date.now() - lastChanged.getTime() < oneYear) {
                    const next = new Date(lastChanged.getTime() + oneYear);
                    msg.textContent = `변경 가능일: ${next.toLocaleDateString('ko-KR')}`;
                    msg.className = 'text-sm text-center text-red-500';
                    return;
                }
            }
        }
        await updateDoc(userRef, { displayName: newNickname, nicknameChangedAt: new Date() });

        // 기존 게시글 creatorName 일괄 업데이트 (백그라운드)
        (async () => {
            try {
                const postsSnap = await getDocs(query(collection(db, 'questions'), where('creatorId', '==', user.uid)));
                if (!postsSnap.empty) {
                    const batch = writeBatch(db);
                    postsSnap.forEach(d => batch.update(d.ref, { creatorName: newNickname }));
                    await batch.commit();
                }
            } catch (e) { console.error('게시글 닉네임 업데이트 실패', e); }
        })();

        msg.textContent = '닉네임이 변경되었습니다!';
        msg.className = 'text-sm text-center text-[#169976]';
        document.getElementById('profile-name')?.textContent && (document.getElementById('profile-name').textContent = newNickname);
    };

    // 비밀번호 변경 섹션 (자체 계정만 표시)
    const user = auth.currentUser;
    const isPasswordUser = user?.providerData?.some(p => p.providerId === 'password');
    const pwSection = document.getElementById('password-change-section');
    if (pwSection) pwSection.classList.toggle('hidden', !isPasswordUser);

    const pwBtn = document.getElementById('change-password-btn');
    const pwCurrent = document.getElementById('current-password-input');
    const pwNew = document.getElementById('new-password-input');
    const pwConfirm = document.getElementById('confirm-password-input');
    const pwMsg = document.getElementById('password-change-msg');
    if (!pwBtn) return;

    pwBtn.onclick = async () => {
        const u = auth.currentUser;
        if (!u) return;
        const current = pwCurrent?.value.trim();
        const newPw = pwNew?.value.trim();
        const confirm = pwConfirm?.value.trim();
        if (!current || !newPw || !confirm) { pwMsg.textContent = '모든 항목을 입력해주세요.'; pwMsg.className = 'text-sm text-center text-red-500'; return; }
        if (newPw.length < 8) { pwMsg.textContent = '새 비밀번호는 8자 이상이어야 합니다.'; pwMsg.className = 'text-sm text-center text-red-500'; return; }
        if (newPw !== confirm) { pwMsg.textContent = '새 비밀번호가 일치하지 않습니다.'; pwMsg.className = 'text-sm text-center text-red-500'; return; }
        try {
            const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
            const credential = EmailAuthProvider.credential(u.email, current);
            await reauthenticateWithCredential(u, credential);
            await updatePassword(u, newPw);
            pwMsg.textContent = '비밀번호가 변경되었습니다!';
            pwMsg.className = 'text-sm text-center text-[#169976]';
            if (pwCurrent) pwCurrent.value = '';
            if (pwNew) pwNew.value = '';
            if (pwConfirm) pwConfirm.value = '';
        } catch (e) {
            if (e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
                pwMsg.textContent = '현재 비밀번호가 올바르지 않습니다.';
            } else {
                pwMsg.textContent = '오류가 발생했습니다. 다시 시도해주세요.';
            }
            pwMsg.className = 'text-sm text-center text-red-500';
        }
    };
}

// 로그아웃은 onAuthStateChanged에서 동적으로 처리하므로 여기서는 제거
// (비로그인 시 return으로 막아버리는 문제 방지)

// 회원 탈퇴
document.getElementById('withdraw-link')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const confirmed = confirm('정말 탈퇴하시겠습니까?\n탈퇴 시 모든 데이터가 삭제되며 복구할 수 없습니다.');
    if (!confirmed) return;
    const user = auth.currentUser;
    if (!user) return;
    try {
        await updateDoc(doc(db, 'userProfiles', user.uid), { deleted: true, deletedAt: new Date() });
        await user.delete();
        alert('탈퇴가 완료되었습니다.');
        window.location.href = 'index.html';
    } catch (error) {
        alert('탈퇴 처리 중 오류가 발생했습니다. 재로그인 후 다시 시도해주세요.');
    }
});

// 초기화
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 로그인 버튼이 남아있으면 로그아웃 버튼으로 복구 후 새로고침
        const logoutBtn = document.getElementById('logout-link');
        if (logoutBtn && logoutBtn.textContent === '로그인') {
            window.location.reload();
            return;
        }
        // 로그아웃 버튼 이벤트 연결
        if (logoutBtn) {
            logoutBtn.textContent = '로그아웃';
            logoutBtn.className = 'text-sm text-slate-400 hover:text-slate-600 dark:hover:text-slate-200';
            logoutBtn.onclick = async (e) => {
                e.preventDefault();
                const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
                await signOut(auth);
                window.location.href = 'index.html';
            };
        }
        initTabs();
        // 프로필 정보 로드
        const profileNameEl = document.getElementById('profile-name');
        const profilePointsEl = document.getElementById('profile-points');
        const profileImageEl = document.getElementById('profile-image');
        if (profileNameEl || profilePointsEl || profileImageEl) {
            const userRef = doc(db, 'userProfiles', user.uid);
            const snap = await getDoc(userRef);
            if (snap.exists()) {
                const data = snap.data();
                if (profileNameEl) profileNameEl.textContent = data.displayName || '사용자';
                if (profilePointsEl) profilePointsEl.textContent = data.points || 0;
                if (profileImageEl && data.photoURL) profileImageEl.src = data.photoURL;
            }
        }
    } else {
        // 헤더 버튼을 로그인으로 변경 (index.html 스타일)
        const logoutBtn = document.getElementById('logout-link');
        if (logoutBtn) {
            logoutBtn.textContent = '로그인';
            logoutBtn.className = 'text-sm font-bold px-3 py-1.5 rounded-lg bg-[#169976] text-white cursor-pointer';
            logoutBtn.onclick = (e) => {
                e.preventDefault();
                const modal = document.getElementById('login-modal');
                if (modal) modal.style.display = 'flex';
            };
        }

        // content-area guest 모드
        const contentArea = document.getElementById('content-area');
        if (contentArea) contentArea.classList.add('guest-mode');

        // 프로필 카드 + 탭 전체를 로그인 필요 메시지로 교체
        if (contentArea) {
            contentArea.innerHTML = `
                <div class="flex flex-col items-center justify-center py-16 px-4">
                    <i class="fas fa-user-circle text-slate-300 text-6xl mb-4"></i>
                    <p class="text-slate-500 text-base">로그인이 필요합니다.</p>
                </div>`;
        }

    }
});
