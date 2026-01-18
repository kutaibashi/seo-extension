// background.js
console.log("Background script started - Session Storage Persistence v2 (Refined Cleanup + PSI)");

// --- In-memory caches (optional, can optimize access) ---
// State primarily lives in chrome.storage.session now
const tabsCache = {};
const crawlStatesCache = {};
// Note: PSI data is not cached in memory here, always fetched from session storage via messages

// --- Constants ---
const CRAWL_DELAY_MS_BG = 750; // Delay between background crawl requests (ms) - Adjust if needed
const FETCH_TIMEOUT_MS_BG = 10000; // Timeout for each link fetch (ms) - Adjust if needed
const BADGE_COLORS = {
    INFO: '#6c757d',    // Gray for loading/other
    SUCCESS: '#28a745', // Green for 2xx
    REDIRECT: '#ffc107', // Yellow for 3xx
    ERROR: '#e5534b'     // Red for 4xx, 5xx, errors
};

// --- Storage Helper Functions ---
async function saveSessionData(key, value) {
    try {
        // console.debug(`[Storage] Saving ${key}:`, value); // Verbose logging
        await chrome.storage.session.set({ [key]: value });
    } catch (e) {
        console.error(`[Storage] Error saving ${key}:`, e);
    }
}

async function loadSessionData(key) {
    try {
        const data = await chrome.storage.session.get(key);
        // console.debug(`[Storage] Loaded ${key}:`, data[key]); // Verbose logging
        return data[key]; // Returns undefined if key doesn't exist
    } catch (e) {
        console.error(`[Storage] Error loading ${key}:`, e);
        return undefined;
    }
}

async function removeSessionData(keyOrKeys) {
    try {
        // console.debug(`[Storage] Removing:`, keyOrKeys); // Verbose logging
        await chrome.storage.session.remove(keyOrKeys);
    } catch (e) {
        console.error(`[Storage] Error removing ${keyOrKeys}:`, e);
    }
}

// --- Storage Key Generators ---
function getTabStorageKey(tabId) { return `tabState_${tabId}`; }
function getCrawlStorageKey(tabId) { return `crawlState_${tabId}`; }
function getPsiStorageKey(tabId) { return `psiState_${tabId}`; } // <-- ADDED for PSI state

// --- Badge Update Function (Modified to load data) ---
async function updateBadgeForTab(tabId) {
    // Avoid errors if tabId is invalid
    if (typeof tabId !== 'number' || tabId < 0) {
        // console.warn(`[updateBadge] Invalid tabId received: ${tabId}`);
        return;
    }
    const storageKey = getTabStorageKey(tabId);
    // Try cache first, then load from storage
    let tabData = tabsCache[tabId] || await loadSessionData(storageKey);
    tabsCache[tabId] = tabData; // Update cache after loading

    try {
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        // Only update active tab unless it's closing
        if (!activeTab || activeTab.id !== tabId) {
            try {
                // Check if tab still exists before clearing badge
                await chrome.tabs.get(tabId);
            } catch (e) {
                // Tab likely closed
            }
            return;
        }

        if (!activeTab.url || activeTab.url.startsWith('chrome://') || activeTab.url.startsWith('about:') || activeTab.url.startsWith('file://')) {
            try { await chrome.action.setBadgeText({ text: '', tabId: tabId }); } catch (e) { /* ignore error if tab closed */ }
            return;
        }

        let badgeText = '';
        let badgeColor = BADGE_COLORS.INFO;
        let statusCodeToEvaluate = null;

        if (tabData && tabData.firstUrl && tabData.requestDetails) {
            // --- Badge logic (same as before, operates on loaded tabData) ---
            let firstRedirectStatus = null;
            let finalStatus = -7; // Default unknown/error status
            let currentUrl = tabData.firstUrl;
            let lastValidUrl = tabData.firstUrl;
            let safetyBreak = 0;
            while (currentUrl && safetyBreak < 20) {
                safetyBreak++;
                const details = tabData.requestDetails[currentUrl];
                if (details) {
                    lastValidUrl = currentUrl;
                    // Use recorded status, including 0 if that's what was recorded
                    finalStatus = details.statusCode;
                    currentUrl = details.redirectUrl || null;
                } else {
                    // If details missing for a step, use last known status
                    finalStatus = tabData.requestDetails[lastValidUrl]?.statusCode ?? -7;
                    currentUrl = null; // Stop tracing
                }
            }
            if (safetyBreak >= 20) finalStatus = -1; // Mark as loop/limit

            // Find first redirect status
            currentUrl = tabData.firstUrl; // Reset for second loop
            safetyBreak = 0;
            while (currentUrl && safetyBreak < 20) {
                safetyBreak++;
                const details = tabData.requestDetails[currentUrl];
                if (details) {
                    if (details.statusCode >= 300 && details.statusCode < 400) { firstRedirectStatus = details.statusCode; break; }
                    currentUrl = details.redirectUrl || null;
                } else { currentUrl = null; }
            }
            // Determine overall status for badge: prioritize first redirect, then final status
            statusCodeToEvaluate = (firstRedirectStatus !== null) ? firstRedirectStatus : finalStatus;
            // --- End badge logic ---

            // Set Badge Text
            if (statusCodeToEvaluate >= 100 && statusCodeToEvaluate < 600) badgeText = String(statusCodeToEvaluate);
            else if (statusCodeToEvaluate === -1) badgeText = 'LOOP'; // Explicitly check for -1
            else if (statusCodeToEvaluate < 0) badgeText = 'ERR';
            else if (statusCodeToEvaluate === 0) badgeText = '...'; // Still loading or indeterminate
            else badgeText = '?'; // Unknown status > 600 or other weird cases
            // Set Badge Color
            if (statusCodeToEvaluate >= 200 && statusCodeToEvaluate < 300) badgeColor = BADGE_COLORS.SUCCESS;
            else if (statusCodeToEvaluate >= 300 && statusCodeToEvaluate < 400) badgeColor = BADGE_COLORS.REDIRECT;
            else if (statusCodeToEvaluate >= 400 && statusCodeToEvaluate < 600) badgeColor = BADGE_COLORS.ERROR;
            else if (statusCodeToEvaluate < 0) badgeColor = BADGE_COLORS.ERROR; // Includes -1, -3, -4 etc.

        } else {
            badgeText = '...';
            badgeColor = BADGE_COLORS.INFO;
        }

        // Set the Badge
        try {
            await chrome.action.setBadgeText({ text: badgeText.substring(0, 4), tabId: tabId });
            if (badgeText) { await chrome.action.setBadgeBackgroundColor({ color: badgeColor, tabId: tabId }); }
        } catch (badgeError) { /* Ignore if tab closed */ }

    } catch (error) {
        // Avoid logging error if it's just because the tab doesn't exist anymore
        if (!(error instanceof Error && error.message.includes('No tab with id'))) {
            console.error(`[updateBadge] Error for tab ${tabId}:`, error);
        }
    }
}

// --- Web Request Listener (Modified to load/save data) ---
if (chrome.webRequest?.onHeadersReceived?.addListener) {
    chrome.webRequest.onHeadersReceived.addListener(
        async (details) => { // Made async
            if (details.frameId === 0) { // Only process main frame requests
                const tabId = details.tabId;
                const storageKey = getTabStorageKey(tabId);

                // Load existing data or initialize
                // console.debug(`[onHeadersReceived] Tab ${tabId} - URL: ${details.url} Status: ${details.statusCode}. Loading state...`);
                let tabData = tabsCache[tabId] || await loadSessionData(storageKey);
                // console.debug(`[onHeadersReceived] Tab ${tabId} - Loaded state:`, JSON.stringify(tabData));

                // Initialize or reset if navigation seems new or state is completed
                if (!tabData || !tabData.requestDetails || tabData.completed) {
                    // console.debug(`[onHeadersReceived] Tab ${tabId} - Initializing/Resetting state for URL: ${details.url}`);
                    tabData = { requestDetails: {}, error: null, firstUrl: details.url, completed: false };
                } else if (!tabData.firstUrl) {
                    // Fallback if firstUrl wasn't set for some reason
                    tabData.firstUrl = details.url;
                }

                let redirectUrl = null;
                // Find redirectUrl and handle potential parsing errors
                if (details.statusCode >= 300 && details.statusCode < 400) {
                    const locationHeader = details.responseHeaders.find(h => h.name.toLowerCase() === 'location');
                    if (locationHeader?.value) {
                        try {
                            // Resolve relative URLs against the current request URL
                            redirectUrl = new URL(locationHeader.value, details.url).href;
                        } catch (e) {
                            // Handle invalid redirect URLs
                            tabData.error = `Redirect URL parse error: ${locationHeader.value}`;
                            if (!tabData.requestDetails[details.url]) tabData.requestDetails[details.url] = {};
                            tabData.requestDetails[details.url].statusCode = -3; // Specific error code for URL parse error
                            tabData.requestDetails[details.url].error = tabData.error;
                            console.error(`[onHeadersReceived] Tab ${tabId} - Redirect URL parse error for "${locationHeader.value}" from "${details.url}"`);
                        }
                    } else {
                        // Handle missing Location header on redirect status
                        tabData.error = `Redirect status ${details.statusCode} but no Location header.`;
                        if (!tabData.requestDetails[details.url]) tabData.requestDetails[details.url] = {};
                        tabData.requestDetails[details.url].statusCode = -5; // Specific error code for missing Location
                        tabData.requestDetails[details.url].error = tabData.error;
                        console.warn(`[onHeadersReceived] Tab ${tabId} - Redirect status ${details.statusCode} but no Location header found for URL: ${details.url}`);
                    }
                }

                // Store details for the current URL, avoid overwriting specific errors (-3, -5) set above
                if (!tabData.requestDetails[details.url] || tabData.requestDetails[details.url]?.statusCode >= 0) {
                    tabData.requestDetails[details.url] = {
                        statusCode: details.statusCode,
                        redirectUrl: redirectUrl,
                        error: null // Clear previous generic errors if we get a new status
                    };
                }

                // Initialize entry for redirect target if it doesn't exist yet
                if (redirectUrl && !tabData.requestDetails[redirectUrl]) {
                    tabData.requestDetails[redirectUrl] = { statusCode: 0, redirectUrl: null, error: null }; // Initialize with status 0 (pending)
                }

                // Mark as not completed (unless a specific error occurred during this step)
                if (!tabData.error && tabData.requestDetails[details.url]?.statusCode !== -3 && tabData.requestDetails[details.url]?.statusCode !== -5) {
                    tabData.completed = false;
                }

                // console.debug(`[onHeadersReceived] Tab ${tabId} - State before save:`, JSON.stringify(tabData));
                tabsCache[tabId] = tabData; // Update cache
                await saveSessionData(storageKey, tabData); // Save to storage immediately
                updateBadgeForTab(details.tabId); // Update badge after potentially changing state
            }
        },
        { urls: ["<all_urls>"], types: ["main_frame"] },
        ["responseHeaders"] // Need response headers to check 'Location'
    );
}

// --- Web Navigation Listeners ---

// MODIFIED onCommitted Listener: Clears navigation, crawl, AND PSI state on new commit
if (chrome.webNavigation?.onCommitted?.addListener) {
    chrome.webNavigation.onCommitted.addListener(async (details) => { // Made async
        // Only act on main frame navigation commits
        if (details.frameId === 0 && details.navigationId) {
            const tabId = details.tabId;
            const tabKey = getTabStorageKey(tabId);
            const crawlKey = getCrawlStorageKey(tabId);
            const psiKey = getPsiStorageKey(tabId); // <-- Get PSI key

            console.log(`[onCommitted] Tab ${tabId} new navigation commit to ${details.url} (Nav ID: ${details.navigationId}). Clearing navigation, crawl, AND PSI state.`);

            // Clear cache for all associated states
            delete tabsCache[tabId];
            delete crawlStatesCache[tabId]; // Assumes crawl cache might exist

            // Clear storage for all associated states
            await removeSessionData([tabKey, crawlKey, psiKey]); // <-- Clear PSI key from storage

            // Initialize minimal navigation state for the *new* navigation in storage/cache
            const initialTabData = {
                requestDetails: { [details.url]: { statusCode: 0, redirectUrl: null, error: null } }, // Start with status 0 for the committed URL
                error: null,
                firstUrl: details.url, // The first URL of this *new* navigation
                completed: false
            };
            tabsCache[tabId] = initialTabData; // Update cache
            await saveSessionData(tabKey, initialTabData); // Save initial state for the new navigation

            updateBadgeForTab(tabId); // Update badge for the new navigation start
        }
    });
}

// onCompleted (Modified to ensure it loads/saves correctly)
if (chrome.webNavigation?.onCompleted?.addListener) {
    chrome.webNavigation.onCompleted.addListener(async (details) => { // Made async
        if (details.frameId === 0) { // Only main frame
            const tabId = details.tabId;
            const storageKey = getTabStorageKey(tabId);
            let tabData = tabsCache[tabId] || await loadSessionData(storageKey);

            // Only proceed if we have some data for this navigation
            if (tabData && tabData.requestDetails) {
                // console.log(`[onCompleted] Event: Tab ${tabId}, Final URL: ${details.url}. Marking navigation completed.`);
                tabData.completed = true; // Mark this navigation sequence as done

                // Check the status recorded for the final URL
                const finalUrlDetails = tabData.requestDetails[details.url];

                // If the final URL was recorded with status 0 (pending) and no overall error occurred,
                // infer it completed successfully (status 200).
                if (!tabData.error && finalUrlDetails && finalUrlDetails.statusCode === 0) {
                    // console.log(`[onCompleted] Tab ${tabId}: Inferring status 200 for final URL ${details.url} (was 0).`);
                    finalUrlDetails.statusCode = 200;
                } else if (!tabData.error && !finalUrlDetails) {
                    // If somehow the final URL wasn't recorded at all, add it with status 200
                    // console.warn(`[onCompleted] Tab ${tabId}: Final URL ${details.url} not found in requestDetails. Adding with status 200.`);
                    tabData.requestDetails[details.url] = { statusCode: 200, error: null, redirectUrl: null };
                }

                tabsCache[tabId] = tabData; // Update cache
                await saveSessionData(storageKey, tabData); // Save the completed state
                updateBadgeForTab(tabId); // Update badge with final status
            } else {
                // This might happen if onCommitted didn't run correctly or state was cleared unexpectedly
                console.warn(`[onCompleted] Tab ${tabId}: No valid tabData found to mark as complete for URL ${details.url}.`);
            }
        }
    });
}

// onErrorOccurred (Modified to save error state correctly)
if (chrome.webNavigation?.onErrorOccurred?.addListener) {
    chrome.webNavigation.onErrorOccurred.addListener(async (details) => { // Made async
        // Ignore user aborts or blocks by other extensions, only act on main frame errors
        if (details.frameId === 0 && details.error !== 'net::ERR_BLOCKED_BY_CLIENT' && details.error !== 'net::ERR_ABORTED') {
            console.error(`[onErrorOccurred] Error: Tab ${details.tabId}, URL: ${details.url}, Error: ${details.error}`);
            const tabId = details.tabId;
            const tabKey = getTabStorageKey(tabId);

            let tabData = tabsCache[tabId] || await loadSessionData(tabKey);

            // Initialize if error occurred before any successful load/commit for this navigation
            if (!tabData) {
                // console.warn(`[onErrorOccurred] Tab ${tabId}: Initializing state due to error on first load attempt for ${details.url}`);
                tabData = { requestDetails: {}, error: null, firstUrl: details.url, completed: false };
            }

            // Record the error
            tabData.error = details.error;
            // Ensure there's an entry for the URL that errored
            if (!tabData.requestDetails[details.url]) {
                tabData.requestDetails[details.url] = {};
            }
            tabData.requestDetails[details.url].statusCode = -4; // Specific navigation error code
            tabData.requestDetails[details.url].error = details.error;
            tabData.completed = true; // Mark the navigation as completed (with an error)

            tabsCache[tabId] = tabData; // Update cache
            await saveSessionData(tabKey, tabData); // Save error state

            updateBadgeForTab(tabId); // Update badge to show error
        }
    });
}


// --- Background Crawling Function (Uses redirect: 'manual') ---
async function crawlNextLink(tabId) {
    const storageKey = getCrawlStorageKey(tabId);
    // Load state fresh from storage at the beginning of each step
    let state = crawlStatesCache[tabId] || await loadSessionData(storageKey);
    crawlStatesCache[tabId] = state; // Update cache

    // Stop conditions
    if (!state || !state.isRunning || state.currentIndex >= state.links.length) {
        if (state && state.isRunning) { // Mark as finished if it was running
            state.isRunning = false;
            crawlStatesCache[tabId] = state;
            await saveSessionData(storageKey, state); // Save final state
        }
        // console.log(`[BG Crawl] Crawling finished or stopped for tab ${tabId}.`);
        return; // Stop the loop
    }

    const link = state.links[state.currentIndex];
    const url = link.href;
    let result = { status: null, error: null }; // Default result structure

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS_BG);

        const response = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            redirect: 'manual' // Keep as manual to get 3xx codes directly
        });

        clearTimeout(timeoutId);

        // response.status will be 0 for redirects (if network error), or the actual code
        result = { status: response.status, error: null };
        // console.debug(`[BG Crawl] Status ${response.status} for ${url} (Tab ${tabId}) with redirect:manual`);

    } catch (error) {
        // console.error(`[BG Crawl] Fetch error for ${url} (Tab ${tabId}):`, error.name, error.message);
        let errorMsg = 'Fetch Err';
        // DOMException is thrown for timeouts with AbortController
        if (error.name === 'AbortError' || (error instanceof DOMException && error.message.includes('aborted'))) {
            errorMsg = 'Timeout';
        } else if (error.name === 'TypeError') { // Often indicates network error or CORS issues
            errorMsg = 'Net/URL Err';
        }
        result = { status: null, error: errorMsg };
    }

    // --- Update state object and save ---
    if (!state.results) state.results = {};
    state.results[url] = result; // Store the result for this specific URL
    state.currentIndex++; // Move to the next link index

    // Check if finished *after* incrementing index
    if (state.currentIndex >= state.links.length) {
        state.isRunning = false; // Mark crawl as no longer running
        // console.log(`[BG Crawl] Reached end of links for tab ${tabId}. Saving final state.`);
    }
    crawlStatesCache[tabId] = state; // Update cache
    await saveSessionData(storageKey, state); // Save progress
    // --- End update and save ---

    // Schedule the next fetch ONLY if still running
    if (state.isRunning) {
        // Use setTimeout for scheduling the next task
        setTimeout(() => crawlNextLink(tabId), CRAWL_DELAY_MS_BG);
    }
}


// --- Message Listener (Handles messages from popup) ---
if (chrome.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        let isAsync = false; // Flag to indicate if sendResponse will be called asynchronously

        // Get Redirect Chain
        if (message.action === 'getRedirectChain' && message.tabId) {
            isAsync = true; // Will use await
            (async () => {
                const tabId = message.tabId;
                const storageKey = getTabStorageKey(tabId);
                let tabData = null;
                let finalStatus = -7; // Default unknown/error

                try {
                    tabData = tabsCache[tabId] || await loadSessionData(storageKey);
                    tabsCache[tabId] = tabData;
                } catch (e) {
                    console.error(`[getRedirectChain] Error loading state for tab ${tabId}:`, e);
                    sendResponse({ chain: [], completed: false, error: `Failed to get tab state: ${e.message}`, finalStatus: finalStatus });
                    return;
                }

                const reconstructedChain = [];
                const isStoredComplete = tabData?.completed || false;
                const storedError = tabData?.error || null;

                if (tabData && tabData.firstUrl && tabData.requestDetails) {
                    let currentUrl = tabData.firstUrl;
                    let safetyBreak = 0;
                    let lastAddedUrl = null;

                    while (currentUrl && safetyBreak < 20) {
                        safetyBreak++;
                        const storedDetails = tabData.requestDetails[currentUrl];
                        let currentStatus = -7; let currentStepError = null;

                        if (storedDetails) {
                            currentStatus = storedDetails.statusCode;
                            currentStepError = storedDetails.error;
                            finalStatus = currentStatus; // Update last known status
                        } else {
                            console.warn(`[getRedirectChain] Tab ${tabId}: Missing details for step: ${currentUrl}`);
                            currentStatus = -6; currentStepError = "Missing step details"; finalStatus = currentStatus;
                            if (currentUrl && currentUrl !== lastAddedUrl) {
                                reconstructedChain.push({ url: currentUrl, status: currentStatus, error: currentStepError });
                                lastAddedUrl = currentUrl;
                            }
                            currentUrl = null; continue;
                        }

                        if (currentUrl && currentUrl !== lastAddedUrl) {
                            reconstructedChain.push({ url: currentUrl, status: currentStatus, error: currentStepError });
                            lastAddedUrl = currentUrl;
                        } else if (currentUrl) {
                            console.warn(`[getRedirectChain] Tab ${tabId}: Loop detected at ${currentUrl}`);
                            if (reconstructedChain.length > 0) {
                                const lastEntry = reconstructedChain[reconstructedChain.length - 1];
                                lastEntry.status = -1; lastEntry.error = "Loop detected"; finalStatus = lastEntry.status;
                            }
                            currentUrl = null; safetyBreak = 20;
                        }

                        if (currentUrl) { currentUrl = storedDetails?.redirectUrl || null; }
                    }

                    if (safetyBreak >= 20 && reconstructedChain.length > 0 && finalStatus !== -1) {
                        console.warn(`[getRedirectChain] Tab ${tabId}: Redirect limit reached.`);
                        const lastEntry = reconstructedChain[reconstructedChain.length - 1];
                        if (lastEntry.status >= 0 || lastEntry.status === -6) {
                            lastEntry.status = -1; lastEntry.error = "Redirect limit reached"; finalStatus = lastEntry.status;
                        }
                    }
                } else {
                    // console.warn(`[getRedirectChain] Tab ${tabId}: Loaded tabData missing key info. Chain reconstruction skipped.`);
                    if (!storedError) reconstructedChain.length = 0;
                    if (storedError) finalStatus = -4;
                }

                if (storedError && finalStatus >= 0) { finalStatus = -4; }

                sendResponse({
                    chain: reconstructedChain,
                    completed: isStoredComplete,
                    error: storedError,
                    finalStatus: finalStatus // Send the determined final status
                });

            })(); // Immediately invoke async function
        }

        // Start Link Crawling
        else if (message.action === 'startCrawlingForTab' && message.tabId && message.links) {
            isAsync = true;
            (async () => {
                const tabId = message.tabId;
                const storageKey = getCrawlStorageKey(tabId);
                const currentState = crawlStatesCache[tabId] || await loadSessionData(storageKey);

                if (currentState?.isRunning) {
                    // console.log(`[BG] Crawl already running for tab ${tabId}`);
                    sendResponse({ status: "already_running" });
                } else {
                    // console.log(`[BG] Starting new crawl for tab ${tabId} with ${message.links.length} links.`);
                    const validLinks = message.links
                        .filter(link => link?.href && (link.href.startsWith('http:') || link.href.startsWith('https://')))
                        .map(link => ({ href: link.href }));

                    if (validLinks.length === 0) {
                        console.warn(`[BG] No valid HTTP(S) links provided for tab ${tabId}.`);
                        sendResponse({ status: "no_valid_links" });
                        return;
                    }

                    const initialState = {
                        isRunning: true,
                        links: validLinks,
                        results: {},
                        currentIndex: 0,
                        error: null
                    };
                    crawlStatesCache[tabId] = initialState;
                    await saveSessionData(storageKey, initialState);
                    crawlNextLink(tabId); // Start the async loop
                    sendResponse({ status: "started" });
                }
            })();
        }

        // Get Crawl Status
        else if (message.action === 'getCrawlStatusForTab' && message.tabId) {
            isAsync = true;
            (async () => {
                const tabId = message.tabId;
                const storageKey = getCrawlStorageKey(tabId);
                const stateFromStorage = await loadSessionData(storageKey);
                crawlStatesCache[tabId] = stateFromStorage; // Update cache
                const stateToSend = stateFromStorage
                    ? { ...stateFromStorage } // Send a copy
                    : { isRunning: false, results: {}, links: [], currentIndex: 0, error: null };
                sendResponse(stateToSend);
            })();
        }

        // *** ADDED: Save PSI Data ***
        else if (message.action === 'savePsiDataForTab' && message.tabId && message.psiData) {
            isAsync = true;
            (async () => {
                const tabId = message.tabId;
                const storageKey = getPsiStorageKey(tabId);
                try {
                    await saveSessionData(storageKey, message.psiData);
                    console.log(`[BG] PSI data saved for tab ${tabId}`);
                    sendResponse({ status: "psi_saved" });
                } catch (e) {
                    console.error(`[BG] Error saving PSI data for tab ${tabId}:`, e);
                    sendResponse({ status: "psi_save_error", error: e.message });
                }
            })();
        }

        // *** ADDED: Get PSI Data ***
        else if (message.action === 'getPsiDataForTab' && message.tabId) {
            isAsync = true;
            (async () => {
                const tabId = message.tabId;
                const storageKey = getPsiStorageKey(tabId);
                try {
                    const storedData = await loadSessionData(storageKey);
                    console.log(`[BG] Retrieved PSI data for tab ${tabId}:`, storedData ? 'Found' : 'Not Found');
                    sendResponse({ psiData: storedData || null }); // Send null if not found
                } catch (e) {
                    console.error(`[BG] Error retrieving PSI data for tab ${tabId}:`, e);
                    sendResponse({ psiData: null, error: e.message });
                }
            })();
        }

        // Handle Ping
        else if (message.action === "contentScriptLoaded") {
            // console.log("[Background] Received PING from content script in tab:", sender.tab?.id);
            sendResponse({ status: "Background received ping" });
            isAsync = false;
        }

        return isAsync; // Return true if any handler is async
    });
}


// --- Tab Management Listeners ---
chrome.tabs.onActivated.addListener((activeInfo) => {
    updateBadgeForTab(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    // Update badge when active tab finishes loading or starts loading a new page
    if (tab.active && (changeInfo.status === 'complete' || changeInfo.status === 'loading')) {
        // Use timeout to allow webRequest/webNavigation listeners to potentially update state first
        setTimeout(() => updateBadgeForTab(tabId), 250);
    }
});

// onRemoved (MODIFIED to also clear PSI state)
chrome.tabs.onRemoved.addListener(async (tabId) => {
    console.log(`[onRemoved] Tab ${tabId} closed. Clearing ALL associated state.`);
    const tabKey = getTabStorageKey(tabId);
    const crawlKey = getCrawlStorageKey(tabId);
    const psiKey = getPsiStorageKey(tabId); // <-- Get PSI key

    // Clear caches
    delete tabsCache[tabId];
    if (crawlStatesCache[tabId]) crawlStatesCache[tabId].isRunning = false; // Stop crawl if running
    delete crawlStatesCache[tabId];

    // Clear all related storage keys
    await removeSessionData([tabKey, crawlKey, psiKey]); // <-- Clear PSI key from storage
});

// --- Periodic Cleanup Alarm ---
chrome.alarms.create('tabDataCleanup', { periodInMinutes: 15 });

chrome.alarms.onAlarm.addListener(async (alarm) => {
    if (alarm.name === 'tabDataCleanup') {
        console.log('[Alarms] Running tab data cleanup...');
        try {
            const currentTabs = await chrome.tabs.query({});
            const openTabIds = new Set(currentTabs.map(t => t.id));
            const sessionData = await chrome.storage.session.get(null); // Get all session data
            const keysToRemove = [];
            let cleanedCount = 0;

            for (const key in sessionData) {
                // Check for navigation, crawl, AND PSI state keys
                if (key.startsWith('tabState_') || key.startsWith('crawlState_') || key.startsWith('psiState_')) {
                    const tabIdStr = key.split('_')[1];
                    const tabId = parseInt(tabIdStr, 10);
                    // If tabId is valid and not currently open
                    if (!isNaN(tabId) && !openTabIds.has(tabId)) {
                        keysToRemove.push(key);
                        // Also clear from in-memory caches just in case
                        delete tabsCache[tabId];
                        delete crawlStatesCache[tabId];
                        cleanedCount++;
                    }
                }
            }
            if (keysToRemove.length > 0) {
                await removeSessionData(keysToRemove);
                console.log(`[Alarms] Cleanup complete. Removed stored data for ${cleanedCount} stale tabs.`);
            } else {
                // console.log("[Alarms] Cleanup complete. No stale tab data found in storage.");
            }

        } catch (e) {
            console.error("[Alarms] Error during tab data cleanup:", e);
        }
    }
});

// --- Extension Startup ---
chrome.runtime.onStartup.addListener(() => {
    console.log("[onStartup] Extension starting. Clearing in-memory caches.");
    // Clear only in-memory caches on startup, session storage persists
    Object.keys(tabsCache).forEach(tabId => delete tabsCache[tabId]);
    Object.keys(crawlStatesCache).forEach(tabId => delete crawlStatesCache[tabId]);
});