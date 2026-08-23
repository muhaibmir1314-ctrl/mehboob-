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

const VIBES = ["☕", "📚", "🎵", "🏔️", "🎮", "🌿", "🍕", "🏏", "🎬", "✈️", "🧘", "📸", "🏋️", "🎨", "💃"];

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
let selectedVibes = [];
let uploadedPhotos = [];
let currentSwipeIndex = 0;
let likes = [];
let matches = [];
let currentMatchChat = null;
let swipeCount = 0;
let dailySwipeLimit = 10;
let currentPage = 'home';

// ============================================
// DOM REFS (New SPA)
// ============================================

const appContent = document.getElementById('app-content');
const headerTitle = document.getElementById('header-title');
const headerBackBtn = document.getElementById('header-back-btn');
const headerRight = document.getElementById('header-right');
const navBtns = document.querySelectorAll('.nav-btn');

// ============================================
// NAVIGATION (SPA)
// ============================================

function navigateTo(page, data = null) {
    currentPage = page;
    // Update nav
    navBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
    });
    // Show/hide back button
    const backPages = ['onboarding', 'chat', 'messages'];
    headerBackBtn.style.display = backPages.includes(page) ? 'block' : 'none';
    // Render page
    switch (page) {
        case 'login': renderLogin(); break;
        case 'onboarding': renderOnboarding(); break;
        case 'home': renderHome(); break;
        case 'search': renderSearch(); break;
        case 'matches': renderMatches(); break;
        case 'chat': renderChat(data); break;
        case 'messages': renderMessages(); break;
        case 'profile': renderProfile(); break;
        default: renderHome();
    }
}

// Back button
headerBackBtn.addEventListener('click', () => {
    if (currentPage === 'onboarding') {
        if (currentStep > 0) { currentStep--; renderOnboarding(); }
        else navigateTo('login');
    } else if (currentPage === 'chat') {
        navigateTo('matches');
    } else if (currentPage === 'messages') {
        navigateTo('home');
    } else {
        navigateTo('home');
    }
});

// Bottom nav
navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page === 'profile' && !currentUser) { navigateTo('login'); return; }
        if (page === 'matches' && !currentUser) { navigateTo('login'); return; }
        if (page === 'search' && !currentUser) { navigateTo('login'); return; }
        navigateTo(page);
    });
});

// Header right (profile icon on home)
function updateHeaderRight() {
    if (currentPage === 'home' && currentUser) {
        headerRight.innerHTML = `<button id="home-profile-btn" class="header-btn"><i class="fas fa-user-circle"></i></button>`;
        document.getElementById('home-profile-btn')?.addEventListener('click', () => navigateTo('profile'));
    } else if (currentPage === 'home' && !currentUser) {
        headerRight.innerHTML = '';
    } else {
        headerRight.innerHTML = '';
    }
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
        console.log('User data loaded:', { likes: likes.length, matches: matches.length });
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
            console.log('Users loaded:', users);
        }
    } catch (e) { console.log('Error loading users:', e); }
}

// ============================================
// RENDER: LOGIN
// ============================================

function renderLogin() {
    headerTitle.textContent = '🍁 Mehboob';
    updateHeaderRight();
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
        selectedVibes = [];
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
    { id: 'gender', label: "What's your gender?", subtitle: "Help us know you better", type: 'select', options: ['Male', 'Female', 'Non-binary', 'Prefer not to say'] },
    { id: 'caste', label: "What's your caste?", subtitle: "If not listed, select 'Other' and type yours", type: 'caste' },
    { id: 'castePreference', label: "Does caste matter to you?", subtitle: "This helps match you better", type: 'select', options: ['Yes', 'No', 'Maybe'] },
    { id: 'vibes', label: "Pick your vibes!", subtitle: "Choose 3 that represent you", type: 'vibes' },
    { id: 'bio', label: "Tell us about yourself", subtitle: "One line that defines you", type: 'text', placeholder: 'Love mountains & chai...' },
    { id: 'photo', label: "Add a photo", subtitle: "Upload at least 1 photo", type: 'photo' }
];

function renderOnboarding() {
    headerTitle.textContent = 'Create Profile';
    updateHeaderRight();
    if (currentStep < 0) currentStep = 0;
    if (currentStep >= onboardingSteps.length) currentStep = onboardingSteps.length - 1;

    const step = onboardingSteps[currentStep];
    let html = `<div class="onboarding-container"><div class="progress-bar"><div class="progress-fill" style="width:${((currentStep+1)/onboardingSteps.length)*100}%"></div></div><div id="onboarding-content">`;
    html += `<h2>${step.label}</h2><p class="subtitle">${step.subtitle}</p>`;

    if (step.type === 'text') {
        html += `<input type="text" id="onboard-input" placeholder="${step.placeholder}" />`;
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
    } else if (step.type === 'vibes') {
        html += `<div class="vibe-grid">`;
        VIBES.forEach(v => {
            const selected = selectedVibes.includes(v) ? 'selected' : '';
            html += `<div class="vibe-btn ${selected}" data-vibe="${v}">${v}</div>`;
        });
        html += `</div>`;
        html += `<p class="vibe-counter" style="font-size:14px;color:var(--text-light);">Selected: ${selectedVibes.length}/3</p>`;
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

    // Restore photo preview
    if (step.type === 'photo' && uploadedPhotos.length > 0) {
        const preview = document.getElementById('photo-preview');
        if (preview) preview.innerHTML = uploadedPhotos.map(p => `<img src="${p}" />`).join('');
    }

    // Back button
    document.getElementById('onboard-back')?.addEventListener('click', () => {
        if (currentStep > 0) { currentStep--; renderOnboarding(); }
    });

    const nextBtn = document.getElementById('onboard-next');

    // Input handlers
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

    // Vibes
    if (step.type === 'vibes') {
        document.querySelectorAll('.vibe-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const vibe = btn.dataset.vibe;
                if (selectedVibes.includes(vibe)) {
                    selectedVibes = selectedVibes.filter(v => v !== vibe);
                    btn.classList.remove('selected');
                } else if (selectedVibes.length < 3) {
                    selectedVibes.push(vibe);
                    btn.classList.add('selected');
                } else {
                    alert('You can only select 3 vibes!');
                }
                const counter = document.querySelector('.vibe-counter');
                if (counter) counter.textContent = `Selected: ${selectedVibes.length}/3`;
                if (selectedVibes.length === 3) { nextBtn.classList.add('active'); nextBtn.disabled = false; }
                else { nextBtn.classList.remove('active'); nextBtn.disabled = true; }
            });
        });
    }

    // Photo upload
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
                    nextBtn2.textContent = currentStep === onboardingSteps.length - 1 ? 'Finish' : 'Next →';
                    nextBtn2.removeAttribute('disabled');
                    nextBtn2.style.pointerEvents = 'auto';
                    nextBtn2.style.cursor = 'pointer';
                }
            } catch (err) {
                console.error('Upload error:', err);
                alert('Failed to upload image. Please try again.');
                nextBtn2.textContent = currentStep === onboardingSteps.length - 1 ? 'Finish' : 'Next →';
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
    } else if (step.type === 'vibes') {
        if (selectedVibes.length !== 3) return alert('Please select exactly 3 vibes');
        onboardData[step.id] = selectedVibes;
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
        name: onboardData.name || "", age: onboardData.age || 0,
        district: onboardData.district || "", gender: onboardData.gender || "",
        caste: onboardData.caste || "", caste_preference: onboardData.castePreference || "",
        vibes: onboardData.vibes || [], bio: onboardData.bio || "",
        photo: onboardData.photo?.[0] || "", photos: onboardData.photo || [],
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
    headerTitle.textContent = '🍁 Discover';
    updateHeaderRight();
    // Add messages button to header right
    const messagesBtn = document.createElement('button');
    messagesBtn.className = 'header-btn';
    messagesBtn.innerHTML = '<i class="fab fa-telegram-plane"></i>';
    messagesBtn.style.marginRight = '8px';
    messagesBtn.addEventListener('click', () => navigateTo('messages'));
    const profileBtn = document.createElement('button');
    profileBtn.className = 'header-btn';
    profileBtn.innerHTML = '<i class="fas fa-user-circle"></i>';
    profileBtn.addEventListener('click', () => navigateTo('profile'));
    headerRight.innerHTML = '';
    if (currentUser) {
        headerRight.appendChild(messagesBtn);
        headerRight.appendChild(profileBtn);
    }

    const available = users.filter(u => u.id !== currentUser?.id);
    let html = '';
    if (available.length === 0) {
        html = `<div class="swipe-card"><div class="empty-state"><i class="fas fa-users"></i><p>No users yet</p><p style="font-size:14px;">Be the first to join!</p></div></div>`;
    } else {
        if (currentSwipeIndex >= available.length) currentSwipeIndex = 0;
        const user = available[currentSwipeIndex];
        html = `
            <div class="swipe-card">
                <img src="${user.photo}" alt="${user.name}" />
                <div class="card-info">
                    <h3>${user.name}, ${user.age}</h3>
                    <div class="card-district">${user.district}</div>
                    <div class="card-vibes">${user.vibes.join(' ')}</div>
                </div>
                <div class="action-buttons">
                    <button class="action-btn pass" onclick="handleSwipe('pass')"><i class="fas fa-times"></i></button>
                    <button class="action-btn like" onclick="handleSwipe('like')"><i class="fas fa-heart"></i></button>
                </div>
            </div>
        `;
    }
    appContent.innerHTML = html;
}

async function handleSwipe(action) {
    if (swipeCount >= dailySwipeLimit) {
        alert('Daily swipe limit reached!');
        return;
    }
    const available = users.filter(u => u.id !== currentUser?.id);
    if (available.length === 0) return;
    const target = available[currentSwipeIndex];
    if (action === 'like') {
        try {
            const existing = likes.find(l => l.from === target.id && l.to === currentUser.id);
            if (existing) {
                matches.push({ user1: currentUser.id, user2: target.id });
                await supabaseInsert('matches', { user1: currentUser.id, user2: target.id });
                alert(`🎉 You matched with ${target.name}!`);
                renderMatches();
            } else {
                likes.push({ from: currentUser.id, to: target.id });
                await supabaseInsert('likes', { from_user: currentUser.id, to_user: target.id });
            }
        } catch (e) { console.log('Like error:', e); }
    }
    swipeCount++;
    currentSwipeIndex++;
    renderHome();
}

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (currentPage === 'home') {
        if (e.key === 'ArrowLeft') {
            const passBtn = document.querySelector('.action-btn.pass');
            if (passBtn) passBtn.click();
        }
        if (e.key === 'ArrowRight') {
            const likeBtn = document.querySelector('.action-btn.like');
            if (likeBtn) likeBtn.click();
        }
    }
});

// ============================================
// RENDER: SEARCH
// ============================================

function renderSearch() {
    headerTitle.textContent = '🔍 Search';
    updateHeaderRight();
    let html = `
        <div class="search-container">
            <div class="search-header"><h2><i class="fas fa-search"></i> Search</h2></div>
            <div class="search-filter"><input type="text" id="search-name-input" placeholder="Search by name..." /></div>
            <div class="search-filter"><select id="district-filter"><option value="">All Districts</option>
    `;
    DISTRICTS.forEach(d => { html += `<option value="${d}">${d}</option>`; });
    html += `</select></div>
            <button id="search-apply-btn" class="btn-primary" style="background:var(--primary);color:white;padding:14px;border:none;border-radius:var(--radius-sm);font-weight:600;cursor:pointer;">Apply</button>
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
        const alreadyLiked = likes.some(l => l.from === currentUser?.id && l.to === u.id);
        return `
            <div class="search-result-card">
                <img src="${u.photo}" alt="${u.name}" />
                <div class="info"><h4>${u.name}, ${u.age}</h4><p>${u.district}</p></div>
                <button class="like-btn ${alreadyLiked ? 'liked' : ''}" onclick="likeFromSearch('${u.id}')">${alreadyLiked ? '❤️ Liked' : '🤍 Like'}</button>
            </div>
        `;
    }).join('');
}

async function likeFromSearch(targetId) {
    const target = users.find(u => u.id === targetId);
    if (!target) return;
    const alreadyLiked = likes.some(l => l.from === currentUser?.id && l.to === targetId);
    if (alreadyLiked) return alert('You already liked this person');
    const existing = likes.find(l => l.from === targetId && l.to === currentUser?.id);
    if (existing) {
        matches.push({ user1: currentUser.id, user2: targetId });
        await supabaseInsert('matches', { user1: currentUser.id, user2: targetId });
        alert(`🎉 You matched with ${target.name}!`);
        renderMatches();
    } else {
        likes.push({ from: currentUser.id, to: targetId });
        await supabaseInsert('likes', { from_user: currentUser.id, to_user: targetId });
        alert(`❤️ You liked ${target.name}`);
    }
    applySearch();
}

// ============================================
// RENDER: MATCHES
// ============================================

function renderMatches() {
    headerTitle.textContent = '❤️ Matches';
    updateHeaderRight();
    let html = `<div class="matches-container"><h2><i class="fas fa-heart"></i> Matches</h2><div id="matches-list">`;
    if (matches.length === 0) {
        html += `<div style="text-align:center;padding:40px 0;color:var(--text-light);"><i class="fas fa-heart" style="font-size:40px;opacity:0.2;display:block;margin-bottom:12px;"></i><p>No matches yet</p><p style="font-size:14px;">Keep swiping to find your connection!</p></div>`;
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
    headerTitle.textContent = `💬 ${data?.partner?.name || 'Chat'}`;
    updateHeaderRight();
    const partner = data?.partner || users.find(u => u.id === currentMatchChat);
    if (!partner) { navigateTo('matches'); return; }
    let html = `
        <div class="chat-container">
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
    headerTitle.textContent = '💬 Messages';
    updateHeaderRight();
    let html = `<div class="messages-container"><div class="messages-header"><h2><i class="fab fa-telegram-plane"></i> Messages</h2></div><div id="messages-list">`;
    if (matches.length === 0) {
        html += `<div style="text-align:center;padding:40px 0;color:var(--text-light);"><i class="fab fa-telegram-plane" style="font-size:40px;opacity:0.2;display:block;margin-bottom:12px;color:var(--primary);"></i><p>No messages yet</p><p style="font-size:14px;">Your chats will appear here</p></div>`;
    } else {
        html += matches.map(m => {
            const partnerId = m.user1 === currentUser?.id ? m.user2 : m.user1;
            const partner = users.find(u => u.id === partnerId);
            if (!partner) return '';
            return `
                <div class="match-card" onclick="openChat('${partner.id}')">
                    <img src="${partner.photo}" alt="${partner.name}" />
                    <div class="info"><h4>${partner.name}, ${partner.age}</h4><p>📍 ${partner.district}</p></div>
                    <i class="fas fa-chevron-right" style="color:var(--text-light);"></i>
                </div>
            `;
        }).join('');
    }
    html += `</div></div>`;
    appContent.innerHTML = html;
}

// ============================================
// RENDER: PROFILE
// ============================================

function renderProfile() {
    headerTitle.textContent = '👤 Profile';
    updateHeaderRight();
    if (!currentUser) { navigateTo('login'); return; }
    let html = `
        <div class="profile-container">
            <div id="profile-content">
                <img src="${currentUser.photo || 'https://i.pravatar.cc/400?img=11'}" alt="${currentUser.name}" class="profile-avatar" />
                <div class="profile-field"><span class="label">Name</span><span class="value">${currentUser.name || ''}</span></div>
                <div class="profile-field"><span class="label">Age</span><span class="value">${currentUser.age || ''}</span></div>
                <div class="profile-field"><span class="label">District</span><span class="value">${currentUser.district || ''}</span></div>
                <div class="profile-field"><span class="label">Caste</span><span class="value">${currentUser.caste || ''}</span></div>
                <div class="profile-field"><span class="label">Caste Preference</span><span class="value">${currentUser.caste_preference || ''}</span></div>
                <div class="profile-field"><span class="label">Vibes</span><span class="value">${(currentUser.vibes || []).join(' ')}</span></div>
                <div class="profile-field"><span class="label">Bio</span><span class="value">${currentUser.bio || ''}</span></div>
                <div class="profile-field"><span class="label">Photos</span><span class="value">${(currentUser.photos || []).length} uploaded</span></div>
            </div>
            <button id="delete-account-btn" class="btn-danger">Delete Account</button>
        </div>
    `;
    appContent.innerHTML = html;
    document.getElementById('delete-account-btn').addEventListener('click', async () => {
        if (!currentUser) return;
        if (confirm('Are you sure you want to delete your account? This cannot be undone.')) {
            if (confirm('All your data (photos, likes, matches) will be permanently deleted.')) {
                try {
                    await supabaseFetch(`users?id=eq.${currentUser.id}`, { method: 'DELETE' });
                    localStorage.removeItem('mehboob_user');
                    currentUser = null;
                    users = [];
                    matches = [];
                    likes = [];
                    navigateTo('login');
                    alert('Account deleted successfully.');
                } catch (e) {
                    console.log('Delete error:', e);
                    localStorage.removeItem('mehboob_user');
                    currentUser = null;
                    users = [];
                    matches = [];
                    likes = [];
                    navigateTo('login');
                    alert('Account deleted successfully.');
                }
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