/* =========================
DATA & STATE
========================= */
let learningData = { modules: [] };
const API_BASE_URL = 'http://localhost:5000';

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
async function loadLearningData() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/learning-data`);
    if (!response.ok) {
      throw new Error('Failed to fetch learning data');
    }
    learningData = await response.json();
    console.log('Learning data loaded from API');
    renderModules();
  } catch (error) {
    console.error('Error loading learning data:', error);
    // Fallback: try to load from local JSON if API fails
    console.warn('Falling back to local learning-data.json');
    try {
      const localResponse = await fetch('./learning-data.json');
      learningData = await localResponse.json();
      renderModules();
    } catch (localError) {
      console.error('Error loading local data:', localError);
      showError('Failed to load learning data. Please try refreshing the page.');
    }
  }
}

/* =========================
YOUTUBE API INITIALIZATION
========================= */
var tag = document.createElement('script');
tag.src = "https://www.youtube.com/iframe_api";
var firstScriptTag = document.getElementsByTagName('script')[0];
firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

function onYouTubeIframeAPIReady() {
console.log('YouTube API Ready');
youtubeAPIReady = true;

if (pendingVideoLoad) {
loadYouTubePlayer(pendingVideoLoad.videoId, pendingVideoLoad.startTime);
pendingVideoLoad = null;
}
}

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

if ((p.maxWatched / duration) * 100 >= 90) {
p.completed = true;
}

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
errorText.textContent = message;
errorDiv.classList.add('show');
}

function hideError() {
const errorDiv = document.getElementById('error-message');
errorDiv.classList.remove('show');
}

/* =========================
RENDER MODULES
========================= */
function renderModules() {
const container = document.getElementById("modules-container");
container.innerHTML = "";

learningData.modules.forEach(m => {
const chaptersHTML = m.chapters.map(c => {
const status = getChapterStatus(c.id);
const statusBadge = status ? `<span class="chapter-status ${status}">${status === 'completed' ? '✓ Completed' : '⏳ In Progress'}</span>` : '';
const thumbnailUrl = `https://img.youtube.com/vi/${c.videoId}/mqdefault.jpg`;
return `
<div class="chapter-card" onclick="playChapter('${m.id}','${c.id}')">
<div class="chapter-thumbnail">
<img src="${thumbnailUrl}" alt="${c.title}" loading="lazy">
</div>
<div class="chapter-content">
<span>${c.title}${statusBadge}</span>
<p class="chapter-description">${c.description}</p>
</div>
<div class="chapter-actions">
<button>▶ Play</button>
</div>
</div>`;
}).join("");

const card = document.createElement("div");
card.className = "module-card";
card.innerHTML = `
<div class="module-header">
<div>
<h3>${m.title}</h3>
<p>${m.description}</p>
</div>
</div>
${chaptersHTML}`;

container.appendChild(card);
});
}

/* =========================
PLAYBACK
========================= */
function playChapter(moduleId, chapterId) {
currentModule = learningData.modules.find(m => m.id === moduleId);
currentChapter = currentModule.chapters.find(c => c.id === chapterId);

const progress = getChapterProgress(chapterId);
maxWatchedTime = progress.maxWatched;

document.getElementById('video-title').textContent = currentChapter.title;
document.getElementById('video-modal').classList.add('active');
hideError();
updateNavigationButtons();

if (player && player.destroy) {
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
console.log('Waiting for YouTube API...');
}
}

/* =========================
YOUTUBE PLAYER
========================= */
function loadYouTubePlayer(videoId, startTime = 0) {
if (!youtubeAPIReady) {
showError('YouTube API is still loading. Please try again in a moment.');
return;
}

const origin = window.location.origin || 'http://localhost';

try {
player = new YT.Player('player', {
height: '100%',
width: '100%',
videoId: videoId,
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
console.error('Error creating player:', e);
showError('Failed to create video player. Error: ' + e.message);
}
}

function onPlayerReady(event) {
console.log('Player ready');
hideError();
startProgressTracking();
}

function onPlayerStateChange(e) {
if (e.data === YT.PlayerState.PLAYING) {
hideError();
startProgressTracking();
} else if (e.data === YT.PlayerState.ENDED) {
stopProgressTracking();
autoAdvanceToNext();
} else {
stopProgressTracking();
}
}

function onPlayerError(event) {
console.error('YouTube Player Error:', event.data);
stopProgressTracking();

let errorMessage = '';
switch(event.data) {
case 2:
errorMessage = 'Invalid video ID. Please check the video configuration.';
break;
case 5:
errorMessage = 'HTML5 player error. Please try refreshing the page.';
break;
case 100:
errorMessage = 'Video not found or has been removed.';
break;
case 101:
case 150:
errorMessage = 'Video owner has restricted playback on embedded players. This video cannot be played here. Please watch it directly on YouTube.';
break;
default:
errorMessage = 'An error occurred while loading the video. Error code: ' + event.data;
}

showError(errorMessage);
}

/* =========================
PROGRESS TRACKING
========================= */
function startProgressTracking() {
if (updateInterval) return;
updateInterval = setInterval(() => {
if (!player || !currentChapter) return;

try {
const t = player.getCurrentTime();
if (t !== undefined && !isNaN(t)) {
maxWatchedTime = Math.max(maxWatchedTime, t);
updateChapterProgress(currentChapter.id, t, currentChapter.duration);
updateProgressDisplay();
}
} catch (e) {
console.error('Error tracking progress:', e);
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
document.getElementById('progress-text').textContent = `Progress: ${pct}%`;
document.getElementById('progress-bar').style.width = pct + '%';
}

/* =========================
NAVIGATION
========================= */
function updateNavigationButtons() {
const prevBtn = document.getElementById('prev-chapter');
const nextBtn = document.getElementById('next-chapter');

const currentIndex = currentModule.chapters.findIndex(c => c.id === currentChapter.id);

prevBtn.disabled = currentIndex === 0;
nextBtn.disabled = currentIndex === currentModule.chapters.length - 1;
}

function autoAdvanceToNext() {
const currentIndex = currentModule.chapters.findIndex(c => c.id === currentChapter.id);
if (currentIndex < currentModule.chapters.length - 1) {
setTimeout(() => {
playChapter(currentModule.id, currentModule.chapters[currentIndex + 1].id);
}, 2000);
}
}

document.getElementById('prev-chapter').onclick = () => {
if (!currentModule || !currentChapter) return;

const currentIndex = currentModule.chapters.findIndex(c => c.id === currentChapter.id);
if (currentIndex > 0) {
playChapter(currentModule.id, currentModule.chapters[currentIndex - 1].id);
}
};

document.getElementById('next-chapter').onclick = () => {
if (!currentModule || !currentChapter) return;

const currentIndex = currentModule.chapters.findIndex(c => c.id === currentChapter.id);
if (currentIndex < currentModule.chapters.length - 1) {
playChapter(currentModule.id, currentModule.chapters[currentIndex + 1].id);
}
};

/* =========================
MODAL CONTROLS
========================= */
document.getElementById('close-modal').onclick = () => {
stopProgressTracking();
if (player && player.pauseVideo) {
try {
player.pauseVideo();
} catch (e) {
console.error('Error pausing video:', e);
}
}
document.getElementById('video-modal').classList.remove('active');
hideError();
renderModules();
};

document.getElementById('video-modal').onclick = (e) => {
if (e.target.id === 'video-modal') {
document.getElementById('close-modal').click();
}
};

document.addEventListener('keydown', (e) => {
const modal = document.getElementById('video-modal');
if (!modal.classList.contains('active')) return;

if (e.key === 'Escape') {
document.getElementById('close-modal').click();
} else if (e.key === 'ArrowLeft') {
document.getElementById('prev-chapter').click();
} else if (e.key === 'ArrowRight') {
document.getElementById('next-chapter').click();
}
});

/* =========================
LOAD DATA FROM API or JSON FALLBACK
========================= */
// Note: Call this function after DOM is ready
async function initLearningData() {
/*
  try {
  // Try to load from API first
  console.log('Attempting to load from API:', API_BASE_URL);
  const response = await fetch(`${API_BASE_URL}/api/learning-data`);
  if (!response.ok) {
    throw new Error(`API returned ${response.status}`);
  }
  const data = await response.json();
  learningData = data;
  console.log('Learning data loaded successfully from API');
} catch (apiError) {
  console.warn('Failed to load from API, trying local JSON:', apiError);*/

  try {
    // Fallback to local JSON
    const localResponse = await fetch('./learn/learning-data.json');
    if (!localResponse.ok) {
      throw new Error(`Failed to load local data: ${localResponse.statusText}`);
    }
    const data = await localResponse.json();
    learningData = data;
    console.log('Learning data loaded successfully from local JSON');
  } catch (error) {
    console.error('Error loading learning data:', error);
    showError('Failed to load course data. Please refresh the page.');
    return;
  }


loadProgressFromStorage();
renderModules();
}

/* =========================
INITIALIZE
========================= */
window.playChapter = playChapter;

// Load data when DOM is ready
if (document.readyState === 'loading') {
document.addEventListener('DOMContentLoaded', initLearningData);
} else {
initLearningData();
}
