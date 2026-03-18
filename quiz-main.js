import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut, getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, onSnapshot, getDoc, setDoc, deleteDoc, addDoc, serverTimestamp, query, orderBy, limit, getDocs, where, startAfter, updateDoc, increment } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { handleVote } from './vote-system.js';
import { createQuizCard, formatTime } from './modules/quiz-card.js';
import { handleCardLike, restoreAllLikeStates } from './modules/likes.js';

function getPostTypeBadge(data){
    if(!data.type) return "POST";
    if(data.type === "quiz") return "PICK";
    if(data.type === "superquiz") return "TOPIC";
    return "POST";
}

function hasImage(data){
    return Array.isArray(data.imageUrls) && data.imageUrls.length > 0;
}

function setupQuestionsListener() {
    const unsubscribe = onSnapshot(collection(db, "questions"), (snapshot) => {
        snapshot.docChanges().forEach(change => {
            const quizId = change.doc.id;
            const data = change.doc.data();
            const quizCard = document.querySelector(`[data-quiz-id="${quizId}"]`);
            if (!quizCard) return;
            const likeCountSpan = quizCard.querySelector('.like-count');
            if (likeCountSpan) {
                likeCountSpan.textContent = data.likesCount || 0;
            }
        });
    });
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
                    btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-[#169976]', 'ring-red-400', 'ring-slate-400', 'ring-[#169976]');
                });

                if (userVoteSnap.exists()) {
                    const selectedOptionId = userVoteSnap.data().selectedOption;
                    buttons.forEach(btn => {
                        if (btn.dataset.optionId === selectedOptionId) {
                             btn.classList.add('ring-2', 'ring-offset-2', 'ring-[#169976]');
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


export async function loadHeader() {
    const container = document.getElementById("header-container");
    if (!container) return;

    const res = await fetch("/components/header.html");
    const html = await res.text();

    container.innerHTML = html;
    if (window.initializeHeader) {
        window.initializeHeader();
    }
}

const quizCache = new Map();
const categoryPageState = {};

const DEBUG = false;

const realtimePageState = {
  lastDoc: null,
  loading: false,
  hasMore: true
};

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

function getRandomCategories(categories, count = 3) {

    if (!Array.isArray(categories)) return [];

    const shuffled = [...categories].sort(() => 0.5 - Math.random());

    return shuffled.slice(0, count);

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
    const active_class = "tab-button px-4 py-2 rounded-full text-sm font-medium bg-[#169976] text-white";

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
    const allCategories = await loadCategories();
    const categories = getRandomCategories(allCategories, 3);
    const container = document.getElementById("category-sections");
    if (!container) return;

    container.innerHTML = "";

    const quizPromises = categories.map(category => loadQuizzesByCategory(category.id));
    const quizzesByAllCategories = await Promise.all(quizPromises);

    categories.forEach(async (category, index) => {
        const quizzes = quizzesByAllCategories[index];
        const section = document.createElement("section");
        section.className = "mb-12";

        const header = document.createElement("div");
        header.className = "flex items-center justify-between mb-4";

        const title = document.createElement("h2");
        title.className = "text-xl font-bold";
        title.textContent = category.name + " 픽스";

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

        quizzes.forEach(quiz => {
            if (!slider.querySelector(`[data-quiz-id="${quiz.id}"]`)) {
                const card = createQuizCard(quiz.id, quiz);
                card.dataset.quizId = quiz.id;
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

        const grid = document.createElement("div");
        grid.className = "grid grid-cols-1 lg:grid-cols-2 gap-6";

        grid.appendChild(slider);

        const postList = document.createElement("div");
        postList.className = "space-y-3";
        postList.id = `category-posts-${category.id}`;

        grid.appendChild(postList);

        section.appendChild(header);
        section.appendChild(grid);

        const posts = await loadPostsByCategory(category.id);
        renderCategoryPosts(category.id, posts);
    });
}

async function loadPostsByCategory(categoryId) {

    const q = query(
        collection(db, "questions"),
        where("category", "==", categoryId),
        orderBy("createdAt", "desc"),
        limit(5)
    );

    const snapshot = await getDocs(q);

    const posts = [];

    snapshot.forEach(doc => {
        const data = doc.data();

        if (!data.type) {
            posts.push({
                id: doc.id,
                ...data
            });
        }
    });

    return posts;
}

function renderCategoryPosts(categoryId, posts) {
    const container = document.getElementById(`category-posts-${categoryId}`);
    if (!container) return;

    container.innerHTML = "";

    posts.forEach(post => {
        const item = document.createElement("a");
        item.href = `view.html?id=${post.id}`;
        item.className = "block border rounded-lg px-4 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition";

        const badge = getPostTypeBadge(post);
        const commentCount = post.commentsCount || 0;
        const imageIcon = hasImage(post) ? "🖼" : "";
        const title = post.title || "제목 없음";

        item.innerHTML = `
        <div class="flex items-center gap-2 text-sm">

            <span class="text-xs font-semibold text-[#169976]">
                [${badge}]
            </span>

            <div class="flex items-center gap-1 flex-1 min-w-0">
                <span class="truncate">
                    ${title}
                </span>
                ${commentCount > 0 ? `<span class="text-red-500 text-xs flex-shrink-0">[${commentCount}]</span>` : ""}
            </div>

            ${imageIcon ? `<span class="text-slate-400">${imageIcon}</span>` : ""}

            <span class="text-xs text-slate-400 ml-auto">
                ${formatTime(post.createdAt)}
            </span>

            <span class="text-xs text-slate-400 ml-2">
                👁 ${post.views || 0}
            </span>

        </div>
        `;

        container.appendChild(item);
    });
}


async function loadQuizzesByCategory(categoryId) {
    if (quizCache.has(categoryId)) {
        return quizCache.get(categoryId);
    }

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
            where("type", "in", ["quiz", "superquiz"]),
            orderBy("createdAt", "desc"),
            startAfter(state.lastDoc),
            limit(6)
        );
    } else {
        q = query(
            collection(db, "questions"),
            where("category", "==", categoryId),
            where("type", "in", ["quiz", "superquiz"]),
            orderBy("createdAt", "desc"),
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

    quizCache.set(categoryId, quizzes);
    return quizzes;
}

async function preloadQuizzes() {
    const q = query(
        collection(db, "questions"),
        orderBy("createdAt", "desc"),
        limit(200)
    );

    const snapshot = await getDocs(q);

    snapshot.forEach(doc => {
        const data = doc.data();
        const category = data.category;

        if (!quizCache.has(category)) {
            quizCache.set(category, []);
        }

        quizCache.get(category).push({
            id: doc.id,
            ...data
        });
    });
}

async function loadRealtimeQuizzes() {
    if (realtimePageState.loading || !realtimePageState.hasMore) return [];

    realtimePageState.loading = true;

    let q;
    if (realtimePageState.lastDoc) {
        q = query(
            collection(db, "questions"),
            where("type", "in", ["quiz", "superquiz"]),
            orderBy("createdAt", "desc"),
            startAfter(realtimePageState.lastDoc),
            limit(6)
        );
    } else {
        q = query(
            collection(db, "questions"),
            where("type", "in", ["quiz", "superquiz"]),
            orderBy("createdAt", "desc"),
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
            slider.appendChild(card);
        }
    });
}

let realtimePage = 0;
const REALTIME_PAGE_SIZE = 7;

async function renderRealtimePosts() {
    const container = document.getElementById("realtime-post-list");
    if (!container) return;
    
    const q = query(
        collection(db, "questions"),
        orderBy("createdAt", "desc"),
        limit(50)
    );
    
    const snapshot = await getDocs(q);
    
    const posts = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));
    
    container.innerHTML = ""; // Clear list
    
    const start = realtimePage * REALTIME_PAGE_SIZE;
    const end = start + REALTIME_PAGE_SIZE;
    const visiblePosts = posts.slice(start, end);
    
    visiblePosts.forEach(post => {
        const data = post;
        const item = document.createElement("a");
        item.href = `view.html?id=${post.id}`;
        item.className = "block border rounded-lg px-4 py-3 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 transition";

        const badge = getPostTypeBadge(data);
        const commentCount = data.commentsCount || 0;
        const imageIcon = hasImage(data) ? "🖼" : "";
        const title = data.title || "제목 없음";

        item.innerHTML = `
        <div class="flex items-center gap-2 text-sm">

            <span class="text-xs font-semibold text-[#169976]">
                [${badge}]
            </span>

            <div class="flex items-center gap-1 flex-1 min-w-0">
                <span class="truncate">
                    ${title}
                </span>
                ${commentCount > 0 ? `<span class="text-red-500 text-xs flex-shrink-0">[${commentCount}]</span>` : ""}
            </div>

            ${imageIcon ? `<span class="text-slate-400">${imageIcon}</span>` : ""}

            <span class="text-xs text-slate-400 ml-auto">
                ${formatTime(data.createdAt)}
            </span>

            <span class="text-xs text-slate-400 ml-2">
                👁 ${post.views || 0}
            </span>

        </div>
        `;

        container.appendChild(item);
    });
}

async function loadPopularSuperQuizzes() {
    const q = query(
        collection(db, "questions"),
        where("type", "==", "superquiz"),
        where("popularityScore", ">=", 0),
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
    const slider = document.getElementById("popular-quiz-slider");
    if (!slider) return;

    slider.innerHTML = ''; // Clear previous content

    const quizzes = await loadPopularSuperQuizzes();
    const pageSize = 3;

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
        where("type", "==", "quiz"),
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
    const slider = document.getElementById("super-quiz-slider");
    if (!slider) return;

    slider.innerHTML = '';

    const quizzes = await loadPopularQuizzes();
    const pageSize = 3;

    if (quizzes.length === 0) {
        slider.innerHTML = '<p class="text-center text-slate-500 w-full">인기 픽이 없습니다.</p>';
        return;
    }

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

export async function updatePopularityScore(quizId) {
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

function initializeHeader() {
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
    // --- Modal elements & Auth buttons ---
    const loginModal = document.getElementById('login-modal');
    const loginModalButton = document.getElementById('login-modal-button');
    const loginModalCloseButton = document.getElementById('login-modal-close-button');
    const logoutButton = document.getElementById('logout-button');

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
    // --- Logout Logic ---
}

window.initializeHeader = initializeHeader;

document.addEventListener('DOMContentLoaded', async () => {

    setupQuestionsListener();
    await preloadQuizzes();
    await loadHeader();
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                handleSearch(searchInput.value);
            }
        });
    }

    if (window.location.pathname.includes('search.html')) {
        // Search page logic is handled by its own inline script
    } else {
        renderCategoryNavbar();
        renderCategorySections().then(() => {
            const auth = getAuth();
            if (auth.currentUser) restoreAllLikeStates(auth.currentUser.uid);
        });
        renderRealtimeSection();
        renderRealtimePosts();
        renderSuperQuizSection().then(() => {
            const auth = getAuth();
            if (auth.currentUser) restoreAllLikeStates(auth.currentUser.uid);
        });
        renderPopularQuizSection().then(() => {
            const auth = getAuth();
            if (auth.currentUser) {
                restoreUserVotes(auth.currentUser);
                restoreAllLikeStates(auth.currentUser.uid);
            }
        });
        loadTrendingKeywords();

        const realtimePrevBtn = document.getElementById('realtime-prev');
        const realtimeNextBtn = document.getElementById('realtime-next');

        if (realtimeNextBtn) {
            realtimeNextBtn.onclick = async () => {
                const snapshot = await getDocs(query(collection(db, "questions"), orderBy("createdAt", "desc"), limit(50)));
                if ((realtimePage + 1) * REALTIME_PAGE_SIZE < snapshot.size) {
                    realtimePage++;
                    renderRealtimePosts();
                }
            };
        }

        if (realtimePrevBtn) {
            realtimePrevBtn.onclick = () => {
                realtimePage = Math.max(0, realtimePage - 1);
                renderRealtimePosts();
            };
        }

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
            let currentPage = 0;

            const updatePopularButtons = () => {
                const pageCount = popularSlider.querySelectorAll('.super-quiz-page').length;
                popularLeft.disabled = currentPage === 0;
                popularRight.disabled = currentPage >= pageCount - 1;
                popularLeft.style.opacity = popularLeft.disabled ? '0.5' : '1';
                popularRight.style.opacity = popularRight.disabled ? '0.5' : '1';
            };

            popularRight.addEventListener('click', () => {
                const pageCount = popularSlider.querySelectorAll('.super-quiz-page').length;
                if (currentPage < pageCount - 1) {
                    currentPage++;
                    popularSlider.style.transform = `translateX(-${currentPage * 100}%)`;
                    updatePopularButtons();
                }
            });

            popularLeft.addEventListener('click', () => {
                if (currentPage > 0) {
                    currentPage--;
                    popularSlider.style.transform = `translateX(-${currentPage * 100}%)`;
                    updatePopularButtons();
                }
            });

            updatePopularButtons();
        }
    }

    const quizContentArea = document.getElementById('quiz-content-area');
    if(quizContentArea) {
        quizContentArea.addEventListener('click', (event) => {
            const voteButton = event.target.closest('.vote-option-btn');
            const likeButton = event.target.closest('.like-button');
            const commentToggleButton = event.target.closest('.comment-toggle-button');

            if (likeButton) {
                const card = likeButton.closest('[data-quiz-id]');
                const quizId = card.dataset.quizId;
                handleCardLike(quizId, card);
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
                    allOptionButtons.forEach(btn => btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-[#169976]', 'ring-red-400', 'ring-slate-400'));
                } else {
                    allOptionButtons.forEach(btn => {
                        btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-[#169976]', 'ring-red-400', 'ring-slate-400');
                        if (btn !== voteButton) btn.classList.add('opacity-50');
                    });
                    let ringColorClass = voteButton.classList.contains('bg-[#169976]') ? 'ring-[#169976]' : (voteButton.classList.contains('bg-red-500') ? 'ring-red-400' : 'ring-slate-400');
                    voteButton.classList.add('ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', ringColorClass);
                }
                
                // Update Firestore using a transaction
                (async () => {
                    const voteSuccessful = await handleVote(card.dataset.quizId, clickedOptionId);

                    if (voteSuccessful) {
                        await updatePopularityScore(card.dataset.quizId);

                        if (auth.currentUser) {
                            restoreUserVotes(auth.currentUser);
                        }
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


    // --- Tab & Accordion Functionality --- //
    const categoryTabs = document.getElementById('category-tabs');
    if (categoryTabs) {
        categoryTabs.addEventListener('click', (e) => {
            if (!e.target.classList.contains('tab-button')) return;

            const buttons = categoryTabs.querySelectorAll('tab-button');
            buttons.forEach(btn => {
                btn.classList.remove('active', 'bg-[#169976]', 'text-white');
                btn.classList.add('text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-100', 'dark:hover:bg-slate-700');
            });
            
            e.target.classList.add('active', 'bg-[#169976]', 'text-white');
            e.target.classList.remove('text-slate-600', 'dark:text-slate-300', 'hover:bg-slate-100', 'dark:hover:bg-slate-700');
        });
    }

    const loginView = document.getElementById('login-view');
    const registerView = document.getElementById('register-view');
    const showRegisterLink = document.getElementById('show-register-view-link');
    const showLoginLink = document.getElementById('show-login-view-link');


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
    onAuthStateChanged(auth, async (user) => {
        const loginButton = document.getElementById('login-modal-button');
        const logoutButton = document.getElementById('logout-button');
        const userProfileInfo = document.getElementById('user-profile-info');
        const userNickname = document.getElementById('user-nickname');
        const userPoints = document.getElementById('user-points');

        const headerAvatar = document.getElementById("user-avatar");

        const userRef = doc(db, "userProfiles", user.uid);

        onSnapshot(userRef, (docSnap) => {

         if (!docSnap.exists()) return;

         const data = docSnap.data();

         if (headerAvatar && data.photoURL) {
         headerAvatar.src = data.photoURL;
         }

     });

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
            
            restoreAllLikeStates(user.uid);

        } else {
            if(loginButton) loginButton.classList.remove('hidden');
            if(logoutButton) logoutButton.classList.add('hidden');
            if(userProfileInfo) userProfileInfo.classList.add('hidden');
            if(userProfileInfo) userProfileInfo.classList.remove('flex');

            document.querySelectorAll('.vote-option-btn').forEach(btn => {
                btn.classList.remove('opacity-50', 'ring-2', 'ring-offset-2', 'dark:ring-offset-slate-800', 'ring-[#169976]', 'ring-red-400', 'ring-slate-400', 'ring-[#169976]');
            });

            restoreAllLikeStates(null);
        }
        const profileNameEl = document.getElementById("profile-name");
        const profilePointsEl = document.getElementById("profile-points");
        const profileImageEl = document.getElementById("profile-image");

        if (user && profileNameEl && profilePointsEl) {

            const userRef = doc(db, "userProfiles", user.uid);
            const snap = await getDoc(userRef);

            if (snap.exists()) {

                const data = snap.data();

                profileNameEl.textContent = data.displayName || "사용자";
                profilePointsEl.textContent = (data.points || 0) + " 포인트";

                if (profileImageEl && data.photoURL) {
                    profileImageEl.src = data.photoURL;
                }

            }

        }
    });
});
