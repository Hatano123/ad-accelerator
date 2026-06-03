// YouTube Ad Accelerator Popup Script

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const enableToggle = document.getElementById('enable-toggle');
  const adsCounter = document.getElementById('ads-counter');
  const timeCounter = document.getElementById('time-counter');
  const speedSlider = document.getElementById('speed-slider');
  const speedValue = document.getElementById('speed-value');
  const muteCheckbox = document.getElementById('mute-checkbox');
  const skipCheckbox = document.getElementById('skip-checkbox');
  const resetStatsBtn = document.getElementById('reset-stats-btn');

  // Load configuration and statistics from chrome.storage
  function loadSettings() {
    chrome.storage.local.get({
      isEnabled: true,
      speedLimit: 5, // Default is now 5x to prevent browser overload
      autoMute: true,
      autoSkip: true,
      adsAccelerated: 0,
      timeSaved: 0
    }, (settings) => {
      enableToggle.checked = settings.isEnabled;
      speedSlider.value = settings.speedLimit;
      speedValue.textContent = `${settings.speedLimit}x`;
      muteCheckbox.checked = settings.autoMute;
      skipCheckbox.checked = settings.autoSkip;
      
      updateStatsUI(settings.adsAccelerated, settings.timeSaved);
    });
  }

  // Helper to format saved time in Japanese format
  function formatTimeSaved(totalSeconds) {
    if (totalSeconds <= 0) return '0秒';
    if (totalSeconds < 60) {
      return `${totalSeconds.toFixed(1)}秒`;
    }
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return `${minutes}分${seconds}秒`;
  }

  // Update statistics elements in UI
  function updateStatsUI(adsCount, timeSavedSeconds) {
    adsCounter.textContent = adsCount.toLocaleString();
    timeCounter.textContent = formatTimeSaved(timeSavedSeconds);
  }

  // Save specific settings to storage
  function saveSetting(key, value) {
    chrome.storage.local.set({ [key]: value }, () => {
      console.log(`[Ad Accelerator UI] Saved setting: ${key} = ${value}`);
    });
  }

  // Setup UI Event Listeners
  enableToggle.addEventListener('change', (e) => {
    saveSetting('isEnabled', e.target.checked);
  });

  speedSlider.addEventListener('input', (e) => {
    const value = parseInt(e.target.value, 10);
    speedValue.textContent = `${value}x`;
  });

  speedSlider.addEventListener('change', (e) => {
    const value = parseInt(e.target.value, 10);
    saveSetting('speedLimit', value);
  });

  muteCheckbox.addEventListener('change', (e) => {
    saveSetting('autoMute', e.target.checked);
  });

  skipCheckbox.addEventListener('change', (e) => {
    saveSetting('autoSkip', e.target.checked);
  });

  resetStatsBtn.addEventListener('click', () => {
    if (confirm('統計データをリセットしますか？')) {
      chrome.storage.local.set({
        adsAccelerated: 0,
        timeSaved: 0
      }, () => {
        updateStatsUI(0, 0);
        resetStatsBtn.style.transform = 'scale(0.95)';
        setTimeout(() => {
          resetStatsBtn.style.transform = '';
        }, 150);
      });
    }
  });

  // Load initial settings
  loadSettings();

  // Periodically refresh stats (every 500ms) to show real-time changes
  const statsInterval = setInterval(() => {
    chrome.storage.local.get({
      adsAccelerated: 0,
      timeSaved: 0
    }, (stats) => {
      updateStatsUI(stats.adsAccelerated, stats.timeSaved);
    });
  }, 500);

  // Clean up interval when window is closed
  window.addEventListener('unload', () => {
    clearInterval(statsInterval);
  });
});
