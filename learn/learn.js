/* =========================
LEARNING PLATFORM SCRIPT
=========================

A self-contained module for a video-based learning platform that:
- Loads course modules & chapters from Supabase (with local JSON fallback)
- Embeds YouTube videos via the IFrame Player API
- Tracks user progress in localStorage
- Supports responsive UI with expandable chapter lists
- Handles errors gracefully (invalid IDs, embed restrictions, etc.)

Dependencies:
- Supabase JS client (loaded via ESM)
- YouTube IFrame Player API (dynamically injected)
- DOM elements with specific IDs (see HTML requirements below)

HTML Requirements:
- #modules-container       → Module list container
- #video-modal             → Modal wrapper for player
- #player                  → Empty div for YouTube player
- #video-title             → Video title display
- #progress-bar, #progress-text → Progress indicators
- #prev-chapter, #next-chapter → Navigation buttons
- #close-modal             → Close button
- #error-message + #error-text → Error display area
*/

/* =========================
DATA & STATE
========================= */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Initialize Supabase client (credentials sanitized)
const supabase = createClient(
  "https://nsmioyqhnefljfpmzksk.supabase.co",
  "sb_publishable_skwyA6GX4YTiiRpvF8PWFw_iHUFgXCZ"
);

// Core data structures
let learningData = { modules: [] };
let player = null;
let currentModule = null;
let currentChapter = null;
let progressData = {};
let maxWatchedTime = 0;
let updateInterval = null;
let youtubeAPIReady = false;
let pendingVideoLoad = null;

/* =========================
DATA LOADING
========================= */
/**
 * Fetches learning content from Supabase.
 * Falls back to ./learn/learning-data.json on failure.
 */
async function loadLearningData() {
  try {
    const { data, error } = await supabase
      .from("db_modules")
      .select(`
        id,
        title,
        description,
        duration,
        db_chapters (
          id,
          title,
          video_id,
          duration,
          description,
          links
        )
      `)
      .order("sort_order", { ascending: true })
      .order("sort_order", { foreignTable: "db_chapters", ascending: true });

    if (error) throw error;

    // Normalize Supabase data into expected structure
    learningData = {
      modules: data.map(module => ({
        id: module.id,
        title: module.title,
        description: module.description,
        duration: module.duration,
        chapters: (module.db_chapters || []).map(chapter => ({
          id: chapter.id,
          title: chapter.title,
          videoId: (chapter.video_id || '').trim(),
          duration: chapter.duration,
          description: chapter.description,
          links: chapter.links || []
        }))
      }))
    };

    renderModules();

  } catch (error) {
    // Fallback to local JSON
    try {
      const localResponse = await fetch("./learn/learning-data.json");
      const localData = await localResponse.json();
      learningData = {
        modules: localData.modules.map(m => ({
          ...m,
          chapters: m.chapters.map(c => ({
            ...c,
            videoId: (c.videoId || '').trim()
          }))
        }))
      };
      renderModules();
    } catch (localError) {
      showError("Failed to load learning content. Please try again later.");
    }
  }
}

/* =========================
YOUTUBE API INITIALIZATION
========================= */
/**
 * Injects YouTube IFrame API script and defines global callback.
 * Must attach onYouTubeIframeAPIReady to window for YouTube to detect it.
 */
window.onYouTubeIframeAPIReady = () => {
  youtubeAPIReady = true;
  if (pendingVideoLoad) {
    loadYouTubePlayer(pendingVideoLoad.videoId, pendingVideoLoad.startTime);
    pendingVideoLoad = null;
  }
};

// Inject YouTube API script
const tag = document.createElement('script');
tag.src = 'https://www.youtube.com/iframe_api';
const firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

/* =========================
PROGRESS MANAGEMENT
========================= */
function getChapterProgress(id) {
  return progressData[id] || { maxWatched: 0, completed: false, lastPosition: 0 };
}

function updateChapterProgress(id, time, duration) {
  if (!progressData[id]) {
    progressData[id] = { maxWatched: 0, completed: false, lastPosition: 0 };
  }

  const p = progressData[id];
  p.lastPosition = time;
  p.maxWatched = Math.max(p.maxWatched, time);
  p.completed = (p.maxWatched / duration) >= 0.9;

  localStorage.setItem('learningProgress', JSON.stringify(progressData));
}

function loadProgressFromStorage() {
  const saved = localStorage.getItem('learningProgress');
  if (saved) {
    progressData = JSON.parse(saved);
  }
}

function getChapterStatus(chapterId) {
  const progress = getChapterProgress(chapterId);
  if (progress.completed) return 'completed';
  if (progress.maxWatched > 0) return 'in-progress';
  return '';
}

/* =========================
ERROR HANDLING
========================= */
function showError(message) {
  const errorDiv = document.getElementById('error-message');
  const errorText = document.getElementById('error-text');
  if (errorText) errorText.textContent = message;
  if (errorDiv) errorDiv.classList.add('show');
}

function hideError() {
  const errorDiv = document.getElementById('error-message');
  if (errorDiv) errorDiv.classList.remove('show');
}

/* =========================
RENDER MODULES
========================= */
function renderModules() {
  const container = document.getElementById("modules-container");
  if (!container) return;

  container.innerHTML = "";

  if (!learningData.modules?.length) {
    container.innerHTML = '<p class="no-modules">No modules available.</p>';
    return;
  }

  learningData.modules.forEach((m, moduleIndex) => {
    const visibleChapters = m.chapters.slice(0, 2);
    const hiddenChapters = m.chapters.slice(2);
    const safeModuleId = `module-${String(m.id).replace(/[^a-zA-Z0-9]/g, '-')}`;

    const renderChapterCard = (chapter) => {
      const status = getChapterStatus(chapter.id);
      const badge = status
        ? `<span class="chapter-status ${status}">${status === 'completed' ? '✓ Completed' : '⏳ In Progress'}</span>`
        : '';
      const thumb = `https://img.youtube.com/vi/${chapter.videoId}/mqdefault.jpg`;
      return `
        <div class="chapter-card" onclick="playChapter('${m.id}','${chapter.id}')">
          <div class="chapter-thumbnail">
            <img src="${thumb}" alt="${chapter.title}" loading="lazy">
          </div>
          <div class="chapter-content">
            <span>${chapter.title}${badge}</span>
            <p class="chapter-description">${chapter.description}</p>
          </div>
          <div class="chapter-actions">
            <button aria-label="Play ${chapter.title}">▶</button>
          </div>
        </div>`;
    };

    const visibleHTML = visibleChapters.map(renderChapterCard).join('');
    let hiddenSection = '';

    if (hiddenChapters.length > 0) {
      const hiddenHTML = hiddenChapters.map(renderChapterCard).join('');
      hiddenSection = `
        <button class="chapters-toggle" 
                aria-expanded="false" 
                aria-controls="hidden-ch-${safeModuleId}"
                data-module="${safeModuleId}"
                data-original-text="View ${hiddenChapters.length} more chapter${hiddenChapters.length > 1 ? 's' : ''}">
          <span>View ${hiddenChapters.length} more chapter${hiddenChapters.length > 1 ? 's' : ''}</span>
          <i class="fas fa-chevron-down toggle-icon"></i>
        </button>
        <div id="hidden-ch-${safeModuleId}" class="hidden-chapters" aria-hidden="true">
          ${hiddenHTML}
        </div>`;
    }

    const card = document.createElement("div");
    card.className = `module-card module-card-${moduleIndex + 1}`;
    card.innerHTML = `
      <div class="module-header">
        <h3>${m.title}</h3>
        <p>${m.description}</p>
      </div>
      ${visibleHTML}
      ${hiddenSection}`;
    container.appendChild(card);
  });

  // Attach toggle listeners
  document.querySelectorAll('.chapters-toggle').forEach(btn => {
    btn.addEventListener('click', function () {
      const isExpanded = this.getAttribute('aria-expanded') === 'true';
      const newState = !isExpanded;
      const targetId = this.getAttribute('aria-controls');
      const target = document.getElementById(targetId);
      const icon = this.querySelector('.toggle-icon');
      const textSpan = this.querySelector('span');
      const originalText = this.getAttribute('data-original-text');

      this.setAttribute('aria-expanded', newState);
      if (target) {
        target.setAttribute('aria-hidden', !newState);
        target.classList.toggle('expanded', newState);
        if (newState) {
          target.querySelectorAll('.chapter-card').forEach((card, i) => {
            card.style.animation = `fadeIn 0.5s ease-out ${i * 0.1}s forwards`;
            card.style.opacity = '0';
            setTimeout(() => { card.style.opacity = '1'; }, 50);
          });
        }
      }
      if (icon) icon.classList.toggle('expanded', newState);
      textSpan.textContent = newState ? 'Collapse' : originalText;
    });
  });
}

/* =========================
PLAYBACK CONTROL
========================= */
/**
 * Initiates playback of a chapter.
 * @param {string|number} moduleId - ID of the parent module
 * @param {string|number} chapterId - ID of the chapter to play
 */
function playChapter(moduleId, chapterId) {
  if (!learningData.modules?.length) {
    showError("Content is still loading. Please wait.");
    return;
  }

  currentModule = learningData.modules.find(m => String(m.id) === String(moduleId));
  if (!currentModule) {
    showError("Module not found.");
    return;
  }

  currentChapter = currentModule.chapters.find(c => String(c.id) === String(chapterId));
  if (!currentChapter?.videoId) {
    showError("Chapter or video ID is missing.");
    return;
  }

  const progress = getChapterProgress(chapterId);
  maxWatchedTime = progress.maxWatched;

  const titleEl = document.getElementById('video-title');
  if (titleEl) titleEl.textContent = currentChapter.title;

  const modal = document.getElementById('video-modal');
  if (modal) modal.classList.add('active');

  hideError();
  updateNavigationButtons();

  // Clean up existing player
  if (player?.destroy) {
    player.destroy();
    player = null;
  }

  if (youtubeAPIReady) {
    loadYouTubePlayer(currentChapter.videoId, progress.lastPosition);
  } else {
    pendingVideoLoad = {
      videoId: currentChapter.videoId,
      startTime: progress.lastPosition
    };
  }
}

/* =========================
YOUTUBE PLAYER INTEGRATION
========================= */
/**
 * Creates a new YouTube player instance.
 * Validates video ID and ensures DOM container exists.
 */
function loadYouTubePlayer(videoId, startTime = 0) {
  if (!youtubeAPIReady) {
    showError('YouTube API is initializing. Please wait.');
    return;
  }

  const cleanVideoId = (videoId || '').trim();
  if (!/^[a-zA-Z0-9_-]{11}$/.test(cleanVideoId)) {
    showError(`Invalid video ID format.`);
    return;
  }

  const playerContainer = document.getElementById('player');
  if (!playerContainer) {
    showError("Player container not found in DOM.");
    return;
  }

  const origin = window.location.origin || 'http://localhost';

  try {
    player = new YT.Player('player', {
      height: '100%',
      width: '100%',
      videoId: cleanVideoId,
      host: 'https://www.youtube-nocookie.com',
      playerVars: {
        autoplay: 1,
        start: Math.floor(startTime),
        rel: 0,
        modestbranding: 1,
        origin: origin,
        enablejsapi: 1,
        playsinline: 1
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
        onError: onPlayerError
      }
    });
  } catch (e) {
    showError('Failed to initialize video player.');
  }
}

function onPlayerReady() {
  hideError();
  startProgressTracking();
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    hideError();
    startProgressTracking();
  } else if (event.data === YT.PlayerState.ENDED) {
    stopProgressTracking();
    autoAdvanceToNext();
  } else {
    stopProgressTracking();
  }
}

function onPlayerError(event) {
  stopProgressTracking();
  let msg = 'An error occurred while loading the video.';
  switch (event.data) {
    case 2:   msg = 'Invalid video ID.'; break;
    case 5:   msg = 'Player error. Please refresh.'; break;
    case 100: msg = 'Video not found or removed.'; break;
    case 101:
    case 150: msg = 'This video cannot be embedded. Watch on YouTube.'; break;
    default:  msg += ` (Code: ${event.data})`;
  }
  showError(msg);
}

/* =========================
PROGRESS TRACKING
========================= */
function startProgressTracking() {
  if (updateInterval) return;
  updateInterval = setInterval(() => {
    if (!player || !currentChapter) return;
    const time = player.getCurrentTime();
    if (typeof time === 'number' && !isNaN(time)) {
      maxWatchedTime = Math.max(maxWatchedTime, time);
      updateChapterProgress(currentChapter.id, time, currentChapter.duration);
      updateProgressDisplay();
    }
  }, 1000);
}

function stopProgressTracking() {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
}

function updateProgressDisplay() {
  const pct = Math.min(100, Math.round((maxWatchedTime / currentChapter.duration) * 100));
  const textEl = document.getElementById('progress-text');
  const barEl = document.getElementById('progress-bar');
  if (textEl) textEl.textContent = `Progress: ${pct}%`;
  if (barEl) barEl.style.width = `${pct}%`;
}

/* =========================
NAVIGATION
========================= */
function updateNavigationButtons() {
  const prevBtn = document.getElementById('prev-chapter');
  const nextBtn = document.getElementById('next-chapter');
  if (!prevBtn || !nextBtn || !currentModule || !currentChapter) return;

  const index = currentModule.chapters.findIndex(c => c.id === currentChapter.id);
  prevBtn.disabled = index === 0;
  nextBtn.disabled = index === currentModule.chapters.length - 1;
}

function autoAdvanceToNext() {
  const index = currentModule.chapters.findIndex(c => c.id === currentChapter.id);
  if (index < currentModule.chapters.length - 1) {
    setTimeout(() => {
      playChapter(currentModule.id, currentModule.chapters[index + 1].id);
    }, 2000);
  }
}

// Bind navigation buttons
document.getElementById('prev-chapter')?.addEventListener('click', () => {
  if (!currentModule || !currentChapter) return;
  const index = currentModule.chapters.findIndex(c => c.id === currentChapter.id);
  if (index > 0) {
    playChapter(currentModule.id, currentModule.chapters[index - 1].id);
  }
});

document.getElementById('next-chapter')?.addEventListener('click', () => {
  if (!currentModule || !currentChapter) return;
  const index = currentModule.chapters.findIndex(c => c.id === currentChapter.id);
  if (index < currentModule.chapters.length - 1) {
    playChapter(currentModule.id, currentModule.chapters[index + 1].id);
  }
});

/* =========================
MODAL & KEYBOARD CONTROLS
========================= */
document.getElementById('close-modal')?.addEventListener('click', () => {
  stopProgressTracking();
  if (player?.pauseVideo) player.pauseVideo();
  document.getElementById('video-modal')?.classList.remove('active');
  hideError();
});

document.getElementById('video-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'video-modal') {
    document.getElementById('close-modal')?.click();
  }
});

document.addEventListener('keydown', (e) => {
  if (!document.getElementById('video-modal')?.classList.contains('active')) return;
  if (e.key === 'Escape') document.getElementById('close-modal')?.click();
  else if (e.key === 'ArrowLeft') document.getElementById('prev-chapter')?.click();
  else if (e.key === 'ArrowRight') document.getElementById('next-chapter')?.click();
});

/* =========================
INITIALIZATION
========================= */
// Expose playChapter globally for inline onclick handlers
window.playChapter = playChapter;

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', async () => {
    await loadLearningData();
    loadProgressFromStorage();
  });
} else {
  loadLearningData().then(loadProgressFromStorage);
}