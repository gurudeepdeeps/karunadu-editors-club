document.addEventListener('DOMContentLoaded', () => {
    // Dynamic Offline Notification State
    const offlineBanner = document.createElement('div');
    offlineBanner.className = 'offline-banner';
    offlineBanner.setAttribute('role', 'alert');
    offlineBanner.setAttribute('aria-live', 'assertive');
    offlineBanner.textContent = '⚡ You are currently offline. External download links and Discord community may be unavailable.';
    document.body.prepend(offlineBanner);

    function updateNetworkStatus() {
        if (!navigator.onLine) {
            offlineBanner.classList.add('active');
        } else {
            offlineBanner.classList.remove('active');
        }
    }

    window.addEventListener('online', updateNetworkStatus);
    window.addEventListener('offline', updateNetworkStatus);
    updateNetworkStatus();

    // Search Functionality
    const searchTrigger = document.querySelector('.search-trigger');
    const searchModal = document.createElement('div');
    searchModal.className = 'search-modal';
    searchModal.setAttribute('role', 'dialog');
    searchModal.setAttribute('aria-modal', 'true');
    searchModal.setAttribute('aria-label', 'Command search modal');
    searchModal.innerHTML = `
        <div class="search-content">
            <div class="search-header">
                <input type="text" placeholder="Search resources, software, legal..." id="searchInput" aria-label="Search all pages">
                <button class="close-search" aria-label="Close search">Esc</button>
            </div>
            <div class="search-results" id="searchResults" role="listbox"></div>
        </div>
    `;
    document.body.appendChild(searchModal);

    const searchInput = searchModal.querySelector('#searchInput');
    const searchResults = searchModal.querySelector('#searchResults');
    const closeSearch = searchModal.querySelector('.close-search');

    // All Real Verified Pages in the Application
    const pages = [
        { title: 'Introduction', url: 'index.html', icon: '🏠', category: 'General' },
        { title: 'Windows Softwares', url: 'windows-softwares.html', icon: '💻', category: 'Software' },
        { title: 'Mac Softwares', url: 'mac-softwares.html', icon: '🍎', category: 'Software' },
        { title: 'Windows Plugins', url: 'windows-plugins.html', icon: '🔌', category: 'Plugins' },
        { title: 'Mac Plugins', url: 'mac-plugins.html', icon: '⚡', category: 'Plugins' },
        { title: 'Blender Addons (Maintenance)', url: 'blender-addons.html', icon: '🧊', category: 'Plugins' },
        { title: 'Car Clips', url: 'car-clips.html', icon: '🚗', category: 'Assets' },
        { title: 'VFX Pack', url: 'vfx-pack.html', icon: '🔥', category: 'Assets' },
        { title: 'SFX Pack', url: 'sfx-pack.html', icon: '🔊', category: 'Assets' },
        { title: 'General FAQ', url: 'general-questions.html', icon: '❓', category: 'Help' },
        { title: 'Contact & Support', url: 'contact.html', icon: '💬', category: 'Help' },
        { title: 'Privacy Policy', url: 'privacy.html', icon: '🛡️', category: 'Legal' },
        { title: 'Terms of Service', url: 'terms.html', icon: '📜', category: 'Legal' },
        { title: 'Cookie Policy', url: 'cookie-policy.html', icon: '🍪', category: 'Legal' },
        { title: 'Educational Disclaimer', url: 'disclaimer.html', icon: '⚖️', category: 'Legal' },
        { title: 'Accessibility Statement', url: 'accessibility.html', icon: '♿', category: 'Legal' },
        { title: 'Security & Reporting', url: 'security.html', icon: '🔒', category: 'Legal' },
        { title: 'Community Guidelines', url: 'community-guidelines.html', icon: '🤝', category: 'Community' }
    ];

    function openSearch() {
        searchModal.classList.add('active');
        searchInput.focus();
        renderResults(pages);
    }

    function closeSearchModal() {
        searchModal.classList.remove('active');
    }

    function renderResults(results) {
        searchResults.innerHTML = '';
        if (results.length === 0) {
            searchResults.innerHTML = '<div class="no-results" role="status">No results found</div>';
            return;
        }

        results.forEach(page => {
            const resultItem = document.createElement('a');
            resultItem.className = 'search-result-item';
            resultItem.href = page.url;
            resultItem.setAttribute('role', 'option');
            resultItem.innerHTML = `
                <span class="result-icon">${page.icon}</span>
                <div style="display:flex; flex-direction:column; gap:2px;">
                    <span class="result-title">${page.title}</span>
                    <span style="font-size:0.75rem; color:#71717a;">${page.category}</span>
                </div>
            `;
            resultItem.addEventListener('click', closeSearchModal);
            searchResults.appendChild(resultItem);
        });
    }

    if (searchTrigger) {
        searchTrigger.addEventListener('click', openSearch);
    }

    closeSearch.addEventListener('click', closeSearchModal);

    searchModal.addEventListener('click', (e) => {
        if (e.target === searchModal) closeSearchModal();
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const filtered = pages.filter(page =>
            page.title.toLowerCase().includes(query) ||
            page.category.toLowerCase().includes(query)
        );
        renderResults(filtered);
    });

    // Mobile Navigation Drawer Logic
    const header = document.querySelector('.top-header');
    const mobileBtn = document.createElement('button');
    mobileBtn.className = 'mobile-menu-btn';
    mobileBtn.setAttribute('aria-label', 'Open navigation menu');
    mobileBtn.innerHTML = '☰';

    if (header) {
        header.insertBefore(mobileBtn, header.firstChild);
    }

    const sidebar = document.querySelector('.sidebar');
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    document.body.appendChild(overlay);

    function toggleSidebar() {
        if (!sidebar) return;
        sidebar.classList.toggle('active');
        overlay.classList.toggle('active');
    }

    function closeSidebar() {
        if (!sidebar) return;
        sidebar.classList.remove('active');
        overlay.classList.remove('active');
    }

    mobileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSidebar();
    });

    overlay.addEventListener('click', closeSidebar);

    if (sidebar) {
        const sidebarLinks = sidebar.querySelectorAll('a');
        sidebarLinks.forEach(link => {
            link.addEventListener('click', closeSidebar);
        });
    }

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            openSearch();
        }
        if (e.key === 'Escape') {
            if (searchModal.classList.contains('active')) {
                closeSearchModal();
            }
            if (sidebar && sidebar.classList.contains('active')) {
                closeSidebar();
            }
        }
    });
});
