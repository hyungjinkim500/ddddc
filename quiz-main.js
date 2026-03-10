import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, runTransaction, onSnapshot, getDoc, setDoc, deleteDoc, addDoc, serverTimestamp, query, orderBy, limit, getDocs, where, startAfter, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const categoryPageState = {};

const DEBUG = false;

const realtimePageState = {
  lastDoc: null,
  loading: false,
  hasMore: true
};

const params = new URLSearchParams(window.location.search);
const quizIdFromUrl = params.get("id");

if (DEBUG) console.log("Quiz ID from URL:", quizIdFromUrl);

async function handleSearch(keyword) {
    const trimmedKeyword = keyword.trim();
    if (trimmedKeyword) {
        try {
            const logRef = doc(db, "searchLogs", trimmedKeyword);
            await setDoc(logRef, { 
                keyword: trimmedKeyword,
                count: increment(1)
            }, { merge: true });
        } catch (error) {
            console.error("Error logging search:", error);
        }
        window.location.href = `search.html?q=${encodeURIComponent(trimmedKeyword)}`;
    }
}

async function loadTrendingKeywords() {
    const container = document.getElementById("trending-keywords");
    if (!container) return;

    function formatKeyword(text) {
        if (!text) return "";
        if (text.length > 8) {
            return text.substring(0, 8) + "...";
        }
        return text;
    }

    try {
        const q = query(collection(db, "searchLogs"), orderBy("count", "desc"), limit(10));
        const snapshot = await getDocs(q);

        const keywords = [];
        snapshot.forEach(doc => {
            keywords.push(doc.data().keyword);
        });

        const limitedKeywords = keywords.slice(0, 10);

        container.innerHTML = ""; 

        limitedKeywords.forEach(keyword => {
            const button = document.createElement("button");
            button.className = "text-sm bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full hover:bg-teal hover:text-white transition";
            button.textContent = `#${formatKeyword(keyword)}`;
            button.onclick = () => handleSearch(keyword); 
            container.appendChild(button);
        });

    } catch (error) {
        console.error("Error loading trending keywords:", error);
    }
}


async function loadCategories() {
    const q = query(
        collection(db, "categories"),
        orderBy("order")
    );

    const snapshot = await getDocs(q);

    const categories = [];

    snapshot.forEach(doc => {
        categories.push({
            id: doc.id,
            ...doc.data()
        });
    });

    if (DEBUG) console.log("Loaded categories:", categories);

    return categories;
}

async function renderCategoryNavbar() {
    const navbar = document.getElementById("category-tabs");
    if (!navbar) return;

    const params = new URLSearchParams(window.location.search);
    const currentCategory = params.get("cat");
    const isQuizPage = window.location.pathname.includes("quiz.html");

    const categories = await loadCategories();
    navbar.innerHTML = "";

    const default_class = "tab-button px-4 py-2 rounded-full text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700";
    const active_class = "tab-button px-4 py-2 rounded-full text-sm font-medium bg-emerald-500 text-white";

    const homeButton = document.createElement("a");
    homeButton.href = "quiz.html";
    homeButton.textContent = "홈";
    homeButton.className = isQuizPage ? active_class : default_class;
    navbar.appendChild(homeButton);

    categories.forEach(category => {
        const button = document.createElement("a");
        button.href = `category.html?cat=${category.id}`;
        button.textContent = category.name;

        if (currentCategory === category.id) {
            button.className = active_class;
            homeButton.className = default_class; 
        } else {
            button.className = default_class;
        }
        navbar.appendChild(button);
    });
    navbar.classList.remove("invisible");
}

async function renderCategorySections() {
    const categories = await loadCategories();
    const container = document.getElementById("category-sections");
    if (!container) return;

    container.innerHTML = "";

    for (const category of categories) {
        const section = document.createElement("section");
        section.className = "mb-12";

        const header = document.createElement("div");
        header.className = "flex items-center justify-between mb-4";

        const title = document.createElement("h2");
        title.className = "text-xl font-bold";
        title.textContent = category.name + " 퀴즈";

        const controls = document.createElement("div");
        controls.className = "flex gap-2";

        const leftBtn = document.createElement("button");
        leftBtn.className = "slider-left w-8 h-8 rounded-full border flex items-center justify-center";
        leftBtn.innerHTML = "‹";

        const rightBtn = document.createElement("button");
        rightBtn.className = "slider-right w-8 h-8 rounded-full border flex items-center justify-center";
        rightBtn.innerHTML = "›";

        controls.appendChild(leftBtn);
        controls.appendChild(rightBtn);

        header.appendChild(title);
        header.appendChild(controls);

        const slider = document.createElement("div");
        slider.className = "flex gap-4 overflow-hidden pb-2";
        slider.id = "category-slider-" + category.id;

        const quizzes = await loadQuizzesByCategory(category.id);
        quizzes.forEach(quiz => {
            if (!slider.querySelector(`[data-quiz-id="${quiz.id}"]`)) {
                const card = createQuizCard(quiz.id, quiz);
                card.dataset.quizId = quiz.id;
                card.style.width = "300px";
                card.style.flexShrink = "0";
                slider.appendChild(card);
            }
        });

        let currentIndex = 0;
        const moveStep = 2;
        const cardWidth = 316;

        rightBtn.onclick = async () => {
            currentIndex += moveStep;
            slider.scrollTo({
                left: currentIndex * cardWidth,
                behavior: "smooth"
            });

            if (slider.scrollLeft + slider.clientWidth >= slider.scrollWidth - 400 && categoryPageState[category.id].hasMore) {
                const newQuizzes = await loadQuizzesByCategory(category.id);
                newQuizzes.forEach(quiz => {
                    if (!slider.querySelector(`[data-quiz-id="${quiz.id}"]`)) {
                        const card = createQuizCard(quiz.id, quiz);
                        card.dataset.quizId = quiz.id;
                        card.style.width = "300px";
                        card.style.flexShrink = "0";
                        slider.appendChild(card);
                    }
                });
            }
        };

        leftBtn.onclick = () => {
            currentIndex = Math.max(0, currentIndex - moveStep);
            slider.scrollTo({
                left: currentIndex * cardWidth,
                behavior: "smooth"
            });
        };

        section.appendChild(header);
        section.appendChild(slider);

        container.appendChild(section);
    }
}

async function loadQuizzesByCategory(categoryId) {
    if (!categoryPageState[categoryId]) {
        categoryPageState[categoryId] = {
            lastDoc: null,
            loading: false,
            hasMore: true
        };
    }

    const state = categoryPageState[categoryId];

    if (state.loading || !state.hasMore) return [];

    state.loading = true;

    let q;
    if (state.lastDoc) {
        q = query(
            collection(db, "questions"),
            where("category", "==", categoryId),
            startAfter(state.lastDoc),
            limit(6)
        );
    } else {
        q = query(
            collection(db, "questions"),
            where("category", "==", categoryId),
            limit(6)
        );
    }

    const snapshot = await getDocs(q);

    const quizzes = [];

    snapshot.forEach(doc => {
        quizzes.push({
            id: doc.id,
            ...doc.data()
        });
    });

    if (snapshot.size < 6) {
        state.hasMore = false;
    }

    if (snapshot.docs.length > 0) {
        state.lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    state.loading = false;

    if (DEBUG) console.log("Loaded quizzes for category:", categoryId, quizzes.length);

    return quizzes;
}

async function loadRealtimeQuizzes() {
    if (realtimePageState.loading || !realtimePageState.hasMore) return [];

    realtimePageState.loading = true;

    let q;
    if (realtimePageState.lastDoc) {
        q = query(
            collection(db, "questions"),
            orderBy("createdAt", "desc"),
            startAfter(realtimePageState.lastDoc),
            limit(8)
        );
    } else {
        q = query(
            collection(db, "questions"),
            orderBy("createdAt", "desc"),
            limit(8)
        );
    }

    const snapshot = await getDocs(q);

    const quizzes = [];

    snapshot.forEach(doc => {
        quizzes.push({
            id: doc.id,
            ...doc.data()
        });
    });

    if (snapshot.size < 8) {
        realtimePageState.hasMore = false;
    }

    if (snapshot.docs.length > 0) {
        realtimePageState.lastDoc = snapshot.docs[snapshot.docs.length - 1];
    }

    realtimePageState.loading = false;

    return quizzes;
}

async function renderRealtimeSection() {
    const slider = document.getElementById("realtime-slider");
    if (!slider) return;

    const quizzes = await loadRealtimeQuizzes();

    quizzes.forEach(quiz => {
        if (!slider.querySelector(`[data-quiz-id="${quiz.id}"]`)) {
            const card = createQuizCard(quiz.id, quiz);
            card.dataset.quizId = quiz.id;
            card.style.width = "300px";
            card.style.flexShrink = "0";
            slider.appendChild(card);
        }
    });
}

async function loadPopularSuperQuizzes() {
    const q = query(
        collection(db, "questions"),
        where("isSuper", "==", true),
        orderBy("popularityScore", "desc"),
        limit(24)
    );

    const snapshot = await getDocs(q);

    const quizzes = [];

    snapshot.forEach(doc => {
        quizzes.push({
            id: doc.id,
            ...doc.data()
        });
    });

    return quizzes;
}

async function renderSuperQuizSection() {
    const slider = document.getElementById("super-quiz-slider");
    if (!slider) return;

    slider.innerHTML = ''; // Clear previous content

    const quizzes = await loadPopularSuperQuizzes();
    const pageSize = 4;

    const leftBtn = document.getElementById('super-slider-left');
    const rightBtn = document.getElementById('super-slider-right');

    if (quizzes.length === 0) {
        slider.innerHTML = '<p class="text-center text-slate-500 w-full">인기 슈퍼퀴즈가 없습니다.</p>';
        if(leftBtn) leftBtn.style.display = 'none';
        if(rightBtn) rightBtn.style.display = 'none';
        return;
    }

    if(leftBtn) leftBtn.style.display = 'flex';
    if(rightBtn) rightBtn.style.display = 'flex';

    for (let i = 0; i < quizzes.length; i += pageSize) {
        const page = document.createElement("div");
        page.className = "super-quiz-page";

        const chunk = quizzes.slice(i, i + pageSize);

        chunk.forEach(quiz => {
            const card = createQuizCard(quiz.id, quiz);
            page.appendChild(card);
        });

        slider.appendChild(page);
    }
}

async function loadPopularQuizzes() {
    const q = query(
        collection(db, "questions"),
        where("isSuper", "==", false),
        orderBy("popularityScore", "desc"),
        limit(24)
    );

    const snapshot = await getDocs(q);

    const quizzes = [];

    snapshot.forEach(doc => {
        quizzes.push({
            id: doc.id,
            ...doc.data()
        });
    });

    return quizzes;
}

async function renderPopularQuizSection() {
    const slider = document.getElementById("popular-quiz-slider");
    if (!slider) return;

    const quizzes = await loadPopularQuizzes();

    quizzes.forEach(quiz => {
        if (!slider.querySelector(`[data-quiz-id="${quiz.id}"]`)) {
            const card = createQuizCard(quiz.id, quiz);
            card.dataset.quizId = quiz.id;
            card.style.width = "300px";
            card.style.flexShrink = "0";
            slider.appendChild(card);
        }
    });
}

const colorMap = {
  emerald: "bg-emerald-500 hover:bg-emerald-600",
  red: "bg-red-500 hover:bg-red-600",
  slate: "bg-slate-500 hover:bg-slate-600",
  yellow: "bg-yellow-400 hover:bg-yellow-500",
  sky: "bg-sky-400 hover:bg-sky-500"
};

async function handleVote(quizId, optionId) {
    const auth = getAuth();
    const user = auth.currentUser;

    if (!user) {
        if (confirm("로그인이 필요합니다. 로그인하시겠습니까?")) {
            openModal();
        }
        return;
    }

    try {
        const quizRef = doc(db, "questions", quizId);
        const userVoteRef = doc(db, "questions", quizId, "userVotes", user.uid);

        await runTransaction(db, async (transaction) => {
            const quizDoc = await transaction.get(quizRef);
            if (!quizDoc.exists()) {
                throw "Quiz document does not exist!";
            }

            const data = quizDoc.data();
            const entryFee = data.entryFee || 0;
            const participantLimit = data.participantLimit || 0;
            const participants = data.participants || [];

            const userProfileRef = doc(db, "userProfiles", user.uid);
            const userProfileDoc = await transaction.get(userProfileRef);
            const userPoints = userProfileDoc.data()?.points || 0;

            if (participantLimit > 0 && participants.length >= participantLimit && !participants.includes(user.uid)) {
                throw "Participant limit reached";
            }

            const userVoteDoc = await transaction.get(userVoteRef);
            const voteData = data.vote ?? {};
            const updatedVotes = { ...voteData };

            let previousOptionId = null;
            if (userVoteDoc.exists()) {
                previousOptionId = userVoteDoc.data().selectedOption;
            }

            let updatedParticipants = [...participants];
            const clickedOptionId = optionId;

            if (previousOptionId === clickedOptionId) {
                // Deselecting the same option
                updatedVotes[clickedOptionId] = Math.max(0, (updatedVotes[clickedOptionId] || 0) - 1);
                transaction.delete(userVoteRef);

                if (entryFee > 0 && previousOptionId) {
                    transaction.update(userProfileRef, {
                        points: userPoints + entryFee
                    });
                }
                // Remove user from participants
                updatedParticipants = updatedParticipants.filter(uid => uid !== user.uid);

            } else {
                // Selecting a new option or switching vote
                if (previousOptionId) {
                    updatedVotes[previousOptionId] = Math.max(0, (updatedVotes[previousOptionId] || 0) - 1);
                }
                updatedVotes[clickedOptionId] = (updatedVotes[clickedOptionId] || 0) + 1;
                transaction.set(userVoteRef, { selectedOption: clickedOptionId });

                if (entryFee > 0 && !participants.includes(user.uid)) {
                    if (userPoints < entryFee) {
                        throw "Not enough points";
                    }
                    transaction.update(userProfileRef, {
                        points: userPoints - entryFee
                    });
                }

                // Add user to participants if not already there
                if (!updatedParticipants.includes(user.uid)) {
                    updatedParticipants.push(user.uid);
                }
            }

            transaction.update(quizRef, { 
                vote: updatedVotes,
                participants: updatedParticipants
            });
        });

        await updatePopularityScore(quizId);

        if (quizIdFromUrl) {
            await loadSingleQuiz(quizIdFromUrl);
        }

        if (auth.currentUser) {
            restoreUserVotes(auth.currentUser);
        }

    } catch (e) {
        console.error("Transaction failed: ", e);
        alert(`투표 처리 중 오류가 발생했습니다: ${e}`);
    }
}

async function loadSingleQuiz(quizId) {
    const container = document.getElementById("quiz-detail-container");
    if (!container) return;

    // Ensure stable UI structure
    if (!document.getElementById("detail-title")) {
        const title = document.createElement("div");
        title.id = "detail-title";
        container.appendChild(title);
    }
    if (!document.getElementById("detail-description")) {
        const description = document.createElement("div");
        description.id = "detail-description";
        container.appendChild(description);
    }
    if (!document.getElementById("detail-participation")) {
        const participation = document.createElement("div");
        participation.id = "detail-participation";
        const bar = document.createElement("div");
        bar.id = "participation-bar";
        const text = document.createElement("div");
        text.id = "participation-text";
        participation.appendChild(bar);
        participation.appendChild(text);
        container.appendChild(participation);
    }
    if (!document.getElementById("detail-results")) {
        const results = document.createElement("div");
        results.id = "detail-results";
        container.appendChild(results);
    }
    if (!document.getElementById("detail-options")) {
        const options = document.createElement("div");
        options.id = "detail-options";
        container.appendChild(options);
    }
    if (!document.getElementById("detail-actions")) {
        const actions = document.createElement("div");
        actions.id = "detail-actions";
        const likeButton = document.createElement("button");
        likeButton.id = "detail-like-button";
        const shareButton = document.createElement("button");
        shareButton.id = "detail-share-button";
        actions.appendChild(likeButton);
        actions.appendChild(shareButton);
        container.appendChild(actions);
    }
    if (!document.getElementById("detail-like-count")) {
        const likeCount = document.createElement("span");
        likeCount.id = "detail-like-count";
        const actions = document.getElementById("detail-actions");
        if(actions) actions.appendChild(likeCount);
    }

    if (!document.getElementById("comments-section")) {
        const comments = document.createElement("div");
        comments.id = "comments-section";

        const commentHeader = document.createElement('div');
        commentHeader.className = 'flex items-center gap-2 mb-2';
        commentHeader.innerHTML = '<span id="comment-count" class="text-sm text-slate-500">댓글 (0)</span>';
        comments.appendChild(commentHeader);

        const input = document.createElement("input");
        input.id = "comment-input";
        const submit = document.createElement("button");
        submit.id = "comment-submit";
        const list = document.createElement("div");
        list.id = "comment-list";
        comments.appendChild(input);
        comments.appendChild(submit);
        comments.appendChild(list);
        container.appendChild(comments);
    }

    const quizRef = doc(db, "questions", quizId);
    const quizSnap = await getDoc(quizRef);

    if (!quizSnap.exists()) {
        container.innerHTML = "<p class='text-center text-red-500'>퀴즈를 찾을 수 없습니다.</p>";
        return;
    }

    if (sessionStorage.getItem("viewed_" + quizId) !== "true") {
        await updateDoc(quizRef, {
            views: increment(1)
        });
        sessionStorage.setItem("viewed_" + quizId, "true");
    }

    const quiz = quizSnap.data();

    const titleElement = document.getElementById("detail-title");
    if (titleElement) {
        titleElement.textContent = quiz.title;
    }

    const descriptionElement = document.getElementById("detail-description");
    if (descriptionElement) {
        descriptionElement.textContent = quiz.description;
    }

    const optionsContainer = document.getElementById("detail-options");
    if (optionsContainer && Array.isArray(quiz.options)) {
        optionsContainer.innerHTML = "";
        quiz.options.forEach((option) => {
            const button = document.createElement("button");
            button.className = "vote-option-btn w-full text-left px-4 py-3 rounded-lg border border-slate-300 hover:bg-slate-50 transition";
            button.dataset.optionId = option.id;
            button.dataset.quizId = quizId;
            button.textContent = option.label;
            button.addEventListener("click", async () => {
                const allButtons = optionsContainer.querySelectorAll(".vote-option-btn");
                allButtons.forEach(btn => {
                    btn.classList.remove("ring-2", "ring-emerald-500", "ring-offset-2");
                });
                button.classList.add("ring-2", "ring-emerald-500", "ring-offset-2");
                await handleVote(quizId, option.id);
            });
            optionsContainer.appendChild(button);
        });
    }

    const resultsContainer = document.getElementById("detail-results");
    if (resultsContainer && Array.isArray(quiz.options)) {
        resultsContainer.innerHTML = "";
        const votes = quiz.vote || {};
        const totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
        quiz.options.forEach(option => {
            const count = votes[option.id] || 0;
            const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
            const wrapper = document.createElement("div");
            wrapper.className = "space-y-1";
            const label = document.createElement("div");
            label.className = "flex justify-between text-sm text-slate-600";
            label.innerHTML = `
                <span>${option.label}</span>
                <span>${percent}% (${count})</span>
            `;
            const bar = document.createElement("div");
            bar.className = "w-full bg-slate-200 rounded h-3";
            const fill = document.createElement("div");
            fill.className = "bg-emerald-500 h-3 rounded";
            fill.style.width = percent + "%";
            bar.appendChild(fill);
            wrapper.appendChild(label);
            wrapper.appendChild(bar);
            resultsContainer.appendChild(wrapper);
        });
    }

    const participationContainer = document.getElementById("detail-participation");
    if (participationContainer) {
        const participants = quiz.participants || [];
        const maxParticipants = quiz.participantLimit || 0;
        const current = participants.length;
        const percent = maxParticipants === 0 ? 0 : Math.round((current / maxParticipants) * 100);
        const bar = document.getElementById("participation-bar");
        if (bar) {
            bar.style.width = percent + "%";
        }
        const text = document.getElementById("participation-text");
        if (text) {
            text.textContent = `${current} / ${maxParticipants} 참여`;
        }
        if (maxParticipants === 0) {
            participationContainer.classList.add("hidden");
        } else {
            participationContainer.classList.remove("hidden");
        }
    }

    const auth = getAuth();
    if (auth.currentUser) {
        restoreUserVotes(auth.currentUser);
        const likeRef = doc(db, `questions/${quizId}/likes`, auth.currentUser.uid);
        const userLikeSnap = await getDoc(likeRef);
        const outline = document.getElementById("like-icon-outline");
        const filled = document.getElementById("like-icon-filled");
        if (outline && filled) {
            if (userLikeSnap.exists()) {
                outline.classList.add("hidden");
                filled.classList.remove("hidden");
            } else {
                outline.classList.remove("hidden");
                filled.classList.add("hidden");
            }
        }
    }
    
    const likeButton = document.getElementById("detail-like-button");
    if(likeButton) {
        likeButton.innerHTML = '<svg id="like-icon-outline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="w-5 h-5"><path stroke-linecap="round" stroke-linejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"/></svg><svg id="like-icon-filled" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" class="w-5 h-5 text-red-500 hidden"><path d="M12 21s-8.5-4.6-8.5-11.1C3.5 6.4 5.9 4 8.8 4c1.9 0 3.6 1 4.2 2.6C13.6 5 15.3 4 17.2 4 20.1 4 22.5 6.4 22.5 9.9 22.5 16.4 12 21 12 21z"/></svg>';
        likeButton.className = "px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 transition";
        likeButton.onclick = () => handleLike(quizId);
    }

    const likeCountEl = document.getElementById("detail-like-count");
    if (likeCountEl) {
        likeCountEl.textContent = quiz.likesCount || 0;
    }

    const likeCount = document.getElementById("detail-like-count");
    if (likeCount) {
        likeCount.className = "ml-2 text-sm text-slate-600";
    }

    const shareButton = document.getElementById("detail-share-button");
    if(shareButton) {
        shareButton.onclick = () => {
            const url = window.location.href;
            navigator.clipboard.writeText(url).then(() => {
                alert("퀴즈 링크가 복사되었습니다!");
            }, () => {
                alert("링크 복사에 실패했습니다.");
            });
        };
    }
}

function formatTimeAgo(timestamp) {
    if (!timestamp || !timestamp.toDate) return "";

    const now = new Date();
    const past = timestamp.toDate();
    const diff = Math.floor((now - past) / 1000);

    if (diff < 60) return `${diff}초 전`;
    if (diff < 3600) return `${Math.floor(diff / 60)}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;

    return `${Math.floor(diff / 86400)}일 전`;
}

export function createQuizCard(quizId, quiz) {
    if(DEBUG) console.log("createQuizCard RUNNING for:", quizId);

    // Defensive code for options
    if (!quiz.options || !Array.isArray(quiz.options)) {
        console.warn("INVALID OPTIONS STRUCTURE:", quiz);
        quiz.options = [];
    }

    const quizCard = document.createElement("div");
    quizCard.dataset.quizId = quizId;

    const isSuper = quiz.isSuper === true;
    
    const borderColorClass = isSuper ? 'border-purple-500' : 'border-black';
    quizCard.className = `bg-white dark:bg-slate-800 rounded-xl shadow-sm p-4 flex flex-col justify-between w-full max-w-4xl mx-auto mb-4 border ${borderColorClass} hover:shadow-lg hover:-translate-y-0.5 transform-gpu transition-all duration-200`;
    
    quizCard.style.minHeight = '140px';

    const avatarName = quiz.creatorName || "User";
    const creatorHTML = isSuper ? `
      <div class="flex items-center gap-2 mb-2">
          <img class="w-6 h-6 rounded-full" src="${quiz.creatorAvatar || `https://ui-avatars.com/api/?name=${avatarName}`}" alt="${avatarName}">
          <span class="text-sm font-semibold text-slate-700 dark:text-slate-300">${avatarName}</span>
      </div>
    ` : '';
    
    const participationHTML = () => {
      if (!isSuper) return '';
      const participants = quiz.participants || [];
      const maxParticipants = quiz.participantLimit || 0;
      if (maxParticipants === 0) return '';
      
      const percent = Math.min(100, Math.round((participants.length / maxParticipants) * 100));

      return `
        <div class="participation-progress mt-3">
          <div class="flex justify-between text-xs text-slate-500 mb-1">
            <span class="font-semibold">참여 현황</span>
            <span>${participants.length} / ${maxParticipants}</span>
          </div>
          <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2">
            <div class="bg-purple-500 h-2 rounded-full" style="width: ${percent}%"></div>
          </div>
        </div>
      `;
    }

    const optionsHTML = quiz.options.map(option => `
        <button 
            class="vote-option-btn flex-1 px-3 py-2 text-sm rounded-md font-semibold transition-all hover:opacity-90 ${colorMap[option.color] || 'bg-slate-500 hover:bg-slate-600'} text-white"
            data-option-id="${option.id}"
        >
            ${option.label}
        </button>
    `).join('');

    quizCard.innerHTML = `
      <div>
        ${creatorHTML}
        <a href="quiz.html?id=${quizId}" class="quiz-title-link">
            <h3 class="quiz-title font-bold text-slate-900 dark:text-white hover:underline truncate">${quiz.title}</h3>
        </a>
        <p class="quiz-desc text-sm text-slate-500 dark:text-slate-400 truncate mt-1">${quiz.description || ''}</p>
      </div>

      <div class="my-3 space-y-2">
        <div class="quiz-options flex flex-wrap gap-2">
            ${optionsHTML}
        </div>
        ${participationHTML()}
      </div>

      <div class="quiz-meta flex items-center gap-4 text-slate-500 dark:text-slate-400 mt-auto pt-2 border-t border-slate-200 dark:border-slate-700">
          <button class="like-button flex items-center gap-1.5 hover:text-red-500 transition-colors">
              <i class="far fa-heart text-base"></i>
              <span class="like-count font-medium text-xs">${quiz.likesCount || 0}</span>
          </button>
          <a href="quiz.html?id=${quizId}#comments" class="comment-button flex items-center gap-1.5 hover:text-sky-500 transition-colors">
              <i class="far fa-comment text-base"></i>
              <span class="comment-count font-medium text-xs">${quiz.commentsCount ?? 0}</span>
          </a>
          <span class="time text-xs ml-auto">${formatTimeAgo(quiz.createdAt)}</span>
          <button class="share-button hover:text-teal transition-colors">
              <i class="fas fa-share-alt"></i>
          </button>
      </div>
    `;

    return quizCard;
}


function calculatePopularityScore(data) {
  const likes = data.likes || 0;
  const votes = data.votes || 0;
  const comments = data.comments || 0;
  const views = data.views || 0;

  return (
    likes * 1 +
    votes * 2 +
    comments * 0.5 +
    views * 0.01
  );
}

async function updatePopularityScore(quizId) {
    const quizRef = doc(db, "questions", quizId);
    const quizSnap = await getDoc(quizRef);

    if (!quizSnap.exists()) {
        console.error(`Quiz with ID ${quizId} not found.`);
        return;
    }

    const quizData = quizSnap.data();

    const likes = quizData.likesCount || 0;
    const comments = quizData.commentsCount || 0;
    const views = quizData.views || 0;
    const votes = Object.values(quizData.vote || {}).reduce((sum, current) => sum + current, 0);

    const popularityScore = calculatePopularityScore({
        likes,
        votes,
        comments,
        views
    });

    await updateDoc(quizRef, { popularityScore });
}

async function restoreUserVotes(user) {
    if (!user) return;
    const quizCards = document.querySelectorAll('[data-quiz-id]');
    const votePromises = [];

    quizCards.forEach(card => {
        const quizId = card.dataset.quizId;
        const userVoteRef = doc(db, `questions/${quizId}/userVotes/${user.uid}`);

        votePromises.push(
            getDoc(userVoteRef).then(userVoteSnap => {
                const buttons = card.querySelectorAll('.vote-option-btn');

                // Reset all buttons first
                buttons.forEach(btn => {
                    btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400', 'ring-red-400', 'ring-slate-400', 'ring-emerald-500');
                });

                if (userVoteSnap.exists()) {
                    const selectedOptionId = userVoteSnap.data().selectedOption;
                    buttons.forEach(btn => {
                        if (btn.dataset.optionId === selectedOptionId) {
                             btn.classList.add('ring-2', 'ring-offset-2', 'ring-emerald-500');
                        } else {
                            btn.classList.add('opacity-50');
                        }
                    });
                }
            }).catch(error => {
                console.error(`Failed to restore vote for quiz ${quizId}:`, error);
            })
        );
    });

    await Promise.all(votePromises);
}

async function loadComments(quizId) {
    const commentList = document.getElementById("comment-list");
    if (!commentList) return;

    commentList.innerHTML = "";

    const commentsRef = collection(db, "questions", quizId, "comments");
    const q = query(commentsRef, orderBy("createdAt", "desc"));
    const snapshot = await getDocs(q);
    const auth = getAuth();

    const commentCountEl = document.getElementById("comment-count");
    if (commentCountEl) {
        commentCountEl.textContent = `댓글 (${snapshot.size})`;
    }

    for (const docSnap of snapshot.docs) {
        const data = docSnap.data();
        const commentEl = document.createElement("div");
        commentEl.className = "border rounded-lg p-3 text-sm";

        let deleteButtonHTML = "";
        if (auth.currentUser && data.uid === auth.currentUser.uid) {
            deleteButtonHTML = `
                <button class="comment-delete text-xs text-red-500" data-comment-id="${docSnap.id}">
                    삭제
                </button>
            `;
        }

        let timeText = "";
        if (data.createdAt && data.createdAt.toDate) {
            const created = data.createdAt.toDate();
            const now = new Date();
            const diff = Math.floor((now - created) / 1000);

            if (diff < 60) {
                timeText = "방금 전";
            } else if (diff < 3600) {
                timeText = Math.floor(diff / 60) + "분 전";
            } else if (diff < 86400) {
                timeText = Math.floor(diff / 3600) + "시간 전";
            } else {
                timeText = Math.floor(diff / 86400) + "일 전";
            }
        }

        commentEl.innerHTML = `
            <div class="flex justify-between items-start">
                <div>
                    <div class="text-slate-800 break-all">${data.text}</div>
                    <div class="text-xs text-slate-400 mt-1">
                        ${data.nickname || "익명"} · ${timeText}
                    </div>
                    <button 
                      class="comment-reply text-xs text-sky-500 mt-1"
                      data-comment-id="${docSnap.id}"
                    >
                    답글
                    </button>
                </div>
                ${deleteButtonHTML}
            </div>
        `;
        commentList.appendChild(commentEl);

        const repliesContainer = document.createElement("div");
        repliesContainer.className = "mt-2 hidden";
        commentEl.appendChild(repliesContainer);

        const repliesRef = collection(
            db,
            "questions",
            quizId,
            "comments",
            docSnap.id,
            "replies"
        );

        const repliesQuery = query(repliesRef, orderBy("createdAt", "asc"));
        const repliesSnapshot = await getDocs(repliesQuery);

        if (!repliesSnapshot.empty) {
          repliesContainer.classList.remove("hidden");
        }

        repliesSnapshot.forEach(replyDoc => {
            const replyData = replyDoc.data();

            let replyTimeText = "";
            if (replyData.createdAt && replyData.createdAt.toDate) {
              const created = replyData.createdAt.toDate();
              const now = new Date();
              const diff = Math.floor((now - created) / 1000);
            
              if (diff < 60) {
                replyTimeText = "방금 전";
              } else if (diff < 3600) {
                replyTimeText = Math.floor(diff / 60) + "분 전";
              } else if (diff < 86400) {
                replyTimeText = Math.floor(diff / 3600) + "시간 전";
              } else {
                replyTimeText = Math.floor(diff / 86400) + "일 전";
              }
            }

            const replyEl = document.createElement("div");
            replyEl.className = "ml-6 mt-2 text-sm border-l-2 border-slate-200 pl-3";

            let replyDeleteButtonHTML = "";

            if (auth.currentUser && replyData.uid === auth.currentUser.uid) {
              replyDeleteButtonHTML = `
                <button
                  class="reply-delete text-xs text-red-500"
                  data-reply-id="${replyDoc.id}"
                  data-comment-id="${docSnap.id}"
                >
                  삭제
                </button>
              `;
            }

            replyEl.innerHTML = `
            <div class="flex justify-between items-start">
              <div>
                <div class="text-slate-800 break-all">${replyData.text}</div>
                <div class="text-xs text-slate-400 mt-1">
                  ${replyData.nickname || "익명"} · ${replyTimeText}
                </div>
              </div>
            
              ${replyDeleteButtonHTML}
            
            </div>
            `;
            repliesContainer.appendChild(replyEl);
        });
    }

    commentList.querySelectorAll(".comment-delete").forEach(btn => {
        btn.addEventListener("click", async () => {
            const commentId = btn.dataset.commentId;
            const commentRef = doc(db, "questions", quizId, "comments", commentId);
            const quizRef = doc(db, "questions", quizId);
            await deleteDoc(commentRef);
            await updateDoc(quizRef, { commentsCount: increment(-1) });
            await loadComments(quizId);
            await updatePopularityScore(quizId);
        });
    });

    commentList.querySelectorAll(".reply-delete").forEach(btn => {
        btn.addEventListener("click", async () => {
    
            const replyId = btn.dataset.replyId;
            const commentId = btn.dataset.commentId;
    
            const replyRef = doc(
                db,
                "questions",
                quizId,
                "comments",
                commentId,
                "replies",
                replyId
            );
    
            await deleteDoc(replyRef);
    
            await loadComments(quizId);
        });
    });

    commentList.querySelectorAll(".comment-reply").forEach(btn => {
        btn.addEventListener("click", () => {
            const existingReplyBox = btn.closest(".border").querySelector(".reply-input");
            if (existingReplyBox) {
              existingReplyBox.closest(".mt-2").remove();
              return;
            }

            const commentId = btn.dataset.commentId;

            const replyBox = document.createElement("div");
            replyBox.style.width = "100%";
            replyBox.className = "mt-2 w-full";

            replyBox.innerHTML = `
            <div class="w-full">
              <div class="flex gap-2">
                <input
                  type="text"
                  placeholder="답글을 입력하세요"
                  class="reply-input flex-1 border rounded-lg px-3 py-1 text-sm"
                />
                <button
                  class="reply-submit bg-sky-500 text-white px-3 py-1 rounded text-sm"
                >
                  작성
                </button>
              </div>
            
              <div class="text-xs text-slate-400 mt-1 text-right reply-char-count">
                0 / 200
              </div>
            </div>
            `;

            btn.closest(".border").appendChild(replyBox);

            const replyInput = replyBox.querySelector(".reply-input");
            const replySubmit = replyBox.querySelector(".reply-submit");
            const replyCharCount = replyBox.querySelector(".reply-char-count");

            replyInput.addEventListener("input", () => {
              const length = replyInput.value.length;
            
              if (replyCharCount) {
                replyCharCount.textContent = `${length} / 200`;
              }
            
              if (length > 200) {
                replyCharCount.classList.add("text-red-500");
              } else {
                replyCharCount.classList.remove("text-red-500");
              }
            });

            replySubmit.addEventListener("click", async () => {
                const auth = getAuth();
                const user = auth.currentUser;

                if (!user) {
                    alert("로그인이 필요합니다.");
                    return;
                }

                const text = replyInput.value.trim();

                if (!text) return;

                if (text.length > 200) {
                    alert("답글은 200자까지 입력 가능합니다.");
                    return;
                }

                const repliesRef = collection(
                    db,
                    "questions",
                    quizId,
                    "comments",
                    commentId,
                    "replies"
                );

                await addDoc(repliesRef, {
                    text: text,
                    uid: user.uid,
                    nickname: user.displayName || "익명",
                    createdAt: serverTimestamp()
                });

                await loadComments(quizId);
            });
        });
    });
}

// --- Like and Comment Functions ---

function setupLikeListener(quizId, currentUserId) {
    const quizCard = document.querySelector(`[data-quiz-id="${quizId}"]`);
    if (!quizCard) return;

    const likeButton = quizCard.querySelector('.like-button');
    if (!likeButton) return;
    const likeCountSpan = quizCard.querySelector('.like-count');
    const likeIcon = likeButton.querySelector('i');

    onSnapshot(doc(db, "questions", quizId), async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (likeCountSpan) likeCountSpan.textContent = data.likesCount || 0;

            let userHasLiked = false;
            if (currentUserId) {
                const likeRef = doc(db, `questions/${quizId}/likes`, currentUserId);
                const userLikeSnap = await getDoc(likeRef);
                userHasLiked = userLikeSnap.exists();
            }

            if (likeIcon) {
                if (userHasLiked) {
                    likeIcon.classList.remove('far', 'fa-heart');
                    likeIcon.classList.add('fas', 'fa-heart', 'text-red-500');
                } else {
                    likeIcon.classList.remove('fas', 'fa-heart', 'text-red-500');
                    likeIcon.classList.add('far', 'fa-heart');
                }
            }
        }
    });
}

function setupCommentListener(quizId) {
    const quizCard = document.querySelector(`[data-quiz-id="${quizId}"]`);
    if (!quizCard) return;

    const commentsList = quizCard.querySelector('.comments-list');
    const commentCountSpan = quizCard.querySelector('.comment-count');
    if (!commentsList || !commentCountSpan) return;

    const commentsQuery = query(collection(db, `questions/${quizId}/comments`), orderBy('createdAt', 'desc'), limit(20));

    onSnapshot(doc(db, "questions", quizId), (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            if (commentCountSpan) commentCountSpan.textContent = data.commentsCount || 0;

            (async () => {
                const snapshot = await getDocs(commentsQuery);
                commentsList.innerHTML = '';
                if (snapshot.empty) {
                    commentsList.innerHTML = `<p class="text-xs text-slate-400 dark:text-slate-500 text-center">아직 댓글이 없습니다.</p>`;
                } else {
                    snapshot.forEach(doc => {
                        const comment = doc.data();
                        const commentElement = createCommentElement(doc.id, comment);
                        commentsList.appendChild(commentElement);
                    });
                }
            })();
        }
    });
}

function createCommentElement(commentId, comment) {
    const div = document.createElement('div');
    div.className = 'flex items-start gap-3 text-sm';
    const createdAt = comment.createdAt?.toDate().toLocaleString('ko-KR', { dateStyle: 'short', timeStyle: 'short'}) || '';

    div.innerHTML = `
        <div class="flex-shrink-0 w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center font-bold text-xs text-slate-500 dark:text-slate-400">
            ${(comment.authorDisplayName || 'U').charAt(0)}
        </div>
        <div class="flex-1">
            <p class="font-semibold text-slate-800 dark:text-slate-200">${comment.authorDisplayName || 'Anonymous'} <span class="text-xs font-normal text-slate-400 dark:text-slate-500 ml-1">${createdAt}</span></p>
            <p class="text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-wrap">${comment.content}</p>
        </div>
    `;
    return div;
}

function createCommentForm(quizId) {
    const form = document.createElement('form');
    form.className = 'comment-form flex items-start gap-2';
    form.innerHTML = `
        <textarea name="comment" placeholder="댓글을 입력하세요..." class="flex-1 px-3 py-2 text-sm rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal transition" rows="1"></textarea>
        <button type="submit" class="px-3 py-2 rounded-md bg-teal text-pm-navy font-semibold text-sm transition-opacity hover:opacity-90">등록</button>
    `;
    form.addEventListener('submit', (e) => handleCommentSubmit(e, quizId));
    return form;
}

async function handleCommentSubmit(e, quizId) {
    e.preventDefault();
    const form = e.target;
    const textarea = form.querySelector('textarea');
    const content = textarea.value.trim();

    if (!content) return;

    const user = auth.currentUser;
    if (!user) {
        alert('댓글을 작성하려면 로그인이 필요합니다.');
        return;
    }

    try {
        const quizRef = doc(db, `questions/${quizId}`);
        await addDoc(collection(db, `questions/${quizId}/comments`), {
            content: content,
            authorUid: user.uid,
            authorDisplayName: user.displayName || '익명',
            createdAt: serverTimestamp()
        });
        await updateDoc(quizRef, { commentsCount: increment(1) });
        textarea.value = '';
        textarea.style.height = 'auto';
        await updatePopularityScore(quizId);
    } catch (error) {
        console.error("Error adding comment: ", error);
        alert('댓글 등록에 실패했습니다.');
    }
}

async function handleLike(quizId) {
    const user = auth.currentUser;
    if (!user) {
        alert('좋아요를 누르려면 로그인이 필요합니다.');
        return;
    }

    const outline = document.getElementById("like-icon-outline");
    const filled = document.getElementById("like-icon-filled");
    
    const quizRef = doc(db, "questions", quizId);
    const likeRef = doc(db, `questions/${quizId}/likes`, user.uid);

    try {
        const docSnap = await getDoc(likeRef);
        if (docSnap.exists()) {
            if (outline && filled) {
                outline.classList.remove("hidden");
                filled.classList.add("hidden");
            }
            await deleteDoc(likeRef);
            await updateDoc(quizRef, { likesCount: increment(-1) });
        } else {
            if (outline && filled) {
                outline.classList.add("hidden");
                filled.classList.remove("hidden");
            }
            await setDoc(likeRef, {
                createdAt: serverTimestamp()
            });
            await updateDoc(quizRef, { likesCount: increment(1) });
        }
        await updatePopularityScore(quizId);
    } catch (error) {
        console.error("Error toggling like: ", error);
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handleSearch(searchInput.value);
            }
        });
    }

    if (quizIdFromUrl) {
        const superQuizSection = document.getElementById("super-quiz-section");
        if (superQuizSection) superQuizSection.style.display = "none";
        const popularQuizSection = document.getElementById("popular-quiz-section");
        if (popularQuizSection) popularQuizSection.style.display = "none";
        const realtimeQuizSection = document.getElementById("realtime-quiz-section");
        if (realtimeQuizSection) realtimeQuizSection.style.display = "none";
        const categorySections = document.getElementById("category-sections");
        if (categorySections) categorySections.style.display = "none";
        const rightWidgetArea = document.getElementById("right-widget-area");
        if (rightWidgetArea) rightWidgetArea.style.display = "none";
        const quizContainer = document.getElementById("quiz-container");
        if (quizContainer) quizContainer.style.display = "none";

        const detailContainer = document.getElementById("quiz-detail-container");
        if (detailContainer) {
            detailContainer.classList.remove("hidden");
        } 

        await loadSingleQuiz(quizIdFromUrl);
        await loadComments(quizIdFromUrl);

        const commentInput = document.getElementById("comment-input");
        const commentLength = document.getElementById("comment-length");

        if (commentInput && commentLength) {
            commentInput.addEventListener("input", () => {
                const length = commentInput.value.length;
                commentLength.textContent = length + " / 200";
            });
        }

        if (commentInput) {
            commentInput.addEventListener("keydown", async (e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    const submitBtn = document.getElementById("comment-submit");
                    if (submitBtn) {
                        submitBtn.click();
                    }
                }
            });
        }

        const commentSubmit = document.getElementById("comment-submit");

        if (commentSubmit) {
            commentSubmit.addEventListener("click", async () => {
                const auth = getAuth();
                const user = auth.currentUser;

                if (!user) {
                    alert("로그인이 필요합니다.");
                    return;
                }

                const text = commentInput.value.trim();
                if (text.length > 200) {
                    alert("댓글은 200자 까지만 입력 가능합니다.");
                    return;
                }
                if (!text) return;

                const commentsRef = collection(db, "questions", quizIdFromUrl, "comments");
                const quizRef = doc(db, "questions", quizIdFromUrl);

                await addDoc(commentsRef, {
                    text: text,
                    uid: user.uid,
                    nickname: user.displayName || "익명",
                    createdAt: serverTimestamp()
                });
                await updateDoc(quizRef, { commentsCount: increment(1) });

                commentInput.value = "";

                await loadComments(quizIdFromUrl);
                await updatePopularityScore(quizIdFromUrl);
            });
        }
    } else if (window.location.pathname.includes('search.html')) {
        // Search page logic is handled by its own inline script
    } else {
        renderCategoryNavbar();
        renderCategorySections();
        renderRealtimeSection();
        renderSuperQuizSection();
        renderPopularQuizSection();
        loadTrendingKeywords();

        const realtimeSlider = document.getElementById('realtime-slider');
        const realtimeLeftBtn = document.getElementById('realtime-slider-left');
        const realtimeRightBtn = document.getElementById('realtime-slider-right');

        if (realtimeSlider && realtimeLeftBtn && realtimeRightBtn) {
            let currentIndex = 0;
            const moveStep = 2;
            const cardWidth = 316;

            realtimeRightBtn.onclick = async () => {
                currentIndex += moveStep;
                realtimeSlider.scrollTo({
                    left: currentIndex * cardWidth,
                    behavior: "smooth"
                });

                if (realtimeSlider.scrollLeft + realtimeSlider.clientWidth >= realtimeSlider.scrollWidth - 400 && realtimePageState.hasMore) {
                    const newQuizzes = await loadRealtimeQuizzes();
                    newQuizzes.forEach(quiz => {
                        if (!realtimeSlider.querySelector(`[data-quiz-id="${quiz.id}"]`)) {
                            const card = createQuizCard(quiz.id, quiz);
                            card.dataset.quizId = quiz.id;
                            card.style.width = "300px";
                            card.style.flexShrink = "0";
                            realtimeSlider.appendChild(card);
                        }
                    });
                }
            };

            realtimeLeftBtn.onclick = () => {
                currentIndex = Math.max(0, currentIndex - moveStep);
                realtimeSlider.scrollTo({
                    left: currentIndex * cardWidth,
                    behavior: "smooth"
                });
            };
        }

        const superSlider = document.getElementById("super-quiz-slider");
        const superLeft = document.getElementById("super-slider-left");
        const superRight = document.getElementById("super-slider-right");

        if (superSlider && superLeft && superRight) {
            let currentPage = 0;

            const updateButtons = () => {
                const pageCount = superSlider.querySelectorAll('.super-quiz-page').length;
                
                superLeft.disabled = currentPage === 0;
                superRight.disabled = currentPage >= pageCount - 1;
                
                superLeft.style.cursor = superLeft.disabled ? 'not-allowed' : 'pointer';
                superRight.style.cursor = superRight.disabled ? 'not-allowed' : 'pointer';
                superLeft.style.opacity = superLeft.disabled ? '0.5' : '1';
                superRight.style.opacity = superRight.disabled ? '0.5' : '1';
            };

            superRight.addEventListener('click', () => {
                const pageCount = superSlider.querySelectorAll('.super-quiz-page').length;
                if (currentPage < pageCount - 1) {
                    currentPage++;
                    superSlider.style.transform = `translateX(-${currentPage * 100}%)`;
                    updateButtons();
                }
            });

            superLeft.addEventListener('click', () => {
                if (currentPage > 0) {
                    currentPage--;
                    superSlider.style.transform = `translateX(-${currentPage * 100}%)`;
                    updateButtons();
                }
            });

            const observer = new MutationObserver(() => {
                currentPage = 0;
                superSlider.style.transform = `translateX(0%)`;
                updateButtons();
            });
            observer.observe(superSlider, { childList: true });

            updateButtons();
        }

        const popularSlider = document.getElementById("popular-quiz-slider");
        const popularLeft = document.getElementById("popular-slider-left");
        const popularRight = document.getElementById("popular-slider-right");

        if (popularSlider && popularLeft && popularRight) {
            let currentIndex = 0;
            const moveStep = 2;
            const cardWidth = 316;

            popularRight.onclick = () => {
                currentIndex += moveStep;
                popularSlider.scrollTo({
                    left: currentIndex * cardWidth,
                    behavior: "smooth"
                });
            };

            popularLeft.onclick = () => {
                currentIndex = Math.max(0, currentIndex - moveStep);
                popularSlider.scrollTo({
                    left: currentIndex * cardWidth,
                    behavior: "smooth"
                });
            };
        }
    }

    const quizContentArea = document.getElementById('quiz-content-area');
    if(quizContentArea) {
        quizContentArea.addEventListener('click', (event) => {
            const voteButton = event.target.closest('.vote-option-btn');
            const likeButton = event.target.closest('.like-button');
            const commentToggleButton = event.target.closest('.comment-toggle-button');

            if (likeButton) {
                const quizId = likeButton.closest('[data-quiz-id]').dataset.quizId;
                handleLike(quizId);
                return;
            }

            if (commentToggleButton) {
                const commentsSection = commentToggleButton.closest('.shadow-sm').querySelector('.comments-section');
                if (commentsSection) {
                    commentsSection.style.display = commentsSection.style.display === 'none' || commentsSection.style.display === '' ? 'block' : 'none';
                }
                return;
            }

            if (voteButton) {
                const card = voteButton.closest('.shadow-sm');
                if (!card) return;

                const auth = getAuth();
                const user = auth.currentUser;

                if (!user) {
                    if (confirm("로그인이 필요합니다. 로그인하시겠습니까?")) {
                        openModal();
                    }
                    return; // Stop any further action
                }

                const allOptionButtons = card.querySelectorAll('.vote-option-btn');
                const previouslySelectedButton = card.querySelector('.vote-option-btn.ring-2');
                const clickedOptionId = voteButton.dataset.optionId;

                // Optimistic UI update for button styles
                if (voteButton === previouslySelectedButton) {
                    allOptionButtons.forEach(btn => btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400', 'ring-red-400', 'ring-slate-400'));
                } else {
                    allOptionButtons.forEach(btn => {
                        btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400', 'ring-red-400', 'ring-slate-400');
                        if (btn !== voteButton) btn.classList.add('opacity-50');
                    });
                    let ringColorClass = voteButton.classList.contains('bg-emerald-500') ? 'ring-emerald-400' : (voteButton.classList.contains('bg-red-500') ? 'ring-red-400' : 'ring-slate-400');
                    voteButton.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', ringColorClass);
                }
                
                // Update Firestore using a transaction
                (async () => {
                    try {
                        const quizRef = doc(db, "questions", card.dataset.quizId);
                        const userVoteRef = doc(db, "questions", card.dataset.quizId, "userVotes", user.uid);

                        await runTransaction(db, async (transaction) => {
                            const quizDoc = await transaction.get(quizRef);
                            if (!quizDoc.exists()) {
                                throw "Quiz document does not exist!";
                            }

                            const data = quizDoc.data();
                            const entryFee = data.entryFee || 0;
                            const participantLimit = data.participantLimit || 0;
                            const participants = data.participants || [];

                            const userProfileRef = doc(db, "userProfiles", user.uid);
                            const userProfileDoc = await transaction.get(userProfileRef);
                            const userPoints = userProfileDoc.data()?.points || 0;

                            if (participantLimit > 0 && participants.length >= participantLimit && !participants.includes(user.uid)) {
                                throw "Participant limit reached";
                            }

                            const userVoteDoc = await transaction.get(userVoteRef);
                            const voteData = data.vote ?? {};
                            const updatedVotes = { ...voteData };

                            let previousOptionId = null;
                            if (userVoteDoc.exists()) {
                                previousOptionId = userVoteDoc.data().selectedOption;
                            }

                            let updatedParticipants = [...participants];

                            if (previousOptionId === clickedOptionId) {
                                // Deselecting the same option
                                updatedVotes[clickedOptionId] = Math.max(0, (updatedVotes[clickedOptionId] || 0) - 1);
                                transaction.delete(userVoteRef);

                                if (entryFee > 0 && previousOptionId) {
                                    transaction.update(userProfileRef, {
                                        points: userPoints + entryFee
                                    });
                                }
                                // Remove user from participants
                                updatedParticipants = updatedParticipants.filter(uid => uid !== user.uid);

                            } else {
                                // Selecting a new option or switching vote
                                if (previousOptionId) {
                                    updatedVotes[previousOptionId] = Math.max(0, (updatedVotes[previousOptionId] || 0) - 1);
                                }
                                updatedVotes[clickedOptionId] = (updatedVotes[clickedOptionId] || 0) + 1;
                                transaction.set(userVoteRef, { selectedOption: clickedOptionId });

                                if (entryFee > 0 && !participants.includes(user.uid)) {
                                    if (userPoints < entryFee) {
                                        throw "Not enough points";
                                    }
                                    transaction.update(userProfileRef, {
                                        points: userPoints - entryFee
                                    });
                                }

                                // Add user to participants if not already there
                                if (!updatedParticipants.includes(user.uid)) {
                                    updatedParticipants.push(user.uid);
                                }
                            }

                            transaction.update(quizRef, { 
                                vote: updatedVotes,
                                participants: updatedParticipants
                            });
                        });

                        await updatePopularityScore(card.dataset.quizId);

                        if (auth.currentUser) {
                            restoreUserVotes(auth.currentUser);
                        }

                    } catch (e) {
                        console.error("Transaction failed: ", e);
                        // TODO: Revert optimistic UI changes if the transaction fails
                    }
                })();
                
                return; // Prevent accordion toggle
            }

            const header = event.target.closest('.quiz-header');
            if (header) {
                const card = header.closest('.shadow-sm');
                const body = card.querySelector('.quiz-body');
                const icon = header.querySelector('.arrow-icon');

                if (body.style.maxHeight) {
                    body.style.maxHeight = null;
                    icon.classList.remove('rotate-180');
                } else {
                    body.style.maxHeight = body.scrollHeight + 'px';
                    icon.classList.add('rotate-180');
                }
            }
        });
    }

    // --- Theme Toggle --- //
    const themeToggle = document.getElementById('theme-toggle');
    if(themeToggle) {
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

    // --- User Avatar Dropdown --- //
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

    // --- Tab & Accordion Functionality --- //
    const categoryTabs = document.getElementById('category-tabs');
    if (categoryTabs) {
        categoryTabs.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-button')) return;

            const buttons = categoryTabs.querySelectorAll('tab-button');
            buttons.forEach(btn => {
                btn.classList.remove('active', 'bg-emerald-500', 'text-white');
                btn.classList.add('text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-100', 'dark:hover:bg-slate-700');
            });
            
            e.target.classList.add('active', 'bg-emerald-500', 'text-white');
            e.target.classList.remove('text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-100', 'dark:hover:bg-slate-700');
        });
    }

    // --- Modal elements & Auth buttons ---
    const loginModal = document.getElementById('login-modal');
    const loginModalButton = document.getElementById('login-modal-button');
    const loginModalCloseButton = document.getElementById('login-modal-close-button');
    const logoutButton = document.getElementById('logout-button');
    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    const showRegisterLink = document.getElementById('show-register-view-link');
    const showLoginLink = document.getElementById('show-login-view-link');

    // --- Modal Control ---
    function openModal() {
        if(loginModal) loginModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function closeModal() {
        if(loginModal) loginModal.classList.remove('show');
        document.body.style.overflow = '';
    }

    if(loginModalButton) loginModalButton.addEventListener('click', openModal);
    if(loginModalCloseButton) loginModalCloseButton.addEventListener('click', closeModal);
    if(loginModal) loginModal.addEventListener('click', (e) => { 
        if (e.target === loginModal) closeModal();
    });

    // --- Tab Switching ---
    if(showRegisterLink) {
        showRegisterLink.addEventListener('click', (e) => {
            e.preventDefault();
            if(loginView) loginView.style.display = 'none';
            if(registerView) registerView.style.display = 'block';
        });
    }
    if(showLoginLink) {
        showLoginLink.addEventListener('click', (e) => {
            e.preventDefault();
            if(registerView) registerView.style.display = 'none';
            if(loginView) loginView.style.display = 'block';
        });
    }

    function updateCommentFormVisibility(quizId, user) {
        const quizCard = document.querySelector(`[data-quiz-id="${quizId}"]`);
        if (!quizCard) return;
        const container = quizCard.querySelector('.comment-form-container');
        if (!container) return;
        container.innerHTML = '';
        if (user) {
            container.appendChild(createCommentForm(quizId));
        }
    }

    // --- Auth State Listener & UI Update ---
    onAuthStateChanged(auth, (user) => {
        const loginButton = document.getElementById('login-modal-button');
        const logoutButton = document.getElementById('logout-button');
        const userProfileInfo = document.getElementById('user-profile-info');
        const userNickname = document.getElementById('user-nickname');
        const userPoints = document.getElementById('user-points');

        if (user) {
            if(loginButton) loginButton.classList.add('hidden');
            if(logoutButton) logoutButton.classList.remove('hidden');
            if(userProfileInfo) userProfileInfo.classList.remove('hidden');
            if(userProfileInfo) userProfileInfo.classList.add('flex');

            const userRef = doc(db, "userProfiles", user.uid);
            onSnapshot(userRef, (doc) => {
                if (doc.exists()) {
                    const userData = doc.data();
                    if(userNickname) userNickname.textContent = userData.displayName || "사용자";
                    if(userPoints) userPoints.textContent = `${userData.points || 0} P`;
                } else {
                    if(userNickname) userNickname.textContent = user.displayName || "사용자";
                    if(userPoints) userPoints.textContent = "0 P";
                }
            });
            restoreUserVotes(user);
            
            // Update all cards for new auth state
            document.querySelectorAll('[data-quiz-id]').forEach(card => {
                const quizId = card.dataset.quizId;
                updateCommentFormVisibility(quizId, user);
                // Re-initialize like listeners with the user's UID
                setupLikeListener(quizId, user.uid);
            });

        } else {
            if(loginButton) loginButton.classList.remove('hidden');
            if(logoutButton) logoutButton.classList.add('hidden');
            if(userProfileInfo) userProfileInfo.classList.add('hidden');
            if(userProfileInfo) userProfileInfo.classList.remove('flex');

            document.querySelectorAll('.vote-option-btn').forEach(btn => {
                btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-emerald-400', 'ring-red-400', 'ring-slate-400', 'ring-emerald-500');
            });

            document.querySelectorAll('.comment-form-container').forEach(container => {
                container.innerHTML = '';
            });

            // Re-initialize like listeners without a user UID
            document.querySelectorAll('[data-quiz-id]').forEach(card => {
                const quizId = card.dataset.quizId;
                setupLikeListener(quizId, null);
            });
        }
    });

    // --- Logout Logic ---
    if(logoutButton) {
        logoutButton.addEventListener('click', async () => {
            try {
                await signOut(auth);
            } catch (error) {
                console.error('Logout Error:', error);
                alert('로그아웃 중 오류가 발생했습니다.');
            }
        });
    }
});