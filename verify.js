(function () {
  'use strict';
  
  // === CONFIGURATION ===
  var CONFIG = {
    // Target Settings
    TARGET_URL: "/h.html", // URL to open after verification 
    OPEN_IN_BLANK: true, // Open in about:blank embedded page
    
    // Page Settings
    VERIFICATION_PAGE: "h.html", // Only verify on this page
    
    // Extension Detection
    REQUIRED_EXTENSIONS: 1,
    EXTENSION_URLS: [
      "chrome-extension://dikiaagfielfbnbbopidjjagldjopbpa/js/background.js"
    ],
    
    // Session Management
    SESSION_KEY: "ext-verify-session",
    FINGERPRINT_KEY: "ext-verify-fp",
    SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 hours
    
    // Security Settings 
    OVERLAY_ID: "ext-verify-overlay",
    REDIRECT_DELAY: 2000,
    DEVTOOLS_CHECK_INTERVAL: 1000,
    REVALIDATION_INTERVAL: 5 * 60 * 1000 // Re-check extensions every 5 minutes
  };

  // === STATE ===
  var STATE = {
    detectedExtensions: 0,
    verificationComplete: false,
    deviceFingerprint: null,
    devToolsOpen: false,
    lastValidation: 0
  };

  // === UTILITY FUNCTIONS ===
  function generateSecureToken(length) {
    length = length || 64;
    var array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, function(byte) {
      return ('0' + byte.toString(16)).slice(-2);
    }).join('');
  }

  function generateDeviceFingerprint() {
    var components = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width + 'x' + screen.height,
      new Date().getTimezoneOffset(),
      !!window.sessionStorage,
      !!window.localStorage,
      navigator.hardwareConcurrency || 'unknown',
      navigator.platform
    ];
    
    var fingerprintStr = components.join('|');
    var hash = 0;
    for (var i = 0; i < fingerprintStr.length; i++) {
      var char = fingerprintStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(36) + generateSecureToken(16);
  }

  // Session management
  function checkSession() {
    try {
      var storedFingerprint = sessionStorage.getItem(CONFIG.FINGERPRINT_KEY);
      var session = sessionStorage.getItem(CONFIG.SESSION_KEY);
      
      if (!session || !storedFingerprint) {
        return false;
      }

      // Verify fingerprint matches
      var currentFingerprint = generateDeviceFingerprint();
      if (storedFingerprint !== currentFingerprint) {
        clearSession();
        return false;
      }

      var sessionData = JSON.parse(session);
      if (!sessionData.expiry) {
        return false;
      }

      if (Date.now() < sessionData.expiry) {
        if (Date.now() - STATE.lastValidation > CONFIG.REVALIDATION_INTERVAL) {
          revalidateExtensions();
        }
        return true;
      }
    } catch (e) {}
    
    clearSession();
    return false;
  }

  function createSession() {
    var session = {
      token: generateSecureToken(64),
      expiry: Date.now() + CONFIG.SESSION_DURATION,
      timestamp: Date.now()
    };
    
    STATE.deviceFingerprint = generateDeviceFingerprint();
    
    sessionStorage.setItem(CONFIG.SESSION_KEY, JSON.stringify(session));
    sessionStorage.setItem(CONFIG.FINGERPRINT_KEY, STATE.deviceFingerprint);
  }

  function clearSession() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    sessionStorage.removeItem(CONFIG.FINGERPRINT_KEY);
  }

  // Extension validation
  async function revalidateExtensions() {
    STATE.lastValidation = Date.now();
    var count = await detectExtensions();
    if (count < CONFIG.REQUIRED_EXTENSIONS) {
      clearSession();
      if (!isVerificationPage()) {
        window.location.reload();
      }
    }
  }

  function isVerificationPage() {
    var path = window.location.pathname;
    var page = path.split('/').pop() || 'index.html';
    
    return page === CONFIG.VERIFICATION_PAGE || 
           page === '' || 
           page === '/' ||
           path.endsWith('/' + CONFIG.VERIFICATION_PAGE) ||
           path === '/' + CONFIG.VERIFICATION_PAGE;
  }

  // DevTools detection
  function detectDevTools() {
    var threshold = 160;
    var widthThreshold = window.outerWidth - window.innerWidth > threshold;
    var heightThreshold = window.outerHeight - window.innerHeight > threshold;

    if ((widthThreshold || heightThreshold) && !STATE.devToolsOpen) {
      STATE.devToolsOpen = true;
      clearSession();
    }

    return widthThreshold || heightThreshold;
  }

  function startDevToolsMonitoring() {
    setInterval(detectDevTools, CONFIG.DEVTOOLS_CHECK_INTERVAL);
  }

  // Extension detection
  function checkExtensionURL(url) {
    return new Promise((resolve) => {
      var img = new Image();
      var timeout;
      var startTime = Date.now();

      function cleanup() {
        clearTimeout(timeout);
        img.onload = img.onerror = null;
      }

      img.onload = function() {
        cleanup();
        var loadTime = Date.now() - startTime;
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

      img.src = url + '?nc=' + Date.now() + Math.random();
    });
  }

  async function detectExtensions() {
    var foundCount = 0;
    
    for (var i = 0; i < CONFIG.EXTENSION_URLS.length; i++) {
      if (await checkExtensionURL(CONFIG.EXTENSION_URLS[i])) {
        foundCount++;
      }
    }
    
    return foundCount;
  }

  // UI Creation
  function createOverlay() {
    var overlay = document.createElement('div');
    overlay.id = CONFIG.OVERLAY_ID;
    
    var styles = {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      background: '#000',
      zIndex: '2147483647',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Arial, sans-serif',
      margin: '0',
      padding: '0',
      color: '#fff'
    };
    
    Object.assign(overlay.style, styles);
    
    // Ensure the overlay covers everything
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    
    overlay.innerHTML = `
      <div id="verify-content" style="text-align: center;">
        <div style="font-size: 24px; margin-bottom: 20px;">Verifying...</div>
      </div>
    `;
    
    return overlay;
  }

  function showMessage(message) {
    var content = document.getElementById('verify-content');
    if (content) {
      content.innerHTML = `<div style="font-size: 24px; font-weight: 500;">${message}</div>`;
    }
  }

  function openTargetPage() {
    showMessage('Access Granted');
    
    setTimeout(() => {
      if (CONFIG.OPEN_IN_BLANK) {
        var blank = window.open('about:blank', '_blank');
        if (blank) {
          blank.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Loading...</title>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
          `);
          blank.document.close();
        }
      } else {
        window.location.href = CONFIG.TARGET_URL;
      }
      
      setTimeout(() => {
        var overlay = document.getElementById(CONFIG.OVERLAY_ID);
        if (overlay) overlay.remove();
      }, 500);
    }, 1000);
  }

  async function runVerification() {
    var overlay = createOverlay();
    document.body.appendChild(overlay);

    // Detect extensions
    STATE.detectedExtensions = await detectExtensions();
    STATE.lastValidation = Date.now();
    
    if (STATE.detectedExtensions < CONFIG.REQUIRED_EXTENSIONS) {
      showMessage('Extension Required');
      return;
    }

    // Create session and proceed
    createSession();
    openTargetPage();
  }

  function blockAndRedirect() {
    var overlay = createOverlay();
    document.body.appendChild(overlay);
    showMessage('Verification Required');

    setTimeout(() => {
      window.location.href = CONFIG.VERIFICATION_PAGE;
    }, CONFIG.REDIRECT_DELAY);
  }

  // Initialization
  function initialize() {
    startDevToolsMonitoring();
    
    // Prevent right-click and shortcuts
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
    });

    if (isVerificationPage()) {
      if (!checkSession()) {
        runVerification();
      }
    } else {
      if (!checkSession()) {
        blockAndRedirect();
      }
    }
  }

  // Start initialization
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Prevent modifications
  Object.freeze(CONFIG);
})();
