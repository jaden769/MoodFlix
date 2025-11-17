"""
Moodflix AI Recommendation API
Wraps the AI project (emotion detection, weather, LLM, learning model)
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import base64
from io import BytesIO
from PIL import Image
from deepface import DeepFace
from collections import deque, defaultdict
from sklearn.preprocessing import LabelEncoder
from sklearn.ensemble import RandomForestClassifier
import subprocess
import pandas as pd
import os
import csv
import re
from datetime import datetime, timedelta
import geocoder
from geopy.geocoders import Nominatim
import holidays
import requests
import sounddevice as sd
import librosa
import threading
import json

# ======================
# CONFIGURATION
# ======================
app = Flask(__name__)
CORS(app)  # Enable CORS for Moodflix frontend

CONFIDENCE_THRESHOLD = 0.4
EMOTION_HISTORY_LEN = 10
OLLAMA_MODEL = "llama2"
CSV_FILE = "user_logs.csv"
WEATHER_API_KEY = "8626216750fcb3381f91b31c71b0862e"
COUNTRY_CODE = "US"
SAMPLE_RATE = 16000
DURATION = 10

# Global state
emotion_history_with_confidence = deque(maxlen=EMOTION_HISTORY_LEN)
audio_data = None

# ======================
# SETUP CSV FILE
# ======================
if not os.path.exists(CSV_FILE):
    with open(CSV_FILE, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow([
            "timestamp", "city", "latitude", "longitude", "today_status", "tomorrow_status",
            "weekday", "weather_desc", "temperature", "mood", "voice_tone", "movie_selected"
        ])

# ======================
# HELPER FUNCTIONS (from other_params.py)
# ======================
def get_location():
    """Get current location from IP"""
    try:
        g = geocoder.ip('me')
        latitude, longitude = g.latlng
        geolocator = Nominatim(user_agent="city_locator")
        location_info = geolocator.reverse((latitude, longitude), language='en')
        city = location_info.raw.get('address', {}).get('city', 'Unknown')
        return city, latitude, longitude
    except:
        return "Unknown", 0.0, 0.0

def today_and_tomorrow_status():
    """Get day status (Weekend/Weekday/Holiday)"""
    now = datetime.now()
    today = now.date()
    tomorrow = today + timedelta(days=1)
    weekday_name = today.strftime("%A")

    try:
        country_holidays = holidays.country_holidays(COUNTRY_CODE)
    except:
        country_holidays = {}

    def is_weekend(date):
        return date.weekday() >= 5

    def is_holiday(date):
        return date in country_holidays

    today_status = "Weekday"
    if is_holiday(today):
        today_status = "Holiday"
    elif is_weekend(today):
        today_status = "Weekend"

    tomorrow_status = "Weekday"
    if is_holiday(tomorrow):
        tomorrow_status = "Holiday"
    elif is_weekend(tomorrow):
        tomorrow_status = "Weekend"

    return today_status, tomorrow_status, weekday_name

def get_weather():
    """Get current weather"""
    city, latitude, longitude = get_location()
    url = f"http://api.openweathermap.org/data/2.5/weather?q={city}&appid={WEATHER_API_KEY}&units=metric"
    try:
        response = requests.get(url, timeout=5)
        if response.status_code == 200:
            data = response.json()
            weather_description = data['weather'][0]['description']
            temperature = data['main']['temp']
            return city, weather_description, temperature
    except:
        pass
    return "Unknown", "clear sky", 20.0

# ======================
# EMOTION DETECTION
# ======================
def preprocess_frame(frame):
    """Enhance frame for better detection"""
    lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
    l = clahe.apply(l)
    enhanced = cv2.merge([l, a, b])
    return cv2.cvtColor(enhanced, cv2.COLOR_LAB2BGR)

def detect_emotion_from_base64(image_base64):
    """Detect emotion from base64 image"""
    try:
        # Decode base64
        image_data = base64.b64decode(image_base64)
        image = Image.open(BytesIO(image_data))
        frame = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)

        # Preprocess and detect emotion
        enhanced_frame = preprocess_frame(frame)
        result = DeepFace.analyze(enhanced_frame, actions=['emotion'], enforce_detection=False, 
                                 detector_backend='opencv', silent=True)
        
        dominant_emotion = result[0]['dominant_emotion']
        confidence = result[0]['emotion'][dominant_emotion] / 100.0
        
        return dominant_emotion, confidence
    except Exception as e:
        print(f"Emotion detection error: {e}")
        return "neutral", 0.5

# ======================
# AUDIO ANALYSIS
# ======================
def extract_audio_features(audio_data, sr=16000):
    """Extract audio features for emotion"""
    audio_data = audio_data.astype(np.float32)
    audio_data = audio_data / (np.max(np.abs(audio_data)) + 1e-6)

    rms = np.mean(librosa.feature.rms(y=audio_data))
    pitches, _ = librosa.piptrack(y=audio_data, sr=sr)
    pitch = np.mean(pitches[pitches>0]) if np.any(pitches>0) else 0
    zcr = np.mean(librosa.feature.zero_crossing_rate(y=audio_data))

    return rms, pitch, zcr

def estimate_voice_emotion(audio_data, sr=16000):
    """Estimate emotion from voice"""
    rms, pitch, zcr = extract_audio_features(audio_data, sr)

    if rms > 0.02 and pitch > 120 and zcr > 0.02:
        return "happy"
    elif rms < 0.01 and pitch < 100 and zcr < 0.01:
        return "sad"
    return "neutral"

# ======================
# LLM RECOMMENDATION
# ======================
def ask_ollama(prompt_text):
    """Call Ollama to get recommendations"""
    try:
        result = subprocess.run(
            ["ollama", "run", OLLAMA_MODEL, prompt_text],
            capture_output=True, text=True, check=True, timeout=30
        )
        return result.stdout.strip()
    except Exception as e:
        print(f"Ollama error: {e}")
        return ""

# ======================
# LEARNING MODEL
# ======================
def train_user_model(csv_file):
    """Train RandomForest on user history"""
    if not os.path.exists(csv_file):
        return None, None

    try:
        df = pd.read_csv(csv_file)
        if df.empty:
            return None, None

        possible_emotions = ['angry','disgust','fear','happy','sad','surprise','neutral']
        le_city = LabelEncoder()
        le_today = LabelEncoder()
        le_mood = LabelEncoder()
        le_mood.fit(possible_emotions)
        le_movie = LabelEncoder()

        features = df[['latitude', 'longitude', 'temperature']].copy()
        features['city'] = le_city.fit_transform(df['city'])
        features['today_status'] = le_today.fit_transform(df['today_status'])
        features['mood'] = le_mood.transform(df['mood'])
        target = le_movie.fit_transform(df['movie_selected'])

        clf = RandomForestClassifier(n_estimators=50, random_state=42)
        clf.fit(features, target)
        return clf, (le_city, le_today, le_mood, le_movie)
    except:
        return None, None

def combined_recommendations(primary_movies, clf_tuple, user_context):
    """Combine LLM + Learning model recommendations"""
    if not primary_movies:
        return []
    
    if clf_tuple is None or clf_tuple[0] is None:
        return primary_movies[:5]

    clf, encoders = clf_tuple
    le_city, le_today, le_mood, le_movie = encoders

    try:
        df = pd.DataFrame([{
            'latitude': user_context.get('lat', 0),
            'longitude': user_context.get('lon', 0),
            'temperature': user_context.get('temperature', 20),
            'city': le_city.transform([user_context.get('city', 'Unknown')])[0],
            'today_status': le_today.transform([user_context.get('today_status', 'Weekday')])[0],
            'mood': le_mood.transform([user_context.get('mood', 'neutral')])[0]
        }])

        pred_probs = clf.predict_proba(df)[0]
        top_indices = pred_probs.argsort()[::-1]
        top_movies = le_movie.inverse_transform(top_indices)

        final_list = []
        for movie in top_movies:
            if movie in primary_movies and movie not in final_list:
                final_list.append(movie)
        for movie in primary_movies:
            if movie not in final_list:
                final_list.append(movie)

        return final_list[:5]
    except:
        return primary_movies[:5]

# ======================
# API ENDPOINTS
# ======================

@app.route('/api/health', methods=['GET'])
def health():
    """Health check"""
    return jsonify({'status': 'ok'})

@app.route('/api/context', methods=['GET'])
def get_context():
    """Get location, weather, day info"""
    city, weather, temp = get_weather()
    today_status, tomorrow_status, weekday = today_and_tomorrow_status()
    
    return jsonify({
        'city': city,
        'weather': weather,
        'temperature': temp,
        'today_status': today_status,
        'tomorrow_status': tomorrow_status,
        'weekday': weekday,
        'timestamp': datetime.now().isoformat()
    })

@app.route('/api/emotion', methods=['POST'])
def detect_emotion():
    """Detect emotion from image base64"""
    data = request.json
    image_base64 = data.get('image', '')
    
    if not image_base64:
        return jsonify({'error': 'No image provided'}), 400

    emotion, confidence = detect_emotion_from_base64(image_base64)
    return jsonify({
        'emotion': emotion,
        'confidence': confidence
    })

@app.route('/api/recommend', methods=['POST'])
def recommend():
    """Get AI-powered movie recommendations"""
    data = request.json
    emotion = data.get('emotion', 'neutral')
    weather = data.get('weather', 'clear')
    temperature = data.get('temperature', 20)
    city = data.get('city', 'Unknown')
    today_status = data.get('today_status', 'Weekday')
    watched_movies = data.get('watched_movies', [])
    voice_tone = data.get('voice_tone', 'neutral')
    available_movies = data.get('available_movies', [])

    # Build prompt for LLM
    prompt = f"""
You are a movie recommendation expert. Based on the user's current context, recommend 5 movies.

Context:
- Emotion: {emotion}
- Voice tone: {voice_tone}
- Location: {city}
- Weather: {weather}, {temperature}°C
- Day: {today_status}
- Previously watched: {', '.join(watched_movies[:3]) if watched_movies else 'none'}

Recommend 5 movie titles that would match this mood. Format: "1. Movie Title (Year)"
Only recommend from these available movies: {available_movies}
If available_movies is empty, recommend any well-known movies.
"""

    # Get LLM recommendations
    llm_response = ask_ollama(prompt)
    movie_titles = re.findall(r'\d+\.\s*(.+?)(?:\s*\(\d{4}\))?(?:\n|$)', llm_response)
    movie_titles = [m.strip() for m in movie_titles if m.strip()][:5]

    # Train learning model and combine recommendations
    user_context = {
        'city': city,
        'lat': 0,  # Would be from location data
        'lon': 0,
        'today_status': today_status,
        'temperature': temperature,
        'mood': emotion
    }

    clf_tuple = train_user_model(CSV_FILE)
    final_recommendations = combined_recommendations(movie_titles, clf_tuple, user_context)

    return jsonify({
        'recommendations': final_recommendations,
        'emotion': emotion,
        'weather': weather,
        'temperature': temperature,
        'reasoning': f"Recommended for your {emotion} mood on a {today_status} during {weather}."
    })

@app.route('/api/log-selection', methods=['POST'])
def log_selection():
    """Log user's movie selection for learning"""
    data = request.json
    
    df = pd.DataFrame([{
        'timestamp': datetime.now(),
        'city': data.get('city', 'Unknown'),
        'latitude': data.get('latitude', 0),
        'longitude': data.get('longitude', 0),
        'today_status': data.get('today_status', 'Weekday'),
        'tomorrow_status': data.get('tomorrow_status', 'Weekday'),
        'weekday': data.get('weekday', 'Unknown'),
        'weather_desc': data.get('weather', 'clear'),
        'temperature': data.get('temperature', 20),
        'mood': data.get('mood', 'neutral'),
        'voice_tone': data.get('voice_tone', 'neutral'),
        'movie_selected': data.get('movie', '')
    }])

    if os.path.exists(CSV_FILE):
        df.to_csv(CSV_FILE, mode='a', header=False, index=False)
    else:
        df.to_csv(CSV_FILE, index=False)

    return jsonify({'status': 'logged'})

if __name__ == '__main__':
    print("🚀 Moodflix AI API Server starting...")
    print("📍 Running on http://localhost:5000")
    app.run(host='0.0.0.0', port=5000, debug=False)
