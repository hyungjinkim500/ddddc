import { auth, db } from './firebase-config.js';
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            // User is signed in, proceed with page setup.
            const form = document.getElementById('create-quiz-form');
            const addOptionBtn = document.getElementById('add-option-btn');
            const optionsContainer = document.getElementById('options-container').querySelector('.space-y-3');

            addOptionBtn.addEventListener('click', () => {
                const optionIndex = optionsContainer.children.length + 1;
                const newOption = document.createElement('div');
                newOption.className = 'flex items-center gap-2';
                newOption.innerHTML = `
                    <input type="text" name="option" required placeholder="선택지 ${optionIndex}" class="w-full px-4 py-3 rounded-md bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 focus:outline-none focus:ring-2 focus:ring-teal transition">
                    <select name="option-color" class="rounded-md bg-slate-100 dark:bg-slate-700 border-slate-200 dark:border-slate-600 h-12">
                        <option value="slate">회색</option>
                        <option value="emerald">초록</option>
                        <option value="red">빨강</option>
                    </select>
                `;
                optionsContainer.appendChild(newOption);
            });

            form.addEventListener('submit', async (e) => {
                e.preventDefault();

                const title = form.title.value;
                const description = form.description.value;
                const optionInputs = form.querySelectorAll('input[name="option"]');
                const colorSelects = form.querySelectorAll('select[name="option-color"]');

                const options = [];
                for (let i = 0; i < optionInputs.length; i++) {
                    options.push({
                        id: `option_${i + 1}`,
                        label: optionInputs[i].value,
                        color: colorSelects[i].value
                    });
                }

                const quizTypeInput = form.querySelector('input[name="quiz-type"]:checked');
                const quizType = quizTypeInput ? quizTypeInput.value : "quiz";
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
                    await addDoc(collection(db, 'questions'), {
                        title: title,
                        description: description,
                        options: options,
                        createdAt: serverTimestamp(),
                        vote: {},
                        type: quizType,
                        status: 'active',
                        creatorId: user.uid,
                        creatorName: user.displayName || "사용자",
                        rewardPoints: 0,
                        participantLimit: participantLimit,
                        participants: [],
                        entryFee: 0,
                        hasCorrectAnswer: false,
                        correctOption: null,
                        expiresAt: null,
                        resolvedAt: null
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
