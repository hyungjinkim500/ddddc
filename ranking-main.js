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

  const filteredData = rankingData.filter(user => !user.isBanned);

  const currentUser = auth.currentUser;

  if (currentUser) {
    const myIndex = filteredData.findIndex(user => user.id === currentUser.uid);

    if (myIndex !== -1) {
      const myRank = myIndex + 1;
      const myPoints = filteredData[myIndex].points || 0;

      const myRankBox = document.querySelector(".mt-10 .font-semibold");

      if (myRankBox) {
        myRankBox.innerHTML = `
          <div class="flex items-center gap-4">
            <span>내 순위: ${myRank}</span>
            <span>사용자: ${filteredData[myIndex].displayName || "익명"}</span>
          </div>
          <span>포인트: ${myPoints} P</span>
        `;
      }
    }
  }

  const rankingBody = document.getElementById("ranking-body");
  rankingBody.innerHTML = "";

  filteredData.forEach((user, index) => {
    const row = document.createElement("div");
    row.className = "flex justify-between items-center py-4 border-b border-slate-200 dark:border-slate-700";

    row.innerHTML = `
      <div class="flex items-center">
        <span class="w-12 text-center font-bold ${
          index === 0
            ? "text-3xl"
            : index === 1
            ? "text-3xl"
            : index === 2
            ? "text-3xl"
            : ""
        }" style="
          color: ${
            index === 0
              ? '#D4AF37'
              : index === 1
              ? '#C0C0C0'
              : index === 2
              ? '#CD7F32'
              : ''
          };
        ">
          ${index + 1}
        </span>
        <span class="ml-2 font-semibold">${user.displayName || "익명"}</span>
      </div>
      <span class="font-semibold">${user.points || 0} P</span>
    `;

    rankingBody.appendChild(row);
  });
});
