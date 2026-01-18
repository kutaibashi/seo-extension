// Translations loaded from external JSON file
let translations = { en: {}, ar: {} };

// Load translations from JSON file
async function loadTranslations() {
    try {
        const response = await fetch(chrome.runtime.getURL('translations.json'));
        translations = await response.json();
        console.log('[SEO Analyzer] Translations loaded successfully');
    } catch (error) {
        console.error('[SEO Analyzer] Failed to load translations:', error);
    }
}

// Helper function to get translation with template replacement
function t(key, params = {}) {
    const lang = currentLang || 'en';
    let text = translations[lang]?.[key] ?? translations['en']?.[key] ?? key;
    
    // Replace template placeholders like {len}, {min}, {max}, {count}, {url}, {err}, etc.
    if (typeof text === 'string' && Object.keys(params).length > 0) {
        for (const [param, value] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
        }
    }
    
    return text;
}

// Helper to get nested translations (e.g., statusText.200)
function tNested(path, params = {}) {
    const lang = currentLang || 'en';
    const keys = path.split('.');
    let text = translations[lang];
    
    for (const key of keys) {
        text = text?.[key];
        if (text === undefined) break;
    }
    
    // Fallback to English
    if (text === undefined) {
        text = translations['en'];
        for (const key of keys) {
            text = text?.[key];
            if (text === undefined) break;
        }
    }
    
    // If still undefined, return the path
    if (text === undefined) return path;
    
    // Replace template placeholders
    if (typeof text === 'string' && Object.keys(params).length > 0) {
        for (const [param, value] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${param}\\}`, 'g'), value);
        }
    }
    
    return text;
}

let currentLang = localStorage.getItem('popupLang') || 'en';
let currentCWV = { lcp: null, fid: null, cls: null };

function updateUI() {
    document.body.classList.toggle('lang-ar', currentLang === 'ar');
    document.documentElement.lang = currentLang;
    document.querySelectorAll('[data-lang-key]').forEach(element => {
        const key = element.dataset.langKey;
        const translation = translations[currentLang]?.[key] ?? translations['en']?.[key];
        if (translation !== undefined && typeof translation !== 'function') {
            if (key.startsWith('linksInfoP') || key === 'socialInfoBenefit' || key === 'socialInfoOgText' || key === 'socialInfoTwitterText' || key === 'linksNoText') {
                element.innerHTML = translation;
            } else {
                element.textContent = translation;
            }
        } else if (typeof translation !== 'function') {
        }
    });
    const langBtn = document.getElementById('lang-switch-btn');
    if (langBtn) {
        langBtn.textContent = currentLang === 'en' ? translations.en.langSwitchToAr : translations.ar.langSwitchToEn;
        langBtn.title = currentLang === 'en' ? 'Switch to Arabic' : 'Switch to English';
    }
    updateTableHeaders();
    const crawlButton = document.getElementById('crawl-links-btn');
    if (crawlButton && !crawlButton.disabled) {
        crawlButton.textContent = translations[currentLang].crawlButtonStart || "Crawl Links";
        const icon = crawlButton.querySelector('.lucide-icon');
        if (!icon) { crawlButton.innerHTML = `<span class="lucide-icon" aria-hidden="true">zap</span> ${crawlButton.textContent}`; }
        else { /* Ensure icon exists */ }
    } else if (crawlButton && crawlButton.disabled) {
        crawlButton.textContent = translations[currentLang].crawlButtonRunning || "Crawling...";
        const icon = crawlButton.querySelector('.lucide-icon');
        if (!icon) { crawlButton.innerHTML = `<span class="lucide-icon" aria-hidden="true">loader-2</span> ${crawlButton.textContent}`; }
        else { icon.textContent = 'loader-2'; }
    }
    const exportButton = document.getElementById('export-links-btn');
    if (exportButton) {
        const exportText = translations[currentLang].exportLinksButton || "Export Links (.txt)";
        const icon = exportButton.querySelector('.lucide-icon');
        if (icon) {
            exportButton.textContent = ` ${exportText}`;
            exportButton.prepend(icon);
        } else {
            exportButton.textContent = exportText;
        }
    }
    if (window.lastResponseData) { populateResponseTab(window.lastResponseData); }
    updateCoreWebVitalsDisplay(currentCWV);
    const fetchPsiButton = document.getElementById('fetch-psi-button');
    if (fetchPsiButton && !fetchPsiButton.disabled) {
        fetchPsiButton.textContent = translations[currentLang].psiFetchButton || "Fetch PSI Data";
    }
}

function updateTableHeaders() {
    const lang = currentLang || 'en';
    const headers = {
        links: [translations[lang].tableHeaderLinkText || 'Link Text', translations[lang].tableHeaderUrl || 'URL', translations[lang].tableHeaderNofollow || 'Nofollow', translations[lang].tableHeaderLinkStatus || 'Status'],
        images: [translations[lang].tableHeaderImgSrc || 'Source (URL)', translations[lang].tableHeaderImgAlt || 'Alt Text', translations[lang].tableHeaderImgDim || 'Dimensions (WxH)']
    };
    document.querySelectorAll('#tab-links table thead tr').forEach(tr => { tr.querySelectorAll('th').forEach((th, index) => { if (headers.links[index]) th.textContent = headers.links[index]; }); });
    document.querySelectorAll('#tab-images table thead tr').forEach(tr => { tr.querySelectorAll('th').forEach((th, index) => { if (headers.images[index]) th.textContent = headers.images[index]; }); });
}

// XSS Prevention: Escape HTML entities in text content
function safeText(text) { 
    const element = document.createElement('div'); 
    element.innerText = text || ''; 
    return element.innerHTML; 
}

// XSS Prevention: Sanitize URLs to prevent javascript: and data: attacks
function safeUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim().toLowerCase();
    // Block dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'vbscript:', 'file:'];
    for (const protocol of dangerousProtocols) {
        if (trimmed.startsWith(protocol)) {
            console.warn('[SEO Analyzer] Blocked dangerous URL:', url.substring(0, 50));
            return '#blocked-url';
        }
    }
    // Allow http, https, mailto, tel, and relative URLs
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || 
        trimmed.startsWith('mailto:') || trimmed.startsWith('tel:') ||
        trimmed.startsWith('/') || trimmed.startsWith('#') || 
        !trimmed.includes(':')) {
        return safeText(url); // Escape any HTML entities in the URL
    }
    // Block unknown protocols
    console.warn('[SEO Analyzer] Blocked unknown protocol URL:', url.substring(0, 50));
    return '#blocked-url';
}

// XSS Prevention: Create safe anchor element
function createSafeLink(url, text, options = {}) {
    const a = document.createElement('a');
    const safeHref = safeUrl(url);
    if (safeHref === '#blocked-url') {
        const span = document.createElement('span');
        span.textContent = text || url || 'Invalid URL';
        span.className = 'blocked-url';
        span.title = 'URL blocked for security reasons';
        return span;
    }
    a.href = safeHref;
    a.textContent = text || url;
    a.title = options.title || url;
    if (options.external !== false) {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
    }
    return a;
}

function displayError(message) {
    const loading = document.getElementById('loading'); const errorDiv = document.getElementById('error'); const mainViewWrapper = document.getElementById('main-view-wrapper');
    if (loading) loading.style.display = 'none'; if (mainViewWrapper) mainViewWrapper.style.display = 'none';
    if (errorDiv) { errorDiv.textContent = message; errorDiv.hidden = false; errorDiv.style.display = 'block'; }
}
function addEmptyTableMessage(containerOrId, messageKey) {
    const container = (typeof containerOrId === 'string') ? document.getElementById(containerOrId) : containerOrId; if (!container) return;
    const message = translations[currentLang]?.[messageKey] ?? translations['en']?.[messageKey] ?? messageKey;
    const existingTable = container.querySelector('table'); if (existingTable) existingTable.remove();
    let messageEl = container.querySelector('.empty-table-message');
    if (!messageEl) { const p = document.createElement('p'); p.className = 'empty-table-message'; p.textContent = message; container.appendChild(p); } else { messageEl.textContent = message; }
}
function removeEmptyTableMessage(containerOrId) {
    const container = (typeof containerOrId === 'string') ? document.getElementById(containerOrId) : containerOrId; if (!container) return;
    const messageEl = container.querySelector('.empty-table-message'); if (messageEl) { messageEl.remove(); }
}
function getStatusExplanation(code) {
    const lang = currentLang || 'en'; const statusTextMap = translations[lang]?.statusText || translations['en']?.statusText;
    if (statusTextMap) {
        if (statusTextMap[code] !== undefined) { return typeof statusTextMap[code] === 'function' ? statusTextMap[code](code) : statusTextMap[code]; }
        else if (code > 599 || code < -7) { const unknownFunc = statusTextMap?.unknown || translations['en']?.statusText?.unknown; return typeof unknownFunc === 'function' ? unknownFunc(code) : `Status code ${code}.`; }
    } return `Status code ${code}.`;
}
function getStatusClass(code) {
    if (code >= 200 && code < 300) return 'status-2xx'; if (code >= 300 && code < 400) return 'status-3xx'; if (code >= 400 && code < 500) return 'status-4xx'; if (code >= 500 && code < 600) return 'status-5xx'; if (code === null || code < 0) return 'status-error'; return 'status-other';
}

function calculateSeoScore(data) {
    if (!data) return 0; let score = 0; let maxScore = 0;
    const TITLE_RECOMMENDED_MAX_LENGTH = 60; const DESC_RECOMMENDED_MAX_LENGTH = 160; const TITLE_MIN_LENGTH = 10; const DESC_MIN_LENGTH = 50;
    maxScore += 15; const titleLength = data.title?.length || 0; if (titleLength === 0) { score += 0; } else if (titleLength < TITLE_MIN_LENGTH || titleLength > TITLE_RECOMMENDED_MAX_LENGTH) { score += 5; } else { score += 15; }
    maxScore += 15; const descLength = data.description?.length || 0; if (descLength === 0) { score += 0; } else if (descLength < DESC_MIN_LENGTH || descLength > DESC_RECOMMENDED_MAX_LENGTH) { score += 5; } else { score += 15; }
    maxScore += 15; const h1Count = data.headingCounts?.H1 || 0; if (h1Count === 1) { score += 15; } else if (h1Count > 1) { score += 5; } else { score += 0; }
    maxScore += 10; let skippedLevelFound = false; function checkHierarchy(headings) { if (!headings) return; headings.forEach(h => { if (h.isOutOfOrder) skippedLevelFound = true; if (h.children) checkHierarchy(h.children); }); } if (data.headingHierarchy) { checkHierarchy(data.headingHierarchy); } if (!skippedLevelFound && h1Count > 0) { score += 10; }
    maxScore += 15; if (data.images && data.images.length > 0) { const imagesMissingAlt = data.images.filter(img => !img.alt).length; const totalImages = data.images.length; const altCoverage = 1 - (imagesMissingAlt / totalImages); score += Math.round(altCoverage * 15); }
    maxScore += 10; if (data.schema && data.schema.length > 0) { const validSchema = data.schema.some(s => !s.parseError && s['@type']); if (validSchema) { score += 10; } }
    maxScore += 5; if (data.canonical) { score += 5; }
    maxScore += 5; const robotsContent = data.robots?.toLowerCase() || ''; if (robotsContent.includes('noindex')) { score -= 20; } else { score += 5; }
    const ESSENTIAL_OG = ['og:title', 'og:type', 'og:image', 'og:url']; const ESSENTIAL_TWITTER = ['twitter:card', 'twitter:title', 'twitter:description'];
    maxScore += 5; let missingEssentialOG = 0; if (data.socialTags?.og) { ESSENTIAL_OG.forEach(tag => { if (!data.socialTags.og.hasOwnProperty(tag)) { missingEssentialOG++; } }); } else { missingEssentialOG = ESSENTIAL_OG.length; } if (missingEssentialOG === 0) score += 5;
    maxScore += 5; let missingEssentialTwitter = 0; if (data.socialTags?.twitter) { ESSENTIAL_TWITTER.forEach(tag => { if (!data.socialTags.twitter.hasOwnProperty(tag)) { missingEssentialTwitter++; } }); } else { missingEssentialTwitter = ESSENTIAL_TWITTER.length; } if (missingEssentialTwitter === 0) score += 5;
    let finalScore = 0; if (maxScore > 0) { const positiveScore = Math.max(0, score); finalScore = Math.round((positiveScore / maxScore) * 100); }
    finalScore = Math.max(0, Math.min(100, finalScore)); return finalScore;
}

function updateSeoScoreDisplay(score) {
    const scoreContainer = document.getElementById('seo-score-container'); const scoreCircle = document.getElementById('seo-score-circle'); const scoreValueEl = document.getElementById('seo-score-value');
    if (!scoreContainer || !scoreCircle || !scoreValueEl) return;
    const validScore = Math.max(0, Math.min(100, Number(score) || 0)); scoreValueEl.textContent = `${validScore}%`;
    const angle = validScore * 3.6; scoreCircle.style.background = `conic-gradient(var(--score-color) ${angle}deg, var(--score-bg-color) ${angle}deg)`;
    scoreContainer.classList.remove('score-low', 'score-medium', 'score-high');
    if (validScore < 50) { scoreContainer.classList.add('score-low'); } else if (validScore < 80) { scoreContainer.classList.add('score-medium'); } else { scoreContainer.classList.add('score-high'); }
    const mainViewWrapper = document.getElementById('main-view-wrapper'); if (mainViewWrapper && mainViewWrapper.style.display !== 'none') { scoreContainer.style.display = 'flex'; }
}

function populateMetaContentTab(data) {
    const TITLE_RECOMMENDED_MAX_LENGTH = 60; const DESC_RECOMMENDED_MAX_LENGTH = 160; const TITLE_MIN_LENGTH = 10; const DESC_MIN_LENGTH = 50; const lang = currentLang || 'en';
    function setStatus(iconElId, textElId, status, text) { const iconEl = document.getElementById(iconElId); const textEl = document.getElementById(textElId); if (iconEl) iconEl.className = `status-icon ${status}`; if (textEl) textEl.innerHTML = text; }
    document.getElementById('seo-title').textContent = data.title || 'N/A'; document.getElementById('meta-description').textContent = data.description || 'N/A'; document.getElementById('url').textContent = data.url || 'N/A'; document.getElementById('canonical-url').textContent = data.canonical || 'N/A'; document.getElementById('robots-meta').textContent = data.robots || 'N/A';
    const titleLength = data.title?.length || 0; let titleStatus = 'ok', titleText = t('titleRecOk', {len: titleLength, min: TITLE_MIN_LENGTH, max: TITLE_RECOMMENDED_MAX_LENGTH}); if (titleLength === 0) { titleStatus = 'error'; titleText = t('titleRecErrorMissing'); } else if (titleLength < TITLE_MIN_LENGTH) { titleStatus = 'warning'; titleText = t('titleRecWarnShort', {len: titleLength, min: TITLE_MIN_LENGTH, max: TITLE_RECOMMENDED_MAX_LENGTH}); } else if (titleLength > TITLE_RECOMMENDED_MAX_LENGTH) { titleStatus = 'warning'; titleText = t('titleRecWarnLong', {len: titleLength, min: TITLE_MIN_LENGTH, max: TITLE_RECOMMENDED_MAX_LENGTH}); } setStatus('title-status-icon', 'title-recommendation', titleStatus, titleText);
    const descLength = data.description?.length || 0; let descStatus = 'ok', descText = t('descRecOk', {len: descLength, min: DESC_MIN_LENGTH, max: DESC_RECOMMENDED_MAX_LENGTH}); if (descLength === 0) { descStatus = 'warning'; descText = t('descRecWarnMissing'); } else if (descLength < DESC_MIN_LENGTH) { descStatus = 'warning'; descText = t('descRecWarnShort', {len: descLength, min: DESC_MIN_LENGTH, max: DESC_RECOMMENDED_MAX_LENGTH}); } else if (descLength > DESC_RECOMMENDED_MAX_LENGTH) { descStatus = 'warning'; descText = t('descRecWarnLong', {len: descLength, min: DESC_MIN_LENGTH, max: DESC_RECOMMENDED_MAX_LENGTH}); } setStatus('desc-status-icon', 'desc-recommendation', descStatus, descText);
    let canonicalStatus = 'ok', canonicalText = t('canonicalRecOkMatch'); if (!data.canonical) { canonicalStatus = 'warning'; canonicalText = t('canonicalRecWarnMissing'); } else if (data.canonical !== data.url) { canonicalStatus = 'ok'; canonicalText = t('canonicalRecOkDiff', {url: safeText(data.canonical)}); } setStatus('canonical-status-icon', 'canonical-recommendation', canonicalStatus, canonicalText);
    let robotsStatus = 'ok', robotsText = t('robotsRecOk'); const robotsContent = data.robots?.toLowerCase() || ''; if (robotsContent.includes('noindex')) { robotsStatus = 'error'; robotsText = t('robotsRecErrorNoIndex'); if (robotsContent.includes('nofollow')) { robotsText += t('robotsRecWarnNoFollowAdd'); } } else if (robotsContent.includes('nofollow')) { robotsStatus = 'warning'; robotsText = t('robotsRecWarnNoFollow'); } else if (!data.robots) { robotsStatus = 'ok'; robotsText = t('robotsRecOkDefault'); } setStatus('robots-status-icon', 'robots-recommendation', robotsStatus, robotsText);
    const countsList = document.getElementById('heading-counts-list'); countsList.innerHTML = ''; let hasHeadings = false; if (data.headingCounts && Object.keys(data.headingCounts).length > 0) { for (let i = 1; i <= 6; i++) { const tagName = `H${i}`; const count = data.headingCounts[tagName] || 0; if (count > 0) hasHeadings = true; const li = document.createElement('li'); li.innerHTML = `<strong>${tagName}</strong> <span>${count}</span>`; countsList.appendChild(li); } } if (!hasHeadings) { const li = document.createElement('li'); li.style.gridColumn = '1 / -1'; li.style.textAlign = 'center'; li.style.background = 'none'; li.style.border = 'none'; li.textContent = translations[lang].hierarchyStatusNoHeadings || 'No headings (H1-H6) found.'; countsList.appendChild(li); }
    const h1Count = data.headingCounts?.H1 || 0; let h1Status = 'ok', h1Text = ''; const h1StatusEl = document.getElementById('h1-recommendation'); if (h1Count === 0) { h1Status = 'error'; h1Text = t('h1RecErrorMissing'); } else if (h1Count > 1) { h1Status = 'warning'; h1Text = t('h1RecWarnMultiple', {count: h1Count}); } else { h1Status = 'ok'; h1Text = t('h1RecOk'); } if (h1StatusEl) h1StatusEl.innerHTML = `<span class="status-icon ${h1Status}"></span> ${h1Text}`;
    const wordCountEl = document.getElementById('word-count'); const letterCountEl = document.getElementById('letter-count'); if (wordCountEl) wordCountEl.textContent = data.wordCount !== undefined ? data.wordCount.toLocaleString() : 'N/A'; if (letterCountEl) letterCountEl.textContent = data.letterCount !== undefined ? data.letterCount.toLocaleString() : 'N/A';
    const hreflangListDiv = document.getElementById('hreflang-list'); if (hreflangListDiv) { hreflangListDiv.innerHTML = ''; if (data.hreflangTags && data.hreflangTags.length > 0) { removeEmptyTableMessage(hreflangListDiv); const ul = document.createElement('ul'); data.hreflangTags.forEach(tag => { const li = document.createElement('li'); const safeLang = safeText(tag.lang); const safeHref = safeUrl(tag.href); const linkHtml = tag.href ? `<a href="${safeHref}" target="_blank" rel="noopener noreferrer" title="${safeText(tag.href)}">${safeText(tag.href)}</a>` : 'N/A'; li.innerHTML = `<strong>${safeLang}</strong> ${linkHtml}`; ul.appendChild(li); }); hreflangListDiv.appendChild(ul); } else { addEmptyTableMessage(hreflangListDiv, 'hreflangNoneFound'); } }
}
function buildHierarchyListWithIndicators(headings, issuesFound) {
    if (!headings || headings.length === 0) return ''; let html = '<ul>'; headings.forEach(heading => { const safeHeadingText = safeText(heading.text); let indicatorHtml = ''; if (heading.isOutOfOrder) { indicatorHtml = `<span class="out-of-order-indicator">${translations[currentLang].hierarchySkippedLevel || 'Skipped Level'}</span>`; issuesFound.skippedLevel = true; } html += `<li class="clickable-item" data-tag-name="${heading.tagName}" data-element-index="${heading.elementIndex}"><strong>H${heading.level}:</strong> ${safeHeadingText} ${indicatorHtml}`; if (heading.children && heading.children.length > 0) { html += buildHierarchyListWithIndicators(heading.children, issuesFound); } html += '</li>'; }); html += '</ul>'; return html;
}
function populateHierarchyTab(data) {
    const contentDiv = document.getElementById('heading-hierarchy-content'); const summaryDiv = document.getElementById('hierarchy-summary'); const summaryIcon = document.getElementById('hierarchy-status-icon'); const summaryText = document.getElementById('hierarchy-status-text');
    if (!contentDiv || !summaryDiv || !summaryIcon || !summaryText) return;
    contentDiv.innerHTML = ''; summaryDiv.className = 'hierarchy-summary'; summaryIcon.className = 'status-icon'; summaryText.textContent = translations[currentLang].hierarchyAnalyzing || 'Analyzing heading structure...';
    let overallStatus = 'ok'; let statusMessage = translations[currentLang].hierarchyStatusOk || 'Heading structure appears logical.'; const issuesFound = { skippedLevel: false };
    if (!data.hasH1) { overallStatus = 'error'; statusMessage = translations[currentLang].hierarchyStatusErrorH1 || 'Critical: Missing H1 tag...'; }
    if (data.headingHierarchy && data.headingHierarchy.length > 0) { contentDiv.innerHTML = buildHierarchyListWithIndicators(data.headingHierarchy, issuesFound); if (overallStatus === 'ok' && issuesFound.skippedLevel) { overallStatus = 'warning'; statusMessage = translations[currentLang].hierarchyStatusWarnSkip || 'Warning: One or more headings skip levels...'; } }
    else { contentDiv.innerHTML = `<p>${translations[currentLang].hierarchyStatusNoHeadings || 'No headings (H1-H6) found...'}</p>`; if (overallStatus !== 'error') { overallStatus = 'warning'; statusMessage = translations[currentLang].hierarchyStatusWarnNone || 'No heading structure found...'; } }
    summaryDiv.classList.add(overallStatus); summaryIcon.classList.add(overallStatus); summaryText.textContent = statusMessage;
}
function renderSchemaProperties(data, parentElement) {
    if (Array.isArray(data)) { data.forEach((item, index) => { const li = document.createElement('li'); li.style.paddingLeft = '0'; if (typeof item === 'object' && item !== null) { const nestedUl = document.createElement('ul'); nestedUl.className = 'schema-properties'; renderSchemaProperties(item, nestedUl); li.appendChild(nestedUl); } else { const valueSpan = document.createElement('span'); valueSpan.className = 'schema-property-value'; if (typeof item === 'string' && (item.startsWith('http://') || item.startsWith('https://'))) { valueSpan.innerHTML = `<a href="${safeUrl(item)}" target="_blank" rel="noopener noreferrer">${safeText(item)}</a>`; } else { valueSpan.innerHTML = safeText(String(item)); } li.appendChild(valueSpan); } parentElement.appendChild(li); }); return; }
    if (typeof data === 'object' && data !== null) { for (const key in data) { const value = data[key]; const li = document.createElement('li'); const nameSpan = document.createElement('span'); nameSpan.className = 'schema-property-name'; nameSpan.textContent = `${key}:`; li.appendChild(nameSpan); const valueContainer = document.createElement('span'); valueContainer.className = 'schema-property-value'; if (typeof value === 'object' && value !== null) { const nestedUl = document.createElement('ul'); nestedUl.className = 'schema-properties'; renderSchemaProperties(value, nestedUl); valueContainer.appendChild(nestedUl); } else { if (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) { valueContainer.innerHTML = `<a href="${safeUrl(value)}" target="_blank" rel="noopener noreferrer">${safeText(value)}</a>`; } else { valueContainer.innerHTML = safeText(String(value)); } } li.appendChild(valueContainer); parentElement.appendChild(li); } return; }
    const li = document.createElement('li'); li.innerHTML = `<span class="schema-property-value">${safeText(String(data))}</span>`; parentElement.appendChild(li);
}
function populateSchemaTab(data) {
    const contentDiv = document.getElementById('schema-content'); contentDiv.innerHTML = '';
    if (data.schema && data.schema.length > 0) { removeEmptyTableMessage(contentDiv); data.schema.forEach((schemaItem, index) => { if (schemaItem.parseError) { return; } const container = document.createElement('div'); container.className = 'schema-item-container'; const header = document.createElement('div'); header.className = 'schema-item-header'; const type = schemaItem['@type']; const typeString = Array.isArray(type) ? type.join(', ') : (type || translations[currentLang].schemaTypeMissing || 'Type Missing'); const typeSpan = document.createElement('span'); typeSpan.className = 'schema-type'; typeSpan.textContent = typeString; header.appendChild(typeSpan); let status = 'ok'; let statusText = translations[currentLang].schemaStatusValid || 'Valid (Basic Check)'; if (!type || (Array.isArray(type) && type.length === 0)) { status = 'error'; statusText = translations[currentLang].schemaStatusInvalid || 'Invalid: @type missing'; typeSpan.textContent = translations[currentLang].schemaTypeMissing || '@type Missing'; } const statusSpan = document.createElement('span'); statusSpan.className = `schema-status ${status}`; statusSpan.innerHTML = `<span class="status-icon ${status}"></span> ${statusText}`; header.appendChild(statusSpan); container.appendChild(header); const itemContent = document.createElement('div'); itemContent.className = 'schema-item-content'; const propertiesUl = document.createElement('ul'); propertiesUl.className = 'schema-properties'; renderSchemaProperties(schemaItem, propertiesUl); itemContent.appendChild(propertiesUl); if (status === 'error') { const errorMsg = document.createElement('div'); errorMsg.className = 'schema-error-message'; errorMsg.textContent = translations[currentLang].schemaErrorTypeMissing || 'The "@type" property is essential...'; itemContent.insertBefore(errorMsg, itemContent.firstChild); } container.appendChild(itemContent); contentDiv.appendChild(container); }); }
    else { addEmptyTableMessage(contentDiv, 'schemaNoSchemaFound'); }
}
function createLinkTable(linksArray, containerId, captionKey) {
    const container = document.getElementById(containerId); if (!container) return; container.innerHTML = '';
    const captionText = t(captionKey);
    if (!linksArray || linksArray.length === 0) { const noneFoundMsg = t('linksNoneFound', {type: captionText.toLowerCase()}); addEmptyTableMessage(container, noneFoundMsg); return; }
    removeEmptyTableMessage(container); const tableContainer = document.createElement('div'); tableContainer.className = 'table-container'; const table = document.createElement('table'); const caption = table.createCaption(); caption.textContent = `${captionText} (${linksArray.length})`; const thead = table.createTHead(); const headerRow = thead.insertRow(); headerRow.innerHTML = `<th></th><th></th><th></th><th></th>`; const tbody = table.createTBody();
    linksArray.forEach(link => { const row = tbody.insertRow(); row.classList.add('clickable-item'); row.dataset.tagName = link.tagName; row.dataset.elementIndex = link.elementIndex; row.dataset.linkUrl = link.href; const linkTextHtml = link.text ? safeText(link.text) : t('linksNoText'); const linkUrlHtml = link.href ? `<a href="${safeUrl(link.href)}" title="${safeText(link.href)}" target="_blank" rel="noopener noreferrer">${safeText(link.href)}</a>` : 'N/A'; row.innerHTML = `<td>${linkTextHtml}</td><td>${linkUrlHtml}</td><td>${link.nofollow ? 'Yes' : 'No'}</td><td class="link-status-code">${t('crawlStatusLoading')}</td>`; });
    tableContainer.appendChild(table); container.appendChild(tableContainer); updateTableHeaders();
}
function populateLinksTab(data) {
    const contentDiv = document.getElementById('link-analysis-content'); const internalContainer = document.getElementById('internal-links-container'); const externalContainer = document.getElementById('external-links-container'); const otherContainer = document.getElementById('other-links-container'); const totalCountEl = document.getElementById('total-links-count'); const internalCountEl = document.getElementById('internal-links-count'); const externalCountEl = document.getElementById('external-links-count'); const otherCountEl = document.getElementById('other-links-count');
    if (!internalContainer || !externalContainer || !otherContainer || !totalCountEl || !internalCountEl || !externalCountEl || !otherCountEl) { if (contentDiv) contentDiv.innerHTML = "<p>Error displaying links: HTML structure missing.</p>"; return; }
    internalContainer.innerHTML = ''; externalContainer.innerHTML = ''; otherContainer.innerHTML = ''; totalCountEl.textContent = '0'; internalCountEl.textContent = '0'; externalCountEl.textContent = '0'; otherCountEl.textContent = '0';
    const internalLinks = []; const externalLinks = []; const otherLinks = []; let totalLinks = 0;
    if (data.links && data.links.length > 0) { totalLinks = data.links.length; data.links.forEach(link => { switch (link.type) { case 'internal': internalLinks.push(link); break; case 'external': externalLinks.push(link); break; default: otherLinks.push(link); break; } }); }
    totalCountEl.textContent = totalLinks.toLocaleString(); internalCountEl.textContent = internalLinks.length.toLocaleString(); externalCountEl.textContent = externalLinks.length.toLocaleString(); otherCountEl.textContent = otherLinks.length.toLocaleString();
    createLinkTable(internalLinks, 'internal-links-container', 'linksInternalCaption'); createLinkTable(externalLinks, 'external-links-container', 'linksExternalCaption'); createLinkTable(otherLinks, 'other-links-container', 'linksOtherCaption');
}
function updateLinkStatusUI(url, status, error = null) {
    const rows = document.querySelectorAll(`#tab-links tbody tr[data-link-url="${CSS.escape(url)}"]`); if (!rows || rows.length === 0) return;
    rows.forEach(row => {
        const statusCell = row.querySelector('.link-status-code'); if (!statusCell) return;
        let displayStatus = '--'; let statusClass = 'status-other'; let statusTitle = '';
        if (error) { displayStatus = error.substring(0, 10); statusClass = 'status-error'; statusTitle = `Error: ${error}`; }
        else if (status === 0) { displayStatus = "3xx"; statusClass = 'status-3xx'; statusTitle = "Redirect (Specific code unknown)"; }
        else if (typeof status === 'number' && status > 0) { displayStatus = status; statusTitle = getStatusExplanation(status); if (status >= 200 && status < 300) statusClass = 'status-2xx'; else if (status >= 400 && status < 500) statusClass = 'status-4xx'; else if (status >= 500 && status < 600) statusClass = 'status-5xx'; }
        else if (status === null) { displayStatus = translations[currentLang].crawlStatusError || "Error"; statusClass = 'status-error'; statusTitle = getStatusExplanation(null); }
        else if (typeof status === 'number' && status < 0) { displayStatus = `Err (${status})`; statusClass = 'status-error'; statusTitle = getStatusExplanation(status) || `Internal status code: ${status}`; }
        else if (status) { displayStatus = String(status).substring(0, 10); statusClass = 'status-error'; statusTitle = `Unexpected status: ${status}`; }
        statusCell.textContent = displayStatus; statusCell.title = statusTitle;
        row.classList.remove('status-2xx', 'status-3xx', 'status-4xx', 'status-5xx', 'status-error', 'status-other'); row.classList.add(statusClass);
    });
}
function populateImagesTab(data) {
    const contentDiv = document.getElementById('image-analysis-content'); if (!contentDiv) return; contentDiv.innerHTML = '';
    if (data.images && data.images.length > 0) {
        removeEmptyTableMessage(contentDiv); const tableContainer = document.createElement('div'); tableContainer.className = 'table-container'; const table = document.createElement('table'); table.innerHTML = `<caption>${translations[currentLang].imagesHeadingTitle || 'Image Analysis'} (${data.images.length})</caption><thead><tr><th></th><th></th><th></th></tr></thead><tbody></tbody>`; const tbody = table.querySelector('tbody');
        data.images.forEach(image => { const row = tbody.insertRow(); row.classList.add('clickable-item'); row.dataset.tagName = image.tagName; row.dataset.elementIndex = image.elementIndex; const dimensions = (image.width && image.height) ? `${image.width} x ${image.height}` : 'N/A'; const altTextHtml = image.alt ? safeText(image.alt) : `<span class="missing-alt">${translations[currentLang].imagesAltMissing || 'Missing'}</span>`; const imgSrc = image.src ? `<a href="${safeUrl(image.src)}" title="${safeText(image.src)}" target="_blank" rel="noopener noreferrer">${safeText(image.src)}</a>` : 'N/A'; row.innerHTML = `<td>${imgSrc}</td><td>${altTextHtml}</td><td>${safeText(dimensions)}</td>`; const imgPreview = document.createElement('img'); imgPreview.src = safeUrl(image.src); imgPreview.alt = 'Preview'; imgPreview.className = 'preview'; imgPreview.onerror = function () { this.style.display = 'none'; }; if (row.cells[0]) { row.cells[0].appendChild(imgPreview); } });
        tableContainer.appendChild(table); contentDiv.appendChild(tableContainer); updateTableHeaders();
    }
    else { addEmptyTableMessage(contentDiv, 'imagesNoneFound'); }
}
function populateSocialTab(data) {
    const ogDiv = document.getElementById('og-tags'); const twitterDiv = document.getElementById('twitter-tags'); const ogStatusEl = document.getElementById('og-status'); const twitterStatusEl = document.getElementById('twitter-status');
    if (!ogDiv || !twitterDiv || !ogStatusEl || !twitterStatusEl) return;
    ogDiv.innerHTML = ''; twitterDiv.innerHTML = ''; ogStatusEl.innerHTML = '<span class="status-icon"></span> <span></span>'; twitterStatusEl.innerHTML = '<span class="status-icon"></span> <span></span>';
    const ogData = data.socialTags?.og || {}; const twitterData = data.socialTags?.twitter || {};
    const ESSENTIAL_OG = ['og:title', 'og:type', 'og:image', 'og:url']; const ESSENTIAL_TWITTER = ['twitter:card', 'twitter:title', 'twitter:description']; const RECOMMENDED_OG = ['og:description', 'og:site_name']; const RECOMMENDED_TWITTER = ['twitter:image'];
    const processTags = (tagData, essentialTags, recommendedTags, container) => { let status = 'ok'; let message = t('socialStatusMsgOk'); let missingEssentialCount = 0; let missingRecommendedCount = 0; const foundTags = Object.keys(tagData); const ul = document.createElement('ul'); if (foundTags.length > 0) { for (const key in tagData) { const li = document.createElement('li'); const value = tagData[key]; const valueHtml = (typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'))) ? `<a href="${safeUrl(value)}" target="_blank" rel="noopener noreferrer">${safeText(value)}</a>` : safeText(value); li.innerHTML = `<strong>${safeText(key)}:</strong> <span class="tag-value">${valueHtml}</span>`; ul.appendChild(li); } } essentialTags.forEach(essTag => { if (!tagData.hasOwnProperty(essTag)) { missingEssentialCount++; const li = document.createElement('li'); li.innerHTML = `<strong>${safeText(essTag)}:</strong> <span class="missing-tag">${t('socialTagMissingEssential')}</span>`; ul.appendChild(li); } }); recommendedTags.forEach(recTag => { if (!tagData.hasOwnProperty(recTag)) { missingRecommendedCount++; const li = document.createElement('li'); li.innerHTML = `<strong>${safeText(recTag)}:</strong> <span class="missing-tag">${t('socialTagMissingRecommended')}</span>`; ul.appendChild(li); } }); if (ul.hasChildNodes()) { container.appendChild(ul); } else { addEmptyTableMessage(container, t('socialStatusMsgNoneFoundOk')); } if (missingEssentialCount > 0) { status = 'error'; message = t('socialStatusMsgErr', {count: missingEssentialCount}); } else if (missingRecommendedCount > 0) { status = 'warning'; message = t('socialStatusMsgWarn', {count: missingRecommendedCount}); } if (foundTags.length === 0 && !ul.hasChildNodes()) { if (missingEssentialCount > 0) { message = t('socialStatusMsgNoneFoundErr'); status = 'error'; } else if (missingRecommendedCount > 0) { message = t('socialStatusMsgNoneFoundWarn'); status = 'warning'; } else { message = t('socialStatusMsgNoneFoundOk'); status = 'ok'; } } return { status, message }; };
    const ogResult = processTags(ogData, ESSENTIAL_OG, RECOMMENDED_OG, ogDiv); const ogStatusIcon = ogStatusEl.querySelector('.status-icon'); const ogStatusText = ogStatusEl.querySelector('span:last-child'); if (ogStatusIcon) ogStatusIcon.className = `status-icon ${ogResult.status}`; if (ogStatusText) ogStatusText.textContent = ogResult.message;
    let twitterResult = processTags(twitterData, ESSENTIAL_TWITTER, RECOMMENDED_TWITTER, twitterDiv); const twitterStatusIcon = twitterStatusEl.querySelector('.status-icon'); const twitterStatusText = twitterStatusEl.querySelector('span:last-child');
    if (Object.keys(twitterData).length > 0 && !twitterData['twitter:card']) { twitterResult.status = 'error'; twitterResult.message = t('socialTwitterCardError'); let cardLi = twitterDiv.querySelector('li strong:contains("twitter:card:")')?.closest('li'); if (!cardLi) { let ul = twitterDiv.querySelector('ul'); if (!ul) { ul = document.createElement('ul'); twitterDiv.innerHTML = ''; twitterDiv.appendChild(ul); } cardLi = document.createElement('li'); cardLi.innerHTML = `<strong>twitter:card:</strong> <span class="missing-tag">${t('socialTagMissingEssential')}</span>`; ul.prepend(cardLi); } else { const missingSpan = cardLi.querySelector('.missing-tag'); if (missingSpan) { missingSpan.textContent = t('socialTagMissingEssential'); } } }
    if (twitterStatusIcon) twitterStatusIcon.className = `status-icon ${twitterResult.status}`; if (twitterStatusText) twitterStatusText.textContent = twitterResult.message;
}
function populateTechnologyTab(data) {
    const techListEl = document.getElementById('tech-list'); if (!techListEl) return; techListEl.innerHTML = ''; const techData = data.detectedTech; let foundAny = false;
    const createTechListItem = (categoryKey, items) => { if (items && items.length > 0) { foundAny = true; const li = document.createElement('li'); const strong = document.createElement('strong'); strong.textContent = translations[currentLang][categoryKey] || categoryKey.replace('techCategory', '') + ':'; li.appendChild(strong); items.forEach(item => { const span = document.createElement('span'); span.className = 'tech-item'; span.textContent = safeText(item); li.appendChild(span); }); techListEl.appendChild(li); } };
    createTechListItem('techCategoryCMS', techData?.cms); createTechListItem('techCategoryAnalytics', techData?.analyticsTagManagers); createTechListItem('techCategoryWebmaster', techData?.webmasterTools);
    if (techData?.hasCMS && techData.cms?.includes('WordPress')) { createTechListItem('techCategoryWpSeoPlugins', techData?.wpSeoPlugins); createTechListItem('techCategoryWpPageBuilders', techData?.wpPageBuilders); if (techData?.wpSeoPlugins?.length > 0) foundAny = true; if (techData?.wpPageBuilders?.length > 0) foundAny = true; }
    if (!techData?.hasCMS || techData.cms?.length === 0) { createTechListItem('techCategoryJSFrameworks', techData?.jsFrameworks); createTechListItem('techCategoryJSLibraries', techData?.jsLibraries); if (techData?.jsFrameworks?.length > 0) foundAny = true; if (techData?.jsLibraries?.length > 0) foundAny = true; }
    else { if (techData?.jsFrameworks?.length > 0) { createTechListItem('techCategoryJSFrameworks', techData?.jsFrameworks); foundAny = true; } if (techData?.jsLibraries?.length > 0) { createTechListItem('techCategoryJSLibraries', techData?.jsLibraries); foundAny = true; } }
    if (!foundAny) { const li = document.createElement('li'); li.className = 'no-tech-found'; li.textContent = translations[currentLang].techNoneDetected || 'None Detected'; techListEl.appendChild(li); }
}
function populateToolsTab(data) {
    const pageUrl = data.url; const encodedPageUrl = encodeURIComponent(pageUrl || ''); let domain = 'N/A';
    const updateLink = (elementId, href) => { const linkElement = document.getElementById(elementId); if (linkElement) { if (href) { linkElement.href = href; linkElement.classList.remove('disabled'); linkElement.removeAttribute('aria-disabled'); linkElement.removeAttribute('tabindex'); } else { linkElement.href = '#'; linkElement.classList.add('disabled'); linkElement.setAttribute('aria-disabled', 'true'); linkElement.setAttribute('tabindex', '-1'); } } };
    try { if (!pageUrl || pageUrl.startsWith('about:') || pageUrl.startsWith('chrome')) throw new Error("Invalid page URL for tools"); const urlObject = new URL(pageUrl); domain = urlObject.hostname; if (domain.startsWith('www.')) { domain = domain.substring(4); } }
    catch (e) { updateLink('pagespeed-link', null); updateLink('richresults-link', null); updateLink('whois-link', null); updateLink('semrush-link', null); updateLink('google-inurl-link', null); updateLink('google-site-link', null); updateLink('google-site-nohttps-link', null); return; }
    updateLink('pagespeed-link', `https://pagespeed.web.dev/analysis?url=${encodedPageUrl}`); updateLink('richresults-link', `https://search.google.com/test/rich-results?url=${encodedPageUrl}`);
    updateLink('whois-link', domain !== 'N/A' ? `https://www.whois.com/whois/${domain}` : null); updateLink('semrush-link', domain !== 'N/A' ? `https://www.semrush.com/analytics/overview/?searchType=domain&q=${domain}` : null);
    updateLink('google-inurl-link', `https://www.google.com/search?q=inurl%3A${encodedPageUrl}`); updateLink('google-site-link', domain !== 'N/A' ? `https://www.google.com/search?q=site%3A${domain}` : null); updateLink('google-site-nohttps-link', domain !== 'N/A' ? `https://www.google.com/search?q=site%3A${domain}+-inurl%3Ahttps` : null);
}
function populateResponseTab(response) {
    window.lastResponseData = response; const loadingEl = document.getElementById('response-loading-placeholder'); const errorEl = document.getElementById('response-error-placeholder'); const contentEl = document.getElementById('response-content'); const statusCodeEl = document.getElementById('response-status-code'); const statusTextEl = document.getElementById('response-status-text'); const redirectListEl = document.getElementById('redirect-path-list'); const noRedirectsMsgEl = document.getElementById('no-redirects-message');
    if (!loadingEl || !errorEl || !contentEl || !statusCodeEl || !statusTextEl || !redirectListEl || !noRedirectsMsgEl) return;
    loadingEl.hidden = true; contentEl.hidden = true; errorEl.hidden = true; errorEl.textContent = ''; redirectListEl.innerHTML = ''; statusCodeEl.textContent = '---'; statusCodeEl.className = ''; statusTextEl.textContent = t('responseStatusTextDefault'); noRedirectsMsgEl.hidden = true;
    const lang = currentLang || 'en'; const chainData = response?.chain || []; const errorMsg = response?.error || null; const finalStatusCode = response?.finalStatus; const isCompleted = response?.completed || false;
    if (errorMsg) { const fetchErrorText = t('responseFetchError', {err: errorMsg}); errorEl.textContent = fetchErrorText; errorEl.hidden = false; const codeForErrorDisplay = finalStatusCode ?? -7; statusCodeEl.textContent = 'ERR'; statusCodeEl.className = getStatusClass(codeForErrorDisplay); statusTextEl.textContent = getStatusExplanation(codeForErrorDisplay); contentEl.hidden = false; return; }
    if (!chainData || chainData.length === 0) { const noDataErrorText = t('responseFetchError', {err: "No navigation data received"}); errorEl.textContent = noDataErrorText; errorEl.hidden = false; statusCodeEl.textContent = '---'; statusTextEl.textContent = tNested('statusText.-7'); statusCodeEl.className = getStatusClass(-7); contentEl.hidden = false; return; }
    let firstRedirectStatus = null; let codeToDisplay = finalStatusCode; let codeForExplanationAndColor = finalStatusCode;
    if (chainData.length > 0) { for (const step of chainData) { if (typeof step.status === 'number' && step.status >= 300 && step.status < 400) { firstRedirectStatus = step.status; break; } if (typeof step.status === 'number' && step.status < 0 && step.status !== -1) { break; } } }
    if (firstRedirectStatus !== null) { codeToDisplay = firstRedirectStatus; codeForExplanationAndColor = firstRedirectStatus; } else { if (typeof finalStatusCode === 'number') { if (finalStatusCode >= 100 && finalStatusCode < 600) { codeToDisplay = finalStatusCode; } else if (finalStatusCode === 0 && !isCompleted) { codeToDisplay = '...'; } else if (finalStatusCode === 0 && isCompleted) { codeToDisplay = '???'; } else if (finalStatusCode === -1) { codeToDisplay = 'LOOP'; } else if (finalStatusCode < 0) { codeToDisplay = 'ERR'; } else { codeToDisplay = '???'; } } else { codeToDisplay = '---'; } codeForExplanationAndColor = finalStatusCode; }
    statusCodeEl.textContent = codeToDisplay; statusTextEl.textContent = getStatusExplanation(codeForExplanationAndColor); statusCodeEl.className = getStatusClass(codeForExplanationAndColor);
    if (chainData.length > 1) { chainData.forEach((step, index) => { const li = document.createElement('li'); const statusSpan = document.createElement('span'); statusSpan.className = `redirect-status ${getStatusClass(step.status)}`; let stepStatusDisplay = 'ERR'; if (step.status === 'unknown' || step.status === -6) { stepStatusDisplay = '???'; } else if (typeof step.status === 'number') { if (step.status >= 0) stepStatusDisplay = step.status; else if (step.status === -1) stepStatusDisplay = 'LOOP'; else if (step.status === -3) stepStatusDisplay = 'URL Err'; else if (step.status === -4) stepStatusDisplay = 'Nav Err'; else if (step.status === -5) stepStatusDisplay = 'No Loc'; } statusSpan.textContent = stepStatusDisplay; statusSpan.title = step.error || getStatusExplanation(step.status); li.appendChild(statusSpan); const urlSpan = document.createElement('span'); urlSpan.className = 'redirect-url'; const sanitizedUrl = safeUrl(step.url); const displayUrl = safeText(step.url); if (step.url && (typeof step.status !== 'number' || step.status >= 0 || step.status === -1 || step.status === -3)) { urlSpan.innerHTML = `<a href="${sanitizedUrl}" target="_blank" rel="noopener noreferrer" title="${displayUrl}">${displayUrl}</a>`; } else { urlSpan.textContent = step.url || 'Unknown URL'; urlSpan.title = step.url || 'Unknown URL'; } li.appendChild(urlSpan); redirectListEl.appendChild(li); }); noRedirectsMsgEl.hidden = true; } else { noRedirectsMsgEl.hidden = false; }
    contentEl.hidden = false;
}

function formatMetric(value, unit = '', decimals = 0) {
    const lang = currentLang || 'en';
    if (value === null || value === undefined) return translations[lang].perfStatusNA || 'N/A';
    try { return `${parseFloat(value).toFixed(decimals)}${unit}`; } catch (e) { return translations[lang].perfStatusNA || 'N/A'; }
}
function setCWVStatus(elementId, value, thresholds) {
    const statusEl = document.getElementById(elementId); if (!statusEl) return;
    let status = 'na'; let statusTextKey = 'perfStatusNA'; const lang = currentLang || 'en';
    if (value !== null && value !== undefined && typeof value === 'number' && !isNaN(value)) {
        if (value <= thresholds[0]) { status = 'ok'; statusTextKey = 'perfStatusGood'; }
        else if (value <= thresholds[1]) { status = 'warning'; statusTextKey = 'perfStatusNeedsImprovement'; }
        else { status = 'error'; statusTextKey = 'perfStatusPoor'; }
    }
    const statusText = translations[lang][statusTextKey] || translations['en'][statusTextKey] || status;
    statusEl.className = `status-indicator ${status}`; statusEl.textContent = statusText;
    statusEl.title = `Value: ${formatMetric(value, '', (status === 'ok' || status === 'warning' || status === 'error') ? 3 : 0)} (${statusText})`;
}
function updateCoreWebVitalsDisplay(cwvData) {
    const lcpEl = document.getElementById('cwv-lcp-value'); const fidEl = document.getElementById('cwv-fid-value'); const clsEl = document.getElementById('cwv-cls-value'); const perfNoteEl = document.getElementById('cwv-note');
    if (lcpEl) lcpEl.textContent = formatMetric(cwvData?.lcp, ' ms'); if (fidEl) fidEl.textContent = formatMetric(cwvData?.fid, ' ms'); if (clsEl) clsEl.textContent = formatMetric(cwvData?.cls, '', 3);
    setCWVStatus('cwv-lcp-status', cwvData?.lcp, [2500, 4000]); setCWVStatus('cwv-fid-status', cwvData?.fid, [100, 300]); setCWVStatus('cwv-cls-status', cwvData?.cls, [0.1, 0.25]);
    if (perfNoteEl) { perfNoteEl.textContent = translations[currentLang].perfNote || translations['en'].perfNote; }
    const scoreValueEl = document.getElementById('perf-score-value'); const scoreStatusEl = document.getElementById('perf-score-status');
    if (scoreValueEl && scoreStatusEl) {
        const perfScore = calculatePerformanceScore(cwvData);
        if (perfScore !== null) { scoreValueEl.textContent = perfScore; setCWVStatus('perf-score-status', perfScore, [90, 49]); }
        else { scoreValueEl.textContent = '--'; const lang = currentLang || 'en'; const naText = translations[lang].perfStatusNA || 'N/A'; scoreStatusEl.className = 'status-indicator na'; scoreStatusEl.textContent = naText; scoreStatusEl.title = naText; }
    }
}

function calculatePerformanceScore(cwvData) {
    if (!cwvData || typeof cwvData.lcp !== 'number' || typeof cwvData.fid !== 'number' || typeof cwvData.cls !== 'number') { return null; }
    const { lcp, fid, cls } = cwvData;
    const LCP_GOOD = 2500; const LCP_POOR = 4000; const FID_GOOD = 100; const FID_POOR = 300; const CLS_GOOD = 0.1; const CLS_POOR = 0.25;
    let lcpScore = (lcp <= LCP_GOOD) ? 1.0 : (lcp >= LCP_POOR) ? 0.0 : (LCP_POOR - lcp) / (LCP_POOR - LCP_GOOD);
    let fidScore = (fid <= FID_GOOD) ? 1.0 : (fid >= FID_POOR) ? 0.0 : (FID_POOR - fid) / (FID_POOR - FID_GOOD);
    let clsScore = (cls <= CLS_GOOD) ? 1.0 : (cls >= CLS_POOR) ? 0.0 : (CLS_POOR - cls) / (CLS_POOR - CLS_GOOD);
    const overallScore = Math.round((lcpScore * 0.25 + fidScore * 0.30 + clsScore * 0.45) * 100);
    return Math.max(0, Math.min(100, overallScore));
}
async function handleFetchPsiData() {
    const psiLoadingEl = document.getElementById('psi-loading');
    const psiErrorEl = document.getElementById('psi-error');
    const psiResultsEl = document.getElementById('psi-results');
    const fetchPsiButton = document.getElementById('fetch-psi-button');

    if (fetchPsiButton) fetchPsiButton.disabled = true;
    if (psiLoadingEl) psiLoadingEl.style.display = 'block';
    if (psiErrorEl) { psiErrorEl.style.display = 'none'; psiErrorEl.textContent = ''; }
    if (psiResultsEl) psiResultsEl.style.display = 'none';

    const psiScoreValueEl = document.getElementById('psi-score-value');
    const psiScoreStatusEl = document.getElementById('psi-score-status');
    const psiOpportunitiesList = document.getElementById('psi-opportunities-list');
    const psiDiagnosticsList = document.getElementById('psi-diagnostics-list');
    if (psiScoreValueEl) psiScoreValueEl.textContent = '--';
    if (psiScoreStatusEl) { psiScoreStatusEl.className = 'status-indicator na'; psiScoreStatusEl.textContent = translations[currentLang]?.perfStatusNA || 'N/A'; }
    if (psiOpportunitiesList) psiOpportunitiesList.innerHTML = '';
    if (psiDiagnosticsList) psiDiagnosticsList.innerHTML = '';

    let userApiKey = null;
    try {
        const items = await chrome.storage.local.get({ psiApiKey: '' });
        userApiKey = items.psiApiKey;
    } catch (e) {
        console.error("Error retrieving API Key from storage:", e);
        showPsiError('Error retrieving API Key from storage. Check browser logs.');
        if (fetchPsiButton) fetchPsiButton.disabled = false;
        if (psiLoadingEl) psiLoadingEl.style.display = 'none';
        return;
    }

    if (!userApiKey) {
        showPsiError('API Key not configured. Please set it in the extension options.');

        if (fetchPsiButton) fetchPsiButton.disabled = false;
        if (psiLoadingEl) psiLoadingEl.style.display = 'none';
        return;
    }

    const targetUrl = cachedData?.url;
    if (!targetUrl) {
        showPsiError('Error: Could not get current page URL.');
        if (fetchPsiButton) fetchPsiButton.disabled = false;
        if (psiLoadingEl) psiLoadingEl.style.display = 'none';
        return;
    }

    const apiEndpoint = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';
    const params = new URLSearchParams({ url: targetUrl, key: userApiKey }); // Use the retrieved key
    const apiUrl = `${apiEndpoint}?${params.toString()}`;

    try {
        const response = await fetch(apiUrl);
        if (!response.ok) {
            let errorJson;
            try { errorJson = await response.json(); } catch (e) { /* ignore if response is not json */ }
            const errorMsg = errorJson?.error?.message || `HTTP error! Status: ${response.status}`;
            // Check for common API key related errors
            if (response.status === 400 && errorMsg.includes('API key not valid')) {
                throw new Error('The configured API Key is not valid. Please check it in the options.');
            } else if (response.status === 403 && errorMsg.includes('permission')) {
                throw new Error('The configured API Key does not have permission for the PageSpeed Insights API.');
            } else if (response.status === 429) {
                throw new Error('API quota exceeded or rate limit hit. Please check your Google Cloud Console.');
            }
            throw new Error(errorMsg);
        }
        const data = await response.json();

        if (psiResultsEl) psiResultsEl.style.display = 'block';
        processAndDisplayPsiResults(data);

        if (activeTabId && data) {
            chrome.runtime.sendMessage({
                action: 'savePsiDataForTab',
                tabId: activeTabId,
                psiData: data
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error sending PSI data to background:", chrome.runtime.lastError.message);
                } else {
                    console.log("PSI data sent to background for storage.");
                }
            });
        }

    } catch (error) {
        showPsiError(`Error fetching PSI data: ${error.message}`);
        console.error(`PSI Fetch Error Details:`, error);
    } finally {
        if (psiLoadingEl) psiLoadingEl.style.display = 'none';
        if (fetchPsiButton) fetchPsiButton.disabled = false;
    }
}

function showPsiError(message) {
    const psiErrorEl = document.getElementById('psi-error'); if (psiErrorEl) { psiErrorEl.textContent = message; psiErrorEl.style.display = 'block'; }
    const psiResultsEl = document.getElementById('psi-results'); if (psiResultsEl) psiResultsEl.style.display = 'none';
}
function convertMarkdownLinks(text) {
    if (!text) return '';
    const markdownLinkRegex = /\[([^\]]+)]\(([^)\s]+)\)/g;
    return text.replace(markdownLinkRegex, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

function processAndDisplayPsiResults(data) {
    const lighthouseResult = data?.lighthouseResult;
    const categories = lighthouseResult?.categories;
    const audits = lighthouseResult?.audits;
    const lang = currentLang || 'en';

    if (!lighthouseResult) {
        showPsiError('Error: Lighthouse results not found in API response.');
        return;
    }

    const performanceCategory = categories?.performance;
    const psiScoreValueEl = document.getElementById('psi-score-value');
    const psiScoreStatusEl = document.getElementById('psi-score-status');

    if (performanceCategory && psiScoreValueEl && psiScoreStatusEl) {
        const score = Math.round(performanceCategory.score * 100);
        psiScoreValueEl.textContent = score;
        setCWVStatus('psi-score-status', score, [90, 49]);
    } else {
        if (psiScoreValueEl) psiScoreValueEl.textContent = '--';
        if (psiScoreStatusEl) {
            psiScoreStatusEl.className = 'status-indicator na';
            psiScoreStatusEl.textContent = translations[lang]?.perfStatusNA || 'N/A';
            psiScoreStatusEl.title = translations[lang]?.perfStatusNA || 'N/A';
        }
    }

    const metricsToProcess = {
        'first-contentful-paint': { elementId: 'psi-fcp', thresholds: [1800, 3000], unitMultiplier: 1000 }, // FCP: Good < 1.8s, Poor > 3s
        'largest-contentful-paint': { elementId: 'psi-lcp', thresholds: [2500, 4000], unitMultiplier: 1000 }, // LCP: Good < 2.5s, Poor > 4s
        'total-blocking-time': { elementId: 'psi-tbt', thresholds: [200, 600], unitMultiplier: 1 },     // TBT: Good < 200ms, Poor > 600ms
        'cumulative-layout-shift': { elementId: 'psi-cls', thresholds: [0.1, 0.25], unitMultiplier: 1 },     // CLS: Good < 0.1, Poor > 0.25
        'speed-index': { elementId: 'psi-si', thresholds: [3400, 5800], unitMultiplier: 1000 }  // SI: Good < 3.4s, Poor > 5.8s
    };

    for (const auditId in metricsToProcess) {
        const config = metricsToProcess[auditId];
        const valueElement = document.getElementById(`${config.elementId}-value`);
        const statusElementId = `${config.elementId}-status`;
        const audit = audits[auditId];

        if (valueElement && audit) {
            let numericValueForStatus = null;

            if (audit.displayValue) {
                valueElement.textContent = audit.displayValue;
            } else if (audit.numericValue !== undefined) {

                let unit = '';
                if (audit.numericUnit === 'millisecond') unit = ' ms';
                else if (audit.numericUnit === 'second') unit = ' s';
                else if (auditId === 'cumulative-layout-shift') unit = '';

                const decimals = auditId === 'cumulative-layout-shift' ? 3 : (unit === ' s' ? 1 : 0);
                valueElement.textContent = formatMetric(audit.numericValue, unit, decimals);
            } else {
                valueElement.textContent = '--';
            }


            if (audit.numericValue !== undefined) {
                numericValueForStatus = audit.numericValue;

                if (audit.numericUnit === 'second' && config.unitMultiplier && config.unitMultiplier > 1) {
                    numericValueForStatus = audit.numericValue * config.unitMultiplier;
                }
            }

            setCWVStatus(statusElementId, numericValueForStatus, config.thresholds);

        } else if (valueElement) {
            valueElement.textContent = 'N/A';
            setCWVStatus(statusElementId, null, config.thresholds);
        }
    }


    // --- 3. Display Opportunities (NOW WITH LINK RENDERING) ---
    const opportunitiesListEl = document.getElementById('psi-opportunities-list');
    if (opportunitiesListEl) {
        opportunitiesListEl.innerHTML = ''; // Clear previous
        const opportunityAudits = Object.values(audits || {})
            .filter(audit => audit.details && (audit.details.type === 'opportunity' || (audit.details.wastedMs && audit.details.wastedMs > 10) || (audit.details.wastedBytes && audit.details.wastedBytes > 1024)) && audit.score !== null && audit.score < 0.9)
            .sort((a, b) => (b.details?.wastedMs || 0) - (a.details?.wastedMs || 0)); // Sort by potential time saving

        if (opportunityAudits.length > 0) {
            opportunityAudits.slice(0, 5).forEach(audit => { // Show top 5
                const li = document.createElement('li');
                let savingsText = '';
                // Prioritize ms savings text if available and significant, wrap in span
                if (audit.details.wastedMs && audit.details.wastedMs >= 10) {
                    savingsText = ` <span class="psi-savings">(~${Math.round(audit.details.wastedMs)} ms potential savings)</span>`;
                } else if (audit.details.wastedBytes && audit.details.wastedBytes >= 1024) {
                    savingsText = ` <span class="psi-savings">(~${Math.round(audit.details.wastedBytes / 1024)} KiB potential savings)</span>`;
                }

                // Use description which is usually more user-friendly markdown
                const description = audit.description || audit.title || audit.id; // Fallback if description is missing

                // *** UPDATED: Convert markdown links in description to HTML ***
                li.innerHTML = convertMarkdownLinks(description) + savingsText;

                opportunitiesListEl.appendChild(li);
            });
        } else {
            // Display message if no opportunities found
            opportunitiesListEl.innerHTML = `<li>${translations[lang]?.psiNoOpportunities || 'No significant opportunities identified.'}</li>`;
        }
    }

    // --- 4. Display Diagnostics (Example: Top 5 relevant numeric diagnostics) ---
    const diagnosticsListEl = document.getElementById('psi-diagnostics-list');
    if (diagnosticsListEl) {
        diagnosticsListEl.innerHTML = ''; // Clear previous
        // Filter audits that represent diagnostics and have a numeric value, exclude metrics already shown
        const diagnosticAudits = Object.values(audits || {})
            .filter(audit => audit.details && audit.details.type === 'diagnostic' && !metricsToProcess[audit.id] && audit.score !== null && audit.score < 1) // Show non-passing diagnostics not already listed as metrics
            .sort((a, b) => (a.score === null ? 1 : b.score === null ? -1 : a.score - b.score)); // Show failing diagnostics first

        if (diagnosticAudits.length > 0) {
            diagnosticAudits.slice(0, 5).forEach(audit => { // Show top 5 relevant
                const li = document.createElement('li');
                // Display title and display value if available, otherwise formatted numeric value
                let valueText = audit.displayValue || '--';
                if (valueText === '--' && audit.numericValue !== undefined) {
                    // Format numeric value if display value was missing
                    let unit = '';
                    if (audit.numericUnit === 'millisecond') unit = ' ms';
                    if (audit.numericUnit === 'byte') unit = ' KiB'; // Convert bytes to KiB for readability
                    const numericValue = audit.numericUnit === 'byte' ? audit.numericValue / 1024 : audit.numericValue;
                    const decimals = audit.numericUnit === 'byte' ? 1 : 0;
                    valueText = formatMetric(numericValue, unit, decimals);
                }

                // *** UPDATED: Convert potential markdown links in title/description too ***
                // Note: Titles usually don't have markdown, but descriptions might
                const titleText = audit.title || audit.id;
                li.innerHTML = `${convertMarkdownLinks(titleText)}: <strong>${valueText}</strong>`;
                li.title = audit.description || ''; // Add raw description as tooltip (links won't render here)

                diagnosticsListEl.appendChild(li);
            });
        } else {
            // Display message if no diagnostics to show
            diagnosticsListEl.innerHTML = `<li>${translations[lang]?.psiNoDiagnostics || 'No specific diagnostics to show.'}</li>`;
        }
    }
}

function sendHighlightMessage(payload) { chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { const activeTab = tabs[0]; if (activeTab && activeTab.id) { chrome.tabs.sendMessage(activeTab.id, { action: 'highlightSingle', payload: payload }, (response) => { if (chrome.runtime.lastError) { console.error("Error sending highlight message:", chrome.runtime.lastError.message); /* Error sending highlight message */ } else { console.log("Highlight message sent, response:", response); } }); } }); }
function sendClearHighlightsMessage() { chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => { const activeTab = tabs[0]; if (activeTab && activeTab.id) { chrome.tabs.sendMessage(activeTab.id, { action: 'clearHighlights' }, (response) => { if (chrome.runtime.lastError) { console.error("Error sending clear highlights message:", chrome.runtime.lastError.message); /* Error sending clear highlights message */ } else { console.log("Clear highlights message sent, response:", response); } }); } }); }

let cachedData = null; let activeTabId = null; window.lastResponseData = null;
let crawlStatusIntervalId = null; const POLLING_INTERVAL_MS = 2000;

function startLinkCrawling() {
    const crawlButton = document.getElementById('crawl-links-btn'); const exportButton = document.getElementById('export-links-btn');
    if (!cachedData || !cachedData.links || cachedData.links.length === 0) { alert(translations[currentLang].crawlAlertNoLinks || "No links to crawl."); return; }
    const linksToCrawl = cachedData.links.filter(link => link.href && (link.href.startsWith('http:') || link.href.startsWith('https://'))).map(link => ({ href: link.href }));
    if (linksToCrawl.length === 0) { alert(translations[currentLang].crawlAlertNoLinks || "No HTTP(S) links found to crawl."); return; }
    if (crawlButton) { crawlButton.disabled = true; crawlButton.textContent = translations[currentLang].crawlButtonRunning || "Crawling..."; const icon = crawlButton.querySelector('.lucide-icon'); if (!icon) { crawlButton.innerHTML = `<span class="lucide-icon" aria-hidden="true">loader-2</span> ${crawlButton.textContent}`; } else { icon.textContent = 'loader-2'; } }
    if (exportButton) exportButton.disabled = true;
    document.querySelectorAll('#tab-links .link-status-code').forEach(el => { el.textContent = t('crawlStatusLoading'); });
    document.querySelectorAll('#tab-links tbody tr').forEach(row => { row.classList.remove('status-2xx', 'status-3xx', 'status-4xx', 'status-5xx', 'status-error', 'status-other'); });
    chrome.runtime.sendMessage({ action: 'startCrawlingForTab', tabId: activeTabId, links: linksToCrawl }, (response) => {
        if (chrome.runtime.lastError) { const errorMsg = t('crawlStartError', {err: chrome.runtime.lastError.message}); alert(errorMsg); if (crawlButton) { crawlButton.disabled = false; crawlButton.textContent = t('crawlButtonStart'); const icon = crawlButton.querySelector('.lucide-icon'); if (icon) icon.textContent = 'zap'; else crawlButton.innerHTML = `<span class="lucide-icon" aria-hidden="true">zap</span> ${crawlButton.textContent}`; } if (exportButton) exportButton.disabled = false; return; }
        if (response && response.status === 'started') { handleBackgroundCrawlState({ isRunning: true, results: {} }); }
        else if (response && response.status === 'already_running') { handleBackgroundCrawlState({ isRunning: true, results: {} }); }
        else { const errorMsg = t('crawlStartError', {err: "Unexpected response"}); alert(errorMsg); if (crawlButton) { crawlButton.disabled = false; crawlButton.textContent = t('crawlButtonStart'); const icon = crawlButton.querySelector('.lucide-icon'); if (icon) icon.textContent = 'zap'; else crawlButton.innerHTML = `<span class="lucide-icon" aria-hidden="true">zap</span> ${crawlButton.textContent}`; } if (exportButton) exportButton.disabled = false; }
    });
}
function handleBackgroundCrawlState(state, isPollingUpdate = false) {
    const crawlButton = document.getElementById('crawl-links-btn'); const exportButton = document.getElementById('export-links-btn');
    if (!state) { if (crawlStatusIntervalId) { clearInterval(crawlStatusIntervalId); crawlStatusIntervalId = null; } if (crawlButton) { if (crawlButton.disabled) { crawlButton.disabled = false; crawlButton.textContent = t('crawlButtonStart'); const icon = crawlButton.querySelector('.lucide-icon'); if (icon) icon.textContent = 'zap'; else crawlButton.innerHTML = `<span class="lucide-icon" aria-hidden="true">zap</span> ${crawlButton.textContent}`; } } if (exportButton) exportButton.disabled = false; return; }
    if (state.results) {
        let linksProcessedInBackground = 0; let linksNotFoundInUI = 0; let rowsUpdatedCount = 0;
        for (const url in state.results) {
            if (state.results.hasOwnProperty(url)) {
                const result = state.results[url]; linksProcessedInBackground++;
                const rows = document.querySelectorAll(`#tab-links tbody tr[data-link-url="${CSS.escape(url)}"]`); if (!rows || rows.length === 0) { linksNotFoundInUI++; }
                else { rows.forEach(row => { const statusCell = row.querySelector('.link-status-code'); if (statusCell) { let displayStatus = '--'; let statusClass = 'status-other'; let statusTitle = ''; const status = result.status; const error = result.error; if (error) { displayStatus = error.substring(0, 10); statusClass = 'status-error'; statusTitle = `Error: ${error}`; } else if (status === 0) { displayStatus = "3xx"; statusClass = 'status-3xx'; statusTitle = "Redirect (Specific code unknown)"; } else if (typeof status === 'number' && status > 0) { displayStatus = status; statusTitle = getStatusExplanation(status); if (status >= 200 && status < 300) statusClass = 'status-2xx'; else if (status >= 400 && status < 500) statusClass = 'status-4xx'; else if (status >= 500 && status < 600) statusClass = 'status-5xx'; } else if (status === null) { displayStatus = translations[currentLang].crawlStatusError || "Error"; statusClass = 'status-error'; statusTitle = getStatusExplanation(null); } else if (typeof status === 'number' && status < 0) { displayStatus = `Err (${status})`; statusClass = 'status-error'; statusTitle = getStatusExplanation(status) || `Internal status code: ${status}`; } else if (status) { displayStatus = String(status).substring(0, 10); statusClass = 'status-error'; statusTitle = `Unexpected status: ${status}`; } statusCell.textContent = displayStatus; statusCell.title = statusTitle; row.classList.remove('status-2xx', 'status-3xx', 'status-4xx', 'status-5xx', 'status-error', 'status-other'); row.classList.add(statusClass); rowsUpdatedCount++; } }); }
            }
        }
    }
    let count2xx = 0; let count3xx = 0; let count4xx = 0; let count5xx = 0; let countError = 0; let linksChecked = 0;
    if (state.results) { for (const url in state.results) { if (state.results.hasOwnProperty(url)) { linksChecked++; const result = state.results[url]; const status = result.status; const error = result.error; if (error || status === null || (typeof status === 'number' && status < 0)) { countError++; } else if (status === 0) { count3xx++; } else if (status >= 200 && status < 300) { count2xx++; } else if (status >= 400 && status < 500) { count4xx++; } else if (status >= 500 && status < 600) { count5xx++; } } } }
    const el2xx = document.getElementById('links-2xx-count'); const el3xx = document.getElementById('links-3xx-count'); const el4xx = document.getElementById('links-4xx-count'); const el5xx = document.getElementById('links-5xx-count'); const elError = document.getElementById('links-error-count');
    if (el2xx) el2xx.textContent = count2xx; if (el3xx) el3xx.textContent = count3xx; if (el4xx) el4xx.textContent = count4xx; if (el5xx) el5xx.textContent = count5xx; if (elError) elError.textContent = countError;
    const totalLinks = state.links?.length || 0; const currentIndex = state.currentIndex || 0; const isRunning = state.isRunning || false; const isFinished = !isRunning && currentIndex >= totalLinks && totalLinks > 0;
    if (isRunning) { if (crawlButton) { if (!crawlButton.disabled) { crawlButton.disabled = true; crawlButton.textContent = translations[currentLang].crawlButtonRunning || "Crawling..."; const icon = crawlButton.querySelector('.lucide-icon'); if (icon) icon.textContent = 'loader-2'; else crawlButton.innerHTML = `<span class="lucide-icon" aria-hidden="true">loader-2</span> ${crawlButton.textContent}`; } } if (exportButton && !exportButton.disabled) exportButton.disabled = true; if (!crawlStatusIntervalId && activeTabId) { crawlStatusIntervalId = setInterval(() => { if (!activeTabId) { clearInterval(crawlStatusIntervalId); crawlStatusIntervalId = null; return; } chrome.runtime.sendMessage({ action: 'getCrawlStatusForTab', tabId: activeTabId }, (latestState) => { if (chrome.runtime.lastError) { /* Error polling status */ } else { handleBackgroundCrawlState(latestState, true); } }); }, POLLING_INTERVAL_MS); } }
    else { if (crawlStatusIntervalId) { clearInterval(crawlStatusIntervalId); crawlStatusIntervalId = null; } if (crawlButton && crawlButton.disabled) { crawlButton.disabled = false; crawlButton.textContent = translations[currentLang].crawlButtonStart || "Crawl Links"; const icon = crawlButton.querySelector('.lucide-icon'); if (icon) icon.textContent = 'zap'; else crawlButton.innerHTML = `<span class="lucide-icon" aria-hidden="true">zap</span> ${crawlButton.textContent}`; } if (exportButton && exportButton.disabled) exportButton.disabled = false; }
}
function exportLinksToTxt() {
    if (!cachedData || !cachedData.links || cachedData.links.length === 0) { alert(translations[currentLang].crawlAlertNoLinks || 'No link data available to export.'); return; }
    const lines = []; lines.push("Type\tLink Text\tURL\tNofollow\tStatus"); lines.push("----\t---------\t---\t--------\t------");
    const addLinkLines = (linkArray, typeName) => { linkArray.forEach(link => { const text = link.text ? link.text.replace(/\s+/g, ' ').trim() : (translations[currentLang].linksNoText || '(No Text/Image)'); const url = link.href || 'N/A'; const nofollow = link.nofollow ? 'Yes' : 'No'; let status = 'N/A'; try { const rows = document.querySelectorAll(`#tab-links tbody tr[data-link-url="${CSS.escape(url)}"]`); if (rows.length > 0) { const statusCell = rows[0].querySelector('.link-status-code'); if (statusCell && statusCell.textContent !== (translations[currentLang].crawlStatusLoading || '...') && statusCell.textContent !== '--') { status = statusCell.textContent; } } } catch (e) { /* Ignore CSS escape issue */ } lines.push(`${typeName}\t${text}\t${url}\t${nofollow}\t${status}`); }); };
    const internalLinks = cachedData.links.filter(l => l.type === 'internal'); const externalLinks = cachedData.links.filter(l => l.type === 'external'); const otherLinks = cachedData.links.filter(l => l.type !== 'internal' && l.type !== 'external'); addLinkLines(internalLinks, "Internal"); addLinkLines(externalLinks, "External"); addLinkLines(otherLinks, "Other");
    const fileContent = lines.join('\n'); try { const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' }); const downloadUrl = URL.createObjectURL(blob); const linkElement = document.createElement('a'); linkElement.href = downloadUrl; let filename = 'seo_links_export.txt'; try { if (cachedData && cachedData.url) { const hostname = new URL(cachedData.url).hostname; if (hostname) { filename = `${hostname.replace(/[^a-z0-9]/gi, '_')}_links.txt`; } } } catch (e) { } linkElement.download = filename; document.body.appendChild(linkElement); linkElement.click(); document.body.removeChild(linkElement); URL.revokeObjectURL(downloadUrl); } catch (e) { alert("Failed to export links."); }
}

const tabButtons = document.querySelectorAll('.tab-button'); const tabContents = document.querySelectorAll('.tab-content');
tabButtons.forEach(button => { button.addEventListener('click', () => { const targetTabId = `tab-${button.dataset.tab}`; tabButtons.forEach(btn => btn.classList.remove('active')); button.classList.add('active'); tabContents.forEach(content => content.classList.remove('active')); const targetContent = document.getElementById(targetTabId); if (targetContent) { targetContent.classList.add('active'); } }); });

document.addEventListener('DOMContentLoaded', async () => {
    // Load translations from JSON file first
    await loadTranslations();
    
    const loading = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    const langBtn = document.getElementById('lang-switch-btn');
    const clearAllBtn = document.getElementById('clear-all-highlights-btn');
    const tabContentArea = document.getElementById('tab-content-area');
    const mainViewWrapper = document.getElementById('main-view-wrapper');
    const responseLoadingPlaceholder = document.getElementById('response-loading-placeholder');
    const responseContent = document.getElementById('response-content');
    const responseError = document.getElementById('response-error-placeholder');
    const exportButton = document.getElementById('export-links-btn');
    const crawlButton = document.getElementById('crawl-links-btn');
    const fetchPsiButton = document.getElementById('fetch-psi-button');
    // --- ADDED: Get reference to About Me link ---
    const aboutMeLink = document.getElementById('about-me-link');

    // Initial UI setup
    updateUI();
    updateCoreWebVitalsDisplay(currentCWV);
    if (mainViewWrapper) mainViewWrapper.style.display = 'none';
    if (loading) loading.style.display = 'block';
    if (errorDiv) errorDiv.hidden = true;
    if (responseLoadingPlaceholder) responseLoadingPlaceholder.hidden = false;
    if (responseContent) responseContent.hidden = true;
    if (responseError) responseError.hidden = true;

    // Language switch handler
    if (langBtn) {
        langBtn.addEventListener('click', () => {
            currentLang = (currentLang === 'en') ? 'ar' : 'en';
            localStorage.setItem('popupLang', currentLang);
            updateUI(); // Update all text elements
            // Re-populate tabs if data exists to reflect language change
            if (cachedData) {
                try {
                    const score = calculateSeoScore(cachedData);
                    updateSeoScoreDisplay(score);
                    populateMetaContentTab(cachedData);
                    populateHierarchyTab(cachedData);
                    populateSchemaTab(cachedData);
                    populateSocialTab(cachedData);
                    populateLinksTab(cachedData); // Will also re-apply language to table headers via updateTableHeaders
                    populateImagesTab(cachedData); // Will also re-apply language via updateTableHeaders
                    populateTechnologyTab(cachedData);
                    populateToolsTab(cachedData);
                    // Re-check crawl status and update button text if needed
                    if (activeTabId) {
                        chrome.runtime.sendMessage({ action: 'getCrawlStatusForTab', tabId: activeTabId }, (state) => {
                            if (!chrome.runtime.lastError) { handleBackgroundCrawlState(state); }
                        });
                    }
                    // Re-populate PSI if stored data exists (or keep button text updated)
                    // Note: You might need to re-fetch or re-display stored PSI data here
                    // if its display text depends on the language. For simplicity,
                    // this example relies on updateUI() handling most translatable parts.
                    updateCoreWebVitalsDisplay(currentCWV); // Re-apply CWV text

                } catch (e) {
                    displayError(t('errorPopulating', { err: e.message }));
                }
            }
            // Re-populate response tab if data exists
            if (window.lastResponseData) {
                populateResponseTab(window.lastResponseData);
            }
        });
    }

    // Other button handlers
    if (clearAllBtn) { clearAllBtn.addEventListener('click', () => { sendClearHighlightsMessage(); }); }

    // --- MODIFIED: Click handler for highlighting WITH DEBUG LOGS ---
    if (tabContentArea) {
        tabContentArea.addEventListener('click', (event) => {
            console.log('[DEBUG] Click detected inside tabContentArea.');
            console.log('[DEBUG] Event Target:', event.target);

            const clickableElement = event.target.closest('.clickable-item');
            console.log('[DEBUG] Found closest .clickable-item:', clickableElement);

            if (clickableElement && clickableElement.dataset) {
                const tagName = clickableElement.dataset.tagName;
                const elementIndex = clickableElement.dataset.elementIndex;
                console.log(`[DEBUG] Extracted tagName: ${tagName}, elementIndex: ${elementIndex}`);

                if (tagName !== undefined && elementIndex !== undefined) {
                    const index = parseInt(elementIndex, 10);
                    if (!isNaN(index)) {
                        const payload = { tagName: tagName, index: index };
                        console.log('[DEBUG] Sending highlight message with payload:', payload);
                        sendHighlightMessage(payload);
                    } else {
                        console.warn('[DEBUG] Failed to parse elementIndex:', elementIndex);
                    }
                } else {
                    console.warn('[DEBUG] Missing tagName or elementIndex in dataset:', clickableElement.dataset);
                }
            } else {
                console.log('[DEBUG] Click was not on or inside a .clickable-item with dataset.');
            }
        });
    }
    // --- END MODIFIED ---

    if (exportButton) { exportButton.addEventListener('click', () => { exportLinksToTxt(); }); }
    if (crawlButton) { crawlButton.addEventListener('click', () => { startLinkCrawling(); }); }
    if (fetchPsiButton) { fetchPsiButton.addEventListener('click', handleFetchPsiData); }

    // --- ADDED: About Me Link Handler ---
    if (aboutMeLink) {
        aboutMeLink.addEventListener('click', (event) => {
            event.preventDefault(); // Prevent the default '#' link behavior
            try { // Add error handling for the API call
                chrome.tabs.create({ url: chrome.runtime.getURL("about.html") }, (newTab) => {
                    if (chrome.runtime.lastError) {
                        console.error("Error opening about page:", chrome.runtime.lastError.message);
                        // Optionally display an error to the user or log it
                    } else {
                        console.log("Opened about page in new tab:", newTab.id);
                    }
                });
            } catch (e) {
                console.error("Exception trying to open about page:", e);
            }
        });
    }
    // --- END About Me Link Handler ---

    // Unload handler
    window.addEventListener('unload', () => { /* ... existing unload handler ... */ });

    // Get active tab info and initiate data loading
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        // Handle cases where the extension can't run
        if (!activeTab || !activeTab.id || !activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:') || activeTab.url.startsWith('file://')) {
            const errorMsg = translations[currentLang]?.errorCannotAnalyze || 'Cannot analyze this page...';
            displayError(errorMsg);
            populateResponseTab({ chain: [], completed: false, error: errorMsg, finalStatus: -7 });
            document.querySelectorAll('#tab-tools .tool-link').forEach(link => { link.classList.add('disabled'); link.href = '#'; });
            if (loading) loading.style.display = 'none'; // Hide loading if error
            return;
        }

        activeTabId = activeTab.id; // Store active tab ID globally in the popup scope

        // Initial state for response tab
        if (responseLoadingPlaceholder) responseLoadingPlaceholder.hidden = false;
        if (responseContent) responseContent.hidden = true;
        if (responseError) responseError.hidden = true;

        // Fetch redirect chain from background
        try {
            chrome.runtime.sendMessage({ action: 'getRedirectChain', tabId: activeTabId }, (response) => {
                // Error handling for redirect chain fetch
                if (chrome.runtime.lastError) {
                    populateResponseTab({ chain: [], completed: false, error: t('errorBackgroundComm', {err: chrome.runtime.lastError.message}), finalStatus: -7 }); return;
                } if (typeof response === 'undefined') {
                    populateResponseTab({ chain: [], completed: false, error: t('errorNoResponse', {source: 'background (redirects)'}), finalStatus: -7 }); return;
                }
                populateResponseTab(response);
            });
        } catch (error) {
            populateResponseTab({ chain: [], completed: false, error: t('errorFetchSend', {dest: 'background (redirects)', err: error.message}), finalStatus: -7 });
        }

        // Fetch initial crawl status from background
        try {
            chrome.runtime.sendMessage({ action: 'getCrawlStatusForTab', tabId: activeTabId }, (state) => {
                if (!chrome.runtime.lastError && typeof state !== 'undefined') {
                    handleBackgroundCrawlState(state, false); // Update link crawl UI
                }
            });
        } catch (error) { /* Initial Status Send Error */ }

        // *** MODIFICATION START: Request stored PSI data ***
        if (activeTabId) {
            chrome.runtime.sendMessage({ action: 'getPsiDataForTab', tabId: activeTabId }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error requesting stored PSI data:", chrome.runtime.lastError.message);
                    // Ensure PSI fetch button is enabled if retrieval fails
                    if (fetchPsiButton) fetchPsiButton.disabled = false;
                    // Ensure results area is managed correctly on error
                    const psiResultsEl = document.getElementById('psi-results');
                    if (psiResultsEl) psiResultsEl.style.display = 'none';
                } else if (response && response.psiData) {
                    console.log("Found stored PSI data, displaying it.", response.psiData);
                    const psiResultsEl = document.getElementById('psi-results');
                    const psiLoadingEl = document.getElementById('psi-loading');
                    const psiErrorEl = document.getElementById('psi-error');

                    if (psiLoadingEl) psiLoadingEl.style.display = 'none';
                    if (psiErrorEl) psiErrorEl.style.display = 'none';
                    if (psiResultsEl) psiResultsEl.style.display = 'block';
                    if (fetchPsiButton) fetchPsiButton.disabled = false; // Keep button enabled for manual refresh

                    processAndDisplayPsiResults(response.psiData); // Display the stored data
                } else {
                    console.log("No stored PSI data found for this tab.");
                    // Ensure fetch button is ready and results area is hidden
                    const psiResultsEl = document.getElementById('psi-results');
                    if (psiResultsEl) psiResultsEl.style.display = 'none';
                    if (fetchPsiButton) fetchPsiButton.disabled = false;
                }
            });
        }
        // *** MODIFICATION END ***

        // Inject content script to get page data
        chrome.scripting.executeScript({ target: { tabId: activeTabId }, files: ['content.js'] }, (injectionResults) => {
            if (chrome.runtime.lastError || !injectionResults || injectionResults.length === 0) {
                // Handle injection failure
                let specificError = chrome.runtime.lastError?.message || 'Unknown injection error.';
                if (specificError.includes("Cannot access") || specificError.includes("Cannot script")) {
                    specificError = translations[currentLang]?.errorCannotAnalyze || "Cannot analyze page.";
                } else {
                    specificError = translations[currentLang]?.errorScriptInjection || 'Failed to inject script.';
                }
                if (errorDiv && errorDiv.hidden) { displayError(specificError); }
                if (responseError && responseError.hidden) { populateResponseTab({ chain: [], completed: false, error: specificError, finalStatus: -7 }); }
                document.querySelectorAll('#tab-tools .tool-link').forEach(link => { link.classList.add('disabled'); link.href = '#'; });
                if (loading) loading.style.display = 'none';
                return;
            }
            // Injection successful, waiting for message with seoData
        });
    });

    // Listener for messages from content script or background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        let needsResponse = false; // Flag if sendResponse will be called later
        if (message.seoData) {
            if (loading) loading.style.display = 'none';
            cachedData = message.seoData; // Store the main data
            try {
                if (mainViewWrapper) mainViewWrapper.style.display = 'block'; // Show main UI
                if (errorDiv) errorDiv.hidden = true; // Hide error message

                // Populate all UI elements with the received data
                const score = calculateSeoScore(cachedData);
                updateSeoScoreDisplay(score);
                populateMetaContentTab(cachedData);
                populateHierarchyTab(cachedData);
                populateSchemaTab(cachedData);
                populateLinksTab(cachedData);
                populateImagesTab(cachedData);
                populateSocialTab(cachedData);
                populateTechnologyTab(cachedData);
                populateToolsTab(cachedData);
                updateCoreWebVitalsDisplay(currentCWV); // Update CWV display initially

                // Re-check crawl status in case it changed while popup was closed
                if (activeTabId) {
                    try {
                        chrome.runtime.sendMessage({ action: 'getCrawlStatusForTab', tabId: activeTabId }, (state) => {
                            if (!chrome.runtime.lastError && typeof state !== 'undefined') {
                                handleBackgroundCrawlState(state, false);
                            }
                        });
                    } catch (error) { /* Re-fetch Status Send Error */ }
                }

                // Ensure correct tab is shown and UI language is correct
                const initialActiveButton = document.querySelector('.tab-button.active') || document.querySelector('.tab-button[data-tab="meta-content"]');
                if (initialActiveButton) {
                    const initialActiveTabId = `tab-${initialActiveButton.dataset.tab}`;
                    const initialActiveContent = document.getElementById(initialActiveTabId);
                    tabContents.forEach(content => content.classList.remove('active'));
                    tabButtons.forEach(btn => btn.classList.remove('active'));
                    if (initialActiveContent) initialActiveContent.classList.add('active');
                    initialActiveButton.classList.add('active');
                }
                updateUI(); // Ensure all text is in the correct language

            } catch (e) {
                const populatingError = t('errorPopulating', { err: e.message });
                displayError(populatingError);
                if (responseError && responseError.hidden) { populateResponseTab({ chain: [], completed: false, error: populatingError, finalStatus: -7 }); }
            }
        } else if (message.coreWebVitalsUpdate) {
            // Update CWV values as they come in from content script
            currentCWV.lcp = message.coreWebVitalsUpdate.lcp ?? currentCWV.lcp;
            currentCWV.fid = message.coreWebVitalsUpdate.fid ?? currentCWV.fid;
            currentCWV.cls = message.coreWebVitalsUpdate.cls ?? currentCWV.cls;
            updateCoreWebVitalsDisplay(currentCWV); // Refresh CWV display parts
        } else if (message.error) {
            // Handle errors sent from content script
            if (loading) loading.style.display = 'none';
            if (errorDiv && errorDiv.hidden) { displayError(message.error); }
            if (responseError && responseError.hidden) { populateResponseTab({ chain: [], completed: false, error: message.error, finalStatus: -7 }); }
            document.querySelectorAll('#tab-tools .tool-link').forEach(link => { link.classList.add('disabled'); link.href = '#'; });
        } else if (message.action === "contentScriptLoaded") {
            console.log("Popup received PING from content script.");
            // Respond to the ping to confirm receipt (optional)
            sendResponse({ status: "Popup received ping" });
            needsResponse = true; // Indicate sendResponse was called
        }

        // Return true only if sendResponse will be called asynchronously
        // In this setup, most responses are synchronous or handled by separate messages
        // so returning false is usually correct unless handling specific async responses here.
        return needsResponse;
    });
});