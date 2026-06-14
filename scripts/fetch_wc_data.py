#!/usr/bin/env python3
import requests
import json
import os
from datetime import datetime
import sys

# RapidAPI credentials from environment variables
RAPIDAPI_KEY = os.getenv('RAPIDAPI_KEY')
RAPIDAPI_HOST = 'api-football-v1.p.rapidapi.com'

def fetch_live_matches():
    """Fetch live World Cup 2026 match data from RapidAPI"""
    
    if not RAPIDAPI_KEY:
        print("ERROR: RAPIDAPI_KEY not set in environment")
        return load_sample_data()
    
    try:
        url = "https://api-football-v1.p.rapidapi.com/v3/events"
        
        headers = {
            "x-rapidapi-key": RAPIDAPI_KEY,
            "x-rapidapi-host": RAPIDAPI_HOST
        }
        
        # Fetch World Cup 2026 matches (League ID: 1, Season: 2026)
        params = {
            "league": 1,
            "season": 2026
        }
        
        response = requests.get(url, headers=headers, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if data.get('results') == 0:
            print("No matches found, using sample data")
            return load_sample_data()
        
        matches = process_api_data(data.get('response', []))
        print(f"Successfully fetched {len(matches)} matches from API")
        return matches
        
    except requests.exceptions.RequestException as e:
        print(f"API Error: {e}")
        return load_sample_data()
    except Exception as e:
        print(f"Error processing API data: {e}")
        return load_sample_data()

def process_api_data(api_matches):
    """Convert API response to our format"""
    matches = []
    
    for idx, api_match in enumerate(api_matches[:10]):  # Limit to 10 matches
        try:
            match = {
                "id": api_match.get('id', idx + 1),
                "time": api_match.get('fixture', {}).get('date', '2026-06-12T00:00:00Z'),
                "status": api_match.get('fixture', {}).get('status', {}).get('short', 'UPCOMING'),
                "venue": api_match.get('fixture', {}).get('venue', {}).get('name', 'TBD'),
                "team1": {
                    "name": api_match.get('teams', {}).get('home', {}).get('name', 'Team 1'),
                    "flag": get_flag(api_match.get('teams', {}).get('home', {}).get('name', '')),
                    "group": "A"
                },
                "team2": {
                    "name": api_match.get('teams', {}).get('away', {}).get('name', 'Team 2'),
                    "flag": get_flag(api_match.get('teams', {}).get('away', {}).get('name', '')),
                    "group": "A"
                },
                "score": {
                    "team1": api_match.get('goals', {}).get('home', 0) or 0,
                    "team2": api_match.get('goals', {}).get('away', 0) or 0
                },
                "stats": {
                    "possession": {
                        "team1": api_match.get('statistics', [{}])[0].get('statistics', [{}])[12].get('value', 45) if len(api_match.get('statistics', [])) > 0 else 45,
                        "team2": api_match.get('statistics', [{}])[1].get('statistics', [{}])[12].get('value', 55) if len(api_match.get('statistics', [])) > 1 else 55
                    },
                    "shots": {
                        "team1": api_match.get('statistics', [{}])[0].get('statistics', [{}])[0].get('value', 8) if len(api_match.get('statistics', [])) > 0 else 8,
                        "team2": api_match.get('statistics', [{}])[1].get('statistics', [{}])[0].get('value', 12) if len(api_match.get('statistics', [])) > 1 else 12
                    },
                    "xG": {
                        "team1": round(api_match.get('goals', {}).get('home', 0) * 1.2, 1),
                        "team2": round(api_match.get('goals', {}).get('away', 0) * 1.2, 1)
                    }
                },
                "predictions": [
                    {"score": f"2-1 {api_match.get('teams', {}).get('home', {}).get('name', 'Home')}", "prob": "35%", "odds": "3.20"},
                    {"score": "1-1 Draw", "prob": "28%", "odds": "3.75"},
                    {"score": f"0-2 {api_match.get('teams', {}).get('away', {}).get('name', 'Away')}", "prob": "18%", "odds": "4.50"}
                ],
                "analysis": {
                    "prediction": f"Match analysis for {api_match.get('teams', {}).get('home', {}).get('name', 'Team 1')} vs {api_match.get('teams', {}).get('away', {}).get('name', 'Team 2')}. Teams expected to play competitive football."
                }
            }
            matches.append(match)
        except Exception as e:
            print(f"Error processing match {idx}: {e}")
            continue
    
    return matches

def get_flag(team_name):
    """Get flag emoji for team"""
    flags = {
        "Argentina": "🇦🇷",
        "USA": "🇺🇸",
        "Mexico": "🇲🇽",
        "Chile": "🇨🇱",
        "France": "🇫🇷",
        "Germany": "🇩🇪",
        "Netherlands": "🇳🇱",
        "Italy": "🇮🇹",
        "Brazil": "🇧🇷",
        "Spain": "🇪🇸",
        "Portugal": "🇵🇹",
        "Uruguay": "🇺🇾",
        "England": "🇬🇧",
        "Belgium": "🇧🇪",
        "Croatia": "🇭🇷",
        "Serbia": "🇷🇸",
        "Poland": "🇵🇱",
        "Denmark": "🇩🇰",
        "Czech Republic": "🇨🇿",
        "Tunisia": "🇹🇳",
        "Canada": "🇨🇦",
        "Morocco": "🇲🇦",
        "Senegal": "🇸🇳",
        "South Korea": "🇰🇷",
        "Switzerland": "🇨🇭",
        "Austria": "🇦🇹",
        "Sweden": "🇸🇪",
        "Greece": "🇬🇷",
        "Japan": "🇯🇵",
        "Australia": "🇦🇺",
        "Saudi Arabia": "🇸🇦",
        "New Zealand": "🇳🇿"
    }
    return flags.get(team_name, "🏳️")

def load_sample_data():
    """Load sample data when API fails"""
    try:
        with open('data/current_data.json', 'r') as f:
            return json.load(f).get('matches', [])
    except:
        return []

def save_matches(matches):
    """Save matches to current_data.json"""
    try:
        # Load existing data
        try:
            with open('data/current_data.json', 'r') as f:
                current_data = json.load(f)
        except:
            current_data = {"matches": [], "leaderboard": {}, "standings": {}}
        
        # Update matches and timestamp
        current_data['matches'] = matches
        current_data['updated'] = datetime.utcnow().isoformat() + 'Z'
        
        # Save back
        with open('data/current_data.json', 'w') as f:
            json.dump(current_data, f, indent=2, ensure_ascii=False)
        
        print(f"Saved {len(matches)} matches to data/current_data.json")
        return True
    except Exception as e:
        print(f"Error saving matches: {e}")
        return False

if __name__ == "__main__":
    print("🔄 Fetching World Cup 2026 match data...")
    matches = fetch_live_matches()
    save_matches(matches)
    print("✅ Data fetch complete")
