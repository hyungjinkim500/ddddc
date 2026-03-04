import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, query, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let currentSortOrder = 'points'; // Default sort order
let unsubscribe;
let lastFetchedData = []; // Cache the last fetched data

const myRankingSection = document.getElementById("my-ranking");
if (myRankingSection) {
    myRankingSection.style.visibility = "hidden";
}

onAuthStateChanged(auth, (user) => {
    subscribeToRanking(user);
});

function subscribeToRanking(user) {
  if (unsubscribe) {
    unsubscribe();
  }

  const fetchOrder = (currentSortOrder === 'rate' || currentSortOrder === 'winCount') ? 'points' : currentSortOrder;

  const q = query(
    collection(db, "userProfiles"),
    orderBy(fetchOrder, "desc"),
    limit(50)
  );

  unsubscribe = onSnapshot(q, (snapshot) => {
    lastFetchedData = [];
    snapshot.forEach((doc) => {
      lastFetchedData.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    renderRanking(lastFetchedData, user);
  });
}

function renderRanking(data, user) {
  const dataToSort = [...data];

  // Client-side sorting for win rate or win count
  if (currentSortOrder === 'rate') {
    dataToSort.sort((a, b) => {
      const winRateA = (a.totalParticipation || 0) > 0 ? (a.winCount || 0) / a.totalParticipation : 0;
      const winRateB = (b.totalParticipation || 0) > 0 ? (b.winCount || 0) / b.totalParticipation : 0;
      if (winRateB !== winRateA) return winRateB - winRateA;
      return (b.points || 0) - (a.points || 0); // Secondary sort by points
    });
  } else if (currentSortOrder === 'winCount') {
    dataToSort.sort((a, b) => {
        if ((b.winCount || 0) !== (a.winCount || 0)) {
            return (b.winCount || 0) - (a.winCount || 0);
        }
        return (b.points || 0) - (a.points || 0); // Secondary sort by points
    });
  }

  const filteredData = dataToSort.filter((u) => !u.isBanned);

  if (!user) {
    if (myRankingSection) {
        myRankingSection.innerHTML = `
            <h3 class="text-sm text-slate-500 dark:text-slate-400 mb-2">내 랭킹</h3>
            <div class="bg-slate-100 dark:bg-slate-800 rounded-xl px-6 py-4 shadow-sm text-center font-semibold text-slate-500 dark:text-slate-400">
                로그인 후 내 랭킹을 확인할 수 있습니다.
            </div>
        `;
        myRankingSection.style.visibility = "visible";
    }
} else {
    const myIndex = filteredData.findIndex((u) => u.id === user.uid);
    if (myRankingSection) {
        if (myIndex !== -1) {
            const myUserData = filteredData[myIndex];
            const myRank = myIndex + 1;
            const myPoints = myUserData.points || 0;
            const myWins = myUserData.winCount || 0;
            const myTotal = myUserData.totalParticipation || 0;
            const myWinRate = myTotal > 0 ? Math.round((myWins / myTotal) * 100) : 0;

            myRankingSection.innerHTML = `
                <h3 class="text-sm text-slate-500 dark:text-slate-400 mb-2">내 랭킹</h3>
                <div class="bg-slate-100 dark:bg-slate-800 rounded-xl px-6 py-4 shadow-sm">
                    <div class="flex justify-between items-center font-semibold">
                        <div class="flex items-center gap-4">
                            <span>내 순위: ${myRank}</span>
                            <span>사용자: ${myUserData.displayName || "익명"}</span>
                        </div>
                        <div class="flex items-baseline gap-2 text-sm font-semibold">
                            <span class="text-base text-slate-800 dark:text-slate-200">${myPoints} P</span>
                            <span class="text-slate-300 dark:text-slate-600">|</span>
                            <span>${myWins} 승</span>
                            <span class="text-slate-300 dark:text-slate-600">|</span>
                            <span>${myWinRate}%</span>
                        </div>
                    </div>
                </div>
            `;
        } else {
            myRankingSection.innerHTML = `
                <h3 class="text-sm text-slate-500 dark:text-slate-400 mb-2">내 랭킹</h3>
                <div class="bg-slate-100 dark:bg-slate-800 rounded-xl px-6 py-4 shadow-sm text-center font-semibold text-slate-500 dark:text-slate-400">
                    아직 랭킹에 등록되지 않았습니다.
                </div>
            `;
        }
        myRankingSection.style.visibility = "visible";
    }
  }

  const rankingBody = document.getElementById("ranking-body");
  rankingBody.innerHTML = "";

  filteredData.forEach((item, index) => {
    const wins = item.winCount || 0;
    const total = item.totalParticipation || 0;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    
    const row = document.createElement("div");
    row.className = "flex justify-between items-center py-4 border-b border-slate-200 dark:border-slate-700";

    if (user && item.id === user.uid) {
      row.classList.add(
        "bg-emerald-50",
        "dark:bg-emerald-900/20",
        "border-l-4",
        "border-emerald-500"
      );
    }

    row.innerHTML = `
      <div class="flex items-center">
        <span class="w-12 text-center font-bold ${
          index === 0 ? "text-2xl" : index === 1 ? "text-xl" : index === 2 ? "text-xl" : ""
        }" style="color: ${
          index === 0 ? '#D4AF37' : index === 1 ? '#C0C0C0' : index === 2 ? '#CD7F32' : ''
        };">
          ${index + 1}
        </span>
        <span class="ml-2 font-semibold">${item.displayName || "익명"}</span>
      </div>
      <div class="flex items-baseline gap-2 text-sm font-semibold">
        <span class="text-base text-slate-800 dark:text-slate-200">${item.points || 0} P</span>
        <span class="text-slate-300 dark:text-slate-600">|</span>
        <span>${wins} 승</span>
        <span class="text-slate-300 dark:text-slate-600">|</span>
        <span>${winRate}%</span>
      </div>
    `;
    rankingBody.appendChild(row);
  });
}

function setActiveSortButton(activeButtonId) {
    const buttonIds = ['sort-points', 'sort-wins', 'sort-rate'];
    
    buttonIds.forEach(id => {
        const button = document.getElementById(id);
        if (button) {
            button.classList.remove('bg-emerald-500', 'text-white');
            button.classList.add('bg-slate-200', 'text-slate-700', 'dark:bg-slate-700', 'dark:text-slate-200');
        }
    });

    const activeButton = document.getElementById(activeButtonId);
    if (activeButton) {
        activeButton.classList.remove('bg-slate-200', 'text-slate-700', 'dark:bg-slate-700', 'dark:text-slate-200');
        activeButton.classList.add('bg-emerald-500', 'text-white');
    }
}

document.getElementById('sort-points').addEventListener('click', () => {
    currentSortOrder = 'points';
    setActiveSortButton('sort-points');
    subscribeToRanking(auth.currentUser);
});
document.getElementById('sort-wins').addEventListener('click', () => {
    currentSortOrder = 'winCount';
    setActiveSortButton('sort-wins');
    renderRanking(lastFetchedData, auth.currentUser);
});
document.getElementById('sort-rate').addEventListener('click', () => {
    currentSortOrder = 'rate';
    setActiveSortButton('sort-rate');
    renderRanking(lastFetchedData, auth.currentUser);
});

// Initial load
setActiveSortButton('sort-points');
