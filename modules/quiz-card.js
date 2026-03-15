const DEBUG = false;

const colorMap = {
  emerald: "bg-emerald-500 hover:bg-emerald-600",
  red: "bg-red-500 hover:bg-red-600",
  slate: "bg-slate-500 hover:bg-slate-600",
  yellow: "bg-yellow-400 hover:bg-yellow-500",
  sky: "bg-sky-400 hover:bg-sky-500"
};

export function formatTime(timestamp) {
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
      <div class="flex items-start justify-between gap-3">
        <div class="flex-1 min-w-0">
          <a href="quiz.html?id=${quizId}" class="quiz-title-link">
              <h3 class="quiz-title font-bold text-slate-900 dark:text-white hover:underline line-clamp-2">
                  ${quiz.title}
              </h3>
          </a>
          ${quiz.description ? `
          <p class="quiz-desc text-sm text-slate-500 dark:text-slate-400 truncate mt-1">
            ${quiz.description}
          </p>` : ''}
        </div>
        ${creatorHTML}
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
          <span class="time text-xs ml-auto">${formatTime(quiz.createdAt)}</span>
          <button class="share-button hover:text-teal transition-colors">
              <i class="fas fa-share-alt"></i>
          </button>
      </div>
    `;

    return quizCard;
}
