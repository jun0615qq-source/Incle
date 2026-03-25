document.addEventListener('DOMContentLoaded', () => {
    // ---- Elements ----
    const loginScreen = document.getElementById('login-screen');
    const scanningScreen = document.getElementById('scanning-screen');
    const scanningEmailText = document.getElementById('scanning-email-text');
    const scanProgress = document.getElementById('scan-progress');
    const scanStatusText = document.getElementById('scan-status-text');
    const dashboardScreen = document.getElementById('dashboard-screen');
    const authForm = document.getElementById('auth-form');
    const authBtn = document.getElementById('auth-btn');
    const authToggleBtn = document.getElementById('auth-toggle-btn');
    const switchPrompt = document.getElementById('switch-prompt');
    const nameGroup = document.getElementById('name-group');
    const nameInput = document.getElementById('name-input');
    const emailInput = document.getElementById('email-input');
    const pwdInput = document.getElementById('pwd-input');
    const authError = document.getElementById('auth-error');
    
    let isSignupMode = false;
    let currentUserEmail = 'demo';
    let subscriptions = [];
    
    // ---- Logic ----
    
    // 1. Handle Authentication Toggle
    authToggleBtn.addEventListener('click', (e) => {
        e.preventDefault();
        isSignupMode = !isSignupMode;
        authError.style.display = 'none';

        if(isSignupMode) {
            nameGroup.style.display = 'flex';
            nameInput.required = true;
            authBtn.textContent = '새 계정 만들기';
            switchPrompt.textContent = '이미 계정이 있으신가요?';
            authToggleBtn.textContent = '로그인';
        } else {
            nameGroup.style.display = 'none';
            nameInput.required = false;
            authBtn.textContent = '로그인하여 시작하기';
            switchPrompt.textContent = '계정이 없으신가요?';
            authToggleBtn.textContent = '회원가입';
        }
    });

    // Handle Authentication Submit
    authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        authError.style.display = 'none';
        
        const email = emailInput.value.trim();
        const pwd = pwdInput.value;
        const name = nameInput.value.trim();

        const endpoint = isSignupMode ? '/api/signup' : '/api/login';
        const payload = isSignupMode ? { email, password: pwd, name } : { email, password: pwd };

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
                authBtn.textContent = isSignupMode ? '새 계정 만들기' : '로그인하여 시작하기';
            } else {
                localStorage.setItem('subsync_user_' + email, JSON.stringify(data.user)); 
                
                if (isSignupMode) {
                    await fetch(`/api/sync/${email}`, { method: 'POST' });
                }

                loginSuccess(data.user);
            }
        })
        .catch(err => {
            console.error('Auth error', err);
            authError.textContent = '서버 통신 실패. (터미널에서 python main.py 로 서버를 켜주세요)';
            authError.style.display = 'block';
            authBtn.disabled = false;
            authBtn.textContent = isSignupMode ? '새 계정 만들기' : '로그인하여 시작하기';
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
            scanningEmailText.innerHTML = `<strong>${user.email}</strong> 수신함을 스캔하여<br>구독 결제 내역을 자동으로 찾는 중입니다.`;
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
        let progress = 0;
        const scanSteps = [
            { p: 15, text: "최근 3개월 결제 영수증 확인 중..." },
            { p: 45, text: "넷플릭스, 유튜브 등 서비스 식별 중..." },
            { p: 75, text: "결제 주기 및 금액 분석 중..." },
            { p: 100, text: "동기화 완료!" }
        ];

        let stepIdx = 0;

        const interval = setInterval(() => {
            progress += Math.floor(Math.random() * 15) + 5;
            if(progress >= 100) progress = 100;
            
            scanProgress.style.width = progress + '%';
            
            while(stepIdx < scanSteps.length && progress >= scanSteps[stepIdx].p) {
                scanStatusText.textContent = scanSteps[stepIdx].text;
                stepIdx++;
            }

            if(progress >= 100) {
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

    // 4. Render Subscription List
    function renderSubscriptions() {
        const listEl = document.getElementById('subs-list');
        const countEl = document.getElementById('sub-count');
        listEl.innerHTML = '';
        
        countEl.textContent = subscriptions.length;

        // Current Date Info for warnings
        const today = new Date();
        const currentDay = today.getDate();

        subscriptions.forEach(sub => {
            // Calculate days left
            let daysLeft = sub.billingDate - currentDay;
            if (daysLeft < 0) {
                // Next month billing
                const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
                daysLeft = (daysInMonth - currentDay) + sub.billingDate;
            }

            const isWarning = daysLeft <= 5 && daysLeft >= 0;

            const itemHTML = `
                <div class="sub-item">
                    <div class="sub-icon ${sub.bgClass}">
                        <i class="ph ${sub.iconClass}"></i>
                    </div>
                    <div class="sub-info">
                        <div class="sub-name">${sub.name}</div>
                        <div class="sub-meta">
                            <span>매월 ${sub.billingDate}일 결제</span>
                            <div class="meta-divider"></div>
                            <span class="${isWarning ? 'warning-text' : ''}">${daysLeft === 0 ? '오늘 결제' : `D-${daysLeft} 해지 가능`}</span>
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
        let current = 0;
        const increment = total / 40; // 40 steps
        
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
        const today = new Date().getDate();
        // Find if any sub is due within 3 days
        const urgent = subscriptions.find(sub => {
            let daysLeft = sub.billingDate - today;
            if (daysLeft < 0) daysLeft += 30; // Approx
            return daysLeft > 0 && daysLeft <= 3;
        });

        if (urgent) {
            const alertBox = document.getElementById('reminder-alert');
            alertBox.style.display = 'flex';
            alertBox.querySelector('.alert-text').innerHTML = `
                <strong>${urgent.name}</strong> 결제일이 곧 다가옵니다! 
                사용하지 않는다면 해지를 고려해보세요.
            `;
        }
    }

    // 7. Render Chart using Chart.js
    function renderChart() {
        const ctx = document.getElementById('spendingChart');
        if(!ctx) return;
        const ctx2d = ctx.getContext('2d');
        
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

    if(openModalBtn && addModal) {
        openModalBtn.addEventListener('click', () => {
            addModal.style.display = 'flex';
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

    // Logout logic
    const logoutBtn = document.getElementById('logout-btn');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            localStorage.removeItem('subsync_user_' + currentUserEmail);
            location.reload();
        });
    }

    // Auto-login check (Session restore)
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('subsync_user_')) {
            const userData = JSON.parse(localStorage.getItem(key));
            if (userData && userData.email) {
                loginSuccess(userData);
                break;
            }
        }
    }

});
