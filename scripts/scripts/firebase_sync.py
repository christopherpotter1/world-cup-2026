import json
import os
from datetime import datetime

def sync_to_firebase(data: dict) -> bool:
    """Sync World Cup data to Firebase Realtime Database"""
    
    try:
        import firebase_admin
        from firebase_admin import db
    except ImportError:
        print("Firebase admin SDK not installed. Skipping Firebase sync.")
        print("To enable Firebase sync, run: pip install firebase-admin")
        return False
    
    try:
        # Initialize Firebase (credentials from environment)
        firebase_url = os.getenv('FIREBASE_DATABASE_URL')
        
        if not firebase_url:
            print("Firebase database URL not configured")
            return False
        
        # Write data to Firebase
        ref = db.reference('wc_2026')
        ref.update({
            'matches': data.get('matches', []),
            'leaderboard': data.get('leaderboard', {}),
            'standings': data.get('standings', {}),
            'bracket': data.get('bracket', {}),
            'updated': data.get('updated', datetime.now().isoformat())
        })
        
        print("✅ Data synced to Firebase successfully")
        return True
        
    except Exception as e:
        print(f"⚠️ Firebase sync failed (non-critical): {e}")
        print("Website will use local data instead")
        return False

def sync_matches(matches: list) -> bool:
    """Sync individual match updates"""
    
    try:
        import firebase_admin
        from firebase_admin import db
    except ImportError:
        return False
    
    try:
        ref = db.reference('wc_2026/matches')
        ref.set(matches)
        return True
    except Exception as e:
        print(f"Match sync error: {e}")
        return False

def sync_leaderboard(leaderboard: dict) -> bool:
    """Sync player leaderboard data"""
    
    try:
        import firebase_admin
        from firebase_admin import db
    except ImportError:
        return False
    
    try:
        ref = db.reference('wc_2026/leaderboard')
        ref.set(leaderboard)
        return True
    except Exception as e:
        print(f"Leaderboard sync error: {e}")
        return False

def sync_standings(standings: dict) -> bool:
    """Sync group standings"""
    
    try:
        import firebase_admin
        from firebase_admin import db
    except ImportError:
        return False
    
    try:
        ref = db.reference('wc_2026/standings')
        ref.set(standings)
        return True
    except Exception as e:
        print(f"Standings sync error: {e}")
        return False

def sync_bracket(bracket: dict) -> bool:
    """Sync knockout bracket"""
    
    try:
        import firebase_admin
        from firebase_admin import db
    except ImportError:
        return False
    
    try:
        ref = db.reference('wc_2026/bracket')
        ref.set(bracket)
        return True
    except Exception as e:
        print(f"Bracket sync error: {e}")
        return False

def main():
    """Main Firebase sync function"""
    
    try:
        # Load current data
        with open('data/current_data.json', 'r') as f:
            data = json.load(f)
        
        # Attempt Firebase sync (optional - continues if fails)
        firebase_available = sync_to_firebase(data)
        
        if firebase_available:
            print("✅ All data synced to Firebase")
        else:
            print("⚠️ Using local data (Firebase sync unavailable)")
        
        return data
        
    except Exception as e:
        print(f"❌ Error in Firebase sync: {e}")
        return None

if __name__ == '__main__':
    main()
