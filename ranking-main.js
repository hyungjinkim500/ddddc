import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, query, orderBy, limit, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const q = query(
  collection(db, 'userProfiles'),
  orderBy('points', 'desc'),
  limit(5)
);

onSnapshot(q, (snapshot) => {
  const rankingData = [];

  snapshot.forEach((doc) => {
    rankingData.push({
      id: doc.id,
      ...doc.data()
    });
  });

  console.log("RANK DATA STRUCTURE:", rankingData);

  const rankingBody = document.getElementById("ranking-body");
  rankingBody.innerHTML = "";

  rankingData.forEach((user, index) => {
    const row = document.createElement("div");
    row.className = "flex justify-between items-center py-4 border-b border-slate-200 dark:border-slate-700";

    row.innerHTML = `
      <div class="flex items-center">
        <span class="w-12 text-center font-bold">${index + 1}</span>
        <span class="ml-2 font-semibold">${user.displayName || "익명"}</span>
      </div>
      <span class="font-semibold">${user.points || 0} P</span>
    `;

    rankingBody.appendChild(row);
  });
});
