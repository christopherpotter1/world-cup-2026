import json
import os
from datetime import datetime

def fetch_wc_data():
    """Fetch World Cup 2026 data from API"""
    
    try:
        import requests
    except ImportError:
        print("requests library not available, using sample data")
        return load_sample_data()
    
    api_host = os.getenv('RAPIDAPI_HOST', 'api-football.p.rapidapi.com')
    api_key = os.getenv('RAPIDAPI_KEY', '')
    
    if not api_key:
        print("No API key found, using sample data")
        return load_sample_data()
    
    headers = {
        'x-rapidapi-host': api_host,
        'x-rapidapi-key': api_key
    }
    
    try:
        # Fetch World Cup 2026 matches
        url = "https://api-football.p.rapidapi.com/fixtures"
        querystring = {
            "league": "1",  # World Cup league ID
            "season": "2026"
        }
        
        response = requests.get(url, headers=headers, params=querystring, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        return process_wc_data(data)
        
    except Exception as e:
        print(f"API Error: {e}, using sample data")
        return load_sample_data()

def process_wc_data(api_data):
    """Process API data into our format"""
    
    matches = []
    try:
        if 'response' in api_data:
            for fixture in api_data['response'][:10]:  # Get first 10 matches
                match = {
                    'id': fixture['fixture']['id'],
                    'team1': {
                        'name': fixture['teams']['home']['name'],
                        'flag': get_flag_emoji(fixture['teams']['home']['name']),
                        'id': fixture['teams']['home']['id']
                    },
                    'team2': {
                        'name': fixture['teams']['away']['name'],
                        'flag': get_flag_emoji(fixture['teams']['away']['name']),
                        'id': fixture['teams']['away']['id']
                    },
                    'time': fixture['fixture']['date'],
                    'status': fixture['fixture']['status']['short'],
                    'score': {
                        'team1': fixture['goals']['home'] or 0,
                        'team2': fixture['goals']['away'] or 0
                    },
                    'venue': fixture['fixture']['venue']['name'],
                    'group': 'TBD'
                }
                matches.append(match)
    except Exception as e:
        print(f"Processing error: {e}")
        return load_sample_data()
    
    return {'matches': matches, 'updated': datetime.now().isoformat()}

def load_sample_data():
    """Load sample World Cup 2026 data"""
    
    sample_data = {
        'matches': [
            {
                'id': 1,
                'team1': {'name': 'USA', 'flag': '🇺🇸', 'id': 1},
                'team2': {'name': 'Mexico', 'flag': '🇲🇽', 'id': 2},
                'time': '2026-06-12T18:00:00Z',
                'status': 'LIVE',
                'score': {'team1': 2, 'team2': 1},
                'venue': 'AT&T Stadium',
                'group': 'C'
            },
            {
                'id': 2,
                'team1': {'name': 'Argentina', 'flag': '🇦🇷', 'id': 3},
                'team2': {'name': 'Chile', 'flag': '🇨🇱', 'id': 4},
                'time': '2026-06-12T21:00:00Z',
                'status': 'SCHEDULED',
                'score': {'team1': 0, 'team2': 0},
                'venue': 'MetLife Stadium',
                'group': 'A'
            },
            {
                'id': 3,
                'team1': {'name': 'France', 'flag': '🇫🇷', 'id': 5},
                'team2': {'name': 'Netherlands', 'flag': '🇳🇱', 'id': 6},
                'time': '2026-06-13T00:00:00Z',
                'status': 'SCHEDULED',
                'score': {'team1': 0, 'team2': 0},
                'venue': 'SoFi Stadium',
                'group': 'D'
            },
            {
                'id': 4,
                'team1': {'name': 'Germany', 'flag': '🇩🇪', 'id': 7},
                'team2': {'name': 'Italy', 'flag': '🇮🇹', 'id': 8},
                'time': '2026-06-13T03:00:00Z',
                'status': 'SCHEDULED',
                'score': {'team1': 0, 'team2': 0},
                'venue': 'Arrowhead Stadium',
                'group': 'B'
            }
        ],
        'updated': datetime.now().isoformat()
    }
    
    return sample_data

def get_flag_emoji(country_name):
    """Get flag emoji for country"""
    flags = {
        'USA': '🇺🇸', 'Mexico': '🇲🇽', 'Canada': '🇨🇦',
        'Argentina': '🇦🇷', 'Brazil': '🇧🇷', 'Uruguay': '🇺🇾',
        'France': '🇫🇷', 'Germany': '🇩🇪', 'Italy': '🇮🇹',
        'Spain': '🇪🇸', 'England': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Netherlands': '🇳🇱',
        'Portugal': '🇵🇹', 'Belgium': '🇧🇪', 'Poland': '🇵🇱',
        'Japan': '🇯🇵', 'South Korea': '🇰🇷', 'Australia': '🇦🇺',
        'Chile': '🇨🇱', 'Colombia': '🇨🇴', 'Peru': '🇵🇪'
    }
    return flags.get(country_name, '⚽')

if __name__ == '__main__':
    data = fetch_wc_data()
    print(json.dumps(data, indent=2))
    
    # Save to file
    with open('data/current_data.json', 'w') as f:
        json.dump(data, f, indent=2)
