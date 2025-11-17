/**
 * Moodflix API Service
 * Handles all communication with the AI backend
 */

const API_BASE_URL = 'http://localhost:5000/api';

/**
 * Fetch context: location, weather, day info
 */
async function getContext() {
  try {
    const response = await fetch(`${API_BASE_URL}/context`);
    if (!response.ok) throw new Error('Failed to fetch context');
    return await response.json();
  } catch (error) {
    console.error('Context fetch error:', error);
    return null;
  }
}

/**
 * Detect emotion from image (base64)
 */
async function detectEmotion(imageBase64) {
  try {
    const response = await fetch(`${API_BASE_URL}/emotion`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 })
    });
    if (!response.ok) throw new Error('Failed to detect emotion');
    return await response.json();
  } catch (error) {
    console.error('Emotion detection error:', error);
    return null;
  }
}

/**
 * Get AI movie recommendations
 */
async function getRecommendations(emotionData, contextData, watchedMovies = []) {
  try {
    const response = await fetch(`${API_BASE_URL}/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        emotion: emotionData.emotion || 'neutral',
        weather: contextData.weather || 'clear',
        temperature: contextData.temperature || 20,
        city: contextData.city || 'Unknown',
        today_status: contextData.today_status || 'Weekday',
        watched_movies: watchedMovies,
        voice_tone: emotionData.voice_tone || 'neutral',
        available_movies: movies.map(m => m.title) // Pass available movies from data.js
      })
    });
    if (!response.ok) throw new Error('Failed to get recommendations');
    return await response.json();
  } catch (error) {
    console.error('Recommendation error:', error);
    return null;
  }
}

/**
 * Log user's movie selection
 */
async function logSelection(movieTitle, emotion, context) {
  try {
    const response = await fetch(`${API_BASE_URL}/log-selection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        movie: movieTitle,
        mood: emotion,
        voice_tone: emotion.voice_tone || 'neutral',
        city: context.city || 'Unknown',
        latitude: 0, // Would be from actual location
        longitude: 0,
        today_status: context.today_status || 'Weekday',
        tomorrow_status: context.tomorrow_status || 'Weekday',
        weekday: context.weekday || 'Unknown',
        weather: context.weather || 'clear',
        temperature: context.temperature || 20
      })
    });
    return response.ok;
  } catch (error) {
    console.error('Log selection error:', error);
    return false;
  }
}

/**
 * Check if API server is running
 */
async function checkAPIHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Capture image from canvas
 */
function captureCanvasAsBase64(canvasElement) {
  return canvasElement.toDataURL('image/jpeg', 0.8).split(',')[1]; // Remove "data:image/jpeg;base64," prefix
}
