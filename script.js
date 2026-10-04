document.addEventListener('DOMContentLoaded', () => {
    // Dynamic Offline Notification State
    const offlineBanner = document.createElement('div');
    offlineBanner.className = 'offline-banner';
    offlineBanner.setAttribute('role', 'alert');
    offlineBanner.setAttribute('aria-live', 'assertive');
    offlineBanner.textContent = '⚡ You are currently offline. External download links and Community Chat may be unavailable.';
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

    // Global Broadcast Notice Controller (Managed via Master Admin)
    const broadcastBanner = document.createElement('div');
    broadcastBanner.className = 'broadcast-banner';
    broadcastBanner.style.display = 'none';
    document.body.prepend(broadcastBanner);

    async function checkGlobalBroadcastNotice() {
        try {
            const res = await fetch('https://kec-community-chat-api.karunadueditorsclub.workers.dev/api/settings');
            if (res.ok) {
                const data = await res.json();
                const settings = data.settings || {};
                if (settings.broadcast_notice) {
                    const notice = typeof settings.broadcast_notice === 'string' ? JSON.parse(settings.broadcast_notice) : settings.broadcast_notice;
                    if (notice && notice.enabled && notice.text) {
                        broadcastBanner.textContent = notice.text;
                        broadcastBanner.style.display = 'block';
                        broadcastBanner.className = `broadcast-banner broadcast-${notice.type || 'accent'}`;
                    } else {
                        broadcastBanner.style.display = 'none';
                    }
                }
            }
        } catch (e) {}
    }
    checkGlobalBroadcastNotice();

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

    // Shadcn / Lucide Icons Map
    const LucideIcons = {
        home: `<svg class="lucide-icon" viewBox="0 0 24 24"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`,
        monitor: `<svg class="lucide-icon" viewBox="0 0 24 24"><rect width="20" height="14" x="2" y="3" rx="2"/><line x1="8" x2="16" y1="21" y2="21"/><line x1="12" x2="12" y1="17" y2="21"/></svg>`,
        apple: `<svg class="lucide-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.37c.61-.75 1.04-1.8 1.01-2.87-.96.04-2.12.64-2.79 1.42-.58.68-1.1 1.74-1.01 2.78 1.07.08 2.18-.58 2.79-1.33z"/></svg>`,
        plug: `<svg class="lucide-icon" viewBox="0 0 24 24"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>`,
        zap: `<svg class="lucide-icon" viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`,
        box: `<svg class="lucide-icon" viewBox="0 0 24 24"><path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/></svg>`,
        film: `<svg class="lucide-icon" viewBox="0 0 24 24"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/></svg>`,
        flame: `<svg class="lucide-icon" viewBox="0 0 24 24"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
        volume: `<svg class="lucide-icon" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
        helpCircle: `<svg class="lucide-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
        messageSquare: `<svg class="lucide-icon" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
        shield: `<svg class="lucide-icon" viewBox="0 0 24 24"><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/></svg>`,
        fileText: `<svg class="lucide-icon" viewBox="0 0 24 24"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>`,
        cookie: `<svg class="lucide-icon" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10 4 4 0 0 1-5-5 4 4 0 0 1-5-5"/><path d="M8.5 8.5v.01"/><path d="M16 15.5v.01"/><path d="M12 12v.01"/><path d="M11 17v.01"/><path d="M7 14v.01"/></svg>`,
        scale: `<svg class="lucide-icon" viewBox="0 0 24 24"><path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/></svg>`,
        eye: `<svg class="lucide-icon" viewBox="0 0 24 24"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
        lock: `<svg class="lucide-icon" viewBox="0 0 24 24"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
        users: `<svg class="lucide-icon" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
        search: `<svg class="lucide-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
        menu: `<svg class="lucide-icon" viewBox="0 0 24 24" style="width:20px;height:20px;"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
        copy: `<svg class="lucide-icon" viewBox="0 0 24 24"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
        check: `<svg class="lucide-icon" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>`,
        smartphone: `<svg class="lucide-icon" viewBox="0 0 24 24"><rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><line x1="12" x2="12" y1="18" y2="18"/></svg>`
    };

    // Update search triggers in DOM to use Shadcn Search Icon
    document.querySelectorAll('.search-trigger .icon').forEach(el => {
        el.innerHTML = LucideIcons.search;
    });

    // Update Top Header Social/Chat link to use Shadcn MessageSquare Icon
    document.querySelectorAll('.header-actions .social-link').forEach(el => {
        if (el.getAttribute('href') && el.getAttribute('href').includes('community-chat')) {
            el.innerHTML = LucideIcons.messageSquare;
        }
    });

    // Sidebar Nav-Links: automatically ensure each nav link has clean Shadcn icons
    const urlIconMap = {
        'index.html': LucideIcons.home,
        'windows-softwares.html': LucideIcons.monitor,
        'mac-softwares.html': LucideIcons.apple,
        'mobile-apps.html': LucideIcons.smartphone,
        'windows-plugins.html': LucideIcons.plug,
        'mac-plugins.html': LucideIcons.zap,
        'car-clips.html': LucideIcons.film,
        'vfx-pack.html': LucideIcons.flame,
        'sfx-pack.html': LucideIcons.volume,
        'community-chat.html': LucideIcons.messageSquare,
        'general-questions.html': LucideIcons.helpCircle,
        'contact.html': LucideIcons.messageSquare,
        'community-guidelines.html': LucideIcons.users,
        'privacy.html': LucideIcons.shield,
        'terms.html': LucideIcons.fileText,
        'cookie-policy.html': LucideIcons.cookie,
        'disclaimer.html': LucideIcons.scale,
        'accessibility.html': LucideIcons.eye,
        'security.html': LucideIcons.lock,
        'master-admin.html': LucideIcons.shield
    };

    document.querySelectorAll('.nav-link').forEach(link => {
        const rawHref = link.getAttribute('href') || '';
        const cleanHref = rawHref.split('?')[0].split('#')[0].replace(/^\//, '');
        const matchKey = Object.keys(urlIconMap).find(key => 
            cleanHref === key || cleanHref === key.replace('.html', '') || rawHref.endsWith('/' + key)
        );
        if (matchKey && urlIconMap[matchKey]) {
            const existingIcon = link.querySelector('.icon');
            if (existingIcon) {
                existingIcon.innerHTML = urlIconMap[matchKey];
            } else {
                const iconSpan = document.createElement('span');
                iconSpan.className = 'icon';
                iconSpan.innerHTML = urlIconMap[matchKey];
                link.insertBefore(iconSpan, link.firstChild);
            }
        }
    });

    // All Real Verified Pages in the Application
    const pages = [
        { title: 'Introduction', url: 'index.html', icon: LucideIcons.home, category: 'General' },
        { title: 'Windows Softwares', url: 'windows-softwares.html', icon: LucideIcons.monitor, category: 'Software' },
        { title: 'Mac Softwares', url: 'mac-softwares.html', icon: LucideIcons.apple, category: 'Software' },
        { title: 'Mobile Apps', url: 'mobile-apps.html', icon: LucideIcons.smartphone, category: 'Software' },
        { title: 'Windows Plugins', url: 'windows-plugins.html', icon: LucideIcons.plug, category: 'Plugins' },
        { title: 'Mac Plugins', url: 'mac-plugins.html', icon: LucideIcons.zap, category: 'Plugins' },
        { title: 'Car Clips', url: 'car-clips.html', icon: LucideIcons.film, category: 'Assets' },
        { title: 'VFX Pack', url: 'vfx-pack.html', icon: LucideIcons.flame, category: 'Assets' },
        { title: 'SFX Pack', url: 'sfx-pack.html', icon: LucideIcons.volume, category: 'Assets' },
        { title: 'Community Chat & Help', url: 'community-chat.html', icon: LucideIcons.messageSquare, category: 'Community' },
        { title: 'General FAQ', url: 'general-questions.html', icon: LucideIcons.helpCircle, category: 'Help' },
        { title: 'Contact & Support', url: 'contact.html', icon: LucideIcons.messageSquare, category: 'Help' },
        { title: 'Privacy Policy', url: 'privacy.html', icon: LucideIcons.shield, category: 'Legal' },
        { title: 'Terms of Service', url: 'terms.html', icon: LucideIcons.fileText, category: 'Legal' },
        { title: 'Cookie Policy', url: 'cookie-policy.html', icon: LucideIcons.cookie, category: 'Legal' },
        { title: 'Educational Disclaimer', url: 'disclaimer.html', icon: LucideIcons.scale, category: 'Legal' },
        { title: 'Accessibility Statement', url: 'accessibility.html', icon: LucideIcons.eye, category: 'Legal' },
        { title: 'Security & Reporting', url: 'security.html', icon: LucideIcons.lock, category: 'Legal' },
        { title: 'Community Guidelines', url: 'community-guidelines.html', icon: LucideIcons.users, category: 'Community' }
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
    mobileBtn.innerHTML = LucideIcons.menu;

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

    window.LucideIcons = LucideIcons;

    // Copyable Password Chip Feature
    window.initCopyablePasswords = function initCopyablePasswords() {
        document.querySelectorAll('.copyable-pass').forEach(chip => {
            if (!chip.querySelector('.copy-icon')) {
                const iconSpan = document.createElement('span');
                iconSpan.className = 'copy-icon';
                iconSpan.setAttribute('aria-hidden', 'true');
                iconSpan.innerHTML = LucideIcons.copy;
                chip.appendChild(iconSpan);
            }

            if (!chip.getAttribute('title')) {
                chip.setAttribute('title', 'Click to copy password');
            }
            if (!chip.getAttribute('role')) {
                chip.setAttribute('role', 'button');
                chip.setAttribute('tabindex', '0');
            }
        });
    }

    document.addEventListener('click', (e) => {
        const chip = e.target.closest('.copyable-pass');
        if (!chip) return;
        e.preventDefault();

        const passText = chip.getAttribute('data-pass') || chip.dataset.pass || chip.textContent.trim();
        if (!passText) return;

        navigator.clipboard.writeText(passText).then(() => {
            chip.classList.add('copied');
            const iconSpan = chip.querySelector('.copy-icon');
            if (iconSpan) {
                iconSpan.innerHTML = LucideIcons.check;
            }
            const originalTitle = chip.getAttribute('title');
            chip.setAttribute('title', 'Copied!');

            setTimeout(() => {
                chip.classList.remove('copied');
                if (iconSpan) {
                    iconSpan.innerHTML = LucideIcons.copy;
                }
                chip.setAttribute('title', originalTitle || 'Click to copy password');
            }, 1800);
        }).catch(() => {
            // Fallback for older browsers
            const tempInput = document.createElement('input');
            tempInput.value = passText;
            document.body.appendChild(tempInput);
            tempInput.select();
            document.execCommand('copy');
            document.body.removeChild(tempInput);

            chip.classList.add('copied');
            const iconSpan = chip.querySelector('.copy-icon');
            if (iconSpan) iconSpan.innerHTML = LucideIcons.check;
            setTimeout(() => {
                chip.classList.remove('copied');
                if (iconSpan) iconSpan.innerHTML = LucideIcons.copy;
            }, 1800);
        });
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            const chip = document.activeElement && document.activeElement.closest('.copyable-pass');
            if (chip) {
                e.preventDefault();
                chip.click();
            }
        }
    });

    initCopyablePasswords();

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
