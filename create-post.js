import { db, auth } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("create-quiz-form");
  const optionsContainer = document.getElementById("options-list");
  const addOptionBtn = document.getElementById("add-option-btn");
  const pickThemeContainer = document.getElementById("pick-theme-container");
  const pickThemeSelect = document.getElementById("pick-theme-select");
  const pollSettings = document.getElementById("poll-settings");
  const quizTypeRadios = form.querySelectorAll('input[name="quiz-type"]');

  const pickThemes = {
    yesno: ["그렇다", "아니다"],
    updown: ["Up", "Down"],
    winlose: ["승", "패"],
    onetwo: ["1번", "2번"],
    yyyn: ["ㅇㅇ", "ㄴㄴ"]
  };

  let currentUser = null;

  onAuthStateChanged(auth, (user) => {
    if (!user) {
      window.location.href = "index.html";
    } else {
      currentUser = user;
    }
  });

  function createOptionElement(isTopic) {
    const optionDiv = document.createElement("div");
    optionDiv.className = "flex items-center gap-2";

    const input = document.createElement("input");
    input.type = "text";
    input.name = "option";
    input.required = true;
    input.className =
      "w-full px-4 py-3 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal transition";
    input.placeholder = "선택지 입력";

    optionDiv.appendChild(input);

    if (isTopic) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.innerHTML = '<i class="fa-solid fa-times text-slate-400"></i>';
        removeBtn.addEventListener("click", () => {
            if (optionsContainer.children.length > 3) {
                optionDiv.remove();
            } else {
                alert("Topic은 최소 3개의 선택지가 필요합니다.");
            }
        });
        optionDiv.appendChild(removeBtn);
    }

    return optionDiv;
  }

  const setupOptions = () => {
    if (!optionsContainer) {
      console.error("Options container not found");
      return;
    }
    optionsContainer.innerHTML = "";
    const selectedRadio = form.querySelector('input[name="quiz-type"]:checked');
    const optionsWrapper = document.getElementById('options-container');

    if (!selectedRadio) {
      pollSettings.style.display = "none";
      optionsWrapper.style.display = "none";
      addOptionBtn.style.display = "none";
      pickThemeContainer.style.display = "none";
      return;
    }

    pollSettings.style.display = "block";
    optionsWrapper.style.display = "block";

    const selectedType = selectedRadio.value;

    if (selectedType === "quiz") {
      pickThemeContainer.style.display = "block";
      addOptionBtn.style.display = "none";
    } else if (selectedType === "superquiz") {
      pickThemeContainer.style.display = "none";
      optionsContainer.appendChild(createOptionElement(true));
      optionsContainer.appendChild(createOptionElement(true));
      optionsContainer.appendChild(createOptionElement(true));
      addOptionBtn.style.display = "block";
    }
  };
  
  let lastChecked = null;
  quizTypeRadios.forEach(radio => {
      radio.addEventListener('click', function() {
          if (lastChecked === this) {
              this.checked = false;
              lastChecked = null;
          } else {
              lastChecked = this;
          }
          setupOptions();
      });
  });

  pickThemeSelect.addEventListener("change", () => {
    optionsContainer.innerHTML = "";
    const theme = pickThemeSelect.value;
    if (!theme) return;
    if (theme === "custom") {
      const a = createOptionElement(false);
      const b = createOptionElement(false);
      a.querySelector("input").maxLength = 5;
      b.querySelector("input").maxLength = 5;
      optionsContainer.appendChild(a);
      optionsContainer.appendChild(b);
      return;
    }
    const preset = pickThemes[theme];
    if (preset) {
      preset.forEach(text => {
        const el = createOptionElement(false);
        const input = el.querySelector("input");
        input.value = text;
        input.readOnly = true;
        optionsContainer.appendChild(el);
      });
    }
  });

  addOptionBtn.addEventListener("click", () => {
    const selectedType =
      form.querySelector('input[name="quiz-type"]:checked').value;
    if (selectedType === "superquiz") {
      if (optionsContainer.children.length >= 5) {
        alert("Topic은 최대 5개의 선택지만 가능합니다.");
        return;
      }
      optionsContainer.appendChild(createOptionElement(true));
    }
  });
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentUser) {
      alert("로그인이 필요합니다.");
      return;
    }
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (!data.title || !data.title.trim()) {
      alert("제목을 입력해주세요.");
      return;
    }
    if (!data.category) {
      alert("카테고리를 선택해주세요.");
      return;
    }
    if (data.participantLimit) {
      const limit = Number(data.participantLimit);
      if (limit < 10 || limit > 500) {
        alert("참가자 제한은 10명 이상 500명 이하입니다.");
        return;
      }
    }

    const optionInputs = Array.from(form.querySelectorAll('[name="option"]')).filter(input => input.value.trim() !== "");
    const quizType = data['quiz-type'];

    if (quizType === "quiz" && optionInputs.length !== 2) {
      alert("VS Pick은 선택지가 정확히 2개여야 합니다.");
      return;
    }
    if (quizType === "superquiz" && (optionInputs.length < 3 || optionInputs.length > 5)) {
      alert("Topic은 선택지가 3~5개여야 합니다.");
      return;
    }

    const options = optionInputs.map((input, i) => ({
      id: `option_${i + 1}`,
      label: input.value,
      color: "slate"
    }));
    
    try {
      const postData = {
        category: data.category,
        title: data.title,
        description: data.description,
        options,
        creatorId: currentUser.uid,
        creatorName: currentUser.displayName,
        createdAt: serverTimestamp(),
        status: "active",
        views: 0,
        vote: {},
        participants: [],
        likesCount: 0,
        commentsCount: 0,
        theme: data.theme
      };

      if (quizType) {
        postData.type = quizType;
        postData.isSuper = quizType === "superquiz";
      }

      await addDoc(collection(db, "questions"), postData);
      window.location.href = "quiz.html";
    } catch (error) { 
      console.error("Error adding document: ", error);
      alert("게시물 생성 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  });
  // Initial setup on page load
  setupOptions();
});
