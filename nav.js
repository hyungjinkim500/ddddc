// 네비 CSS 주입
(function injectNavStyles() {
    if (document.getElementById('nav-js-style')) return;
    const style = document.createElement('style');
    style.id = 'nav-js-style';
    style.textContent = `
        #bottom-nav {
            position: fixed;
            bottom: 0;
            left: 50%;
            transform: translateX(-50%);
            width: 100%;
            max-width: 480px;
            background: white;
            border-top: 1px solid #e2e8f0;
            display: flex;
            z-index: 50;
        }
        html.dark #bottom-nav { background: #1e293b; border-color: #334155; }
        .nav-btn {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 10px 0;
            font-size: 10px;
            color: #94a3b8;
            cursor: pointer;
            text-decoration: none;
            gap: 3px;
        }
        .nav-btn.active { color: #263559; }
        .nav-btn.pick-btn .pick-circle {
            width: 48px;
            height: 48px;
            background: #3ef0cc;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin-top: -20px;
            box-shadow: 0 4px 12px rgba(22,153,118,0.4);
        }
        .nav-btn.pick-btn .pick-circle i { font-size: 22px; color: white; }
    `;
    document.head.appendChild(style);
})();

// 현재 페이지에 맞는 네비 active 상태 반환
function getActivePage() {
    const path = window.location.pathname;
    if (path.includes('explore.html')) return 'explore';
    if (path.includes('notification.html')) return 'notification';
    if (path.includes('mypage.html')) return 'mypage';
    return 'home';
}

function isActive(page) {
    return getActivePage() === page ? 'active' : '';
}

// 하단 네비 HTML 주입
function injectBottomNav() {
    if (document.getElementById('bottom-nav')) return;
    const nav = document.createElement('nav');
    nav.id = 'bottom-nav';
    nav.style.cssText = 'position:fixed;bottom:0;left:50%;transform:translateX(-50%);width:100%;max-width:480px;background:white;border-top:1px solid #e2e8f0;display:flex;z-index:50;';
    nav.innerHTML = `
        <a href="index.html" class="nav-btn ${isActive('home')}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M14,18h-4c-1.103,0-2-.897-2-2v-4c0-1.103,.897-2,2-2h4c1.103,0,2,.897,2,2v4c0,1.103-.897,2-2,2Zm-4-6v4h4.002l-.002-4h-4Zm9,12H5c-2.757,0-5-2.243-5-5V9.724c0-1.665,.824-3.215,2.204-4.145L9.203,.855c1.699-1.146,3.895-1.146,5.594,0l7,4.724c1.379,.93,2.203,2.479,2.203,4.145v9.276c0,2.757-2.243,5-5,5ZM12,1.997c-.584,0-1.168,.172-1.678,.517L3.322,7.237c-.828,.558-1.322,1.487-1.322,2.486v9.276c0,1.654,1.346,3,3,3h14c1.654,0,3-1.346,3-3V9.724c0-.999-.494-1.929-1.321-2.486L13.678,2.514c-.51-.345-1.094-.517-1.678-.517Z"/></svg>
            <span>홈</span>
        </a>
        <a href="explore.html" class="nav-btn ${isActive('explore')}">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12.75 3.03v.568c0 .334.148.65.405.864l1.068.89c.442.369.535 1.01.216 1.49l-.51.766a2.25 2.25 0 0 1-1.161.886l-.143.048a1.107 1.107 0 0 0-.57 1.664a1.108 1.108 0 0 1-.427 1.605L9 13.125l.423 1.059a.956.956 0 0 1-1.652.928l-.679-.906a1.125 1.125 0 0 0-1.906.172L4.5 15.75l-.612.153M12.75 3.031a9 9 0 0 0-8.862 12.872M12.75 3.031a9 9 0 0 1 6.69 14.036m0 0l-.177-.529A2.25 2.25 0 0 0 17.128 15H16.5l-.324-.324a1.453 1.453 0 0 0-2.328.377l-.036.073a1.6 1.6 0 0 1-.982.816l-.99.282c-.55.157-.894.702-.8 1.267l.073.438c.08.474.49.821.97.821c.846 0 1.598.542 1.865 1.345l.215.643m5.276-3.67a9 9 0 0 1-5.276 3.67m0 0a9 9 0 0 1-10.275-4.835M15.75 9c0 .896-.393 1.7-1.016 2.25"/></svg>
            <span>탐색</span>
        </a>
        <button id="pick-btn-trigger" class="nav-btn pick-btn">
            <div class="pick-circle"><i class="fas fa-plus"></i></div>
            <span style="color:#263559;font-size:10px;margin-top:2px;">POST&PIX</span>
        </button>
        <a href="notification.html" class="nav-btn ${isActive('notification')}" id="nav-alarm">
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M14.857 17.082a24 24 0 0 0 5.454-1.31A8.97 8.97 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.97 8.97 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.3 24.3 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0M3.124 7.5A8.97 8.97 0 0 1 5.292 3m13.416 0a8.97 8.97 0 0 1 2.168 4.5"/></svg>
            <span>알림</span>
        </a>
        <a href="mypage.html" class="nav-btn ${isActive('mypage')}">
            <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M15.75 6a3.75 3.75 0 1 1-7.5 0a3.75 3.75 0 0 1 7.5 0M4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.9 17.9 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632"/></svg>
            <span>마이</span>
        </a>
    `;
    document.body.appendChild(nav);
}

// 글쓰기 바텀시트 HTML 주입
function injectWriteSheet() {
    if (document.getElementById('write-sheet')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'write-sheet-backdrop';
    backdrop.className = 'hidden fixed inset-0 bg-black/40 z-40';
    document.body.appendChild(backdrop);

    const sheet = document.createElement('div');
    sheet.id = 'write-sheet';
    sheet.className = 'hidden fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[480px] bg-white dark:bg-slate-800 rounded-t-2xl z-50 pb-8';
    sheet.innerHTML = `
        <div class="w-10 h-1 bg-slate-300 dark:bg-slate-600 rounded-full mx-auto mt-3 mb-4"></div>
        <div class="px-4 space-y-2">
            <button id="sheet-post-btn" class="flex items-center gap-4 w-full px-4 py-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition text-left">
                <div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-pen text-slate-500 dark:text-slate-300"></i>
                </div>
                <div>
                    <p class="font-bold text-slate-800 dark:text-white text-sm">POST</p>
                    <p class="text-xs text-slate-400">일반 게시글 작성</p>
                </div>
            </button>
            <button id="sheet-pix-btn" class="flex items-center gap-4 w-full px-4 py-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition text-left">
                <div class="w-10 h-10 rounded-full bg-green-50 dark:bg-green-900/30 flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-vote-yea text-[#169976]"></i>
                </div>
                <div>
                    <p class="font-bold text-slate-800 dark:text-white text-sm">PIX</p>
                    <p class="text-xs text-slate-400">2~10개 옵션 투표 게시글</p>
                </div>
            </button>
            <button id="sheet-balance-btn" class="flex items-center gap-4 w-full px-4 py-4 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition text-left">
                <div class="w-10 h-10 rounded-full bg-orange-50 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-balance-scale text-orange-400"></i>
                </div>
                <div>
                    <p class="font-bold text-slate-800 dark:text-white text-sm">밸런스게임</p>
                    <p class="text-xs text-slate-400">1대1 대결 투표 게시글</p>
                </div>
            </button>
        </div>
    `;
    document.body.appendChild(sheet);
}

// 이벤트 바인딩
function initNav() {
    injectBottomNav();
    injectWriteSheet();

    const trigger = document.getElementById('pick-btn-trigger');
    const backdrop = document.getElementById('write-sheet-backdrop');
    const sheet = document.getElementById('write-sheet');

    function openSheet() { backdrop.classList.remove('hidden'); sheet.classList.remove('hidden'); }
    function closeSheet() { backdrop.classList.add('hidden'); sheet.classList.add('hidden'); }

    trigger?.addEventListener('click', () => {
        import('./firebase-config.js').then(({ auth }) => {
            if (!auth.currentUser) { window.openModal?.(); return; }
            openSheet();
        });
    });

    backdrop?.addEventListener('click', closeSheet);

    document.getElementById('sheet-post-btn')?.addEventListener('click', () => {
        closeSheet(); window.location.href = 'create-post.html?type=post';
    });
    document.getElementById('sheet-pix-btn')?.addEventListener('click', () => {
        closeSheet(); window.location.href = 'create-post.html?type=pix';
    });
    document.getElementById('sheet-balance-btn')?.addEventListener('click', () => {
        closeSheet(); window.location.href = 'create-post.html?type=balance';
    });
}

document.addEventListener('DOMContentLoaded', initNav);
