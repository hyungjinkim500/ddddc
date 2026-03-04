import { auth, db } from './firebase-config.js';
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

document.addEventListener('DOMContentLoaded', () => {
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

        const user = auth.currentUser;

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

        const quizType = form.querySelector('input[name="quiz-type"]:checked').value;
        const participantInput = form.querySelector('input[name="participantLimit"]');
        const participantLimit = parseInt(participantInput.value || "0");

        if (quizType === "superquiz" && participantLimit < 10) {
            alert("참가자 제한은 최소 10명 이상이어야 합니다.");
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
                creatorId: user ? user.uid : null,
                creatorName: user ? (user.displayName || "사용자") : null,
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
});
