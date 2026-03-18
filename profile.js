
import { auth, db, storage } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { doc, updateDoc, getDoc, collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
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
    document.querySelectorAll('.sidebar-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            showTab(tab.dataset.tab);
        });
    });
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
async function loadMyPosts() {
    const user = auth.currentUser;
    if (!user) return;
    const container = document.getElementById('my-posts-list');
    if (!container) return;
    container.innerHTML = '<p class="text-slate-400">불러오는 중...</p>';
    const q = query(collection(db, 'questions'), where('creatorId', '==', user.uid), orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
    const snap = await getDocs(q);
    if (snap.empty) { container.innerHTML = '<p class="text-slate-400">작성한 글이 없습니다.</p>'; return; }
    container.innerHTML = '';
    snap.forEach(docSnap => {
        const d = docSnap.data();
        const badge = d.type === 'superquiz' ? 'TOPIC' : d.type === 'quiz' ? 'PICK' : 'POST';
        const item = document.createElement('a');
        item.href = `view.html?id=${docSnap.id}`;
        item.className = 'block border rounded-lg px-4 py-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition';
        item.innerHTML = `<div class="flex items-center gap-2"><span class="text-xs font-bold text-[#169976]">[${badge}]</span><span class="flex-1 truncate">${d.title || '제목 없음'}</span><span class="text-xs text-slate-400">👁 ${d.views || 0}</span><span class="text-xs text-slate-400">♥ ${d.likesCount || 0}</span></div>`;
        container.appendChild(item);
    });
}

// 내 투표 - questions/{id}/userVotes/{uid} 구조로 조회
async function loadMyVotes() {
    const user = auth.currentUser;
    if (!user) return;
    const container = document.getElementById('my-votes-list');
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
        item.href = `view.html?id=${v.postId}`;
        item.className = 'block border rounded-lg px-4 py-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition';
        item.innerHTML = `<div class="flex items-center gap-2"><span class="flex-1 truncate">${v.title}</span><span class="text-xs text-[#169976] font-semibold">${v.selectedOption || ''}</span></div>`;
        container.appendChild(item);
    });
}

// 내 댓글 - questions/{id}/comments 구조로 조회
async function loadMyComments() {
    const user = auth.currentUser;
    if (!user) return;
    const container = document.getElementById('my-comments-list');
    if (!container) return;
    container.innerHTML = '<p class="text-slate-400">불러오는 중...</p>';
    const postsSnap = await getDocs(query(collection(db, 'questions'), orderBy('createdAt', 'desc'), limit(100)));
    const results = [];
    await Promise.all(postsSnap.docs.map(async postDoc => {
        const commentsSnap = await getDocs(query(collection(db, `questions/${postDoc.id}/comments`), where('userId', '==', user.uid)));
        commentsSnap.forEach(c => {
            results.push({ postId: postDoc.id, postTitle: postDoc.data().title || '', content: c.data().content || '' });
        });
    }));
    if (results.length === 0) { container.innerHTML = '<p class="text-slate-400">작성한 댓글이 없습니다.</p>'; return; }
    container.innerHTML = '';
    results.slice(0, PAGE_SIZE).forEach(c => {
        const item = document.createElement('a');
        item.href = `view.html?id=${c.postId}`;
        item.className = 'block border rounded-lg px-4 py-3 bg-slate-50 dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 transition';
        item.innerHTML = `<div class="flex items-center gap-2"><span class="flex-1 truncate">${c.content}</span><span class="text-xs text-slate-400 flex-shrink-0">→ ${c.postTitle.substring(0, 15)}...</span></div>`;
        container.appendChild(item);
    });
}

// 좋아요한 글 - questions/{id}/likes/{uid} 구조로 조회
async function loadMyLikes() {
    const user = auth.currentUser;
    if (!user) return;
    const container = document.getElementById('my-likes-list');
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
        item.href = `view.html?id=${l.postId}`;
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
        msg.textContent = '닉네임이 변경되었습니다!';
        msg.className = 'text-sm text-center text-[#169976]';
        document.getElementById('profile-name')?.textContent && (document.getElementById('profile-name').textContent = newNickname);
    };
}

// 로그아웃
document.getElementById('logout-link')?.addEventListener('click', async (e) => {
    e.preventDefault();
    const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
    await signOut(auth);
    window.location.href = 'quiz.html';
});

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
        window.location.href = 'quiz.html';
    } catch (error) {
        alert('탈퇴 처리 중 오류가 발생했습니다. 재로그인 후 다시 시도해주세요.');
    }
});

// 초기화
onAuthStateChanged(auth, (user) => {
    if (user) {
        initTabs();
    } else {
        // 프로필 카드 영역을 로그인 필요 메시지로 교체
        const profileCard = document.querySelector('.bg-white.dark\\:bg-slate-800.rounded-xl.shadow.p-6.mb-6');
        if (profileCard) {
            profileCard.innerHTML = `
                <div class="text-center py-4">
                    <p class="text-black-500 text-xl mb-80">마이페이지 조회는 로그인이 필요합니다.</p>
                    <button onclick="document.getElementById('login-modal-button').click()" 
                        class="px-6 py-2 bg-[#169976] text-white rounded-lg font-semibold hover:opacity-90 transition">
                        로그인
                    </button>
                </div>`;
        }
        // 탭 콘텐츠 영역도 숨김
        const contentCard = document.querySelector('.bg-white.dark\\:bg-slate-800.rounded-xl.shadow.p-6.min-h-64');
        if (contentCard) contentCard.classList.add('hidden');
        // 사이드바도 숨김
        const sidebar = document.querySelector('.col-span-3');
        if (sidebar) sidebar.classList.add('hidden');
    }
});
