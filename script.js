// ============================================
// SUPABASE CONFIG
// ============================================

const SUPABASE_URL = "https://gfpujsqpppopvogkfyjj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdmcHVqc3FwcHBvcHZvZ2tmeWpqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwOTI0MTIsImV4cCI6MjEwMTY2ODQxMn0.-C5SRCnK1dnbf8iTUl0P-EZj8JUdK5TN19yOquCTWT8";

// ============================================
// DATA
// ============================================

const DISTRICTS = [
    "Srinagar", "Baramulla", "Anantnag", "Kupwara",
    "Bandipora", "Ganderbal", "Budgam", "Pulwama",
    "Shopian", "Kulgam"
];

const CASTES = [
    "Bhat", "Mir", "Kumar", "Dar", "Zargar",
    "Malik", "Sheikh", "Raina", "Khan", "Parray",
    "Khawaja", "Rather", "Shah", "Ganaie", "Wani",
    "Geelani", "Khar", "Waza", "Lone", "Kachru",
    "Khandey", "Chopan", "Hajjam", "Syed", "Peer",
    "Mattoo", "Kachroo", "Ahanger", "Pirzada", "Teli",
    "Reshi", "Hakeem", "Gojar", "Qureshi", "Pahari",
    "Mughal", "Sufi", "Qadri", "Hamdani", "Gurezi"
];

// ============================================
// SUPABASE HELPERS
// ============================================

async function supabaseFetch(endpoint, options = {}) {
    const url = `${SUPABASE_URL}/rest/v1/${endpoint}`;
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
    };
    const response = await fetch(url, { ...options, headers: { ...headers, ...options.headers } });
    if (!response.ok) throw new Error(`Supabase error: ${response.status}`);
    return response.json();
}

async function supabaseInsert(table, data) {
    return supabaseFetch(table, { method: 'POST', body: JSON.stringify(data) });
}

async function supabaseSelect(table, query = '') {
    return supabaseFetch(`${table}${query}`);
}

// ============================================
// PHOTO UPLOAD
// ============================================

async function uploadPhotoToStorage(file) {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
    const url = `${SUPABASE_URL}/storage/v1/object/photos/${fileName}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': file.type
        },
        body: file
    });
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Upload failed');
    }
    return `${SUPABASE_URL}/storage/v1/object/public/photos/${fileName}`;
}

// ============================================
// STATE
// ============================================

let users = [];
let currentUser = null;
let currentStep = 0;
let onboardData = {};
let uploadedPhotos = [];
let likes = [];
let matches = [];
let currentMatchChat = null;
let currentPage = 'home';
let viewedProfileUser = null;

// ============================================
// DOM REFS
// ============================================

const appContent = document.getElementById('app-content');
const headerTitle = document.getElementById('header-title');
const headerBackBtn = document.getElementById('header-back-btn');
const headerRight = document.getElementById('header-right');
const navBtns = document.querySelectorAll('.nav-btn');

// ============================================
// NAVIGATION
// ============================================

function navigateTo(page, data = null) {
    currentPage = page;
    navBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });
    const backPages = ['onboarding', 'chat', 'messages', 'profile-view'];
    headerBackBtn.style.display = backPages.includes(page) ? 'block' : 'none';
    switch (page) {
        case 'login': renderLogin(); break;
        case 'onboarding': renderOnboarding(); break;
        case 'home': renderHome(); break;
        case 'search': renderSearch(); break;
        case 'matches': renderMatches(); break;
        case 'chat': renderChat(data); break;
        case 'messages': renderMessages(); break;
        case 'profile': renderProfile(); break;
        case 'profile-view': renderProfileView(data); break;
        default: renderHome();
    }
}

headerBackBtn.addEventListener('click', () => {
    if (currentPage === 'onboarding') {
        if (currentStep > 0) { currentStep--; renderOnboarding(); }
        else navigateTo('login');
    } else if (currentPage === 'chat' || currentPage === 'messages') {
        navigateTo('home');
    } else if (currentPage === 'profile-view') {
        navigateTo('home');
    } else {
        navigateTo('home');
    }
});

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (!currentUser && page !== 'home' && page !== 'login') {
            navigateTo('login');
            return;
        }
        navigateTo(page);
    });
});

// ============================================
// HEADER — HOME: Leaf + Messages | Others: Title with icon
// ============================================

function updateHeaderRight() {
    headerRight.innerHTML = '';
    if (currentUser && currentPage === 'home') {
        // Only messages icon (paper plane) on home page
        const messagesBtn = document.createElement('button');
        messagesBtn.className = 'header-btn';
        messagesBtn.innerHTML = '<i class="fas fa-paper-plane" style="color:var(--primary);font-size:20px;"></i>';
        messagesBtn.addEventListener('click', () => navigateTo('messages'));
        headerRight.appendChild(messagesBtn);
    }
}

function setHeaderTitle(page, title, icon = null) {
    if (page === 'home') {
        headerTitle.innerHTML = `<span class="header-leaf">🍁</span> Mehboob`;
    } else {
        headerTitle.innerHTML = icon ? `<span class="header-title-with-icon"><i class="fas fa-${icon}" style="color:var(--primary);font-size:16px;"></i> ${title}</span>` : title;
    }
    updateHeaderRight();
}

// ============================================
// LOAD USER DATA
// ============================================

async function loadUserData() {
    if (!currentUser) return;
    try {
        const userLikes = await supabaseSelect('likes', `?from_user=eq.${currentUser.id}`);
        likes = userLikes || [];
        const userMatches = await supabaseSelect('matches', `?or=(user1.eq.${currentUser.id},user2.eq.${currentUser.id})`);
        matches = userMatches || [];
        console.log('Data loaded:', { likes: likes.length, matches: matches.length });
    } catch (e) { console.error("Error loading user data:", e); }
}

function checkAutoLogin() {
    const savedUser = localStorage.getItem('mehboob_user');
    if (savedUser) {
        try {
            const userData = JSON.parse(savedUser);
            currentUser = userData;
            if (!users.find(u => u.id === currentUser.id)) users.push(currentUser);
            loadUsersFromSupabase();
            loadUserData();
            navigateTo('home');
            return true;
        } catch (e) {
            localStorage.removeItem('mehboob_user');
            return false;
        }
    }
    return false;
}

async function loadUsersFromSupabase() {
    try {
        const data = await supabaseSelect('users');
        if (data && data.length > 0) {
            const existingIds = new Set(users.map(u => u.id));
            const newUsers = data.filter(u => !existingIds.has(u.id));
            users = [...users, ...newUsers];
            console.log('Users loaded:', users.length);
        }
    } catch (e) { console.log('Error loading users:', e); }
}

// ============================================
// RENDER: LOGIN
// ============================================

function renderLogin() {
    setHeaderTitle('login', 'Login');
    appContent.innerHTML = `
        <div class="login-container">
            <div class="logo-wrapper">
                <div class="logo-icon">🍁</div>
                <h1 class="app-name">Mehboob</h1>
                <p class="tagline">Find your Mehboob</p>
            </div>
            <div class="login-form">
                <button id="continue-btn" class="btn-primary">Continue <i class="fas fa-arrow-right"></i></button>
                <p class="terms">By continuing you agree to our <a href="#">Terms</a> &amp; <a href="#">Privacy Policy</a></p>
            </div>
        </div>
    `;
    document.getElementById('continue-btn').addEventListener('click', () => {
        if (currentUser) { navigateTo('home'); return; }
        currentStep = 0;
        onboardData = {};
        uploadedPhotos = [];
        navigateTo('onboarding');
    });
}

// ============================================
// RENDER: ONBOARDING
// ============================================

const onboardingSteps = [
    { id: 'name', label: "What's your name?", subtitle: "What should we call you?", type: 'text', placeholder: 'Enter your name' },
    { id: 'age', label: "How old are you?", subtitle: "Age must be between 16-35", type: 'number', placeholder: '16-35', min: 16, max: 35 },
    { id: 'district', label: "Which district are you from?", subtitle: "Select your Kashmir district", type: 'select', options: DISTRICTS },
    { id: 'caste', label: "What's your caste?", subtitle: "If not listed, select 'Other' and type yours", type: 'caste' },
    { id: 'bio', label: "Tell us about yourself", subtitle: "A short bio (max 100 chars)", type: 'text', placeholder: 'Love mountains & chai...', maxlength: 100 },
    { id: 'photo', label: "Add a photo", subtitle: "Upload at least 1 photo", type: 'photo' }
];

function renderOnboarding() {
    setHeaderTitle('onboarding', 'Create Profile');
    if (currentStep < 0) currentStep = 0;
    if (currentStep >= onboardingSteps.length) currentStep = onboardingSteps.length - 1;

    const step = onboardingSteps[currentStep];
    let html = `<div class="onboarding-container"><div class="progress-bar"><div class="progress-fill" style="width:${((currentStep+1)/onboardingSteps.length)*100}%"></div></div><div id="onboarding-content">`;
    html += `<h2>${step.label}</h2><p class="subtitle">${step.subtitle}</p>`;

    if (step.type === 'text') {
        const maxAttr = step.maxlength ? `maxlength="${step.maxlength}"` : '';
        html += `<input type="text" id="onboard-input" placeholder="${step.placeholder}" ${maxAttr} />`;
        if (step.maxlength) {
            html += `<div style="font-size:12px;color:var(--text-light);text-align:right;margin-top:-10px;margin-bottom:10px;"><span id="char-counter">0</span>/${step.maxlength}</div>`;
        }
    } else if (step.type === 'number') {
        html += `<input type="number" id="onboard-input" placeholder="${step.placeholder}" min="${step.min}" max="${step.max}" />`;
    } else if (step.type === 'select') {
        html += `<select id="onboard-select"><option value="">Select...</option>`;
        step.options.forEach(opt => { html += `<option value="${opt}">${opt}</option>`; });
        html += `</select>`;
    } else if (step.type === 'caste') {
        html += `<select id="onboard-select"><option value="">Select your caste...</option>`;
        CASTES.forEach(c => { html += `<option value="${c}">${c}</option>`; });
        html += `<option value="other">Other (type yours)</option></select>`;
        html += `<div id="caste-other-container" class="caste-other-input"><input type="text" id="caste-other-input" placeholder="Type your caste..." /></div>`;
    } else if (step.type === 'photo') {
        html += `
            <div class="photo-upload-area" id="photo-upload-area">
                <i class="fas fa-cloud-upload-alt"></i>
                <p>Tap to upload photos</p>
                <p style="font-size:12px;color:#999;">Minimum 1 photo</p>
            </div>
            <input type="file" id="photo-input" accept="image/*" multiple style="display:none" />
            <div class="photo-preview" id="photo-preview"></div>
        `;
        if (uploadedPhotos.length > 0) {
            const preview = document.getElementById('photo-preview');
            if (preview) preview.innerHTML = uploadedPhotos.map(p => `<img src="${p}" />`).join('');
        }
    }

    html += `<div class="onboarding-buttons">`;
    if (currentStep > 0) html += `<button class="btn-back" id="onboard-back"><i class="fas fa-arrow-left"></i> Back</button>`;
    html += `<button class="btn-next" id="onboard-next" disabled>${currentStep === onboardingSteps.length - 1 ? 'Finish' : 'Next →'}</button>`;
    html += `</div></div></div>`;

    appContent.innerHTML = html;

    if (step.type === 'photo' && uploadedPhotos.length > 0) {
        const preview = document.getElementById('photo-preview');
        if (preview) preview.innerHTML = uploadedPhotos.map(p => `<img src="${p}" />`).join('');
    }

    if (step.type === 'text' && step.maxlength) {
        const input = document.getElementById('onboard-input');
        const counter = document.getElementById('char-counter');
        if (input && counter) {
            input.addEventListener('input', () => {
                counter.textContent = input.value.length;
            });
        }
    }

    document.getElementById('onboard-back')?.addEventListener('click', () => {
        if (currentStep > 0) { currentStep--; renderOnboarding(); }
    });

    const nextBtn = document.getElementById('onboard-next');

    const input = document.getElementById('onboard-input');
    if (input && (step.type === 'text' || step.type === 'number')) {
        input.addEventListener('input', () => {
            const val = input.value.trim();
            if (val.length > 0) { nextBtn.classList.add('active'); nextBtn.disabled = false; }
            else { nextBtn.classList.remove('active'); nextBtn.disabled = true; }
        });
        if (step.type === 'number') {
            input.addEventListener('change', () => {
                const val = parseInt(input.value);
                if (val >= 16 && val <= 35 && val) { nextBtn.classList.add('active'); nextBtn.disabled = false; }
                else { nextBtn.classList.remove('active'); nextBtn.disabled = true; }
            });
        }
    }

    const select = document.getElementById('onboard-select');
    if (select) {
        select.addEventListener('change', () => {
            if (select.value) { nextBtn.classList.add('active'); nextBtn.disabled = false; }
            else { nextBtn.classList.remove('active'); nextBtn.disabled = true; }
            if (step.type === 'caste') {
                const otherContainer = document.getElementById('caste-other-container');
                if (otherContainer) otherContainer.classList.toggle('show', select.value === 'other');
            }
        });
    }

    if (step.type === 'photo') {
        const area = document.getElementById('photo-upload-area');
        const inputFile = document.getElementById('photo-input');
        area?.addEventListener('click', () => inputFile?.click());
        inputFile?.addEventListener('change', async (e) => {
            const files = Array.from(e.target.files);
            const nextBtn2 = document.getElementById('onboard-next');
            nextBtn2.textContent = 'Uploading...';
            nextBtn2.disabled = true;
            try {
                for (const file of files) {
                    const publicUrl = await uploadPhotoToStorage(file);
                    uploadedPhotos.push(publicUrl);
                }
                const preview = document.getElementById('photo-preview');
                if (preview) preview.innerHTML = uploadedPhotos.map(p => `<img src="${p}" />`).join('');
                if (uploadedPhotos.length >= 1) {
                    nextBtn2.classList.add('active');
                    nextBtn2.disabled = false;
                    nextBtn2.textContent = 'Finish';
                    nextBtn2.removeAttribute('disabled');
                    nextBtn2.style.pointerEvents = 'auto';
                    nextBtn2.style.cursor = 'pointer';
                    nextBtn2.style.opacity = '1';
                }
            } catch (err) {
                console.error('Upload error:', err);
                alert('Failed to upload image. Please try again.');
                nextBtn2.textContent = 'Finish';
                nextBtn2.disabled = uploadedPhotos.length < 1;
            }
        });
        if (uploadedPhotos.length > 0) {
            const nextBtn2 = document.getElementById('onboard-next');
            if (nextBtn2) { nextBtn2.classList.add('active'); nextBtn2.disabled = false; }
        }
    }

    nextBtn.addEventListener('click', handleOnboardNext);
}

function handleOnboardNext() {
    const step = onboardingSteps[currentStep];
    if (step.type === 'text') {
        const val = document.getElementById('onboard-input')?.value.trim();
        if (!val) return alert('Please fill this field');
        onboardData[step.id] = val;
    } else if (step.type === 'number') {
        const val = parseInt(document.getElementById('onboard-input')?.value);
        if (!val || val < 16 || val > 35) return alert('Age must be between 16-35');
        onboardData[step.id] = val;
    } else if (step.type === 'select') {
        const val = document.getElementById('onboard-select')?.value;
        if (!val) return alert('Please select an option');
        onboardData[step.id] = val;
    } else if (step.type === 'caste') {
        let val = document.getElementById('onboard-select')?.value;
        if (!val) return alert('Please select your caste');
        if (val === 'other') {
            const otherVal = document.getElementById('caste-other-input')?.value.trim();
            if (!otherVal) return alert('Please type your caste');
            val = otherVal;
        }
        onboardData[step.id] = val;
    } else if (step.type === 'photo') {
        if (uploadedPhotos.length < 1) return alert('Please upload at least 1 photo');
        onboardData[step.id] = uploadedPhotos;
    }
    if (currentStep === onboardingSteps.length - 1) {
        finishOnboarding();
    } else {
        currentStep++;
        renderOnboarding();
    }
}

async function finishOnboarding() {
    const userData = {
        name: onboardData.name || "",
        age: onboardData.age || 0,
        district: onboardData.district || "",
        caste: onboardData.caste || "",
        bio: onboardData.bio || "",
        photo: onboardData.photo?.[0] || "",
        photos: onboardData.photo || [],
        phone: currentUser?.phone || "9876543210",
        premium: false, online: true
    };
    try {
        const result = await supabaseInsert('users', userData);
        console.log('User saved:', result);
        const savedUser = result?.[0] || userData;
        currentUser = savedUser;
        users.push(currentUser);
        localStorage.setItem('mehboob_user', JSON.stringify(currentUser));
        await loadUsersFromSupabase();
        await loadUserData();
        navigateTo('home');
    } catch (e) {
        console.log('Error saving user:', e);
        alert('Error saving user: ' + e.message);
    }
}

// ============================================
// RENDER: HOME
// ============================================

function renderHome() {
    setHeaderTitle('home');
    const available = users.filter(u => u.id !== currentUser?.id);
    let html = `<div class="feed-container">`;
    if (available.length === 0) {
        html += `<div class="feed-empty"><i class="fas fa-users"></i><p>No users yet</p><span>Be the first to join!</span></div>`;
    } else {
        available.forEach(user => {
            const isLiked = likes.some(l => l.from_user === currentUser?.id && l.to_user === user.id);
            const isMatched = matches.some(m => (m.user1 === currentUser?.id && m.user2 === user.id) || (m.user2 === currentUser?.id && m.user1 === user.id));
            let btnText = '🤍 Request';
            let btnClass = 'feed-action-btn request';
            if (isMatched) { btnText = '💬 Chat'; btnClass = 'feed-action-btn chat'; }
            else if (isLiked) { btnText = '⏳ Requested'; btnClass = 'feed-action-btn requested'; }
            html += `
                <div class="feed-card" onclick="viewProfile('${user.id}')">
                    <div class="feed-row">
                        <div class="feed-left">
                            <img src="${user.photo}" class="feed-avatar" alt="${user.name}" />
                            <div class="feed-info">
                                <div class="feed-name-age">
                                    <span class="feed-name">${user.name}</span>
                                    <span class="feed-age">${user.age}</span>
                                </div>
                                <div class="feed-district"><i class="fas fa-map-pin"></i>${user.district}</div>
                            </div>
                        </div>
                        <button class="${btnClass}" onclick="event.stopPropagation(); handleMatchAction('${user.id}')">${btnText}</button>
                    </div>
                </div>
            `;
        });
    }
    html += `</div>`;
    appContent.innerHTML = html;
}

function viewProfile(userId) {
    const user = users.find(u => u.id === userId);
    if (!user) return;
    viewedProfileUser = user;
    navigateTo('profile-view', { user });
}

async function handleMatchAction(targetId) {
    if (!currentUser) { navigateTo('login'); return; }
    const target = users.find(u => u.id === targetId);
    if (!target) return;

    const isMatched = matches.some(m => (m.user1 === currentUser.id && m.user2 === targetId) || (m.user2 === currentUser.id && m.user1 === targetId));
    if (isMatched) {
        currentMatchChat = targetId;
        navigateTo('chat', { partner: target });
        return;
    }

    const isLiked = likes.some(l => l.from_user === currentUser.id && l.to_user === targetId);
    if (isLiked) {
        alert('Request already sent!');
        return;
    }

    const targetLiked = likes.some(l => l.from_user === targetId && l.to_user === currentUser.id);
    if (targetLiked) {
        const matchData = { user1: currentUser.id, user2: targetId };
        try {
            await supabaseInsert('matches', matchData);
            matches.push(matchData);
            alert(`🎉 You matched with ${target.name}!`);
            renderHome();
            return;
        } catch (e) { console.log('Match error:', e); }
    } else {
        try {
            await supabaseInsert('likes', { from_user: currentUser.id, to_user: targetId });
            likes.push({ from_user: currentUser.id, to_user: targetId });
            alert(`❤️ Request sent to ${target.name}`);
            renderHome();
        } catch (e) { console.log('Like error:', e); }
    }
}

// ============================================
// RENDER: PROFILE VIEW
// ============================================

function renderProfileView(data) {
    const user = data?.user || viewedProfileUser;
    if (!user) { navigateTo('home'); return; }
    setHeaderTitle('profile-view', `${user.name}, ${user.age}`);

    const isLiked = likes.some(l => l.from_user === currentUser?.id && l.to_user === user.id);
    const isMatched = matches.some(m => (m.user1 === currentUser?.id && m.user2 === user.id) || (m.user2 === currentUser?.id && m.user1 === user.id));
    const isOwn = user.id === currentUser?.id;

    let actionHtml = '';
    if (!isOwn) {
        if (isMatched) {
            actionHtml = `<button class="pv-action-btn chat" onclick="openChatFromProfile('${user.id}')">💬 Chat</button>`;
        } else if (isLiked) {
            actionHtml = `<button class="pv-action-btn requested" disabled>⏳ Requested</button>`;
        } else {
            actionHtml = `<button class="pv-action-btn" onclick="handleMatchActionFromProfile('${user.id}')">🤍 Match Request</button>`;
        }
    } else {
        actionHtml = `<button class="pv-action-btn" onclick="navigateTo('profile')">Edit Profile</button>`;
    }

    const html = `
        <div class="profile-view-container">
            <div class="pv-header">
                <span class="pv-name-age">${user.name}<span class="pv-age">, ${user.age}</span></span>
                <span class="pv-district"><i class="fas fa-map-pin"></i>${user.district}</span>
            </div>
            <img src="${user.photo || 'https://i.pravatar.cc/400?img=11'}" class="pv-avatar" alt="${user.name}" />
            <div class="pv-bio">${user.bio || 'Hey there!'}</div>
            <div class="pv-info">
                <div class="pv-field"><span class="label">District</span><span class="value">${user.district || '-'}</span></div>
                <div class="pv-field"><span class="label">Caste</span><span class="value">${user.caste || '-'}</span></div>
            </div>
            ${actionHtml}
        </div>
    `;
    appContent.innerHTML = html;
}

function openChatFromProfile(partnerId) {
    const partner = users.find(u => u.id === partnerId);
    currentMatchChat = partnerId;
    navigateTo('chat', { partner });
}

async function handleMatchActionFromProfile(targetId) {
    await handleMatchAction(targetId);
    const user = users.find(u => u.id === targetId);
    if (user) navigateTo('profile-view', { user });
}

// ============================================
// RENDER: SEARCH
// ============================================

function renderSearch() {
    setHeaderTitle('search', 'Search', 'search');
    let html = `
        <div class="search-container">
            <div class="search-filter">
                <input type="text" id="search-name-input" placeholder="Search by name..." />
            </div>
            <div class="search-filter">
                <select id="district-filter">
                    <option value="">All Districts</option>
    `;
    DISTRICTS.forEach(d => { html += `<option value="${d}">${d}</option>`; });
    html += `</select></div>
            <button id="search-apply-btn">Apply</button>
            <div id="search-results-wrapper"><div id="search-results"></div></div>
        </div>
    `;
    appContent.innerHTML = html;
    document.getElementById('search-apply-btn').addEventListener('click', applySearch);
    document.getElementById('search-name-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') applySearch();
    });
    applySearch();
}

function applySearch() {
    const nameQuery = document.getElementById('search-name-input')?.value.trim().toLowerCase() || '';
    const district = document.getElementById('district-filter')?.value || '';
    const container = document.getElementById('search-results');
    let results = users.filter(u => u.id !== currentUser?.id);
    if (nameQuery) results = results.filter(u => u.name.toLowerCase().includes(nameQuery));
    if (district) results = results.filter(u => u.district === district);
    if (!container) return;
    if (results.length === 0) {
        container.innerHTML = `<p style="color:var(--text-light);text-align:center;padding:20px;">No users found</p>`;
        return;
    }
    container.innerHTML = results.map(u => {
        const alreadyLiked = likes.some(l => l.from_user === currentUser?.id && l.to_user === u.id);
        return `
            <div class="search-result-card" onclick="viewProfile('${u.id}')">
                <img src="${u.photo}" alt="${u.name}" />
                <div class="info"><h4>${u.name}, ${u.age}</h4><p>${u.district}</p></div>
                <button class="like-btn ${alreadyLiked ? 'liked' : ''}" onclick="event.stopPropagation(); handleMatchAction('${u.id}')">${alreadyLiked ? '❤️ Liked' : '🤍 Like'}</button>
            </div>
        `;
    }).join('');
}

// ============================================
// RENDER: MATCHES
// ============================================

function renderMatches() {
    setHeaderTitle('matches', 'Matches', 'heart');
    let html = `<div class="matches-container"><div id="matches-list">`;
    if (matches.length === 0) {
        html += `<div style="text-align:center;padding:40px 0;color:var(--text-light);">
            <i class="fas fa-heart" style="font-size:40px;opacity:0.2;display:block;margin-bottom:12px;"></i>
            <p>No matches yet</p>
            <p style="font-size:14px;">Send match requests to connect!</p>
        </div>`;
    } else {
        html += matches.map(m => {
            const partnerId = m.user1 === currentUser?.id ? m.user2 : m.user1;
            const partner = users.find(u => u.id === partnerId);
            if (!partner) return '';
            return `
                <div class="match-card" onclick="openChat('${partner.id}')">
                    <img src="${partner.photo}" alt="${partner.name}" />
                    <div class="info"><h4>${partner.name}, ${partner.age}</h4><p>📍 ${partner.district}</p></div>
                    <i class="fas fa-arrow-right chat-arrow"></i>
                </div>
            `;
        }).join('');
    }
    html += `</div></div>`;
    appContent.innerHTML = html;
}

function openChat(partnerId) {
    currentMatchChat = partnerId;
    const partner = users.find(u => u.id === partnerId);
    navigateTo('chat', { partner });
}

// ============================================
// RENDER: CHAT
// ============================================

function renderChat(data) {
    const partner = data?.partner || users.find(u => u.id === currentMatchChat);
    if (!partner) { navigateTo('matches'); return; }
    setHeaderTitle('chat', `Chat with ${partner.name}`);
    let html = `
        <div class="chat-container">
            <div class="chat-header">
                <button onclick="navigateTo('matches')"><i class="fas fa-arrow-left"></i></button>
                <span>${partner.name}</span>
            </div>
            <div id="chat-messages">
                <div class="msg received">👋 You matched! Say hi.</div>
            </div>
            <div class="chat-input">
                <input type="text" id="chat-input-field" placeholder="Type a message..." />
                <button id="chat-send-btn"><i class="fas fa-paper-plane"></i></button>
            </div>
        </div>
    `;
    appContent.innerHTML = html;
    document.getElementById('chat-send-btn').addEventListener('click', sendMessage);
    document.getElementById('chat-input-field').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
}

function sendMessage() {
    const input = document.getElementById('chat-input-field');
    const msg = input?.value.trim();
    if (!msg) return;
    const container = document.getElementById('chat-messages');
    container.innerHTML += `<div class="msg sent">${msg}</div>`;
    input.value = '';
    container.scrollTop = container.scrollHeight;
    setTimeout(() => {
        container.innerHTML += `<div class="msg received">😊 That's cool! Tell me more.</div>`;
        container.scrollTop = container.scrollHeight;
    }, 1000);
}

// ============================================
// RENDER: MESSAGES
// ============================================

function renderMessages() {
    setHeaderTitle('messages', 'Messages', 'comment-dots');
    let html = `<div class="messages-container"><div id="messages-list">`;
    if (matches.length === 0) {
        html += `
            <div style="text-align:center;padding:60px 20px;color:var(--text-light);">
                <i class="fas fa-comment-dots" style="font-size:48px;opacity:0.2;display:block;margin-bottom:12px;color:var(--primary);"></i>
                <p style="font-size:16px;font-weight:600;color:var(--text);">No messages yet</p>
                <p style="font-size:13px;">Your chats will appear here</p>
            </div>
        `;
    } else {
        matches.forEach(m => {
            const partnerId = m.user1 === currentUser?.id ? m.user2 : m.user1;
            const partner = users.find(u => u.id === partnerId);
            if (!partner) return;
            const lastMsg = "Tap to start chatting!";
            const time = "now";
            html += `
                <div class="chat-row" onclick="openChat('${partner.id}')">
                    <img src="${partner.photo}" alt="${partner.name}" />
                    <div class="chat-info">
                        <div class="chat-top">
                            <span class="chat-name">${partner.name}</span>
                            <span class="chat-time">${time}</span>
                        </div>
                        <div class="chat-preview">${lastMsg}</div>
                    </div>
                    <i class="fas fa-chevron-right chat-chevron"></i>
                </div>
            `;
        });
    }
    html += `</div></div>`;
    appContent.innerHTML = html;
}

// ============================================
// RENDER: PROFILE (Own)
// ============================================

function renderProfile() {
    setHeaderTitle('profile', 'Profile', 'user');
    if (!currentUser) { navigateTo('login'); return; }
    let html = `
        <div class="profile-container">
            <img src="${currentUser.photo || 'https://i.pravatar.cc/400?img=11'}" class="profile-avatar" />
            <div class="profile-name">${currentUser.name}</div>
            <div class="profile-age">${currentUser.age}</div>
            <div class="profile-info">
                <div class="profile-field"><span class="label">District</span><span class="value">${currentUser.district || '-'}</span></div>
                <div class="profile-field"><span class="label">Caste</span><span class="value">${currentUser.caste || '-'}</span></div>
                <div class="profile-field"><span class="label">Bio</span><span class="value">${currentUser.bio || 'Hey there!'}</span></div>
            </div>
            <button id="delete-account-btn" class="delete-btn">Delete Account</button>
        </div>
    `;
    appContent.innerHTML = html;
    document.getElementById('delete-account-btn').addEventListener('click', async () => {
        if (!currentUser) return;
        if (confirm('Delete account?')) {
            try {
                await supabaseFetch(`users?id=eq.${currentUser.id}`, { method: 'DELETE' });
                localStorage.removeItem('mehboob_user');
                currentUser = null; users = []; matches = []; likes = [];
                navigateTo('login');
                alert('Account deleted.');
            } catch (e) {
                localStorage.removeItem('mehboob_user');
                currentUser = null; users = []; matches = []; likes = [];
                navigateTo('login');
                alert('Account deleted.');
            }
        }
    });
}

// ============================================
// INIT
// ============================================

(async function init() {
    try {
        await loadUsersFromSupabase();
    } catch (e) { console.log('Init error:', e); }
    const loggedIn = checkAutoLogin();
    if (!loggedIn) {
        navigateTo('login');
    }
})();