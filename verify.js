(function () {
  'use strict';
  
  // === CONFIGURATION ===
  var CONFIG = {
    // Security Settings
    PASSPHRASE: "Star", // Change this to your secret passphrase
    ALLOWED_IPS: [
      // Add allowed IP addresses here (leave empty to allow all)
      // "192.168.1.100",
      // "10.0.0.50"
    ],
    
    // Target Settings
    TARGET_URL: "/h.html", // URL to open after verification
    OPEN_IN_BLANK: true, // Open in about:blank embedded page
    
    // Page Settings
    VERIFICATION_PAGE: "index.html", // Only verify on this page
    
    // Extension Detection - Just add Chrome extension URLs
    REQUIRED_EXTENSIONS: 1, // Now requires 2 extensions
    EXTENSION_URLS: [
      "chrome-extension://dikiaagfielfbnbbopidjjagldjopbpa/js/background.js"
    ],
    
    // Session Management
    SESSION_KEY: "ext-verify-session",
    FINGERPRINT_KEY: "ext-verify-fp",
    SESSION_DURATION: 24 * 60 * 60 * 1000, // 24 hours
    
    // Security Settings
    OVERLAY_ID: "ext-verify-overlay",
    MAX_PASSPHRASE_ATTEMPTS: 3,
    LOCKOUT_DURATION: 60 * 60 * 1000, // 1 hour lockout after max attempts
    REDIRECT_DELAY: 2000,
    DEVTOOLS_CHECK_INTERVAL: 1000,
    REVALIDATION_INTERVAL: 5 * 60 * 1000 // Re-check extensions every 5 minutes
  };

  // === STATE ===
  var STATE = {
    userIP: null,
    detectedExtensions: 0,
    passphraseAttempts: 0,
    verificationComplete: false,
    deviceFingerprint: null,
    devToolsOpen: false,
    lastValidation: 0,
    locked: false
  };

  // === ANTI-TAMPERING ===
  var INTEGRITY = {
    configHash: null,
    scriptIntegrity: true
  };

  // Calculate initial config hash
  (function() {
    var configStr = JSON.stringify(CONFIG);
    var hash = 0;
    for (var i = 0; i < configStr.length; i++) {
      hash = ((hash << 5) - hash) + configStr.charCodeAt(i);
      hash = hash & hash;
    }
    INTEGRITY.configHash = hash;
  })();

  // === ADVANCED UTILITY FUNCTIONS ===
  
  // Secure random token generation with high entropy
  function generateSecureToken(length) {
    length = length || 64;
    var array = new Uint8Array(length);
    crypto.getRandomValues(array);
    return Array.from(array, function(byte) {
      return ('0' + byte.toString(16)).slice(-2);
    }).join('');
  }

  // Device fingerprinting for session binding
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

  // Simple encryption for session data
  function encryptData(data, key) {
    var jsonStr = JSON.stringify(data);
    var encrypted = '';
    for (var i = 0; i < jsonStr.length; i++) {
      encrypted += String.fromCharCode(jsonStr.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(encrypted);
  }

  function decryptData(encrypted, key) {
    try {
      var decrypted = atob(encrypted);
      var original = '';
      for (var i = 0; i < decrypted.length; i++) {
        original += String.fromCharCode(decrypted.charCodeAt(i) ^ key.charCodeAt(i % key.length));
      }
      return JSON.parse(original);
    } catch (e) {
      return null;
    }
  }

  // Check if user is locked out
  function checkLockout() {
    try {
      var lockout = sessionStorage.getItem('ext-verify-lockout');
      if (lockout) {
        var lockoutTime = parseInt(lockout, 10);
        if (Date.now() < lockoutTime) {
          STATE.locked = true;
          return true;
        } else {
          sessionStorage.removeItem('ext-verify-lockout');
        }
      }
    } catch (e) {}
    return false;
  }

  function setLockout() {
    STATE.locked = true;
    sessionStorage.setItem('ext-verify-lockout', (Date.now() + CONFIG.LOCKOUT_DURATION).toString());
    // Clear all verification data
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    sessionStorage.removeItem(CONFIG.FINGERPRINT_KEY);
  }

  // Session management with fingerprint binding
  function checkSession() {
    if (checkLockout()) {
      return false;
    }

    try {
      var encryptedSession = sessionStorage.getItem(CONFIG.SESSION_KEY);
      var storedFingerprint = sessionStorage.getItem(CONFIG.FINGERPRINT_KEY);
      
      if (!encryptedSession || !storedFingerprint) {
        return false;
      }

      // Verify fingerprint matches
      var currentFingerprint = generateDeviceFingerprint();
      if (storedFingerprint !== currentFingerprint) {
        // Session hijacking attempt detected
        clearSession();
        return false;
      }

      var session = decryptData(encryptedSession, CONFIG.PASSPHRASE);
      if (!session || !session.token || !session.expiry) {
        return false;
      }

      if (Date.now() < session.expiry) {
        // Periodically revalidate extensions
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
      timestamp: Date.now(),
      integrity: INTEGRITY.configHash
    };
    
    STATE.deviceFingerprint = generateDeviceFingerprint();
    
    var encrypted = encryptData(session, CONFIG.PASSPHRASE);
    sessionStorage.setItem(CONFIG.SESSION_KEY, encrypted);
    sessionStorage.setItem(CONFIG.FINGERPRINT_KEY, STATE.deviceFingerprint);
  }

  function clearSession() {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
    sessionStorage.removeItem(CONFIG.FINGERPRINT_KEY);
  }

  // Revalidate extensions in background
  async function revalidateExtensions() {
    STATE.lastValidation = Date.now();
    var count = await detectExtensions();
    if (count < CONFIG.REQUIRED_EXTENSIONS) {
      // Extensions removed - invalidate session
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

  // === DEVTOOLS DETECTION ===
  function detectDevTools() {
    var threshold = 160;
    var devtools = {
      isOpen: false,
      orientation: null
    };

    var widthThreshold = window.outerWidth - window.innerWidth > threshold;
    var heightThreshold = window.outerHeight - window.innerHeight > threshold;

    if (widthThreshold) {
      devtools.isOpen = true;
      devtools.orientation = 'vertical';
    } else if (heightThreshold) {
      devtools.isOpen = true;
      devtools.orientation = 'horizontal';
    }

    if (devtools.isOpen && !STATE.devToolsOpen) {
      STATE.devToolsOpen = true;
      // Optional: Clear session on devtools detection
      // clearSession();
    }

    return devtools.isOpen;
  }

  // Start devtools monitoring
  function startDevToolsMonitoring() {
    setInterval(detectDevTools, CONFIG.DEVTOOLS_CHECK_INTERVAL);
  }

  // === IP CHECK ===
  async function checkIP() {
    if (CONFIG.ALLOWED_IPS.length === 0) {
      return true;
    }

    try {
      var response = await fetch('https://api.ipify.org?format=json', {
        method: 'GET',
        cache: 'no-cache'
      });
      var data = await response.json();
      STATE.userIP = data.ip;
      return CONFIG.ALLOWED_IPS.includes(data.ip);
    } catch (e) {
      console.error('IP check failed:', e);
      return false;
    }
  }

  // === EXTENSION DETECTION ===
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
        // Add timing check to prevent false positives
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
    var results = [];
    
    for (var i = 0; i < CONFIG.EXTENSION_URLS.length; i++) {
      var found = await checkExtensionURL(CONFIG.EXTENSION_URLS[i]);
      if (found) {
        foundCount++;
        results.push(i);
      }
    }
    
    return foundCount;
  }

  // === UI CREATION ===
  function createMinimalUI() {
    var overlay = document.createElement('div');
    overlay.id = CONFIG.OVERLAY_ID;
    
    var styles = {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
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
    
    overlay.innerHTML = `
      <div id="verify-content" style="text-align: center;">
        <div id="verify-input-container" style="display: none;">
          <input 
            type="password" 
            id="verify-passphrase" 
            placeholder=""
            autocomplete="off"
            onpaste="return false"
            oncut="return false"
            oncopy="return false"
            style="background: transparent; border: none; border-bottom: 2px solid #fff; color: #fff; font-size: 18px; padding: 10px; outline: none; text-align: center; width: 250px; caret-color: #fff;"
          />
        </div>
      </div>
    `;
    
    return overlay;
  }

  function createBlurOverlay() {
    var overlay = document.createElement('div');
    overlay.id = CONFIG.OVERLAY_ID;
    
    var styles = {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      background: 'rgba(0, 0, 0, 0.95)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
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
    
    document.documentElement.style.filter = 'blur(10px)';
    document.body.style.filter = 'blur(10px)';
    
    overlay.innerHTML = `
      <div style="text-align: center;">
        <div style="font-size: 24px; font-weight: 500; margin-bottom: 10px;">Verification Required</div>
        <div style="font-size: 16px; opacity: 0.8;">Redirecting to verification page...</div>
      </div>
    `;
    
    return overlay;
  }

  function showPassphraseInput() {
    var container = document.getElementById('verify-input-container');
    if (container) container.style.display = 'block';
  }

  function showMessage(message) {
    var content = document.getElementById('verify-content');
    if (content) {
      content.innerHTML = `<div style="font-size: 20px; font-weight: 500;">${message}</div>`;
    }
  }

  // === VERIFICATION FLOW ===
  async function verifyPassphrase(input) {
    if (STATE.locked) {
      showMessage('Access Locked');
      return false;
    }

    STATE.passphraseAttempts++;
    
    // Add small delay to prevent timing attacks
    await new Promise(resolve => setTimeout(resolve, 300));
    
    if (input === CONFIG.PASSPHRASE) {
      createSession();
      openTargetPage();
      return true;
    } else {
      var remaining = CONFIG.MAX_PASSPHRASE_ATTEMPTS - STATE.passphraseAttempts;
      if (remaining <= 0) {
        setLockout();
        showMessage('Access Locked');
      }
      return false;
    }
  }

  function openTargetPage() {
    showMessage('Finished. Continue...');
    
    setTimeout(() => {
      if (CONFIG.OPEN_IN_BLANK) {
        var blank = window.open('about:blank', '_blank');
        if (blank) {
          blank.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
              <title>Page</title>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                html, body { width: 100%; height: 100%; overflow: hidden; }
                embed { 
                  position: absolute;
                  top: 0;
                  left: 0;
                  width: 100%; 
                  height: 100%; 
                  border: none;
                  display: block;
                }
              </style>
            </head>
            <body>
              <embed src="${CONFIG.TARGET_URL}" type="text/html">
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
    if (checkLockout()) {
      var overlay = createMinimalUI();
      document.body.appendChild(overlay);
      showMessage('Access Locked');
      return;
    }

    var overlay = createMinimalUI();
    document.body.appendChild(overlay);

    // Step 1: Check IP
    var ipAllowed = await checkIP();
    
    if (!ipAllowed) {
      showMessage('Access Denied');
      return;
    }

    // Step 2: Detect extensions
    STATE.detectedExtensions = await detectExtensions();
    STATE.lastValidation = Date.now();
    
    if (STATE.detectedExtensions < CONFIG.REQUIRED_EXTENSIONS) {
      showMessage('Access Denied');
      return;
    }

    // Step 3: Show passphrase input
    showPassphraseInput();

    var input = document.getElementById('verify-passphrase');
    
    if (input) {
      // Prevent paste, copy, cut
      input.addEventListener('paste', function(e) { e.preventDefault(); });
      input.addEventListener('copy', function(e) { e.preventDefault(); });
      input.addEventListener('cut', function(e) { e.preventDefault(); });
      
      input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
          if (STATE.locked || STATE.passphraseAttempts >= CONFIG.MAX_PASSPHRASE_ATTEMPTS) {
            return;
          }
          verifyPassphrase(input.value);
        }
      });
      
      setTimeout(() => input.focus(), 100);
    }
  }

  // === PROTECTED PAGE CHECK ===
  function blockAndRedirect() {
    var overlay = createBlurOverlay();
    document.body.appendChild(overlay);

    setTimeout(() => {
      window.location.href = CONFIG.VERIFICATION_PAGE;
    }, CONFIG.REDIRECT_DELAY);
  }

  // === INITIALIZATION ===
  function initialize() {
    // Start security monitoring
    startDevToolsMonitoring();
    
    // Prevent right-click and common shortcuts
    document.addEventListener('contextmenu', function(e) {
      e.preventDefault();
    });
    
    document.addEventListener('keydown', function(e) {
      // Prevent F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    initialize();
  }

  // Protect against script tampering
  Object.freeze(CONFIG);
  Object.freeze(INTEGRITY);
})();
