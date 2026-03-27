// Register Service Worker for PWA
if('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.log('Service Worker Failed:', err));
}

document.addEventListener('DOMContentLoaded', () => {
    // ---- Elements ----
    const loginScreen = document.getElementById('login-screen');
    const scanningScreen = document.getElementById('scanning-screen');
    const scanningEmailText = document.getElementById('scanning-email-text');
    const scanProgress = document.getElementById('scan-progress');
    const scanStatusText = document.getElementById('scan-status-text');
    const dashboardScreen = document.getElementById('dashboard-screen');
    
    // Auth Elements
    const authForm = document.getElementById('auth-form');
    const toggleBtn = document.getElementById('auth-toggle-btn');
    const toggleText = document.getElementById('switch-prompt');
    const authTitle = document.getElementById('auth-title');
    const authSubtitle = document.getElementById('auth-subtitle');
    const authBtn = document.getElementById('auth-btn');
    
    const nameGroup = document.getElementById('name-group');
    const nameInput = document.getElementById('auth-name');
    const emailInput = document.getElementById('auth-email');
    const pwdInput = document.getElementById('auth-password');
    const pwdConfirmGroup = document.getElementById('pwd-confirm-group');
    const pwdConfirmInput = document.getElementById('auth-password-confirm');
    const authError = document.getElementById('auth-error');

    const sendCodeBtn = document.getElementById('send-code-btn');
    const verifyCodeGroup = document.getElementById('verify-code-group');
    const authCodeInput = document.getElementById('auth-code');
    const forgotPwdBtn = document.getElementById('forgot-pwd-btn');
    
    let authMode = 'login'; // 'login', 'signup', 'reset'
    let currentUserEmail = 'demo';
    let subscriptions = [];
    
    // ---- Logic ----
    
    // 1. Handle Authentication Toggle
    function setAuthMode(mode) {
        authMode = mode;
        if (mode === 'signup') {
            authTitle.textContent = 'Incle 시작하기';
            authSubtitle.textContent = '이메일 인증으로 안전하게 계정을 만드세요.';
            authBtn.textContent = '새 계정 만들기';
            toggleText.innerHTML = '이미 계정이 있으신가요? <a href="#" id="auth-toggle-btn">로그인</a>';
            nameGroup.style.display = 'block';
            nameInput.required = true;
            sendCodeBtn.style.display = 'block';
            verifyCodeGroup.style.display = 'block';
            authCodeInput.required = true;
            pwdConfirmGroup.style.display = 'block';
            pwdConfirmInput.required = true;
            forgotPwdBtn.style.display = 'none';
        } else if (mode === 'reset') {
            authTitle.textContent = '비밀번호 찾기';
            authSubtitle.textContent = '이메일로 인증번호를 받아 비밀번호를 변경하세요.';
            authBtn.textContent = '비밀번호 변경하기';
            toggleText.innerHTML = '비밀번호가 기억나셨나요? <a href="#" id="auth-toggle-btn">로그인</a>';
            nameGroup.style.display = 'none';
            nameInput.required = false;
            sendCodeBtn.style.display = 'block';
            verifyCodeGroup.style.display = 'block';
            authCodeInput.required = true;
            pwdConfirmGroup.style.display = 'block';
            pwdConfirmInput.required = true;
            forgotPwdBtn.style.display = 'none';
        } else {
            // 'login'
            authTitle.textContent = '다시 오셨군요!';
            authSubtitle.textContent = '이메일과 비밀번호를 입력해주세요.';
            authBtn.textContent = '로그인하여 시작하기';
            toggleText.innerHTML = '계정이 없으신가요? <a href="#" id="auth-toggle-btn">회원가입</a>';
            nameGroup.style.display = 'none';
            nameInput.required = false;
            sendCodeBtn.style.display = 'none';
            verifyCodeGroup.style.display = 'none';
            authCodeInput.required = false;
            pwdConfirmGroup.style.display = 'none';
            pwdConfirmInput.required = false;
            forgotPwdBtn.style.display = 'inline-block';
        }
        authError.style.display = 'none';
        authForm.reset();
        
        // Re-bind the toggle button since we replaced HTML
        document.getElementById('auth-toggle-btn').addEventListener('click', (e) => {
            e.preventDefault();
            setAuthMode(authMode === 'login' ? 'signup' : 'login');
        });
    }

    if(toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            setAuthMode(authMode === 'login' ? 'signup' : 'login');
        });
    }

    if(forgotPwdBtn) {
        forgotPwdBtn.addEventListener('click', (e) => {
            e.preventDefault();
            setAuthMode('reset');
        });
    }

    // Send Code Button Logic
    if(sendCodeBtn) {
        sendCodeBtn.addEventListener('click', async () => {
            const email = emailInput.value.trim();
            if(!email) { alert('이메일을 먼저 입력해주세요.'); return; }
            
            sendCodeBtn.disabled = true;
            sendCodeBtn.textContent = '발송 중...';
            authError.style.display = 'none';
            
            try {
                const res = await fetch('/api/send-code', {
                    method: 'POST',
                    headers:{'Content-Type':'application/json'},
                    body: JSON.stringify({email})
                });
                if(res.ok) {
                    alert('인증번호가 발송되었습니다.\n(참고: 데모 코드이므로 터미널/Render 로그에 6자리 번호가 출력됩니다)');
                    verifyCodeGroup.style.display = 'block';
                    sendCodeBtn.textContent = '재전송';
                } else {
                    const data = await res.json();
                    authError.textContent = data.detail || '발송 실패';
                    authError.style.display = 'block';
                    sendCodeBtn.textContent = '인증번호 받기';
                }
            } catch(e) {
                authError.textContent = '서버 통신 오류';
                authError.style.display = 'block';
                sendCodeBtn.textContent = '인증번호 받기';
            }
            sendCodeBtn.disabled = false;
        });
    }

    // Form Submit (Signup or Login or Reset)
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const email = emailInput.value.trim();
        const pwd = pwdInput.value;
        const name = nameInput.value.trim();
        const code = authCodeInput.value.trim();
        const pwdConf = pwdConfirmInput.value;

        // Validation for typo safeguard
        if ((authMode === 'signup' || authMode === 'reset') && pwd !== pwdConf) {
            authError.textContent = '비밀번호가 서로 일치하지 않습니다.';
            authError.style.display = 'block';
            return;
        }

        let endpoint = '/api/login';
        let payload = { email, password: pwd };
        
        if (authMode === 'signup') {
            endpoint = '/api/signup';
            payload = { email, password: pwd, name, verification_code: code };
        } else if (authMode === 'reset') {
            endpoint = '/api/reset-password';
            payload = { email, new_password: pwd, verification_code: code };
        }

        authBtn.disabled = true;
        authBtn.textContent = '처리 중...';

        fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(async res => {
            const data = await res.json();
            if (!res.ok) {
                authError.textContent = data.detail || '오류가 발생했습니다.';
                authError.style.display = 'block';
                authBtn.disabled = false;
                authBtn.textContent = (authMode === 'signup') ? '새 계정 만들기' : (authMode === 'reset' ? '비밀번호 변경하기' : '로그인하여 시작하기');
            } else {
                if (authMode === 'signup') {
                    // Sign-up successful, DO NOT login instantly.
                    alert('회원가입이 완료되었습니다! 보안을 위해 로그인 창에서 새로 접속해 주세요.');
                    setAuthMode('login');
                    emailInput.value = email; // Pre-fill
                    authBtn.disabled = false;
                    authBtn.textContent = '로그인하여 시작하기';
                } else if (authMode === 'reset') {
                    alert('비밀번호가 성공적으로 변경되었습니다! 새 비밀번호로 로그인해 주세요.');
                    setAuthMode('login');
                    emailInput.value = email;
                    authBtn.disabled = false;
                    authBtn.textContent = '로그인하여 시작하기';
                } else {
                    // Login successful
                    localStorage.setItem('subsync_user_' + email, JSON.stringify(data.user));
                    
                    // Trigger sync here instead of signup
                    await fetch(`/api/sync/${email}`, { method: 'POST' }).catch(e=>console.log(e));
                    
                    loginSuccess(data.user);
                }
            }
        })
        .catch(err => {
            console.error('Auth error', err);
            authError.textContent = '서버 통신 실패. (터미널에서 python main.py 로 백엔드가 켜져있나요?)';
            authError.style.display = 'block';
            authBtn.disabled = false;
            authBtn.textContent = (authMode === 'signup') ? '새 계정 만들기' : (authMode === 'reset' ? '비밀번호 변경하기' : '로그인하여 시작하기');
        });
    });

    function loginSuccess(user) {
        currentUserEmail = user.email;
        // greeting text update
        const greetingSpan = document.querySelector('.greeting');
        if(greetingSpan) greetingSpan.innerHTML = `안녕하세요, <strong>${user.name || '유저'}</strong>님!`;
        
        const profileEmail = document.getElementById('profile-email');
        if(profileEmail) profileEmail.textContent = user.email;

        if(scanningEmailText && user.email) {
            scanningEmailText.innerHTML = `<strong>${user.email}</strong> 수신함을 스캔하여<br>구독 결제 내역을 점검중입니다.`;
        }

        // Simple animation logic to transition screens
        loginScreen.style.opacity = '0';
        setTimeout(() => {
            loginScreen.classList.remove('active');
            loginScreen.style.display = 'none';
            
            scanningScreen.style.display = 'flex';
            setTimeout(() => {
                scanningScreen.classList.add('active');
                runScannerAnimation();
            }, 50);
        }, 300);
    }

    function runScannerAnimation() {

        const scanSteps = [
            { p: 15, text: "최근 3개월 결제 영수증 확인 중..." },
            { p: 45, text: "넷플릭스, 유튜브 등 서비스 식별 중..." },
            { p: 75, text: "결제 주기 및 금액 분석 중..." },
            { p: 100, text: "동기화 완료!" }
        ];

        let progress = 0;
        let stepIdx = 0;

        const interval = setInterval(() => {
            progress += Math.floor(Math.random() * 15) + 5;
            if(progress > 100) progress = 100;
            
            if(scanProgress) scanProgress.style.width = progress + '%';

            // Find current text
            if(stepIdx < scanSteps.length && progress >= scanSteps[stepIdx].p) {
                if(scanStatusText) scanStatusText.textContent = scanSteps[stepIdx].text;
                stepIdx++;
            }

            if(progress === 100) {
                clearInterval(interval);
                setTimeout(() => {
                    scanningScreen.style.opacity = '0';
                    setTimeout(() => {
                        scanningScreen.classList.remove('active');
                        scanningScreen.style.display = 'none';
                        
                        dashboardScreen.style.display = 'flex';
                        setTimeout(() => {
                            dashboardScreen.classList.add('active');
                            fetchAndInitDashboard();
                        }, 50);
                    }, 300);
                }, 800);
            }
        }, 350);
    }

    // 2. Format Currency
    const formatSeq = (num) => {
        return '₩' + num.toLocaleString('ko-KR');
    };

    async function fetchAndInitDashboard() {
        try {
            const res = await fetch(`/api/subscriptions/${currentUserEmail}`);
            if(res.ok) {
                subscriptions = await res.json();
            }
        } catch(e) {
            console.error('API Error, using empty data', e);
        }
        renderSubscriptions();
        calculateTotal();
        checkReminders();
        renderChart();
    }

    // 4. Render Subscriptions
    function renderSubscriptions() {
        const listEl = document.getElementById('sub-list');
        listEl.innerHTML = '';
        
        subscriptions.forEach(sub => {
            const today = new Date().getDate();
            let daysLeft = sub.billingDate - today;
            let isWarning = false;

            if (daysLeft < 0) daysLeft += 30; // approx 30 days month
            
            if (daysLeft <= 3) {
                isWarning = true;
            }

            const itemHTML = `
                <div class="sub-item">
                    <div class="sub-info">
                        <div class="sub-icon ${sub.bgClass}">
                            <i class="ph ${sub.iconClass}"></i>
                        </div>
                        <div class="sub-meta">
                            <h4>${sub.name}</h4>
                            <span>매월 ${sub.billingDate}일</span>
                            <div class="meta-divider"></div>
                            <span class="${isWarning ? 'warning-text' : ''}">${daysLeft === 0 ? '오늘 결제' : `D-${daysLeft} 전 취소 가능`}</span>
                        </div>
                    </div>
                    <div>
                        <div class="sub-price">${formatSeq(sub.price)}</div>
                    </div>
                </div>
            `;
            listEl.insertAdjacentHTML('beforeend', itemHTML);
        });
    }

    // 5. Calculate Total
    function calculateTotal() {
        const total = subscriptions.reduce((sum, item) => sum + item.price, 0);
        
        // Count up animation
        const totalEl = document.getElementById('total-amount');
        if(!totalEl) return;
        
        let current = 0;
        const increment = total / 40; // 40 steps
        
        if (total === 0) {
            totalEl.textContent = formatSeq(0);
            return;
        }

        const countInterval = setInterval(() => {
            current += increment;
            if (current >= total) {
                totalEl.textContent = formatSeq(total);
                clearInterval(countInterval);
            } else {
                totalEl.textContent = formatSeq(Math.floor(current));
            }
        }, 20);
    }

    // 6. Check Reminders
    function checkReminders() {
        if(subscriptions.length === 0) return;
        const today = new Date().getDate();
        // Find if any sub is due within 3 days
        const urgent = subscriptions.find(sub => {
            let daysLeft = sub.billingDate - today;
            if (daysLeft < 0) daysLeft += 30; // Approx
            return daysLeft > 0 && daysLeft <= 3;
        });

        if (urgent) {
            const alertBox = document.getElementById('reminder-alert');
            if (alertBox) {
                alertBox.style.display = 'flex';
                alertBox.querySelector('.alert-text').innerHTML = `
                    <strong>${urgent.name}</strong> 결제일이 임박했습니다! 
                    필요하지 않다면 취소를 고려해보세요.
                `;
            }
        }
    }

    // 7. Render Chart using Chart.js
    function renderChart() {
        const ctx = document.getElementById('spendingChart');
        if(!ctx) return;
        const ctx2d = ctx.getContext('2d');
        
        if (subscriptions.length === 0) {
            // Optional empty state chart
            return;
        }

        // Map data safely
        const labels = subscriptions.map(s => s.name.split(' ')[0]); // Get first word for brevity
        const data = subscriptions.map(s => s.price);

        // Destroy previous chart if exists
        if(window.myDoughnutChart) {
            window.myDoughnutChart.destroy();
        }

        // Chart.js init
        window.myDoughnutChart = new Chart(ctx2d, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: [
                        '#1A1A1A', '#4B5563', '#9CA3AF', '#D1D5DB', '#F3F4F6', '#2563EB', '#1DB954'
                    ],
                    borderWidth: 0,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '75%', // Thin donut
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: { family: "'Inter', sans-serif", size: 12 },
                            usePointStyle: true,
                            padding: 20
                        }
                    },
                    tooltip: {
                        backgroundColor: 'rgba(0,0,0,0.8)',
                        padding: 12,
                        cornerRadius: 8,
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                if (label) { label += ': '; }
                                if (context.parsed !== null) {
                                    label += formatSeq(context.parsed);
                                }
                                return label;
                            }
                        }
                    }
                }
            }
        });
    }

    // ---- Navigation & UI Interactive Logic ----

    // Tab Switching
    const navItems = document.querySelectorAll('.nav-item');
    const tabContents = document.querySelectorAll('.tab-content');

    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = item.getAttribute('data-tab');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
            
            tabContents.forEach(tab => {
                tab.style.display = 'none';
                tab.classList.remove('active');
            });
            
            const activeTab = document.getElementById(targetId);
            if(activeTab) {
                activeTab.style.display = 'block';
                // Trigger reflow for animation
                void activeTab.offsetWidth;
                activeTab.classList.add('active');
            }
        });
    });

    // Add Modal Logic
    const openModalBtn = document.getElementById('open-modal-btn');
    const closeModalBtn = document.getElementById('close-modal-btn');
    const addModal = document.getElementById('add-modal');
    const addSubForm = document.getElementById('add-sub-form');

    const premiumModal = document.getElementById('premium-modal');
    const closePremiumBtn = document.getElementById('close-premium-btn');

    if(openModalBtn && addModal) {
        openModalBtn.addEventListener('click', () => {
            // Freemium Logic: Limit to 3 max
            if (subscriptions.length >= 3) {
                if(premiumModal) premiumModal.style.display = 'flex';
                return;
            }
            addModal.style.display = 'flex';
        });
    }

    if(closePremiumBtn && premiumModal) {
        closePremiumBtn.addEventListener('click', (e) => {
            e.preventDefault();
            premiumModal.style.display = 'none';
        });
    }

    if(closeModalBtn && addModal) {
        closeModalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            addModal.style.display = 'none';
        });
    }

    if(addModal) {
        addModal.addEventListener('click', (e) => {
            if(e.target === addModal) addModal.style.display = 'none';
        });
    }

    if(addSubForm) {
        addSubForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('add-name').value;
            const price = parseInt(document.getElementById('add-price').value, 10);
            const date = parseInt(document.getElementById('add-date').value, 10);
            
            const newSub = {
                id: null,
                name: name,
                price: price,
                billingDate: date,
                category: 'Custom',
                iconClass: 'ph-star',
                bgClass: 'bg-coupang',
                user_email: currentUserEmail
            };

            try {
                const res = await fetch('/api/subscriptions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newSub)
                });
                if(res.ok) {
                    addModal.style.display = 'none';
                    addSubForm.reset();
                    // Refresh dash
                    await fetchAndInitDashboard();
                }
            } catch (err) {
                console.error("Failed to add sub", err);
            }
        });
    }

    // 8. Real Google API Sync Logic (Phase 7)
    const googleSyncBtn = document.getElementById('google-sync-btn');
    if(googleSyncBtn) {
        googleSyncBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            // Fetch Google Client ID from backend config
            let clientId = '';
            try {
                const confRes = await fetch('/api/config');
                const confData = await confRes.json();
                clientId = confData.google_client_id;
            } catch(err) {
                console.error(err);
            }
            
            if (!clientId) {
                alert("서버 환경설정에 구글 권한(GOOGLE_CLIENT_ID)이 등록되지 않았습니다.\n개발자(운영자) 최초 서버 셋팅이 필요합니다.");
                return;
            }

            const tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/gmail.readonly',
                callback: async (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        // show loading
                        dashboardScreen.style.opacity = '0';
                        setTimeout(() => {
                            dashboardScreen.classList.remove('active');
                            dashboardScreen.style.display = 'none';
                            
                            scanningScreen.style.display = 'flex';
                            setTimeout(() => {
                                scanningScreen.classList.add('active');
                                scanningScreen.style.opacity = '1';
                                scanningEmailText.innerHTML = `<strong>실제 이메일</strong> 수신함을 스캔하여<br>진짜 구독 결제 내역을 찾는 중입니다... 시간이 다소 소요됩니다.`;
                            }, 50);
                        }, 300);
                        
                        try {
                            const sf = await fetch('/api/sync-gmail', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({
                                    access_token: tokenResponse.access_token,
                                    user_email: currentUserEmail
                                })
                            });
                            const sfData = await sf.json();
                            
                            scanningScreen.style.opacity = '0';
                            setTimeout(() => {
                                scanningScreen.style.display = 'none';
                                scanningScreen.classList.remove('active');
                                alert(sfData.message || (sfData.detail ? "오류: " + sfData.detail : "완료"));
                                dashboardScreen.style.display = 'flex';
                                dashboardScreen.style.opacity = '1';
                                dashboardScreen.classList.add('active');
                                fetchAndInitDashboard(); // refresh
                            }, 500);

                        } catch(apiErr) {
                            scanningScreen.style.display = 'none';
                            alert("이메일 분석 중 앗! 통신 오류가 발생했습니다.");
                            location.reload();
                        }
                    }
                },
            });
            tokenClient.requestAccessToken();
        });
    }

    // Logout logic
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('subsync_user_' + currentUserEmail);
            location.reload();
        });
    }

    // Auto-login check (Session restore)
    let autoLogged = false;
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('subsync_user_')) {
            const userData = JSON.parse(localStorage.getItem(key));
            if (userData && userData.email) {
                autoLogged = true;
                loginSuccess(userData);
                break;
            }
        }
    }

});
