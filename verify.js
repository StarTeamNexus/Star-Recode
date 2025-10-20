(function () {
  'use strict';
  
  const CONFIG = {
    TARGET_URL: "/h.html",
    OPEN_IN_BLANK: true,
    REQUIRED_EXTENSIONS: 1,
    EXTENSION_URLS: [
      "chrome-extension://dikiaagfielfbnbbopidjjagldjopbpa/js/background.js"
    ],
    SESSION_KEY: "st-session",
    FINGERPRINT_KEY: "st-fp",
    SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 hours
    DEVTOOLS_CHECK_INTERVAL: 1000, // 1 second
    REVALIDATION_INTERVAL: 5 * 60 * 1000 // 5 minutes
  };

  const STATE = {
    detectedExtensions: 0,
    lastValidation: 0
  };

  // Generate a unique device identifier
  function getDeviceId() {
    const components = [
      navigator.userAgent,
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency || 'unknown',
      navigator.platform
    ].join('|');
    
    let hash = 0;
    for (let i = 0; i < components.length; i++) {
      const char = components.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36);
  }

  // Session Management
  function createSession() {
    const session = {
      id: Math.random().toString(36).substring(2) + Date.now().toString(36),
      expiry: Date.now() + CONFIG.SESSION_DURATION,
      deviceId: getDeviceId()
    };
    
    try {
      sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
      sessionStorage.setItem(CONFIG.FINGERPRINT_KEY, session.deviceId);
    } catch (e) {
      return false;
    }
    return true;
  }

  function checkSession() {
    try {
      const storedFp = sessionStorage.getItem(CONFIG.FINGERPRINT_KEY);
      const session = JSON.parse(sessionStorage.getItem(CONFIG.SESSION_KEY) || '{}');
      
      if (!storedFp || !session.expiry || !session.deviceId) {
        return false;
      }

      if (storedFp !== session.deviceId || Date.now() > session.expiry) {
        clearSession();
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(CONFIG.SESSION_KEY);
      sessionStorage.removeItem(CONFIG.FINGERPRINT_KEY);
    } catch (e) {}
  }

  // Extension Detection
  function checkExtension(url) {
    return new Promise((resolve) => {
      const img = new Image();
      let done = false;

      const finish = (result) => {
        if (!done) {
          done = true;
          resolve(result);
        }
      };

      img.onload = () => finish(true);
      img.onerror = () => finish(false);
      
      img.src = url + '?t=' + Date.now();
      setTimeout(() => finish(false), 1000);
    });
  }

  async function verifyExtensions() {
    try {
      const results = await Promise.all(CONFIG.EXTENSION_URLS.map(checkExtension));
      return results.filter(Boolean).length;
    } catch (e) {
      return 0;
    }
  }

  // DevTools Detection
  function checkDevTools() {
    const threshold = 160;
    const widthDiff = window.outerWidth - window.innerWidth > threshold;
    const heightDiff = window.outerHeight - window.innerHeight > threshold;
    
    if (widthDiff || heightDiff) {
      clearSession();
      location.reload();
      return true;
    }
    return false;
  }

  // Page Navigation
  function isIndexPage() {
    const path = location.pathname;
    return path === '/' || path === '/index.html' || path === '';
  }

  function goToIndex() {
    if (!isIndexPage()) {
      location.href = '/index.html';
    }
  }

  function openTarget() {
    if (CONFIG.OPEN_IN_BLANK) {
      const win = window.open('about:blank', '_blank');
      if (win) {
        win.document.write(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width">
              <style>
                body, html { margin: 0; padding: 0; height: 100%; }
                iframe { border: 0; width: 100%; height: 100%; }
              </style>
            </head>
            <body>
              <iframe src="${CONFIG.TARGET_URL}"></iframe>
            </body>
          </html>
        `);
        win.document.close();
      }
    } else {
      location.href = CONFIG.TARGET_URL;
    }
  }

  // Main Verification Process
  async function runVerification() {
    STATE.detectedExtensions = await verifyExtensions();
    STATE.lastValidation = Date.now();
    
    if (STATE.detectedExtensions >= CONFIG.REQUIRED_EXTENSIONS) {
      if (createSession()) {
        openTarget();
      }
    }
  }

  // Anti-Debug Protection
  function setupProtection() {
    // DevTools monitoring
    setInterval(checkDevTools, CONFIG.DEVTOOLS_CHECK_INTERVAL);
    
    // Block right-click
    document.addEventListener('contextmenu', e => e.preventDefault());
    
    // Block common debug shortcuts
    document.addEventListener('keydown', e => {
      if (
        e.keyCode === 123 || // F12
        (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) || // Ctrl+Shift+I/J
        (e.ctrlKey && e.keyCode === 85) // Ctrl+U
      ) {
        e.preventDefault();
        return false;
      }
    });
  }

  // Initialization
  function initialize() {
    setupProtection();

    if (isIndexPage()) {
      if (!checkSession()) {
        runVerification();
      }
    } else if (!checkSession()) {
      goToIndex();
    }
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
