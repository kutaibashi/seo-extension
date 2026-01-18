// content.js

(function () {
    console.log('[SEO Analyzer - content.js] Script starting execution.');

    // *** ADDED: Core Web Vitals Variables ***
    let coreWebVitalsMetrics = {
        lcp: null,
        fid: null,
        cls: 0,
        clsEntries: 0 // Optional: Track number of shifts
    };
    let performanceObserver = null; // Keep a reference to potentially disconnect later

    // *** ADDED: Send an immediate ping message ***
    try {
        console.log('[SEO Analyzer - content.js] Sending immediate PING message...');
        chrome.runtime.sendMessage({ action: "contentScriptLoaded" }, (response) => {
            // Optional: Check response from popup later
            if (chrome.runtime.lastError) {
                console.error('[SEO Analyzer - content.js] PING send failed:', chrome.runtime.lastError.message);
            } else {
                console.log('[SEO Analyzer - content.js] PING response received:', response);
            }
        });
    } catch (e) {
        console.error('[SEO Analyzer - content.js] Error sending initial PING:', e);
    }
    // *** END PING ***

    // Helper function to get meta tag content by name or property
    function getMetaContent(selector) {
        const element = document.querySelector(selector);
        return element ? element.getAttribute('content')?.trim() : null;
    }
    // Helper function to get link rel attribute
    function getLinkHref(selector) {
        const element = document.querySelector(selector);
        return element ? element.getAttribute('href')?.trim() : null;
    }
    // Helper function to check for comments in the document source
    function checkCommentsForText(text) {
        const iterator = document.createNodeIterator(document.documentElement, NodeFilter.SHOW_COMMENT);
        let node;
        while (node = iterator.nextNode()) {
            if (node.nodeValue && node.nodeValue.toLowerCase().includes(text.toLowerCase())) {
                return true;
            }
        }
        return false;
    }

    // --- Data Collection Functions (Original functions remain the same) ---
    function getMetaDataAndHeadings() {
        console.log('[SEO Analyzer - content.js] Getting Meta/Headings...');
        const data = {
            title: document.title?.trim() || null, description: getMetaContent('meta[name="description"]'), url: window.location.href,
            canonical: getLinkHref('link[rel="canonical"]'), robots: getMetaContent('meta[name="robots"]'),
            headingCounts: { H1: 0, H2: 0, H3: 0, H4: 0, H5: 0, H6: 0 },
            // New: Viewport meta tag
            viewport: getMetaContent('meta[name="viewport"]'),
            // New: Favicon detection
            favicon: detectFavicon(),
            // New: Duplicate meta tags
            duplicates: detectDuplicateMetas()
        };
        document.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(h => { const tagName = h.tagName.toUpperCase(); if (data.headingCounts.hasOwnProperty(tagName)) data.headingCounts[tagName]++; });
        return data;
    }

    // New: Detect favicon
    function detectFavicon() {
        const faviconSelectors = [
            'link[rel="icon"]',
            'link[rel="shortcut icon"]',
            'link[rel="apple-touch-icon"]',
            'link[rel="apple-touch-icon-precomposed"]'
        ];
        const favicons = [];
        faviconSelectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(link => {
                const href = link.getAttribute('href');
                if (href) {
                    try {
                        const absoluteHref = new URL(href, window.location.href).href;
                        favicons.push({
                            href: absoluteHref,
                            rel: link.getAttribute('rel'),
                            sizes: link.getAttribute('sizes') || null,
                            type: link.getAttribute('type') || null
                        });
                    } catch (e) {
                        favicons.push({ href: href, rel: link.getAttribute('rel'), sizes: null, type: null });
                    }
                }
            });
        });
        // Check for default /favicon.ico
        if (favicons.length === 0) {
            favicons.push({ href: window.location.origin + '/favicon.ico', rel: 'default', sizes: null, type: null, isDefault: true });
        }
        return favicons;
    }

    // New: Detect duplicate meta tags
    function detectDuplicateMetas() {
        const duplicates = { title: 0, description: 0, canonical: 0, viewport: 0 };
        // Count title tags
        duplicates.title = document.querySelectorAll('title').length;
        // Count meta descriptions
        duplicates.description = document.querySelectorAll('meta[name="description"]').length;
        // Count canonical links
        duplicates.canonical = document.querySelectorAll('link[rel="canonical"]').length;
        // Count viewport metas
        duplicates.viewport = document.querySelectorAll('meta[name="viewport"]').length;
        return duplicates;
    }

    function getHeadingHierarchy() { console.log('[SEO Analyzer - content.js] Getting Hierarchy...'); const headingElements = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')); const hierarchy = []; const stack = []; let hasH1 = false; const headingData = headingElements.map((el, index) => ({ el, index })); headingData.forEach(({ el, index }) => { const level = parseInt(el.tagName.substring(1)); if (level === 1) hasH1 = true; const node = { level: level, text: el.textContent?.trim() || '', children: [], isOutOfOrder: false, tagName: el.tagName.toLowerCase(), elementIndex: index }; const parentLevel = stack.length > 0 ? stack[stack.length - 1].level : 0; if (level > parentLevel + 1) node.isOutOfOrder = true; while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop(); if (stack.length === 0) hierarchy.push(node); else stack[stack.length - 1].children.push(node); stack.push(node); }); return { tree: hierarchy, hasH1: hasH1 }; }
    function getSchemaMarkup() { console.log('[SEO Analyzer - content.js] Getting Schema...'); const schemaScripts = document.querySelectorAll('script[type="application/ld+json"]'); const schemas = []; const addSchemaObject = (obj) => { if (typeof obj === 'object' && obj !== null && Object.keys(obj).length > 0) schemas.push(obj); }; schemaScripts.forEach(script => { try { const jsonContent = JSON.parse(script.textContent); if (Array.isArray(jsonContent)) jsonContent.forEach(item => addSchemaObject(item)); else if (typeof jsonContent === 'object' && jsonContent !== null) { if (Array.isArray(jsonContent['@graph'])) { jsonContent['@graph'].forEach(item => addSchemaObject(item)); const topLevelKeys = Object.keys(jsonContent).filter(k => k !== '@context' && k !== '@graph'); if (topLevelKeys.length > 0 && jsonContent['@type']) addSchemaObject(jsonContent); } else addSchemaObject(jsonContent); } } catch (e) { console.warn('Could not parse JSON-LD schema:', e, script.textContent); schemas.push({ parseError: true, scriptContent: script.textContent }); } }); return schemas; }
    function getLinkAnalysis() { console.log('[SEO Analyzer - content.js] Getting Links...'); const links = []; const pageUrl = new URL(window.location.href); const linkElements = Array.from(document.querySelectorAll('a[href]')); linkElements.forEach((a, index) => { const href = a.getAttribute('href'); if (!href || href.trim() === '' || href.startsWith('javascript:')) return; let linkType = 'external'; let absoluteUrl = ''; try { absoluteUrl = new URL(href, pageUrl.origin).href; const linkUrl = new URL(absoluteUrl); if (linkUrl.protocol === 'mailto:' || linkUrl.protocol === 'tel:') linkType = 'other'; else if (href.startsWith('#')) linkType = 'anchor'; else if (linkUrl.hostname === pageUrl.hostname) linkType = 'internal'; } catch (e) { absoluteUrl = href; linkType = 'unknown'; } links.push({ text: a.textContent?.trim() || a.innerText?.trim() || '', href: absoluteUrl, type: linkType, nofollow: a.getAttribute('rel')?.toLowerCase().includes('nofollow') || false, tagName: 'a', elementIndex: index }); }); return links; }
    function getImageAnalysis() { console.log('[SEO Analyzer - content.js] Getting Images...'); const images = []; const imageElements = Array.from(document.querySelectorAll('img')); imageElements.forEach((img, index) => { let absoluteSrc = ''; try { absoluteSrc = new URL(img.getAttribute('src') || '', window.location.href).href; } catch (e) { console.warn("Could not parse image src:", img.getAttribute('src'), e); absoluteSrc = img.getAttribute('src') || 'invalid_src'; } images.push({ src: absoluteSrc, alt: img.getAttribute('alt')?.trim() || null, width: img.naturalWidth || img.width || null, height: img.naturalHeight || img.height || null, tagName: 'img', elementIndex: index }); }); return images; }
    function getSocialMediaMetadata() { console.log('[SEO Analyzer - content.js] Getting Social...'); const socialTags = { og: {}, twitter: {} }; document.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"]').forEach(meta => { const key = meta.getAttribute('property') || meta.getAttribute('name'); const value = meta.getAttribute('content')?.trim(); if (value) { if (key.startsWith('og:')) socialTags.og[key] = value; else if (key.startsWith('twitter:')) socialTags.twitter[key] = value; } }); return socialTags; }
    function getContentAnalysis() { 
        console.log('[SEO Analyzer - content.js] Getting Content Analysis...'); 
        let textContent = ''; 
        let wordCount = 0; 
        let letterCount = 0;
        let keywordDensity = [];
        const mainSelectors = ['main', 'article', '[role="main"]', '.main-content', '#main-content', '.post-content', '#content', '.entry-content']; 
        let mainElement = null; 
        for (const selector of mainSelectors) { mainElement = document.querySelector(selector); if (mainElement) break; } 
        if (!mainElement) mainElement = document.body; 
        if (mainElement) { 
            try { 
                const clone = mainElement.cloneNode(true); 
                clone.querySelectorAll('header, footer, nav, aside, script, style, noscript, iframe, svg, button, form, input, textarea, select, label, img, figure, .advertisement, .ads, .sidebar, .comments, .related-posts, .share-buttons, .breadcrumbs, .pagination, .widget, .footer-widget, .header-widget, [aria-hidden="true"], link, meta').forEach(el => el.remove()); 
                textContent = clone.textContent || ''; 
                textContent = textContent.replace(/\s+/g, ' ').trim(); 
                if (textContent) { 
                    letterCount = textContent.length; 
                    const words = textContent.split(/\s+/).filter(word => word.length > 0);
                    wordCount = words.length;
                    // Keyword density analysis
                    keywordDensity = analyzeKeywordDensity(words, wordCount);
                } 
            } catch (e) { 
                console.error("Error during content analysis cloning/cleanup:", e); 
                textContent = mainElement.textContent || ''; 
                textContent = textContent.replace(/\s+/g, ' ').trim(); 
                if (textContent) { 
                    letterCount = textContent.length; 
                    const words = textContent.split(/\s+/).filter(word => word.length > 0);
                    wordCount = words.length;
                    keywordDensity = analyzeKeywordDensity(words, wordCount);
                } 
            } 
        } 
        return { wordCount, letterCount, keywordDensity }; 
    }

    // New: Analyze keyword density
    function analyzeKeywordDensity(words, totalWords) {
        if (!words || words.length === 0) return [];
        
        // Common stop words to exclude
        const stopWords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
            'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
            'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must',
            'shall', 'can', 'need', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'you',
            'he', 'she', 'we', 'they', 'what', 'which', 'who', 'whom', 'where', 'when', 'why',
            'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such',
            'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just',
            'also', 'now', 'here', 'there', 'then', 'if', 'else', 'about', 'into', 'through',
            'during', 'before', 'after', 'above', 'below', 'up', 'down', 'out', 'off', 'over',
            'under', 'again', 'further', 'once', 'any', 'your', 'our', 'their', 'his', 'her',
            'my', 'me', 'him', 'us', 'them', 'am', 'being', 'having', 'doing', 'get', 'got',
            'one', 'two', 'first', 'new', 'like', 'even', 'way', 'well', 'back', 'much', 'go',
            'see', 'come', 'make', 'take', 'know', 'think', 'say', 'use', 'find', 'give', 'tell',
            'work', 'call', 'try', 'ask', 'seem', 'feel', 'look', 'want', 'put', 'mean', 'keep',
            'let', 'begin', 'seem', 'help', 'show', 'hear', 'play', 'run', 'move', 'live', 'believe'
        ]);

        const wordFreq = {};
        words.forEach(word => {
            // Normalize: lowercase, remove punctuation
            const normalized = word.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]/g, '');
            if (normalized.length >= 3 && !stopWords.has(normalized) && !/^\d+$/.test(normalized)) {
                wordFreq[normalized] = (wordFreq[normalized] || 0) + 1;
            }
        });

        // Convert to array and sort by frequency
        const sorted = Object.entries(wordFreq)
            .map(([word, count]) => ({
                word,
                count,
                density: ((count / totalWords) * 100).toFixed(2)
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 20); // Top 20 keywords

        return sorted;
    }

    function getHreflangTags() { console.log('[SEO Analyzer - content.js] Getting Hreflang...'); const hreflangTags = []; try { const linkElements = document.querySelectorAll('link[rel="alternate"][hreflang]'); linkElements.forEach(link => { const lang = link.getAttribute('hreflang'); const href = link.getAttribute('href'); if (lang && href) { let absoluteHref = href; try { absoluteHref = new URL(href, window.location.href).href; } catch (urlError) { console.warn(`Could not resolve hreflang URL: ${href}`, urlError); } hreflangTags.push({ lang: lang.trim(), href: absoluteHref }); } }); } catch (e) { console.error("Error getting hreflang tags:", e); } return hreflangTags; }
    function detectTechnologies() { console.log('[SEO Analyzer - content.js] Detecting Tech...'); const detected = { cms: new Set(), analyticsTagManagers: new Set(), webmasterTools: new Set(), jsFrameworks: new Set(), jsLibraries: new Set(), wpSeoPlugins: new Set(), wpPageBuilders: new Set() }; let isWordPress = false; try { const generator = getMetaContent('meta[name="generator"]'); if (generator) { if (/WordPress/i.test(generator)) detected.cms.add('WordPress'); if (/Joomla/i.test(generator)) detected.cms.add('Joomla'); if (/Drupal/i.test(generator)) detected.cms.add('Drupal'); if (/Shopify/i.test(generator)) detected.cms.add('Shopify'); if (/Wix/i.test(generator)) detected.cms.add('Wix'); if (/Squarespace/i.test(generator)) detected.cms.add('Squarespace'); if (/Magento/i.test(generator)) detected.cms.add('Magento'); if (/Webflow/i.test(generator)) detected.cms.add('Webflow'); if (/Salla/i.test(generator)) detected.cms.add('Salla'); if (/^Divi v/i.test(generator)) detected.wpPageBuilders.add('Divi'); } const resources = [...Array.from(document.scripts).map(s => s.src), ...Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(l => l.href)].filter(Boolean); let isSallaDetectedByURL = false; resources.forEach(url => { if (/wp-content|wp-includes/i.test(url)) detected.cms.add('WordPress'); if (/cdn\.shopify\.com|shopify\.com\/s\/files/i.test(url)) detected.cms.add('Shopify'); if (/sites\/default\/files/i.test(url)) detected.cms.add('Drupal'); if (/js\/mage|media\/js/i.test(url) && !detected.cms.has('WordPress')) detected.cms.add('Magento'); if (/assets\.squarespace\.com/i.test(url)) detected.cms.add('Squarespace'); if (/salla\.network|salla\.sa/i.test(url)) { detected.cms.add('Salla'); isSallaDetectedByURL = true; } if (/\/react(-dom)?(\.min)?\.js/i.test(url)) detected.jsFrameworks.add('React'); if (/\/vue(\.min)?\.js/i.test(url)) detected.jsFrameworks.add('Vue.js'); if (/\/angular(\.min)?\.js/i.test(url)) detected.jsFrameworks.add('Angular'); if (/\/jquery(\.min)?\.js|\/jquery-/i.test(url)) detected.jsLibraries.add('jQuery'); if (/\/bootstrap(\.min)?\.(js|css)/i.test(url)) { if (/\.js/.test(url)) detected.jsLibraries.add('Bootstrap JS'); if (/\.css/.test(url)) detected.jsLibraries.add('Bootstrap CSS'); } }); if (window.Shopify) detected.cms.add('Shopify'); if (window.Drupal) detected.cms.add('Drupal'); if (window.Squarespace) detected.cms.add('Squarespace'); if (document.querySelector('[data-wf-page], html[data-wf-site]')) detected.cms.add('Webflow'); if (document.querySelector('body.wix') || window.wixBiSession) detected.cms.add('Wix'); if (document.querySelector('.wp-block, body.wp-admin, body.wordpress')) detected.cms.add('WordPress'); if (document.querySelector('meta[content*="Joomla!"]')) detected.cms.add('Joomla'); if (!isSallaDetectedByURL) { if (document.querySelector('salla-add-product-button, [id^="salla-"], [class*="salla-"]') || window.Salla) { detected.cms.add('Salla'); } } isWordPress = detected.cms.has('WordPress'); let usesGtag = window.gtag || resources.some(src => /googletagmanager\.com\/gtag\/js/i.test(src)); let usesGtm = window.google_tag_manager || window.dataLayer || resources.some(src => /googletagmanager\.com\/gtm\.js/i.test(src)); let usesUA = window.ga || window._gaq || resources.some(src => /google-analytics\.com\/analytics\.js/i.test(src)); if (usesGtm) detected.analyticsTagManagers.add('Google Tag Manager'); if (usesGtag) detected.analyticsTagManagers.add('Google Analytics (gtag.js/GA4)'); if (usesUA && !detected.analyticsTagManagers.has('Google Analytics (gtag.js/GA4)')) detected.analyticsTagManagers.add('Google Analytics (analytics.js/UA)'); if (window._paq || resources.some(src => /matomo\.js|piwik\.js/i.test(src))) { detected.analyticsTagManagers.add('Matomo/Piwik'); } if (document.querySelector('meta[name="google-site-verification"]')) { detected.webmasterTools.add('Google Search Console (verified)'); } if (document.querySelector('meta[name="msvalidate.01"]')) { detected.webmasterTools.add('Bing Webmaster Tools (verified)'); } if (window.jQuery || window.$) detected.jsLibraries.add('jQuery'); if (window.React || document.querySelector('[data-reactroot], [data-reactid]')) detected.jsFrameworks.add('React'); if (window.Vue || document.getElementById('app')?.__vue__) detected.jsFrameworks.add('Vue.js'); if (window.angular || document.querySelector('.ng-binding, .ng-scope')) detected.jsFrameworks.add('Angular'); if (isWordPress) { if (window.wpseo || checkCommentsForText('Yoast SEO') || resources.some(r => /wordpress-seo/i.test(r)) || document.querySelector('.wpseo-breadcrumb, [class*="wpseo"]')) detected.wpSeoPlugins.add('Yoast SEO'); if (window.rankMath || checkCommentsForText('Rank Math') || checkCommentsForText('/ Rank Math') || resources.some(r => /seo-by-rank-math/i.test(r)) || document.querySelector('.rank-math-breadcrumb, [class*="rank-math"]')) detected.wpSeoPlugins.add('Rank Math'); if (document.querySelector('.elementor-widget-wrap, body.elementor-page, link[id*="elementor-frontend-css"]') || window.elementorFrontend || resources.some(r => /elementor\/assets/i.test(r))) detected.wpPageBuilders.add('Elementor'); if (document.querySelector('.wpb_content_element, .vc_row, body.wpb-js-composer') || checkCommentsForText('WPBakery Page Builder') || resources.some(r => /wpbakery|js_composer/i.test(r))) detected.wpPageBuilders.add('WPBakery'); if (document.querySelector('#et-boc, .et-pb-section, body.et-pb-theme, style[id="divi-style-inline-inline-css"]') || window.ET_Builder || resources.some(r => /\/Divi\//i.test(r))) detected.wpPageBuilders.add('Divi'); if (document.querySelector('.brxe-section, body[data-bricks-scroll-breakpoint], html[data-bricks-builder-mode]') || window.bricksInitializeSlider || resources.some(r => /\/bricks\/frontend/i.test(r))) detected.wpPageBuilders.add('Bricks'); } } catch (e) { console.error("Error during technology detection:", e); } const result = { hasCMS: isWordPress }; for (const key in detected) { if (detected[key] instanceof Set) { result[key] = Array.from(detected[key]); } else { result[key] = detected[key]; } } return result; }

    // --- Highlight Handling ---
    const HIGHLIGHT_CLASS = 'seo-analyzer-highlight'; const HIGHLIGHT_STYLE_ID = 'seo-analyzer-highlight-styles';
    function clearAllHighlights() { document.querySelectorAll(`.${HIGHLIGHT_CLASS}`).forEach(el => { el.classList.remove(HIGHLIGHT_CLASS); }); }
    function applySingleHighlight(tagName, index) { clearAllHighlights(); try { let elements; if (tagName === 'a') { elements = document.querySelectorAll('a[href]'); } else if (tagName === 'img') { elements = document.querySelectorAll('img'); } else if (tagName.match(/^h[1-6]$/i)) { elements = document.querySelectorAll('h1, h2, h3, h4, h5, h6'); } else { console.warn("Unsupported tag name:", tagName); return false; } if (elements && index >= 0 && index < elements.length) { const targetElement = elements[index]; targetElement.classList.add(HIGHLIGHT_CLASS); targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); return true; } else { console.warn(`Element not found: ${tagName}[${index}]`); return false; } } catch (e) { console.error(`Error highlighting:`, e); return false; } }
    function ensureHighlightStyles() { if (document.getElementById(HIGHLIGHT_STYLE_ID)) return; const css = `.${HIGHLIGHT_CLASS} { outline: 3px solid #E5534B !important; background-color: rgba(229, 83, 75, 0.1) !important; box-shadow: 0 0 0 3px rgba(229, 83, 75, 0.3) !important; transition: all 0.2s ease; scroll-margin-top: 50px !important; }`; const styleSheet = document.createElement("style"); styleSheet.id = HIGHLIGHT_STYLE_ID; styleSheet.innerText = css; document.head.appendChild(styleSheet); }

    // --- Listener for messages from the popup ---
    console.log('[SEO Analyzer - content.js] Adding message listener for highlights.');
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        console.log('[SEO Analyzer - content.js] Received message:', message);
        if (message.action === 'highlightSingle') {
            ensureHighlightStyles();
            const { tagName, index } = message.payload;
            if (tagName !== undefined && index !== undefined) {
                const success = applySingleHighlight(tagName, index);
                sendResponse({ status: success ? "Highlight applied" : "Element not found" });
            } else { sendResponse({ status: "Invalid payload" }); }
        } else if (message.action === 'clearHighlights') {
            clearAllHighlights();
            sendResponse({ status: "Highlights cleared" });
        }
        // Return false indicating synchronous response or no response needed
        // If you needed to do async work *here* before responding, you'd return true.
        return false;
    });

    // --- Collect INITIAL data and send it back to the popup ---
    console.log('[SEO Analyzer - content.js] Starting INITIAL data collection.');
    try {
        // --- Collect Data (excluding CWV initially) ---
        const metaAndHeadings = getMetaDataAndHeadings();
        const hierarchyData = getHeadingHierarchy();
        const schemaData = getSchemaMarkup();
        const contentData = getContentAnalysis();
        const hreflangData = getHreflangTags();
        const techData = detectTechnologies();
        const linkData = getLinkAnalysis();
        const imageData = getImageAnalysis();
        const socialData = getSocialMediaMetadata();
        console.log('[SEO Analyzer - content.js] Initial data collection functions finished.');

        // --- Construct Initial Object (without CWV) ---
        const seoData = {
            title: metaAndHeadings.title, description: metaAndHeadings.description, url: metaAndHeadings.url,
            canonical: metaAndHeadings.canonical, robots: metaAndHeadings.robots, headingCounts: metaAndHeadings.headingCounts,
            // New fields
            viewport: metaAndHeadings.viewport,
            favicon: metaAndHeadings.favicon,
            duplicates: metaAndHeadings.duplicates,
            headingHierarchy: hierarchyData.tree, hasH1: hierarchyData.hasH1,
            schema: schemaData,
            links: linkData, images: imageData, socialTags: socialData,
            wordCount: contentData.wordCount, letterCount: contentData.letterCount,
            keywordDensity: contentData.keywordDensity,
            hreflangTags: hreflangData,
            detectedTech: techData
            // CWV metrics will be sent via separate messages
        };
        console.log('[SEO Analyzer - content.js] Constructed initial seoData object:', seoData);

        // --- Send Initial Message ---
        console.log('[SEO Analyzer - content.js] Attempting to send initial seoData message to runtime...');
        // Simply send the message without expecting a response
        chrome.runtime.sendMessage({ seoData: seoData });
        // The callback function and its contents have been removed.

    } catch (error) {
        console.error('[SEO Analyzer - content.js] Error collecting initial SEO data:', error);
        // Attempt to send an error message back
        try {
            console.log('[SEO Analyzer - content.js] Attempting to send error message back...');
            chrome.runtime.sendMessage({ error: `Content script failed during initial load: ${error.message}` });
        } catch (sendError) {
            console.error('[SEO Analyzer - content.js] Failed even to send error message:', sendError);
        }
    }

    // --- *** ADDED: Core Web Vitals Observation Setup *** ---

    // Define the callback for the PerformanceObserver
    function handlePerformanceEntry(list) {
        let shouldSendMessage = false;
        const entries = list.getEntries();
        entries.forEach(entry => {
            if (entry.entryType === 'largest-contentful-paint') {
                // LCP might report multiple times, take the latest one
                coreWebVitalsMetrics.lcp = entry.startTime;
                console.log('[SEO Analyzer - content.js] LCP recorded:', coreWebVitalsMetrics.lcp);
                shouldSendMessage = true;
            } else if (entry.entryType === 'first-input') {
                // FID is only reported once
                if (coreWebVitalsMetrics.fid === null) { // Only record the first FID
                    coreWebVitalsMetrics.fid = entry.processingStart - entry.startTime;
                    console.log('[SEO Analyzer - content.js] FID recorded:', coreWebVitalsMetrics.fid);
                    shouldSendMessage = true;
                }
            } else if (entry.entryType === 'layout-shift' && !entry.hadRecentInput) {
                // Accumulate CLS score, ignoring shifts after recent input
                coreWebVitalsMetrics.cls += entry.value;
                coreWebVitalsMetrics.clsEntries++; // Optional
                console.log('[SEO Analyzer - content.js] CLS updated:', coreWebVitalsMetrics.cls);
                shouldSendMessage = true;
            }
        });

        // Send an update message only if relevant metrics changed
        if (shouldSendMessage) {
            try {
                console.log('[SEO Analyzer - content.js] Sending CWV update message:', coreWebVitalsMetrics);
                // Simply send the message without expecting a response
                chrome.runtime.sendMessage({ coreWebVitalsUpdate: coreWebVitalsMetrics });
                // The callback function and its contents have been removed.
            } catch (e) {
                console.error('[SEO Analyzer - content.js] Error trying to send CWV update message:', e);
            }
        }
    }

    // Instantiate and Start Observing for CWV
    try {
        if (typeof PerformanceObserver !== 'undefined') {
            performanceObserver = new PerformanceObserver(handlePerformanceEntry);

            // Observe LCP, FID, and CLS
            performanceObserver.observe({ type: 'largest-contentful-paint', buffered: true });
            performanceObserver.observe({ type: 'first-input', buffered: true });
            performanceObserver.observe({ type: 'layout-shift', buffered: true });

            console.log('[SEO Analyzer - content.js] PerformanceObserver started for LCP, FID, CLS.');
        } else {
            console.warn('[SEO Analyzer - content.js] PerformanceObserver API not available in this context.');
        }

    } catch (e) {
        console.error('[SEO Analyzer - content.js] Could not create or start PerformanceObserver:', e);
    }
    // --- *** END CWV Observation Setup *** ---


    console.log('[SEO Analyzer - content.js] Script initial execution finished. CWV observer running.');

})(); // End IIFE