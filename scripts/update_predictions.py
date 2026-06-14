#!/usr/bin/env python3
import json
import os
from datetime import datetime
import random

def update_predictions():
    """Update match predictions based on actual results"""
    
    try:
        with open('data/current_data.json', 'r') as f:
            data = json.load(f)
    except Exception as e:
        print(f"Error loading data: {e}")
        return False
    
    matches = data.get('matches', [])
    leaderboard = data.get('leaderboard', {})
    
    # Update predictions for each match
    for match in matches:
        status = match.get('status', 'UPCOMING')
        score = match.get('score', {})
        team1_score = score.get('team1', 0)
        team2_score = score.get('team2', 0)
        
        # Generate new predictions based on match status
        if status in ['LIVE', 'IN_PLAY']:
            match['predictions'] = generate_live_predictions(match, team1_score, team2_score)
        elif status in ['FT', 'FINISHED', 'COMPLETED']:
            match['predictions'] = generate_final_predictions(match, team1_score, team2_score)
            update_leaderboard(match, leaderboard)
        else:
            match['predictions'] = generate_upcoming_predictions(match)
    
    # Update leaderboard
    data['leaderboard'] = leaderboard
    data['updated'] = datetime.utcnow().isoformat() + 'Z'
    
    # Save updated data
    try:
        with open('data/current_data.json', 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("✅ Predictions updated successfully")
        return True
    except Exception as e:
        print(f"Error saving predictions: {e}")
        return False

def generate_upcoming_predictions(match):
    """Generate predictions for upcoming matches"""
    team1 = match.get('team1', {}).get('name', 'Team 1')
    team2 = match.get('team2', {}).get('name', 'Team 2')
    
    # Calculate win probabilities based on team strength (simplified)
    team1_strength = random.uniform(0.3, 0.9)
    team2_strength = random.uniform(0.3, 0.9)
    
    total = team1_strength + team2_strength
    team1_win_prob = (team1_strength / total) * 0.55  # Win probability
    draw_prob = 0.25
    team2_win_prob = (team2_strength / total) * 0.20  # Win probability
    
    predictions = [
        {
            "score": f"{random.randint(1,3)}-{random.randint(0,2)} {team1}",
            "prob": f"{int(team1_win_prob * 100)}%",
            "odds": f"{round(1 / (team1_win_prob + 0.1), 2)}"
        },
        {
            "score": "1-1 Draw",
            "prob": f"{int(draw_prob * 100)}%",
            "odds": f"{round(1 / draw_prob, 2)}"
        },
        {
            "score": f"{random.randint(0,2)}-{random.randint(1,3)} {team2}",
            "prob": f"{int(team2_win_prob * 100)}%",
            "odds": f"{round(1 / (team2_win_prob + 0.1), 2)}"
        }
    ]
    return predictions

def generate_live_predictions(match, team1_score, team2_score):
    """Generate live match predictions (in-play)"""
    team1 = match.get('team1', {}).get('name', 'Team 1')
    team2 = match.get('team2', {}).get('name', 'Team 2')
    
    # Current score is base prediction
    remaining_goals_prob = 0.6  # 60% chance of more goals
    
    predictions = [
        {
            "score": f"{team1_score + 1}-{team2_score} {team1}",
            "prob": f"{int(remaining_goals_prob * 45)}%",
            "odds": "2.10"
        },
        {
            "score": f"{team1_score}-{team2_score + 1} {team2}",
            "prob": f"{int(remaining_goals_prob * 35)}%",
            "odds": "2.80"
        },
        {
            "score": f"{team1_score}-{team2_score} Draw",
            "prob": f"{int((1 - remaining_goals_prob) * 100)}%",
            "odds": "1.90"
        }
    ]
    return predictions

def generate_final_predictions(match, team1_score, team2_score):
    """Generate final score predictions (match completed)"""
    team1 = match.get('team1', {}).get('name', 'Team 1')
    team2 = match.get('team2', {}).get('name', 'Team 2')
    
    if team1_score > team2_score:
        winner = team1
        confidence = 100
    elif team2_score > team1_score:
        winner = team2
        confidence = 100
    else:
        winner = "Draw"
        confidence = 100
    
    predictions = [
        {
            "score": f"Final: {team1_score}-{team2_score}",
            "prob": f"{confidence}%",
            "odds": "1.00"
        },
        {
            "score": f"Winner: {winner}",
            "prob": f"{confidence}%",
            "odds": "1.00"
        },
        {
            "score": "Match Completed",
            "prob": "100%",
            "odds": "1.00"
        }
    ]
    return predictions

def update_leaderboard(match, leaderboard):
    """Update leaderboard with match results"""
    
    if 'scorers' not in leaderboard:
        leaderboard['scorers'] = []
    if 'assists' not in leaderboard:
        leaderboard['assists'] = []
    if 'cards' not in leaderboard:
        leaderboard['cards'] = []
    
    # Simulate goal scorers (in real scenario, this would come from API)
    team1_goals = match.get('score', {}).get('team1', 0)
    team2_goals = match.get('score', {}).get('team2', 0)
    
    team1_name = match.get('team1', {}).get('name', 'Team 1')
    team2_name = match.get('team2', {}).get('name', 'Team 2')
    
    # Update scorers (simplified)
    if team1_goals > 0:
        for scorer in leaderboard['scorers']:
            if scorer['team'] == team1_name and random.random() > 0.5:
                scorer['goals'] += team1_goals
                break
    
    if team2_goals > 0:
        for scorer in leaderboard['scorers']:
            if scorer['team'] == team2_name and random.random() > 0.5:
                scorer['goals'] += team2_goals
                break
    
    # Re-sort leaderboards
    leaderboard['scorers'] = sorted(
        leaderboard['scorers'],
        key=lambda x: x['goals'],
        reverse=True
    )
    
    # Update ranks
    for idx, player in enumerate(leaderboard['scorers'], 1):
        player['rank'] = idx
    
    for idx, player in enumerate(leaderboard['assists'], 1):
        player['rank'] = idx
    
    for idx, player in enumerate(leaderboard['cards'], 1):
        player['rank'] = idx

def update_standings(data):
    """Update group standings based on match results"""
    
    matches = data.get('matches', [])
    standings = data.get('standings', {})
    
    # Reset standings
    for group in standings.get('groups', []):
        for team in group.get('teams', []):
            team['played'] = 0
            team['wins'] = 0
            team['draws'] = 0
            team['losses'] = 0
            team['points'] = 0
    
    # Process each completed match
    for match in matches:
        if match.get('status') not in ['FT', 'FINISHED', 'COMPLETED']:
            continue
        
        team1_name = match.get('team1', {}).get('name')
        team2_name = match.get('team2', {}).get('name')
        team1_score = match.get('score', {}).get('team1', 0)
        team2_score = match.get('score', {}).get('team2', 0)
        
        # Find teams in standings and update
        for group in standings.get('groups', []):
            for team in group.get('teams', []):
                if team['name'] == team1_name:
                    team['played'] += 1
                    if team1_score > team2_score:
                        team['wins'] += 1
                        team['points'] += 3
                    elif team1_score == team2_score:
                        team['draws'] += 1
                        team['points'] += 1
                    else:
                        team['losses'] += 1
                
                if team['name'] == team2_name:
                    team['played'] += 1
                    if team2_score > team1_score:
                        team['wins'] += 1
                        team['points'] += 3
                    elif team1_score == team2_score:
                        team['draws'] += 1
                        team['points'] += 1
                    else:
                        team['losses'] += 1
    
    # Sort teams in each group by points
    for group in standings.get('groups', []):
        group['teams'] = sorted(
            group['teams'],
            key=lambda x: (x['points'], x['wins']),
            reverse=True
        )

if __name__ == "__main__":
    print("🔄 Updating predictions...")
    update_predictions()
    print("✅ Predictions update complete")
