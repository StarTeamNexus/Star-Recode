       (function() {
    // Store the original functions we need to protect
    const originalConsole = window.console;
    const originalDoc = document.documentElement.outerHTML;
    
    // Aggressive console clear and override
    function disableConsole() {
        Object.defineProperty(window, 'console', {
            get: function() {
                return {
                    log: function() {},
                    debug: function() {},
                    info: function() {},
                    warn: function() {},
                    error: function() {},
                    clear: function() {},
                };
            },
            set: function() {
                return false;
            },
            configurable: false
        });
    }

    // Disable view source and various keyboard shortcuts
    document.addEventListener('keydown', function(e) {
        // Array of blocked keys
        const blockedKeys = [
            { key: 'F12', code: 123 },
            { key: 'u', ctrl: true }, // Ctrl+U
            { key: 's', ctrl: true }, // Ctrl+S
            { key: 'i', ctrlShift: true }, // Ctrl+Shift+I
            { key: 'j', ctrlShift: true }, // Ctrl+Shift+J
            { key: 'c', ctrlShift: true }, // Ctrl+Shift+C
        ];

        const isBlocked = blockedKeys.some(blocked => {
            if (blocked.ctrl && e.ctrlKey && e.key.toLowerCase() === blocked.key) return true;
            if (blocked.ctrlShift && e.ctrlKey && e.shiftKey && e.key.toLowerCase() === blocked.key) return true;
            if (blocked.code && e.keyCode === blocked.code) return true;
            if (blocked.key === e.key) return true;
            return false;
        });

        if (isBlocked) {
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true);

    // Disable right-click
    document.addEventListener('contextmenu', function(e) {
        e.preventDefault();
        return false;
    }, true);

    // Anti-debugging techniques
    function antiDebug() {
        const start = performance.now();
        debugger;
        const end = performance.now();
        
        if (end - start > 100) {
            // Detected debugging - take action
            window.location.reload(true);
        }
    }

    // Source code protection
    function protectSource() {
        Object.defineProperty(document, 'documentElement', {
            get: function() {
                return Object.create(Element.prototype);
            }
        });
    }

    // Aggressive DevTools detection
    function detectDevTools() {
        const threshold = 160;
        const element = document.createElement('div');
        
        Object.defineProperty(element, 'id', {
            get: function() {
                window.location.reload(true);
                return null;
            }
        });
        
        console.log(element);
        console.clear();
    }

    // Self-healing protection system
    function protectionSystem() {
        // Run continuous checks
        setInterval(() => {
            // Check if console has been restored
            if (window.console !== undefined && window.console.log.toString().indexOf('native') !== -1) {
                disableConsole();
            }
            
            // Run anti-debug
            antiDebug();
            
            // Check for DevTools
            detectDevTools();
            
            // Re-apply source protection
            protectSource();
        }, 50);
    }

    // Initialize all protections
    (function initialize() {
        disableConsole();
        protectSource();
        protectionSystem();
        
        // Break debugging capabilities
        setInterval(() => {
            debugger;
        }, 1);
        
        // Additional source view prevention
        document.onkeydown = function(e) {
            if (e.key === 'u' && e.ctrlKey) return false;
            if (e.key === 's' && e.ctrlKey) return false;
        };
        
        // Prevent selecting text
        document.onselectstart = function(e) { 
            e.preventDefault();
            return false;
        };
        
        // Disable copy
        document.oncopy = function(e) {
            e.preventDefault();
            return false;
        };
        
        // Clear any existing console history
        console.clear();
    })();
})();
