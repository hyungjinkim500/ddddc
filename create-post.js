import { db, auth } from "./firebase-config.js";
import {
  collection,
  addDoc,
  serverTimestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getStorage, ref, uploadBytes, getDownloadURL } 
from "https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js";
import { compressImage } from "./image-compress.js";
import { getFirestore, doc as fsDoc, getDoc as fsGetDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const storage = getStorage();

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("create-quiz-form");
  const optionsContainer = document.getElementById("options-list");
  const addOptionBtn = document.getElementById("add-option-btn");
  const pickThemeContainer = document.getElementById("pick-theme-container");
  const pickThemeSelect = document.getElementById("pick-theme-select");
  const pollSettings = document.getElementById("poll-settings");
  const quizTypeRadios = form.querySelectorAll('input[name="quiz-type"]');
  const imageInput = document.getElementById("image-input");
  const imagePreview = document.getElementById("image-preview");
  const descriptionInput = document.getElementById("quiz-description");
  const descriptionCounter = document.getElementById("description-counter");

  // URL 파라미터로 타입 자동 설정 + 수정 모드 감지
  const urlParams = new URLSearchParams(window.location.search);
  const typeParam = urlParams.get('type');
  const isEditMode = urlParams.get('edit') === 'true';
  const editPostId = urlParams.get('id');

  if (descriptionInput && descriptionCounter) {
    descriptionInput.addEventListener("input", () => {
      const length = descriptionInput.value.length;
      descriptionCounter.textContent = `${length} / 2000`;
    });
  }

  let selectedImages = [];
  let existingImageUrls = []; // 수정 모드: 기존 이미지 URL 관리

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

  function createOptionElement(isTopic, index = 0) {
    const optionDiv = document.createElement("div");
    optionDiv.className = "flex items-center gap-2";

    const input = document.createElement("input");
    input.type = "text";
    input.name = "option";
    input.required = true;
    input.className =
      "w-full px-4 py-3 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal transition";
    
    input.maxLength = isTopic ? 20 : 10;
    
    const optionIndex = index;

    if (!isTopic) {
      if (optionIndex === 0) {
        input.placeholder = "선택지 입력 (최대 10글자) 초록";
        input.classList.add("border-emerald-500");
      }
      if (optionIndex === 1) {
        input.placeholder = "선택지 입력 (최대 10글자) 빨강";
        input.classList.add("border-red-500");
      }
    }

    if (isTopic) {
      input.placeholder = "선택지 입력 (최대 20글자)";
    }

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
    if (!optionsContainer) return;
    optionsContainer.innerHTML = "";
    const selectedRadio = form.querySelector('input[name="quiz-type"]:checked');
    const optionsWrapper = document.getElementById('options-container');

    if (!selectedRadio) {
      pollSettings.classList.add('hidden');
      optionsWrapper.classList.add('hidden');
      addOptionBtn.classList.add('hidden');
      pickThemeContainer.classList.add('hidden');
      return;
    }

    pollSettings.classList.remove('hidden');
    optionsWrapper.classList.remove('hidden');

    const selectedType = selectedRadio.value;

    if (selectedType === "quiz") {
      pickThemeContainer.classList.remove('hidden');
      addOptionBtn.classList.add('hidden');
    } else if (selectedType === "superquiz") {
      pickThemeContainer.classList.add('hidden');
      optionsContainer.appendChild(createOptionElement(true));
      optionsContainer.appendChild(createOptionElement(true));
      optionsContainer.appendChild(createOptionElement(true));
      addOptionBtn.classList.remove('hidden');
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
      const a = createOptionElement(false, 0);
      const b = createOptionElement(false, 1);
      optionsContainer.appendChild(a);
      optionsContainer.appendChild(b);
      return;
    }
    const preset = pickThemes[theme];
    if (preset) {
      preset.forEach((text, index) => {
        const el = createOptionElement(false, index);
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

    const titleEl = document.getElementById('quiz-title');
    const title = (titleEl?.value || data.title || '').trim();

    if (!title) {
      alert("제목을 입력해주세요.");
      return;
    }

    if (title.length > 100) {
        alert("제목은 최대 100자까지 작성할 수 있습니다.");
        return;
    }

    if (data.description && data.description.length > 2000) {
        alert("본문은 최대 2000자까지 작성할 수 있습니다.");
        return;
    }

    // 카테고리는 숨김 처리 - 기본값 'free' 사용
    if (!data.category) data.category = 'free';

    const quizType = data['quiz-type'];

    // 참가자 제한 validation (수정 모드에서는 스킵)
    const useLimit = !isEditMode && document.getElementById('use-participant-limit')?.checked;
    const limitInput = document.getElementById('participant-limit');
    const limitMsg = document.getElementById('participant-limit-msg');
    if (useLimit) {
      const limit = Number(data.participantLimit);
      if (!data.participantLimit || isNaN(limit)) {
        if (limitInput) { limitInput.classList.add('border-red-500'); limitInput.classList.remove('border-slate-200'); }
        if (limitMsg) limitMsg.classList.remove('hidden');
        limitInput?.focus();
        return;
      }
      if (limitInput) { limitInput.classList.remove('border-red-500'); limitInput.classList.add('border-slate-200'); }
      if (limitMsg) limitMsg.classList.add('hidden');
      if (limit < 10 || limit > 500) {
        alert("참가자 제한은 10명 이상 500명 이하입니다.");
        return;
      }
    }

    const optionInputs = Array.from(form.querySelectorAll('[name="option"]')).filter(input => !input.disabled && input.value.trim() !== "");

    if (!isEditMode) {
      if (quizType === 'quiz' && !data.theme) {
        alert('VS Pick 테마를 선택해주세요.');
        return;
      }
      if (quizType === "quiz" && optionInputs.length !== 2) {
        alert("VS Pick은 선택지가 정확히 2개여야 합니다.");
        return;
      }
      if (quizType === "superquiz" && (optionInputs.length < 3 || optionInputs.length > 5)) {
        alert("Topic은 선택지가 3~5개여야 합니다.");
        return;
      }
    }

    const options = optionInputs.map((input, i) => ({
      id: `option_${i + 1}`,
      label: input.value,
      color: "slate"
    }));
    
    // userProfiles에서 photoURL 조회
    let _creatorPhotoURL = '';
    try {
        const profileSnap = await fsGetDoc(fsDoc(db, 'userProfiles', currentUser.uid));
        if (profileSnap.exists()) _creatorPhotoURL = profileSnap.data().photoURL || '';
    } catch (e) {}

    try {
      const postData = {
        category: data.category,
        title: title,
        description: data.description,
        options,
        creatorId: currentUser.uid,
        creatorName: currentUser.displayName,
        creatorPhotoURL: _creatorPhotoURL || currentUser.photoURL || '',
        createdAt: serverTimestamp(),
        status: "active",
        views: 0,
        vote: {},
        participants: [],
        likesCount: 0,
        commentsCount: 0,
        theme: data.theme,
        ...(isEditMode ? {} : { imageUrls: [] }),
        allowNoVoteComment: document.getElementById('allow-no-vote-comment')?.checked || false,
      };

      if (quizType) {
        postData.type = quizType;
        postData.isSuper = quizType === "superquiz";
        postData.participantLimit = Number(data.participantLimit) || 0;
      }

      let docRef;
      if (isEditMode && editPostId) {
        // 수정 모드: 기존 문서 업데이트 (생성 관련 필드 제외)
        const { createdAt, views, vote, participants, likesCount, commentsCount, ...updateData } = postData;
        // undefined 값 제거 (disabled 필드가 FormData에 포함 안 될 경우 대비)
        Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);
        // 수정 모드에서 options가 빈 배열이면 기존 값 유지 (투표 사라짐 방지)
        if (isEditMode && Array.isArray(updateData.options) && updateData.options.length === 0) {
            delete updateData.options;
        }
        docRef = fsDoc(db, 'questions', editPostId);
        await updateDoc(docRef, updateData);
      } else {
        // 신규 등록
        docRef = await addDoc(collection(db, "questions"), postData);
      }

      if (isEditMode) {
        // 수정 모드: 기존 유지 이미지 + 새 이미지 합치기
        const imageUrls = [...existingImageUrls];
        for (let i = 0; i < selectedImages.length; i++) {
          const imageBlob = selectedImages[i];
          const imageRef = ref(storage, `postImages/${editPostId}/new_${Date.now()}_${i}.jpg`);
          await uploadBytes(imageRef, imageBlob);
          const downloadURL = await getDownloadURL(imageRef);
          imageUrls.push(downloadURL);
        }
        await updateDoc(docRef, { imageUrls });
      } else if (selectedImages.length > 0) {
        const imageUrls = [];
        for (let i = 0; i < selectedImages.length; i++) {
          const imageBlob = selectedImages[i];
          const imageRef = ref(storage, `postImages/${docRef.id}/${i}.jpg`);
          await uploadBytes(imageRef, imageBlob);
          const downloadURL = await getDownloadURL(imageRef);
          imageUrls.push(downloadURL);
        }
        await updateDoc(docRef, { imageUrls });
      }

      window.location.href = isEditMode ? `post.html?id=${editPostId}` : "index.html";
    } catch (error) { 
      console.error("Error adding document: ", error);
      alert("게시물 생성 중 오류가 발생했습니다. 다시 시도해 주세요.");
    }
  });

  imageInput.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files);
  
    for (const file of files) {
      if (existingImageUrls.length + selectedImages.length >= 4) {
        alert("이미지는 최대 4장까지 업로드 가능합니다.");
        break;
      }
  
      if (file.size > 10 * 1024 * 1024) {
        alert("이미지 크기는 10MB 이하만 가능합니다.");
        continue;
      }

      if (!file.type.startsWith("image/")) {
        alert("이미지 파일만 업로드 가능합니다.");
        continue;
      }
  
      try {
        const compressedBlob = await compressImage(file);
        selectedImages.push(compressedBlob);
      } catch (error) {
        alert("이미지 압축에 실패했습니다.");
      }
    }
  
    renderImagePreview();
  
    // Clear the input to allow re-selecting the same file
    e.target.value = "";
  });
  
  function renderExistingImages() {
    const existingContainer = document.getElementById('existing-image-preview');
    if (!existingContainer) return;
    existingContainer.innerHTML = '';
    existingImageUrls.forEach((url, index) => {
      const wrapper = document.createElement('div');
      wrapper.className = 'relative';
      const img = document.createElement('img');
      img.src = url;
      img.className = 'w-full h-24 object-cover rounded-lg';
      const removeBtn = document.createElement('button');
      removeBtn.innerHTML = '✕';
      removeBtn.type = 'button';
      removeBtn.className = 'absolute top-1 right-1 bg-black/60 text-white text-xs px-1 rounded';
      removeBtn.addEventListener('click', () => {
        existingImageUrls.splice(index, 1);
        renderExistingImages();
      });
      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
      existingContainer.appendChild(wrapper);
    });
  }

  function renderImagePreview() {
    imagePreview.innerHTML = "";
  
    selectedImages.forEach((blob, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "relative";
  
      const img = document.createElement("img");
      const url = URL.createObjectURL(blob);
      img.src = url;
      img.className = "w-full h-24 object-cover rounded-lg";
      img.onload = () => {
        URL.revokeObjectURL(url);
      };
  
      const removeBtn = document.createElement("button");
      removeBtn.innerHTML = "✕";
      removeBtn.className =
        "absolute top-1 right-1 bg-black/60 text-white text-xs px-1 rounded";
  
      removeBtn.addEventListener("click", () => {
        selectedImages.splice(index, 1);
        renderImagePreview();
      });
  
      wrapper.appendChild(img);
      wrapper.appendChild(removeBtn);
  
      imagePreview.appendChild(wrapper);
    });
  }
  
  if (typeParam === 'pix') {
      const quizRadio = document.getElementById('type-quiz');
      if (quizRadio) quizRadio.checked = true;
  }

  // 수정 모드: 제목/본문 로드
  if (isEditMode && editPostId) {
      try {
          const postSnap = await fsGetDoc(fsDoc(db, 'questions', editPostId));
          if (postSnap.exists()) {
              const post = postSnap.data();
              const titleInput = document.getElementById('quiz-title');
              const descInput = document.getElementById('quiz-description');
              if (titleInput) titleInput.value = post.title || '';
              if (descInput) {
                  descInput.value = post.description || '';
                  if (descriptionCounter) descriptionCounter.textContent = `${descInput.value.length} / 2000`;
              }

              // 기존 이미지 미리보기
              if (Array.isArray(post.imageUrls) && post.imageUrls.length > 0) {
                  existingImageUrls = [...post.imageUrls];
                  renderExistingImages();
              }

              // 타입 설정
              if (post.type === 'quiz' || post.type === 'superquiz') {
                  const radioId = post.type === 'quiz' ? 'type-quiz' : 'type-superquiz';
                  const radio = document.getElementById(radioId);
                  if (radio) { radio.checked = true; lastChecked = radio; }
                  setupOptions();

                  // VS Pick 테마
                  if (post.type === 'quiz' && post.theme) {
                      pickThemeSelect.value = post.theme;
                      pickThemeSelect.dispatchEvent(new Event('change'));
                      if (post.theme === 'custom' && Array.isArray(post.options)) {
                          const inputs = optionsContainer.querySelectorAll('input[name="option"]');
                          post.options.forEach((opt, i) => {
                              if (inputs[i]) { inputs[i].value = opt.label; inputs[i].readOnly = false; }
                          });
                      }
                  }

                  // Topic 선택지
                  if (post.type === 'superquiz' && Array.isArray(post.options)) {
                      optionsContainer.innerHTML = '';
                      post.options.forEach((opt, i) => {
                          const el = createOptionElement(true, i);
                          el.querySelector('input').value = opt.label;
                          optionsContainer.appendChild(el);
                      });
                  }

                  // 참가자 제한
                  if (post.participantLimit > 0) {
                      const limitCheck = document.getElementById('use-participant-limit');
                      const limitInputBox = document.getElementById('participant-limit-input');
                      const limitInput = document.getElementById('participant-limit');
                      if (limitCheck) limitCheck.checked = true;
                      if (limitInputBox) limitInputBox.classList.remove('hidden');
                      if (limitInput) limitInput.value = post.participantLimit;
                  }

                  // 무투표 댓글 허용
                  const noVoteCheck = document.getElementById('allow-no-vote-comment');
                  if (noVoteCheck) noVoteCheck.checked = post.allowNoVoteComment || false;

                  // 투표 있는 게시글: 제목/픽설정 수정 불가 처리
                  const titleInput = document.getElementById('quiz-title');
                  if (titleInput) {
                      titleInput.disabled = true;
                      titleInput.classList.add('opacity-50', 'cursor-not-allowed');
                  }
                  const pollSettings = document.getElementById('poll-settings');
                  if (pollSettings) {
                      pollSettings.querySelectorAll('input, select, button').forEach(el => {
                          el.disabled = true;
                          el.classList.add('opacity-50', 'cursor-not-allowed');
                      });
                  }
                  // 안내 문구 추가
                  const titleSection = titleInput?.closest('div');
                  if (titleSection && !titleSection.querySelector('.edit-notice')) {
                      const notice = document.createElement('p');
                      notice.className = 'edit-notice text-xs text-slate-400 mt-1';
                      notice.textContent = '투표가 있는 게시글은 본문과 사진만 수정할 수 있습니다.';
                      titleSection.appendChild(notice);
                  }
              }
          }
      } catch (e) {
          console.error('수정 데이터 로드 실패', e);
      }
  }

  // 참가자 제한 체크박스 토글
  document.getElementById('use-participant-limit')?.addEventListener('change', (e) => {
      const inputBox = document.getElementById('participant-limit-input');
      if (inputBox) inputBox.classList.toggle('hidden', !e.target.checked);
      if (!e.target.checked) {
          const input = document.getElementById('participant-limit');
          if (input) input.value = '';
      }
  });

  // Initial setup on page load
  setupOptions();
});