import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, query, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let currentSortOrder = 'points'; // Default sort order
let unsubscribe;
let lastFetchedData = []; // Cache the last fetched data

function subscribeToRanking() {
  if (unsubscribe) {
    unsubscribe();
  }

  // For 'rate', we fetch by a more stable field like points and sort client-side
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
    renderRanking(lastFetchedData);
  });
}

function renderRanking(data) {
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
  // 'points' sorting is handled by the query, but we can rely on the initial fetch order

  const filteredData = dataToSort.filter((user) => !user.isBanned);

  const currentUser = auth.currentUser;
  if (currentUser) {
    const myIndex = filteredData.findIndex((user) => user.id === currentUser.uid);
    if (myIndex !== -1) {
      const myUserData = filteredData[myIndex];
      const myRank = myIndex + 1;
      const myPoints = myUserData.points || 0;
      const myWins = myUserData.winCount || 0;
      const myTotal = myUserData.totalParticipation || 0;
      const myWinRate = myTotal > 0 ? Math.round((myWins / myTotal) * 100) : 0;

      const myRankBox = document.querySelector(".mt-10 .font-semibold");
      if (myRankBox) {
        myRankBox.innerHTML = `
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
        `;
      }
    }
  }

  const rankingBody = document.getElementById("ranking-body");
  rankingBody.innerHTML = "";

  filteredData.forEach((user, index) => {
    const wins = user.winCount || 0;
    const total = user.totalParticipation || 0;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
    
    const row = document.createElement("div");
    row.className = "flex justify-between items-center py-4 border-b border-slate-200 dark:border-slate-700";

    if (currentUser && user.id === currentUser.uid) {
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
        <span class="ml-2 font-semibold">${user.displayName || "익명"}</span>
      </div>
      <div class="flex items-baseline gap-2 text-sm font-semibold">
        <span class="text-base text-slate-800 dark:text-slate-200">${user.points || 0} P</span>
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
    subscribeToRanking();
});
document.getElementById('sort-wins').addEventListener('click', () => {
    currentSortOrder = 'winCount';
    setActiveSortButton('sort-wins');
    // We can re-render the cached data for wins and rate, no need to re-fetch
    renderRanking(lastFetchedData);
});
document.getElementById('sort-rate').addEventListener('click', () => {
    currentSortOrder = 'rate';
    setActiveSortButton('sort-rate');
    renderRanking(lastFetchedData);
});

// Initial load
setActiveSortButton('sort-points');
subscribeToRanking();
