// A Simple Antitamper I used someone else's code 

    document.addEventListener('contextmenu', function(e) {
              alert("You have been detected for attempting to Edit or Tamper Star's code")

      e.preventDefault();
    });


    document.addEventListener('keydown', function(e) {
      // Prevent F12
      if (e.key === 'F12') {
        e.preventDefault();
        alert("You have been detected for attempting to Edit or Tamper Star's code")
        window.location.href = "TamperDetected.html" //this will change when a game.html file is made
      }
      // Prevent Ctrl+Shift+I (Inspect Element)
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        alert("You have been detected for attempting to Edit or Tamper Star's code")
        window.location.href = "TamperDetected.html" //this will change when a game.html file is made
      }
      if (e.ctrlKey && e.shiftKey && e.key === 'K') {
        e.preventDefault();
        alert("You have been detected for attempting to Edit or Tamper Star's code")
        window.location.href = "TamperDetected.html" //this will change when a game.html file is made
      }
      // Prevent Ctrl+U (View Source)
      if (e.ctrlKey && e.key === 'u') {
        e.preventDefault();
        alert("You have been detected for attempting to Edit or Tamper Star's code")
        window.location.href = "TamperDetected.html" //this will change when a game.html file is made
      }
    });
