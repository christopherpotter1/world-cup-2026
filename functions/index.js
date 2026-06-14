const functions = require("firebase-functions");
const axios = require("axios");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.database();

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

// SCHEDULE: Every day at 6 AM UTC (9 AM UTC+3 Estonia)
exports.dailyWorldCupUpdate = functions.pubsub
  .schedule("0 6 * * *")
  .timeZone("UTC")
  .onRun(async (context) => {
    console.log("🔄 STARTING WORLD CUP 2026 DAILY UPDATE...");
    
    try {
      // 1. FETCH REAL MATCHES FROM SOFASCORE
      const matches = await fetchAllWorldCupMatches();
      console.log(`✅ Fetched ${matches.length} matches`);

      // 2. ENRICH WITH DETAILED DATA
      const enrichedMatches = await Promise.all(
        matches.map(async (match) => {
          console.log(`📊 Processing: ${match.team1.name} vs ${match.team2.name}`);
          
          // Get full stats, lineups with ratings
          const lineups = await fetchLineups(match.id);
          const stats = await fetchMatchStats(match.id);
          const playerRatings = await fetchPlayerRatings(match.id);
          const analysis = await getClaudeAnalysis(match, stats, lineups);
          const odds = await fetchBettingOdds(match);
          const form = await fetchTeamForm(match.team1.name, match.team2.name);
          const h2h = await fetchH2H(match.team1.name, match.team2.name);
          const social = await fetchSocialMedia(match);
          const predictions = generatePredictions(stats);

          return {
            ...match,
            lineups: mergeRatingsWithLineups(lineups, playerRatings),
            stats,
            analysis13part: analysis,
            bettingOdds: odds,
            form,
            h2h,
            social,
            predictions,
            playerRatings,
            lastUpdated: new Date().toISOString(),
          };
        })
      );

      // 3. UPDATE LEADERBOARD
      const leaderboard = await updateLeaderboard(enrichedMatches);

      // 4. UPDATE STANDINGS
      const standings = await updateStandings(enrichedMatches);

      // 5. UPDATE BRACKET
      const bracket = await updateBracket(enrichedMatches);

      // 6. SAVE EVERYTHING TO FIREBASE
      await db.ref("matches").set(enrichedMatches);
      await db.ref("leaderboard").set(leaderboard);
      await db.ref("standings").set(standings);
      await db.ref("bracket").set(bracket);
      await db.ref("lastUpdated").set(new Date().toISOString());

      console.log("✅ WORLD CUP UPDATE COMPLETE!");
      return { success: true };
    } catch (error) {
      console.error("❌ ERROR:", error);
      return { success: false, error: error.message };
    }
  });

// ============ FETCH ALL WORLD CUP 2026 MATCHES ============
async function fetchAllWorldCupMatches() {
  try {
    // Use Sofascore API to get World Cup 2026 matches
    const response = await axios.get(
      "https://api.sofascore.com/api/v1/tournaments/17/matches",
      {
        headers: { "X-RapidAPI-Key": RAPIDAPI_KEY },
      }
    );

    return response.data.events.map((match) => ({
      id: match.id,
      sofascoreId: match.id,
      time: new Date(match.startTimestamp * 1000).toISOString(),
      status: match.status?.type || "UPCOMING",
      venue: match.venue?.name || "TBD",
      attendance: match.attendance || null,
      referee: match.referee?.name || "TBD",
      team1: {
        name: match.homeTeam.name,
        flag: getTeamFlag(match.homeTeam.name),
        group: getTeamGroup(match.homeTeam.name),
        sofascoreId: match.homeTeam.id,
      },
      team2: {
        name: match.awayTeam.name,
        flag: getTeamFlag(match.awayTeam.name),
        group: getTeamGroup(match.awayTeam.name),
        sofascoreId: match.awayTeam.id,
      },
      score: {
        team1: match.homeScore?.current || 0,
        team2: match.awayScore?.current || 0,
      },
    }));
  } catch (error) {
    console.error("❌ Sofascore fetch error:", error);
    return [];
  }
}

// ============ FETCH LINEUPS ============
async function fetchLineups(matchId) {
  try {
    const response = await axios.get(
      `https://api.sofascore.com/api/v1/matches/${matchId}/lineups`,
      {
        headers: { "X-RapidAPI-Key": RAPIDAPI_KEY },
      }
    );

    const data = response.data;

    return {
      team1: {
        formation: data.home?.formation || "4-3-3",
        players: (data.home?.players || []).map((p) => ({
          number: p.shirtNumber,
          name: p.player.name,
          position: p.position,
          club: p.player.team?.name || "N/A",
          sofascoreId: p.player.id,
        })),
      },
      team2: {
        formation: data.away?.formation || "4-2-3-1",
        players: (data.away?.players || []).map((p) => ({
          number: p.shirtNumber,
          name: p.player.name,
          position: p.position,
          club: p.player.team?.name || "N/A",
          sofascoreId: p.player.id,
        })),
      },
    };
  } catch (error) {
    console.error("❌ Lineups fetch error:", error);
    return { team1: { formation: "4-3-3", players: [] }, team2: { formation: "4-2-3-1", players: [] } };
  }
}

// ============ FETCH PLAYER RATINGS ============
async function fetchPlayerRatings(matchId) {
  try {
    const response = await axios.get(
      `https://api.sofascore.com/api/v1/matches/${matchId}/statistics`,
      {
        headers: { "X-RapidAPI-Key": RAPIDAPI_KEY },
      }
    );

    const data = response.data;

    return {
      team1: (data.home?.players || []).map((p) => ({
        sofascoreId: p.player.id,
        name: p.player.name,
        rating: p.rating || 0,
        minutesPlayed: p.minutesPlayed || 0,
        goals: p.statistics?.goals || 0,
        assists: p.statistics?.assists || 0,
        passes: p.statistics?.passes || 0,
        shotsOnTarget: p.statistics?.shotsOnTarget || 0,
        tackles: p.statistics?.tackles || 0,
        interceptions: p.statistics?.interceptions || 0,
      })),
      team2: (data.away?.players || []).map((p) => ({
        sofascoreId: p.player.id,
        name: p.player.name,
        rating: p.rating || 0,
        minutesPlayed: p.minutesPlayed || 0,
        goals: p.statistics?.goals || 0,
        assists: p.statistics?.assists || 0,
        passes: p.statistics?.passes || 0,
        shotsOnTarget: p.statistics?.shotsOnTarget || 0,
        tackles: p.statistics?.tackles || 0,
        interceptions: p.statistics?.interceptions || 0,
      })),
    };
  } catch (error) {
    console.error("❌ Player ratings error:", error);
    return { team1: [], team2: [] };
  }
}

// ============ MERGE RATINGS WITH LINEUPS ============
function mergeRatingsWithLineups(lineups, ratings) {
  return {
    team1: {
      formation: lineups.team1.formation,
      players: lineups.team1.players.map((player) => {
        const rating = ratings.team1.find((r) => r.sofascoreId === player.sofascoreId);
        return {
          ...player,
          rating: rating?.rating || 0,
          stats: rating ? {
            goals: rating.goals,
            assists: rating.assists,
            passes: rating.passes,
            shotsOnTarget: rating.shotsOnTarget,
            tackles: rating.tackles,
            interceptions: rating.interceptions,
          } : {},
        };
      }),
    },
    team2: {
      formation: lineups.team2.formation,
      players: lineups.team2.players.map((player) => {
        const rating = ratings.team2.find((r) => r.sofascoreId === player.sofascoreId);
        return {
          ...player,
          rating: rating?.rating || 0,
          stats: rating ? {
            goals: rating.goals,
            assists: rating.assists,
            passes: rating.passes,
            shotsOnTarget: rating.shotsOnTarget,
            tackles: rating.tackles,
            interceptions: rating.interceptions,
          } : {},
        };
      }),
    },
  };
}

// ============ FETCH MATCH STATS ============
async function fetchMatchStats(matchId) {
  try {
    const response = await axios.get(
      `https://api.sofascore.com/api/v1/matches/${matchId}/statistics`,
      {
        headers: { "X-RapidAPI-Key": RAPIDAPI_KEY },
      }
    );

    const data = response.data;

    return {
      possession: {
        team1: data.home?.possession || 50,
        team2: data.away?.possession || 50,
      },
      shots: {
        team1: data.home?.shots || 0,
        team2: data.away?.shots || 0,
      },
      shotsOnTarget: {
        team1: data.home?.shotsOnTarget || 0,
        team2: data.away?.shotsOnTarget || 0,
      },
      xG: {
        team1: (data.home?.expectedGoals || 0).toFixed(2),
        team2: (data.away?.expectedGoals || 0).toFixed(2),
      },
      passes: {
        team1: data.home?.passes || 0,
        team2: data.away?.passes || 0,
      },
      passAccuracy: {
        team1: data.home?.passAccuracy || 85,
        team2: data.away?.passAccuracy || 85,
      },
      tackles: {
        team1: data.home?.tackles || 0,
        team2: data.away?.tackles || 0,
      },
      fouls: {
        team1: data.home?.fouls || 0,
        team2: data.away?.fouls || 0,
      },
      corners: {
        team1: data.home?.corners || 0,
        team2: data.away?.corners || 0,
      },
      yellowCards: {
        team1: data.home?.yellowCards || 0,
        team2: data.away?.yellowCards || 0,
      },
      redCards: {
        team1: data.home?.redCards || 0,
        team2: data.away?.redCards || 0,
      },
    };
  } catch (error) {
    console.error("❌ Stats fetch error:", error);
    return {};
  }
}

// ============ CLAUDE AI ANALYSIS (13-PART) ============
async function getClaudeAnalysis(match, stats, lineups) {
  try {
    const prompt = `Analyze this World Cup 2026 match comprehensively:

${match.team1.name} vs ${match.team2.name}
Status: ${match.status}
Score: ${match.score.team1}-${match.score.team2}
Possession: ${stats.possession?.team1 || 50}% - ${stats.possession?.team2 || 50}%
Shots: ${stats.shots?.team1 || 0} - ${stats.shots?.team2 || 0} (On target: ${stats.shotsOnTarget?.team1 || 0} - ${stats.shotsOnTarget?.team2 || 0})
xG: ${stats.xG?.team1 || 0} - ${stats.xG?.team2 || 0}
Passes: ${stats.passes?.team1 || 0} - ${stats.passes?.team2 || 0}
Pass Accuracy: ${stats.passAccuracy?.team1 || 85}% - ${stats.passAccuracy?.team2 || 85}%
Corners: ${stats.corners?.team1 || 0} - ${stats.corners?.team2 || 0}
Tackles: ${stats.tackles?.team1 || 0} - ${stats.tackles?.team2 || 0}

Provide detailed 13-point analysis as JSON array:
[
  {"category": "1. Recent Form", "insight": "..."},
  {"category": "2. Head-to-Head", "insight": "..."},
  ...13 points total
]`;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
      },
      {
        headers: {
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
        },
      }
    );

    const text = response.data.content[0].text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.error("❌ Claude error:", error);
  }

  return generateDefaultAnalysis(match);
}

// ============ BETTING ODDS ============
async function fetchBettingOdds(match) {
  try {
    const response = await axios.get(
      `https://api-football-v1.p.rapidapi.com/v3/odds`,
      {
        params: {
          fixture: match.sofascoreId,
          bet: "1X2,over_under,both_teams_score",
        },
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
        },
      }
    );

    return response.data.response || generateDefaultOdds();
  } catch (error) {
    console.error("❌ Odds error:", error);
    return generateDefaultOdds();
  }
}

function generateDefaultOdds() {
  return {
    "1X2 (CoolBet)": [
      { option: "Team 1 Win", odd: "2.50" },
      { option: "Draw", odd: "3.20" },
      { option: "Team 2 Win", odd: "3.00" },
    ],
    "Over/Under 2.5 (CoolBet)": [
      { option: "Over 2.5", odd: "1.90" },
      { option: "Under 2.5", odd: "1.90" },
    ],
    "Both Teams Score (CoolBet)": [
      { option: "Yes", odd: "1.70" },
      { option: "No", odd: "2.10" },
    ],
  };
}

// ============ TEAM FORM ============
async function fetchTeamForm(team1, team2) {
  try {
    const form1 = await axios.get(
      `https://api-football-v1.p.rapidapi.com/v3/teams/statistics`,
      {
        params: { team: team1, season: 2026 },
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
        },
      }
    );

    const form2 = await axios.get(
      `https://api-football-v1.p.rapidapi.com/v3/teams/statistics`,
      {
        params: { team: team2, season: 2026 },
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
        },
      }
    );

    return {
      team1: {
        winRate: form1.data.response?.statistics?.wins || "N/A",
        avgGoals: form1.data.response?.statistics?.goals?.for || "N/A",
        lastGames: form1.data.response?.fixtures?.last || [],
      },
      team2: {
        winRate: form2.data.response?.statistics?.wins || "N/A",
        avgGoals: form2.data.response?.statistics?.goals?.for || "N/A",
        lastGames: form2.data.response?.fixtures?.last || [],
      },
    };
  } catch (error) {
    console.error("❌ Form error:", error);
    return { team1: {}, team2: {} };
  }
}

// ============ HEAD-TO-HEAD ============
async function fetchH2H(team1, team2) {
  try {
    const response = await axios.get(
      `https://api-football-v1.p.rapidapi.com/v3/fixtures/headtohead`,
      {
        params: { h2h: `${team1}-${team2}`, limit: 10 },
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
        },
      }
    );

    const matches = response.data.response || [];

    return {
      matches: matches.length,
      team1Wins: matches.filter((m) => m.teams.home.name === team1 && m.goals.home > m.goals.away).length,
      draws: matches.filter((m) => m.goals.home === m.goals.away).length,
      team2Wins: matches.filter((m) => m.teams.away.name === team2 && m.goals.away > m.goals.home).length,
      recentResults: matches.slice(0, 3).map((m) => `${m.teams.home.name} ${m.goals.home}-${m.goals.away} ${m.teams.away.name}`),
    };
  } catch (error) {
    console.error("❌ H2H error:", error);
    return { matches: 0, recentResults: [] };
  }
}

// ============ SOCIAL MEDIA ============
async function fetchSocialMedia(match) {
  // Placeholder - integrate Twitter API or Sofascore events
  return [
    {
      author: "@FIFAWorldCup",
      platform: "Twitter",
      timestamp: "now",
      content: `⚽ ${match.team1.name} vs ${match.team2.name} - LIVE NOW! #WorldCup2026`,
    },
  ];
}

// ============ PREDICTIONS ============
function generatePredictions(stats) {
  const team1Xg = parseFloat(stats.xG?.team1 || 1.5);
  const team2Xg = parseFloat(stats.xG?.team2 || 1.2);

  return [
    {
      score: `${Math.ceil(team1Xg)}-${Math.floor(team2Xg)}`,
      prob: "35%",
      odds: "3.20",
    },
    {
      score: "1-1",
      prob: "25%",
      odds: "3.50",
    },
    {
      score: `${Math.floor(team1Xg)}-${Math.ceil(team2Xg)}`,
      prob: "20%",
      odds: "4.00",
    },
  ];
}

// ============ UPDATE LEADERBOARD ============
async function updateLeaderboard(matches) {
  const scorers = {};
  const assists = {};
  const cards = {};

  matches.forEach((match) => {
    if (match.playerRatings) {
      match.playerRatings.team1.forEach((p) => {
        if (!scorers[p.name]) scorers[p.name] = { player: p.name, team: match.team1.name, goals: 0 };
        scorers[p.name].goals += p.goals;
      });
      match.playerRatings.team2.forEach((p) => {
        if (!scorers[p.name]) scorers[p.name] = { player: p.name, team: match.team2.name, goals: 0 };
        scorers[p.name].goals += p.goals;
      });
    }
  });

  const sortedScorers = Object.values(scorers)
    .sort((a, b) => b.goals - a.goals)
    .slice(0, 10)
    .map((s, idx) => ({ rank: idx + 1, ...s }));

  return {
    scorers: sortedScorers,
    assists: [],
    cards: [],
  };
}

// ============ UPDATE STANDINGS ============
async function updateStandings(matches) {
  const groups = {
    A: { name: "Group A", teams: {} },
    B: { name: "Group B", teams: {} },
    C: { name: "Group C", teams: {} },
    D: { name: "Group D", teams: {} },
    E: { name: "Group E", teams: {} },
    F: { name: "Group F", teams: {} },
    G: { name: "Group G", teams: {} },
    H: { name: "Group H", teams: {} },
  };

  matches.forEach((match) => {
    const group = match.team1.group;
    if (!groups[group].teams[match.team1.name]) {
      groups[group].teams[match.team1.name] = { name: match.team1.name, played: 0, wins: 0, draws: 0, losses: 0, points: 0 };
    }
    if (!groups[group].teams[match.team2.name]) {
      groups[group].teams[match.team2.name] = { name: match.team2.name, played: 0, wins: 0, draws: 0, losses: 0, points: 0 };
    }

    if (match.status === "FINISHED") {
      groups[group].teams[match.team1.name].played++;
      groups[group].teams[match.team2.name].played++;

      if (match.score.team1 > match.score.team2) {
        groups[group].teams[match.team1.name].wins++;
        groups[group].teams[match.team1.name].points += 3;
        groups[group].teams[match.team2.name].losses++;
      } else if (match.score.team2 > match.score.team1) {
        groups[group].teams[match.team2.name].wins++;
        groups[group].teams[match.team2.name].points += 3;
        groups[group].teams[match.team1.name].losses++;
      } else {
        groups[group].teams[match.team1.name].draws++;
        groups[group].teams[match.team1.name].points++;
        groups[group].teams[match.team2.name].draws++;
        groups[group].teams[match.team2.name].points++;
      }
    }
  });

  return Object.values(groups).map((g) => ({
    ...g,
    teams: Object.values(g.teams).sort((a, b) => b.points - a.points),
  }));
}

// ============ UPDATE BRACKET ============
async function updateBracket(matches) {
  return {
    roundOf16: { matches: [] },
    quarterfinals: { matches: [] },
    semifinals: { matches: [] },
    final: { matches: [] },
  };
}

// ============ UTILITIES ============
function getTeamFlag(name) {
  const flags = {
    Argentina: "🇦🇷", USA: "🇺🇸", Mexico: "🇲🇽", Chile: "🇨🇱",
    France: "🇫🇷", Germany: "🇩🇪", Netherlands: "🇳🇱", Italy: "🇮🇹",
    Brazil: "🇧🇷", Spain: "🇪🇸", Portugal: "🇵🇹", Uruguay: "🇺🇾",
    England: "🇬🇧", Belgium: "🇧🇪", Croatia: "🇭🇷", Serbia: "🇷🇸",
    Poland: "🇵🇱", Denmark: "🇩🇰", "Czech Republic": "🇨🇿", Tunisia: "🇹🇳",
    Canada: "🇨🇦", Morocco: "🇲🇦", Senegal: "🇸🇳", "South Korea": "🇰🇷",
    Switzerland: "🇨🇭", Austria: "🇦🇹", Sweden: "🇸🇪", Greece: "🇬🇷",
    Japan: "🇯🇵", Australia: "🇦🇺", "Saudi Arabia": "🇸🇦", "New Zealand": "🇳🇿",
    Curaçao: "🇨🇼",
  };
  return flags[name] || "🏳️";
}

function getTeamGroup(name) {
  const groups = {
    Argentina: "A", USA: "A", Mexico: "A", Chile: "A",
    France: "B", Germany: "B", Netherlands: "B", Italy: "B",
    Brazil: "C", Spain: "C", Portugal: "C", Uruguay: "C",
    England: "D", Belgium: "D", Croatia: "D", Serbia: "D",
    Poland: "E", Denmark: "E", "Czech Republic": "E", Tunisia: "E",
    Canada: "F", Morocco: "F", Senegal: "F", "South Korea": "F",
    Switzerland: "G", Austria: "G", Sweden: "G", Greece: "G",
    Japan: "H", Australia: "H", "Saudi Arabia": "H", "New Zealand": "H",
    Curaçao: "A",
  };
  return groups[name] || "Unknown";
}

function generateDefaultAnalysis(match) {
  return [
    { category: "1. Recent Form", insight: `${match.team1.name} vs ${match.team2.name} - Detailed form analysis` },
    { category: "2. Head-to-Head", insight: "Historical matchup analysis" },
    { category: "3. Key Players", insight: "Player analysis" },
    { category: "4. Tactics", insight: "Tactical breakdown" },
    { category: "5. Injuries", insight: "Injury status" },
    { category: "6. Home/Away", insight: "Home/away record" },
    { category: "7. Possession", insight: "Possession analysis" },
    { category: "8. Shooting", insight: "Shooting efficiency" },
    { category: "9. Defense", insight: "Defensive strength" },
    { category: "10. Set Pieces", insight: "Set piece threat" },
    { category: "11. Matchups", insight: "Key player matchups" },
    { category: "12. Venue/Weather", insight: "Environmental factors" },
    { category: "13. Context", insight: "Tournament context" },
  ];
}
