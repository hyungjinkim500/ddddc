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
  const quizTypeRadios = form.querySelectorAll('input[name="quiz-type"]');

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
    const selectedType = form.querySelector('input[name="quiz-type"]:checked').value;

    if (selectedType === "quiz") {
      optionsContainer.appendChild(createOptionElement(false));
      optionsContainer.appendChild(createOptionElement(false));
      addOptionBtn.style.display = "none";
    } else { // superquiz
      optionsContainer.appendChild(createOptionElement(true));
      optionsContainer.appendChild(createOptionElement(true));
      optionsContainer.appendChild(createOptionElement(true));
      addOptionBtn.style.display = "block";
    }
  };

  quizTypeRadios.forEach(radio => {
    radio.addEventListener('change', setupOptions);
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

    const optionInputs = Array.from(form.querySelectorAll('[name="option"]')).filter(input => input.value.trim() !== "");
    const quizType = data['quiz-type'];

    if (quizType === 'quiz' && optionInputs.length !== 2) {
        alert('VS Pick은 정확히 2개의 선택지가 필요합니다.');
        return;
    }

    if (quizType === 'superquiz' && (optionInputs.length < 3 || optionInputs.length > 5)) {
        alert('Topic은 3개에서 5개 사이의 선택지가 필요합니다.');
        return;
    }

    const options = optionInputs.map((input, i) => ({
      id: `option_${i + 1}`,
      label: input.value,
      color: "slate"
    }));

    try {
      await addDoc(collection(db, "questions"), {
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
        type: quizType,
        isSuper: quizType === 'superquiz'
      });

      window.location.href = "quiz.html";

    } catch (error) {
      console.error("Error adding document: ", error);
      alert("게시물 생성 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  });

  // Initial setup on page load
  setupOptions();
});
