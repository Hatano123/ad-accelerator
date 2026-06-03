// YouTube Ad Accelerator Content Script (Robust + Loop Protection + 5x Default)

let isAdMode = false;
let hasSkippedCurrentAd = false; // Prevents infinite skip trigger loops
let originalSpeed = 1.0;
let originalMuted = false;
let adStartTime = 0;
let activeVideoElement = null;

// Default configuration (speedLimit default is now 5)
let config = {
  isEnabled: true,
  speedLimit: 5,
  autoSkip: true,
  autoMute: true
};

// Retrieve configuration from storage
chrome.storage.local.get(['isEnabled', 'speedLimit', 'autoSkip', 'autoMute'], (result) => {
  if (result.isEnabled !== undefined) config.isEnabled = result.isEnabled;
  if (result.speedLimit !== undefined) config.speedLimit = result.speedLimit;
  if (result.autoSkip !== undefined) config.autoSkip = result.autoSkip;
  if (result.autoMute !== undefined) config.autoMute = result.autoMute;
  
  console.log("[Ad Accelerator] Initialized config:", config);
  runAccelerator();
});

// Watch for configuration changes from popup
chrome.storage.onChanged.addListener((changes) => {
  for (let key in changes) {
    if (changes[key] && changes[key].newValue !== undefined) {
      config[key] = changes[key].newValue;
    }
  }
  runAccelerator();
});

// Helper: Check if an ad is currently playing
function isAdActive() {
  const player = document.querySelector('.html5-video-player, #movie_player');
  if (player && (player.classList.contains('ad-showing') || player.classList.contains('ad-interrupting'))) {
    return true;
  }
  
  const videoAds = document.querySelector('.video-ads');
  if (videoAds && videoAds.children.length > 0) {
    return true;
  }

  const adOverlay = document.querySelector('.ytp-ad-player-overlay, .ytp-ad-player-overlay-layout, .ytp-ad-message-container, .ytp-ad-overlay-container');
  if (adOverlay && (adOverlay.offsetWidth > 0 || adOverlay.offsetHeight > 0)) {
    return true;
  }

  return false;
}

// Helper: Deep Query Selector to find elements inside Shadow DOMs
function querySelectorAllDeep(selector, root = document) {
  const elements = Array.from(root.querySelectorAll(selector));
  const children = root.querySelectorAll('*');
  for (const child of children) {
    if (child.shadowRoot) {
      elements.push(...querySelectorAllDeep(selector, child.shadowRoot));
    }
  }
  return elements;
}

// Helper: Click any skip buttons that are visible (including inside Shadow DOM)
function clickSkipButtons() {
  const skipSelectors = [
    '.ytp-ad-skip-button',
    '.ytp-ad-skip-button-modern',
    '.ytp-skip-ad-button',
    '.ytp-ad-skip-button-renderer',
    'button[class*="skip-ad"]',
    'div[class*="skip-ad"]',
    '.ytp-ad-skip-button-container',
    'ytp-skip-ad-button',
    'button[aria-label^="Skip ad"]',
    'button[aria-label*="スキップ"]'
  ];

  for (const selector of skipSelectors) {
    const elements = querySelectorAllDeep(selector);
    for (const element of elements) {
      if (element && (element.offsetWidth > 0 || element.offsetHeight > 0)) {
        console.log("[Ad Accelerator] Skip button found:", selector);
        try {
          element.click();
          
          const bubbleProps = { bubbles: true, cancelable: true, view: window };
          element.dispatchEvent(new PointerEvent('pointerdown', bubbleProps));
          element.dispatchEvent(new MouseEvent('mousedown', bubbleProps));
          element.dispatchEvent(new PointerEvent('pointerup', bubbleProps));
          element.dispatchEvent(new MouseEvent('mouseup', bubbleProps));
          element.dispatchEvent(new MouseEvent('click', bubbleProps));
          
          console.log("[Ad Accelerator] Auto-clicked skip button");
          return true;
        } catch (e) {
          console.error("[Ad Accelerator] Error clicking skip button:", e);
        }
      }
    }
  }
  return false;
}

// Bind event listeners to video elements to track user changes to speed/mute
// AND synchronously intercept YouTube's attempts to reset the speed/volume during ads
function bindVideoEvents(video) {
  if (activeVideoElement === video) return;
  activeVideoElement = video;
  
  console.log("[Ad Accelerator] Hooked new video element:", video);

  // Synchronously intercept playback rate changes
  video.addEventListener('ratechange', () => {
    if (!config.isEnabled) return;
    
    const adActive = isAdActive();
    if (adActive) {
      if (video.playbackRate !== config.speedLimit) {
        video.playbackRate = config.speedLimit;
      }
    } else {
      if (video.playbackRate !== config.speedLimit) {
        originalSpeed = video.playbackRate;
      }
    }
  });

  // Synchronously intercept mute changes
  video.addEventListener('volumechange', () => {
    if (!config.isEnabled) return;

    const adActive = isAdActive();
    if (adActive && config.autoMute) {
      if (!video.muted) {
        video.muted = true;
      }
    } else if (!adActive) {
      originalMuted = video.muted;
    }
  });
}

// Restore normal speed and mute state
function restoreNormalState() {
  const video = document.querySelector('.html5-main-video, video');
  if (video) {
    if (originalSpeed >= config.speedLimit) {
      originalSpeed = 1.0;
    }
    
    video.playbackRate = originalSpeed;
    
    if (config.autoMute) {
      video.muted = originalMuted;
    }
    console.log("[Ad Accelerator] Restored normal video. Speed:", originalSpeed, "Mute:", originalMuted);
  }
}

// Main execution function
function runAccelerator() {
  if (!config.isEnabled) {
    if (isAdMode) {
      restoreNormalState();
      isAdMode = false;
      hasSkippedCurrentAd = false;
    }
    return;
  }

  const activeAd = isAdActive();
  const video = document.querySelector('.html5-main-video, video');

  if (!video) return;

  // Bind speed/mute change listeners to the current video
  bindVideoEvents(video);

  if (activeAd) {
    if (!isAdMode) {
      // Ad started!
      isAdMode = true;
      adStartTime = performance.now();
      hasSkippedCurrentAd = false; // Reset skip state for the new ad
      
      if (video.playbackRate !== config.speedLimit) {
        originalSpeed = video.playbackRate;
      }
      originalMuted = video.muted;
      
      console.log(`[Ad Accelerator] Ad detected! Original speed: ${originalSpeed}, Muted: ${originalMuted}`);
    }

    // 1. Accelerate playback rate
    if (video.playbackRate !== config.speedLimit) {
      video.playbackRate = config.speedLimit;
    }

    // 2. Mute video if configured
    if (config.autoMute && !video.muted) {
      video.muted = true;
    }

    // 3. Auto skip features (ensured to run once per ad via loop-protection)
    if (config.autoSkip && !hasSkippedCurrentAd) {
      let isSkipped = false;
      
      // Step A: Attempt to instantly skip by setting playhead to the end
      try {
        if (video.duration && !isNaN(video.duration) && isFinite(video.duration)) {
          if (video.currentTime < video.duration - 0.2) {
            video.currentTime = video.duration - 0.1;
            isSkipped = true;
            console.log("[Ad Accelerator] Fast-forwarded ad to end. CurrentTime:", video.currentTime);
          }
        }
      } catch (err) {
        console.error("[Ad Accelerator] Error setting currentTime:", err);
      }

      // Step B: Also attempt to click the skip button
      const buttonClicked = clickSkipButtons();
      if (buttonClicked) {
        isSkipped = true;
      }
      
      if (isSkipped) {
        hasSkippedCurrentAd = true; // Mark as skipped to prevent repeated attempts on this ad instance
      }
    }
  } else {
    // No ad playing
    if (isAdMode) {
      // Ad just finished!
      restoreNormalState();
      
      const adEndTime = performance.now();
      const realElapsedTime = (adEndTime - adStartTime) / 1000; // seconds
      const estimatedSavedTime = realElapsedTime * (config.speedLimit - 1);
      
      // Save stats
      if (estimatedSavedTime > 0) {
        chrome.storage.local.get({ adsAccelerated: 0, timeSaved: 0 }, (stats) => {
          chrome.storage.local.set({
            adsAccelerated: stats.adsAccelerated + 1,
            timeSaved: stats.timeSaved + estimatedSavedTime
          });
        });
      }
      
      isAdMode = false;
      hasSkippedCurrentAd = false;
    }
  }
}

// Periodic check loop
setInterval(runAccelerator, 150);

// Setup Mutation Observer to trigger on DOM updates
const observer = new MutationObserver(() => {
  runAccelerator();
});

// Start observer when the document is ready
if (document.body) {
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
} else {
  document.addEventListener('DOMContentLoaded', () => {
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });
}
