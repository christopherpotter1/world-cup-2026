#!/usr/bin/env python3
import json
import os
from datetime import datetime
import sys

try:
    import firebase_admin
    from firebase_admin import credentials, db
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False
    print("⚠️  Firebase not installed. Skipping Firebase sync.")

def sync_to_firebase():
    """Sync World Cup data to Firebase Realtime Database"""
    
    if not FIREBASE_AVAILABLE:
        print("Firebase module not available, skipping sync")
        return False
    
    # Get Firebase credentials from environment
    firebase_config = {
        "apiKey": os.getenv('FIREBASE_API_KEY'),
        "authDomain": os.getenv('FIREBASE_AUTH_DOMAIN'),
        "databaseURL": os.getenv('FIREBASE_DATABASE_URL'),
        "projectId": os.getenv('FIREBASE_PROJECT_ID'),
        "storageBucket": os.getenv('FIREBASE_STORAGE_BUCKET'),
        "messagingSenderId": os.getenv('FIREBASE_MESSAGING_SENDER_ID'),
        "appId": os.getenv('FIREBASE_APP_ID')
    }
    
    # Check if all required credentials are present
    if not all(firebase_config.values()):
        print("⚠️  Firebase credentials incomplete, skipping sync")
        return False
    
    try:
        # Initialize Firebase (only once)
        if not firebase_admin.get_app():
            cred = credentials.Certificate(firebase_config)
            firebase_admin.initialize_app(cred, {
                'databaseURL': firebase_config['databaseURL']
            })
        
        # Load local data
        with open('data/current_data.json', 'r') as f:
            data = json.load(f)
        
        # Sync each section
        print("📤 Syncing to Firebase...")
        
        # Sync matches
        ref = db.reference('wc2026/matches')
        ref.set(data.get('matches', []))
        print("✅ Matches synced")
        
        # Sync leaderboard
        ref = db.reference('wc2026/leaderboard')
        ref.set(data.get('leaderboard', {}))
        print("✅ Leaderboard synced")
        
        # Sync standings
        ref = db.reference('wc2026/standings')
        ref.set(data.get('standings', {}))
        print("✅ Standings synced")
        
        # Sync metadata
        ref = db.reference('wc2026/metadata')
        ref.set({
            'lastUpdated': data.get('updated', datetime.utcnow().isoformat()),
            'source': 'GitHub Actions Automation',
            'syncTime': datetime.utcnow().isoformat()
        })
        print("✅ Metadata synced")
        
        print("✅ Firebase sync complete!")
        return True
        
    except Exception as e:
        print(f"⚠️  Firebase sync failed: {e}")
        print("This is non-critical. Main data is saved locally.")
        return False

def load_local_data():
    """Load data from local JSON file"""
    try:
        with open('data/current_data.json', 'r') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading local data: {e}")
        return None

def get_firebase_data():
    """Read data from Firebase (for testing)"""
    
    if not FIREBASE_AVAILABLE:
        print("Firebase not available")
        return None
    
    try:
        ref = db.reference('wc2026')
        return ref.get()
    except Exception as e:
        print(f"Error reading from Firebase: {e}")
        return None

if __name__ == "__main__":
    print("🔄 Firebase Sync Starting...")
    
    # Load local data
    data = load_local_data()
    if data:
        print(f"✅ Loaded local data with {len(data.get('matches', []))} matches")
    
    # Attempt Firebase sync
    sync_to_firebase()
    
    print("✅ Sync process complete")
