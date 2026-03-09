import { auth, db } from './firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, serverTimestamp, getDoc, doc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in, proceed with page setup.
            const form = document.getElementById('create-quiz-form');
            const addOptionBtn = document.getElementById('add-option-btn');
            const optionsContainer = document.getElementById('options-container').querySelector('.space-y-3');

            const quizTypeRadios = document.querySelectorAll('input[name="quiz-type"]');

            quizTypeRadios.forEach(radio => {
                radio.addEventListener('change', () => {
                    console.log("quiz type changed:", radio.value);
                    const optionInputs = optionsContainer.querySelectorAll('input[name="option"]');
                    const hasInput = Array.from(optionInputs).some(input => input.value.trim() !== "");

                    console.log("options have input:", hasInput);

                    if (hasInput) {
                        const confirmChange = confirm("퀴즈 모드를 변경하면 선택지가 초기화됩니다. 계속하시겠습니까?");
                        if (!confirmChange) {
                            return;
                        }
                    }
                    const quizType = radio.value;

                    const maxOptions = quizType === "superquiz" ? 3 : 5;

                    optionsContainer.innerHTML = "";

                    let colorSelectorHtml;
                    if (quizType === 'superquiz') {
                        colorSelectorHtml = `
                        <select name="option-color"
                        class="rounded-md bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 h-12">
                        <option value="emerald">초록</option>
                        <option value="red">빨강</option>
                        <option value="slate">회색</option>
                        </select>
                        `;
                    } else {
                        colorSelectorHtml = '<input type="hidden" name="option-color" value="slate">';
                    }

                    const option1 = document.createElement("div");
                    option1.className = "flex items-center gap-2";
                    option1.innerHTML = `
                    <input type="text" name="option" required placeholder="선택지 1"
                    class="w-full px-4 py-3 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal transition">
                    ${colorSelectorHtml.trim()}
                    `;

                    const option2 = document.createElement("div");
                    option2.className = "flex items-center gap-2";
                    option2.innerHTML = option1.innerHTML.replace("선택지 1", "선택지 2");

                    optionsContainer.appendChild(option1);
                    optionsContainer.appendChild(option2);

                });
            });

            const initialQuizTypeInput = document.querySelector('input[name="quiz-type"]:checked');
            if (initialQuizTypeInput) {
                initialQuizTypeInput.dispatchEvent(new Event('change'));
            }

            addOptionBtn.addEventListener('click', () => {
                const currentOptionCount = optionsContainer.children.length;

                const quizTypeInput = document.querySelector('input[name="quiz-type"]:checked');
                const quizType = quizTypeInput ? quizTypeInput.value : "quiz";

                const maxOptions = quizType === "superquiz" ? 3 : 5;

                if (currentOptionCount >= maxOptions) {
                    return;
                }

                let colorSelectorHtml;
                if (quizType === 'superquiz') {
                    colorSelectorHtml = `
                        <select name="option-color" class="rounded-md bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 h-12">
                            <option value="slate">회색</option>
                            <option value="emerald">초록</option>
                            <option value="red">빨강</option>
                        </select>
                    `;
                } else {
                    colorSelectorHtml = '<input type="hidden" name="option-color" value="slate">';
                }

                const optionIndex = optionsContainer.children.length + 1;
                const newOption = document.createElement('div');
                newOption.className = 'flex items-center gap-2';
                newOption.innerHTML = `
                    <input type="text" name="option" required placeholder="선택지 ${optionIndex}" class="w-full px-4 py-3 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal transition">
                    ${colorSelectorHtml.trim()}
                `;
                optionsContainer.appendChild(newOption);
            });

            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const title = form.title.value;
                const description = form.description.value;
                const category = form.category.value;
                const optionInputs = form.querySelectorAll('input[name="option"]');

                const filledOptions = Array.from(optionInputs).filter(input => input.value.trim() !== "");

                if (filledOptions.length < 2) {
                    alert("선택지는 최소 2개 이상 입력해야 합니다.");
                    return;
                }

                const quizTypeInput = form.querySelector('input[name="quiz-type"]:checked');
                const quizType = quizTypeInput ? quizTypeInput.value : "quiz";

                const colorInputs = form.querySelectorAll('[name="option-color"]');

                const options = [];
                for (let i = 0; i < optionInputs.length; i++) {
                    options.push({
                        id: `option_${i + 1}`,
                        label: optionInputs[i].value,
                        color: quizType === "quiz" ? "slate" : colorInputs[i].value
                    });
                }

                const participantInput = form.querySelector('input[name="participantLimit"]');
                const participantLimit = participantInput ? parseInt(participantInput.value || "0") : 0;

                if (quizType === "superquiz" && participantLimit < 10) {
                    alert("참가자 제한은 최소 10명 이상이어야 합니다.");
                    return;
                }

                const rewardSelect = form.querySelector('select[name="rewardPoints"]');
                const rewardPoints = parseInt(rewardSelect?.value || "0");
                const maxParticipants = rewardPoints / 2;

                if (quizType === "superquiz" && participantLimit > maxParticipants) {
                    alert(`참가자 제한은 최대 ${maxParticipants}명까지 가능합니다.`);
                    return;
                }

                try {
                    const uid = user.uid;
                    const userProfileRef = doc(db, "userProfiles", uid);
                    const userProfileSnap = await getDoc(userProfileRef);

                    let points = 0;
                    if (userProfileSnap.exists()) {
                        points = userProfileSnap.data().points || 0;
                        console.log("User points:", points);
                    } else {
                        console.log("User profile not found, assuming 0 points.");
                    }

                    let cost = 0;
                    if (quizType === "quiz") {
                        cost = 20;
                    } else if (quizType === "superquiz") {
                        cost = rewardPoints;
                    }

                    if (points < cost) {
                        alert("포인트가 부족합니다.");
                        return;
                    }

                    await addDoc(collection(db, 'questions'), {
                        title: title,
                        description: description,
                        category: category,
                        options: options,
                        createdAt: serverTimestamp(),
                        vote: {},
                        type: quizType,
                        status: 'active',
                        creatorId: user.uid,
                        creatorName: user.displayName || "사용자",
                        rewardPoints: rewardPoints,
                        participantLimit: participantLimit,
                        participants: [],
                        entryFee: quizType === "superquiz" ? 1 : 0,
                        hasCorrectAnswer: false,
                        correctOption: null,
                        expiresAt: null,
                        resolvedAt: null,
                        views: 0,
                        likesCount: 0,
                        commentsCount: 0,
                        popularityScore: 0,
                        isSuper: quizType === "superquiz" ? true : false
                    });

                    const newPoints = points - cost;
                    await updateDoc(userProfileRef, {
                        points: newPoints
                    });

                    alert('퀴즈가 성공적으로 생성되었습니다!');
                    window.location.href = 'quiz.html';
                } catch (error) {
                    console.error('Error creating quiz: ', error);
                    alert('퀴즈 생성에 실패했습니다.');
                }
            });
        } else {
            // User is signed out.
            alert("로그인이 필요한 서비스 입니다. 로그인해주세요.");
            window.location.href = "quiz.html";
        }
    });
});
