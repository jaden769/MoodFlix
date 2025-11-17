/**
 * Emotion Detector Frontend Logic
 * Handles webcam capture and recommendation flow
 */

let currentEmotion = null;
let currentContext = null;
let mediaStream = null;

// ==================
// INITIALIZATION
// ==================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('🎬 Emotion Detector initialized');

  // Check API health
  const isAPIHealthy = await checkAPIHealth();
  if (!isAPIHealthy) {
    showMessage('API server is not running. Start api_server.py to use AI recommendations.', 'error');
    document.getElementById('apiStatus').style.display = 'block';
    return;
  }

  // Initialize webcam
  await initWebcam();

  // Load context
  currentContext = await getContext();
  if (currentContext) {
    displayContext();
  }

  // Setup event listeners
  document.getElementById('captureBtn').addEventListener('click', captureEmotion);
  document.getElementById('getRecommendationsBtn').addEventListener('click', getRecommendations);
});

// ==================
// WEBCAM SETUP
// ==================
async function initWebcam() {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
    const video = document.getElementById('video');
    video.srcObject = mediaStream;
    console.log('✅ Webcam initialized');
  } catch (error) {
    console.error('Webcam error:', error);
    showMessage('Cannot access webcam. Check browser permissions.', 'error');
  }
}

// ==================
// CAPTURE EMOTION
// ==================
async function captureEmotion() {
  const video = document.getElementById('video');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  // Set canvas size to match video
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;

  // Draw video frame to canvas
  ctx.drawImage(video, 0, 0);

  // Convert to base64
  const imageBase64 = captureCanvasAsBase64(canvas);

  // Show loading
  const btn = document.getElementById('captureBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span> Analyzing...';

  // Detect emotion
  const emotionResult = await detectEmotion(imageBase64);

  btn.disabled = false;
  btn.innerHTML = originalText;

  if (emotionResult) {
    currentEmotion = emotionResult;
    displayEmotion(emotionResult);
    document.getElementById('getRecommendationsBtn').disabled = false;
    showMessage('✅ Emotion detected! Click "Get Recommendations" to see personalized movies.', 'success');
  } else {
    showMessage('❌ Could not detect emotion. Try again.', 'error');
  }
}

// ==================
// DISPLAY EMOTION
// ==================
function displayEmotion(emotionData) {
  const emotionDisplay = document.getElementById('emotionDisplay');
  document.getElementById('emotionValue').textContent = emotionData.emotion.toUpperCase();
  document.getElementById('confidenceValue').textContent = 
    `Confidence: ${(emotionData.confidence * 100).toFixed(1)}%`;
  emotionDisplay.style.display = 'block';

  // Update context display
  const contextInfo = document.getElementById('contextInfo');
  document.getElementById('moodStatus').textContent = emotionData.emotion;
  document.getElementById('voiceStatus').textContent = emotionData.voice_tone || 'neutral';
  contextInfo.style.display = 'block';
}

// ==================
// GET RECOMMENDATIONS
// ==================
async function getRecommendations() {
  if (!currentEmotion || !currentContext) {
    showMessage('❌ Please capture emotion first.', 'error');
    return;
  }

  // Show loading
  const btn = document.getElementById('getRecommendationsBtn');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="loading-spinner"></span> Getting recommendations...';
  document.getElementById('loadingState').style.display = 'block';

  // Get recommendations
  const recommendations = await getRecommendations(currentEmotion, currentContext);

  btn.disabled = false;
  btn.innerHTML = originalText;
  document.getElementById('loadingState').style.display = 'none';

  if (recommendations && recommendations.recommendations.length > 0) {
    displayRecommendations(recommendations);
    showMessage('✅ Recommendations loaded based on your mood!', 'success');
  } else {
    showMessage('❌ Could not get recommendations. Try again.', 'error');
  }
}

// ==================
// DISPLAY RECOMMENDATIONS
// ==================
function displayRecommendations(data) {
  const section = document.getElementById('recommendationsSection');
  const container = document.getElementById('recommendationsContainer');
  const reasoning = document.getElementById('recommendationReasoning');

  reasoning.textContent = data.reasoning || 'Personalized for your mood, location, and preferences.';
  container.innerHTML = '';

  data.recommendations.forEach((movieTitle, index) => {
    // Find movie in data.js
    const movie = movies.find(m => m.title.toLowerCase() === movieTitle.toLowerCase());
    
    if (movie) {
      const col = document.createElement('div');
      col.className = 'col-md-6 col-lg-4';

      const card = document.createElement('div');
      card.className = 'card h-100 bg-dark text-white border-0';
      card.style.background = 'rgba(255, 255, 255, 0.05)';
      card.style.border = '1px solid rgba(255, 255, 255, 0.1)';
      card.style.borderRadius = '12px';
      card.style.transition = 'all 0.3s ease';
      card.style.cursor = 'pointer';

      const link = document.createElement('a');
      link.href = `movie.html?type=movies&id=${movies.indexOf(movie)}`;
      link.className = 'text-white text-decoration-none';

      const img = document.createElement('img');
      img.src = movie.poster;
      img.alt = movie.title;
      img.className = 'card-img-top';
      img.style.height = '300px';
      img.style.objectFit = 'cover';

      const body = document.createElement('div');
      body.className = 'card-body';
      body.style.padding = '1.5rem';

      const title = document.createElement('h5');
      title.className = 'card-title';
      title.textContent = movie.title;
      title.style.fontWeight = '600';

      const rating = document.createElement('p');
      rating.className = 'card-text';
      rating.textContent = `⭐ ${movie.rating}/10`;
      rating.style.color = '#ff6b6b';

      body.appendChild(title);
      body.appendChild(rating);
      link.appendChild(img);
      link.appendChild(body);
      card.appendChild(link);
      col.appendChild(card);
      container.appendChild(col);

      // Add hover effect
      card.addEventListener('mouseenter', () => {
        card.style.transform = 'translateY(-8px)';
        card.style.background = 'rgba(255, 255, 255, 0.08)';
        card.style.borderColor = '#ff6b6b';
        card.style.boxShadow = '0 12px 24px rgba(255, 107, 107, 0.3)';
      });

      card.addEventListener('mouseleave', () => {
        card.style.transform = 'translateY(0)';
        card.style.background = 'rgba(255, 255, 255, 0.05)';
        card.style.borderColor = 'rgba(255, 255, 255, 0.1)';
        card.style.boxShadow = 'none';
      });

      // Log selection on click
      link.addEventListener('click', (e) => {
        logSelection(movie.title, currentEmotion, currentContext);
      });
    }
  });

  section.style.display = 'block';
}

// ==================
// DISPLAY CONTEXT
// ==================
function displayContext() {
  document.getElementById('cityName').textContent = currentContext.city || 'Unknown';
  document.getElementById('weatherDesc').textContent = currentContext.weather || 'Clear';
  document.getElementById('tempValue').textContent = currentContext.temperature || '—';
  document.getElementById('dayStatus').textContent = currentContext.today_status || 'Weekday';
  document.getElementById('weekday').textContent = currentContext.weekday || 'Unknown';
}

// ==================
// UTILITIES
// ==================
function showMessage(message, type = 'info') {
  const msgDiv = document.getElementById('statusMessage');
  msgDiv.textContent = message;
  msgDiv.className = `status-message ${type}`;

  if (type !== 'error') {
    setTimeout(() => {
      msgDiv.className = 'status-message';
    }, 3000);
  }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }
});
