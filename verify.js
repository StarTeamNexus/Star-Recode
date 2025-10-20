(function () {
  'use strict';
  
  // === CONFIGURATION ===
  const CONFIG = Object.freeze({
    // Target Settings
    TARGET_URL: "/h.html",
    OPEN_IN_BLANK: true,
    
    // Page Settings
    VERIFICATION_PAGE: "index.html",
    
    // Extension Detection
    REQUIRED_EXTENSIONS: 1,
    EXTENSION_URLS: [
      "chrome-extension://dikiaagfielfbnbbopidjjagldjopbpa/js/background.js"
    ],
    
    // Session Management
    SESSION_KEY: "ext-verify-session",
    FINGERPRINT_KEY: "ext-verify-fp",
    SESSION_DURATION: 24 * 60 * 60 * 1000,
    
    // Security Settings 
    DEVTOOLS_CHECK_INTERVAL: 1000,
    REVALIDATION_INTERVAL: 5 * 60 * 1000
  });

  // === STATE ===
  const STATE = {
    detectedExtensions: 0,
    verificationComplete: false,
    deviceFingerprint: null,
    devToolsOpen: false,
    lastValidation: 0
  };

  // === UTILITY FUNCTIONS ===
  function generateSecureToken(length = 64) {
    try {
      const array = new Uint8Array(length);
      crypto.getRandomValues(array);
      return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      console.error('Failed to generate secure token:', e);
      return null;
    }
  }

  function generateDeviceFingerprint() {
    try {
      const components = [
        navigator.userAgent,
        navigator.language,
        screen.colorDepth,
        `${screen.width}x${screen.height}`,
        new Date().getTimezoneOffset(),
        'sessionStorage' in window,
        'localStorage' in window,
        navigator.hardwareConcurrency || 'unknown',
        navigator.platform,
        'ontouchstart' in window,
        navigator.maxTouchPoints,
        navigator.deviceMemory || 'unknown'
      ];
      
      const fingerprintStr = components.join('|');
      let hash = 0;
      
      for (let i = 0; i < fingerprintStr.length; i++) {
        const char = fingerprintStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      
      return `${hash.toString(36)}${generateSecureToken(16)}`;
    } catch (e) {
      console.error('Failed to generate device fingerprint:', e);
      return null;
    }
  }

  // Session management
  function checkSession() {
    try {
      const storedFingerprint = sessionStorage.getItem(CONFIG.FINGERPRINT_KEY);
      const session = sessionStorage.getItem(CONFIG.SESSION_KEY);
      
      if (!session || !storedFingerprint) {
        return false;
      }

      const currentFingerprint = generateDeviceFingerprint();
      if (!currentFingerprint || storedFingerprint !== currentFingerprint) {
        clearSession();
        return false;
      }

      const sessionData = JSON.parse(session);
      if (!sessionData?.expiry) {
        return false;
      }

      if (Date.now() < sessionData.expiry) {
        if (Date.now() - STATE.lastValidation > CONFIG.REVALIDATION_INTERVAL) {
          void revalidateExtensions();
        }
        return true;
      }
    } catch (e) {
      console.error('Session check failed:', e);
    }
    
    clearSession();
    return false;
  }

  function createSession() {
    try {
      const session = {
        token: generateSecureToken(64),
        expiry: Date.now() + CONFIG.SESSION_DURATION,
        timestamp: Date.now()
      };
      
      STATE.deviceFingerprint = generateDeviceFingerprint();
      
      if (!session.token || !STATE.deviceFingerprint) {
        throw new Error('Failed to generate security tokens');
      }
      
      sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
      sessionStorage.setItem(CONFIG.FINGERPRINT_KEY, STATE.deviceFingerprint);
    } catch (e) {
      console.error('Failed to create session:', e);
      clearSession();
    }
  }

  function clearSession() {
    try {
      sessionStorage.removeItem(CONFIG.SESSION_KEY);
      sessionStorage.removeItem(CONFIG.FINGERPRINT_KEY);
    } catch (e) {
      console.error('Failed to clear session:', e);
    }
  }

  async function revalidateExtensions() {
    try {
      STATE.lastValidation = Date.now();
      const count = await detectExtensions();
      if (count < CONFIG.REQUIRED_EXTENSIONS) {
        clearSession();
        redirectToIndex();
      }
    } catch (e) {
      console.error('Extension revalidation failed:', e);
      clearSession();
      redirectToIndex();
    }
  }

  function isIndexPage() {
    try {
      const path = window.location.pathname;
      const page = path.split('/').pop() || 'index.html';
      return page === 'index.html' || page === '' || page === '/';
    } catch (e) {
      console.error('Failed to check page type:', e);
      return false;
    }
  }

  // DevTools detection
  function detectDevTools() {
    try {
      const threshold = 160;
      const widthThreshold = window.outerWidth - window.innerWidth > threshold;
      const heightThreshold = window.outerHeight - window.innerHeight > threshold;

      if ((widthThreshold || heightThreshold) && !STATE.devToolsOpen) {
        STATE.devToolsOpen = true;
        clearSession();
        redirectToIndex();
      }

      return widthThreshold || heightThreshold;
    } catch (e) {
      console.error('DevTools detection failed:', e);
      return false;
    }
  }

  function startDevToolsMonitoring() {
    try {
      setInterval(detectDevTools, CONFIG.DEVTOOLS_CHECK_INTERVAL);
    } catch (e) {
      console.error('Failed to start DevTools monitoring:', e);
    }
  }

  // Extension detection
  function checkExtensionURL(url) {
    return new Promise((resolve) => {
      const img = new Image();
      let timeout;
      const startTime = Date.now();

      function cleanup() {
        if (timeout) {
          clearTimeout(timeout);
        }
        img.onload = img.onerror = null;
      }

      img.onload = function() {
        cleanup();
        const loadTime = Date.now() - startTime;
        resolve(loadTime < 1000);
      };

      img.onerror = function() {
        cleanup();
        resolve(false);
      };

      timeout = setTimeout(() => {
        cleanup();
        resolve(false);
      }, 600);

      img.src = `${url}?nc=${Date.now()}${Math.random()}`;
    });
  }

  async function detectExtensions() {
    try {
      const results = await Promise.all(
        CONFIG.EXTENSION_URLS.map(url => checkExtensionURL(url))
      );
      return results.filter(Boolean).length;
    } catch (e) {
      console.error('Extension detection failed:', e);
      return 0;
    }
  }

  function redirectToIndex() {
    try {
      if (!isIndexPage()) {
        window.location.href = '/index.html';
      }
    } catch (e) {
      console.error('Failed to redirect:', e);
    }
  }

  function openTargetPage() {
    try {
      if (CONFIG.OPEN_IN_BLANK) {
        const blank = window.open('about:blank', '_blank');
        if (blank) {
          const html = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>Loading...</title>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <meta http-equiv="Content-Security-Policy" content="default-src 'self'; frame-src *;">
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body { width: 100%; height: 100%; overflow: hidden; }
                iframe { 
                  position: fixed;
                  top: 0;
                  left: 0;
                  width: 100%; 
                  height: 100%; 
                  border: none;
                }
              </style>
            </head>
            <body>
              <iframe src="${CONFIG.TARGET_URL}" frameborder="0" allowfullscreen></iframe>
            </body>
            </html>
          `;
          blank.document.write(html);
          blank.document.close();
        }
      } else {
        window.location.href = CONFIG.TARGET_URL;
      }
    } catch (e) {
      console.error('Failed to open target page:', e);
    }
  }

  async function runVerification() {
    try {
      STATE.detectedExtensions = await detectExtensions();
      STATE.lastValidation = Date.now();
      
      if (STATE.detectedExtensions >= CONFIG.REQUIRED_EXTENSIONS) {
        createSession();
        openTargetPage();
      }
    } catch (e) {
      console.error('Verification failed:', e);
    }
  }

  // Initialization
  function initialize() {
    try {
      startDevToolsMonitoring();
      
      document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
      });
      
      document.addEventListener('keydown', function(e) {
        if (e.keyCode === 123 || 
            (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) ||
            (e.ctrlKey && e.keyCode === 85)) {
          e.preventDefault();
          return false;
        }
      }, { passive: false });

      if (isIndexPage()) {
        if (!checkSession()) {
          void runVerification();
        }
      } else {
        if (!checkSession()) {
          redirectToIndex();
        }
      }
    } catch (e) {
      console.error('Initialization failed:', e);
    }
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }
})();
