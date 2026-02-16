document.addEventListener('DOMContentLoaded', () => {
    // Search Functionality
    const searchTrigger = document.querySelector('.search-trigger');
    const searchModal = document.createElement('div');
    searchModal.className = 'search-modal';
    searchModal.innerHTML = `
        <div class="search-content">
            <div class="search-header">
                <input type="text" placeholder="Search pages..." id="searchInput" autofocus>
                <button class="close-search">Esc</button>
            </div>
            <div class="search-results" id="searchResults"></div>
        </div>
    `;
    document.body.appendChild(searchModal);

    const searchInput = searchModal.querySelector('#searchInput');
    const searchResults = searchModal.querySelector('#searchResults');
    const closeSearch = searchModal.querySelector('.close-search');

    // Pages Data
    const pages = [
        { title: 'Introduction', url: 'index.html', icon: '🏠' },
        { title: 'Windows Softwares', url: 'windows-softwares.html', icon: '💻' },
        { title: 'Mac Softwares', url: 'mac-softwares.html', icon: '🍎' },
        { title: 'Windows Plugins', url: 'windows-plugins.html', icon: '🔌' },
        { title: 'Mac Plugins', url: 'mac-plugins.html', icon: '⚡' },
        { title: 'Blender Addons', url: 'blender-addons.html', icon: '🧊' },
        { title: 'Car Clips', url: 'car-clips.html', icon: '🚗' },
        { title: 'VFX Pack', url: 'vfx-pack.html', icon: '🔥' },
        { title: 'SFX Pack', url: 'sfx-pack.html', icon: '🔊' },
        { title: 'FAQ', url: 'general-questions.html', icon: '❓' }
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
            searchResults.innerHTML = '<div class="no-results">No results found</div>';
            return;
        }

        results.forEach(page => {
            const resultItem = document.createElement('a');
            resultItem.className = 'search-result-item';
            resultItem.href = page.url;
            resultItem.innerHTML = `
                <span class="result-icon">${page.icon}</span>
                <span class="result-title">${page.title}</span>
            `;
            // Close modal when clicking a link (optional, as page navigates anyway)
            resultItem.addEventListener('click', closeSearchModal);
            searchResults.appendChild(resultItem);
        });
    }

    // Event Listeners
    searchTrigger.addEventListener('click', openSearch);
    
    closeSearch.addEventListener('click', closeSearchModal);
    
    searchModal.addEventListener('click', (e) => {
        if (e.target === searchModal) closeSearchModal();
    });

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase();
        const filtered = pages.filter(page => page.title.toLowerCase().includes(query));
        renderResults(filtered);
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            openSearch();
        }
        if (e.key === 'Escape' && searchModal.classList.contains('active')) {
            closeSearchModal();
        }
    });
});
