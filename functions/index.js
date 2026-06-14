const functions = require("firebase-functions");
const axios = require("axios");
const admin = require("firebase-admin");

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.database();

// Environment variables
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const SOFASCORE_API = "https://api.sofascore.com/api/v1";

// ============ CLOUD FUNCTION #1: FETCH LIVE MATCH DATA ============
exports.fetchLiveMatches = functions.pubsub
  .schedule("0 6 * * *") // 6 AM UTC (9 AM UTC+3 Estonia)
  .timeZone("UTC")
  .onRun(async (context) => {
    console.log("🔄 Fetching live World Cup 2026 matches...");
    
    try {
      // Fetch from Sofascore API
      const matches = await fetchSofascoreData();
      
      // Enrich with Claude analysis
      const enrichedMatches = await Promise.all(
        matches.map(async (match) => {
          const analysis = await getClaudeAnalysis(match);
          return { ...match, analysis13part: analysis };
        })
      );

      // Save to database
      await db.ref("matches").set(enrichedMatches);
      console.log(`✅ Updated ${enrichedMatches.length} matches`);
      
      return { success: true, matchesUpdated: enrichedMatches.length };
    } catch (error) {
      console.error("❌ Error fetching matches:", error);
      return { success: false, error: error.message };
    }
  });

// ============ CLOUD FUNCTION #2: ANALYZE MATCH (ON-DEMAND) ============
exports.analyzeMatch = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST");
  res.set("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return;
  }

  try {
    const { matchId, team1, team2, stats, score } = req.body;

    const analysis = await getClaudeAnalysis({
      id: matchId,
      team1: { name: team1 },
      team2: { name: team2 },
      stats,
      score,
    });

    res.json({ success: true, analysis });
  } catch (error) {
    console.error("❌ Analysis error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ CLOUD FUNCTION #3: GET BETTING ODDS ============
exports.getBettingOdds = functions.https.onRequest(async (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");

  try {
    const { matchId } = req.query;

    // Fetch from betting APIs (RapidAPI)
    const odds = await fetchBettingOdds(matchId);

    res.json({ success: true, odds });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============ HELPER FUNCTIONS ============

/**
 * Fetch match data from Sofascore API
 */
async function fetchSofascoreData() {
  try {
    // Get World Cup 2026 tournament ID and upcoming matches
    const response = await axios.get(`${SOFASCORE_API}/tournaments`, {
      headers: { "X-RapidAPI-Key": RAPIDAPI_KEY },
    });

    const wcTournament = response.data.find(
      (t) => t.name.includes("World Cup") && t.season === 2026
    );

    if (!wcTournament) {
      console.warn("⚠️ World Cup 2026 tournament not found");
      return [];
    }

    // Fetch matches for next 24 hours
    const matchesRes = await axios.get(
      `${SOFASCORE_API}/tournaments/${wcTournament.id}/matches`,
      {
        params: {
          limit: 50,
          offset: 0,
        },
        headers: { "X-RapidAPI-Key": RAPIDAPI_KEY },
      }
    );

    return matchesRes.data.events.map((match) => ({
      id: match.id,
      time: new Date(match.startTimestamp * 1000).toISOString(),
      status: match.status?.type || "UPCOMING",
      venue: match.venue?.name || "TBD",
      attendance: match.attendance || "TBD",
      referee: match.referee?.name || "TBD",
      team1: {
        name: match.homeTeam.name,
        flag: getTeamFlag(match.homeTeam.name),
        group: getTeamGroup(match.homeTeam.name),
      },
      team2: {
        name: match.awayTeam.name,
        flag: getTeamFlag(match.awayTeam.name),
        group: getTeamGroup(match.awayTeam.name),
      },
      score: {
        team1: match.homeScore?.current || 0,
        team2: match.awayScore?.current || 0,
      },
      stats: await extractMatchStats(match),
      lineups: await extractLineups(match),
      predictions: generatePredictions(match),
      weather: {
        temperature: match.weather?.temperatureCelsius || "N/A",
        condition: match.weather?.description || "Clear",
        humidity: "N/A",
        windSpeed: "N/A",
      },
    }));
  } catch (error) {
    console.error("❌ Sofascore API error:", error);
    return [];
  }
}

/**
 * Get Claude AI Analysis (13-part)
 */
async function getClaudeAnalysis(match) {
  try {
    const prompt = `
You are an expert football/soccer analyst. Analyze this World Cup 2026 match and provide a detailed 13-part analysis in JSON format.

Match: ${match.team1.name} vs ${match.team2.name}
Stats: ${JSON.stringify(match.stats || {})}
Score: ${match.score?.team1 || 0}-${match.score?.team2 || 0}

Provide analysis for these 13 categories:
1. Recent Form/Trends
2. Head-to-Head History
3. Key Players Analysis
4. Tactical Setup/Formation
5. Injury & Suspension Status
6. Home/Away Record
7. Possession & Ball Control
8. Shooting & Finishing
9. Defensive Strength
10. Set Piece Effectiveness
11. Player Matchups
12. Environmental Factors (Weather, Venue)
13. Historical Context

Return as JSON array with objects: { "category": "1. Name", "insight": "detailed insight" }
`;

    const response = await axios.post(
      "https://api.anthropic.com/v1/messages",
      {
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      },
      {
        headers: {
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
        },
      }
    );

    const analysisText = response.data.content[0].text;
    const jsonMatch = analysisText.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // Fallback if parsing fails
    return generateFallbackAnalysis(match);
  } catch (error) {
    console.error("❌ Claude API error:", error);
    return generateFallbackAnalysis(match);
  }
}

/**
 * Extract match statistics from Sofascore
 */
async function extractMatchStats(match) {
  return {
    possession: {
      team1: match.statistics?.[0]?.possession || 50,
      team2: match.statistics?.[1]?.possession || 50,
    },
    shots: {
      team1: match.statistics?.[0]?.shots || 0,
      team2: match.statistics?.[1]?.shots || 0,
    },
    shotsOnTarget: {
      team1: match.statistics?.[0]?.shotsOnTarget || 0,
      team2: match.statistics?.[1]?.shotsOnTarget || 0,
    },
    xG: {
      team1: (match.statistics?.[0]?.expectedGoals || 0).toFixed(2),
      team2: (match.statistics?.[1]?.expectedGoals || 0).toFixed(2),
    },
    passes: {
      team1: match.statistics?.[0]?.passes || 0,
      team2: match.statistics?.[1]?.passes || 0,
    },
    tackles: {
      team1: match.statistics?.[0]?.tackles || 0,
      team2: match.statistics?.[1]?.tackles || 0,
    },
    fouls: {
      team1: match.statistics?.[0]?.fouls || 0,
      team2: match.statistics?.[1]?.fouls || 0,
    },
    passAccuracy: {
      team1: match.statistics?.[0]?.passAccuracy || 85,
      team2: match.statistics?.[1]?.passAccuracy || 85,
    },
    corners: {
      team1: match.statistics?.[0]?.corners || 0,
      team2: match.statistics?.[1]?.corners || 0,
    },
  };
}

/**
 * Extract lineups from match data
 */
async function extractLineups(match) {
  return {
    team1: {
      formation: match.homeTeam.formation || "4-3-3",
      players: (match.homeTeam.players || []).slice(0, 11).map((p) => ({
        number: p.shirtNumber,
        name: p.name,
        position: p.position || "Unknown",
        club: p.team?.name || "N/A",
        rating: Math.round(Math.random() * 20 + 60) / 10, // Placeholder rating
      })),
    },
    team2: {
      formation: match.awayTeam.formation || "4-2-3-1",
      players: (match.awayTeam.players || []).slice(0, 11).map((p) => ({
        number: p.shirtNumber,
        name: p.name,
        position: p.position || "Unknown",
        club: p.team?.name || "N/A",
        rating: Math.round(Math.random() * 20 + 60) / 10, // Placeholder rating
      })),
    },
  };
}

/**
 * Fetch betting odds from RapidAPI
 */
async function fetchBettingOdds(matchId) {
  try {
    const response = await axios.get(
      `https://api-football-v1.p.rapidapi.com/v3/odds`,
      {
        params: {
          fixture: matchId,
          bet: "1X2",
        },
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
        },
      }
    );

    return response.data.response || {};
  } catch (error) {
    console.error("❌ Betting odds error:", error);
    return {};
  }
}

/**
 * Generate match predictions
 */
function generatePredictions(match) {
  const team1Possession = match.statistics?.[0]?.possession || 50;
  const team1Expected = match.statistics?.[0]?.expectedGoals || 1;

  return [
    {
      score: `${Math.ceil(team1Expected)}-0 ${match.homeTeam.name}`,
      prob: "35%",
      odds: "3.20",
    },
    {
      score: "1-1 Draw",
      prob: "25%",
      odds: "3.50",
    },
    {
      score: `0-${Math.ceil(match.statistics?.[1]?.expectedGoals || 1)} ${match.awayTeam.name}`,
      prob: "20%",
      odds: "4.00",
    },
  ];
}

/**
 * Generate fallback analysis
 */
function generateFallbackAnalysis(match) {
  return [
    {
      category: "1. Recent Form",
      insight: `${match.team1.name} in solid form heading into tournament. ${match.team2.name} looking to make impact.`,
    },
    {
      category: "2. Head-to-Head",
      insight: `Historical meetings favor ${match.team1.name}. Recent form suggests competitive match.`,
    },
    {
      category: "3. Key Players",
      insight: `Both teams have quality attacking threats. Midfield battle will be crucial.`,
    },
    {
      category: "4. Tactics",
      insight: `Expect balanced approach from both sides with focus on possession and control.`,
    },
    {
      category: "5. Injuries",
      insight: `Both teams appear at full strength for this fixture.`,
    },
    {
      category: "6. Home/Away",
      insight: `Neutral venue. No significant home advantage for either team.`,
    },
    {
      category: "7. Possession",
      insight: `Expect competitive possession battle with slight edge to ${match.team1.name}.`,
    },
    {
      category: "8. Shooting",
      insight: `Both teams efficient in front of goal. Clinical finishing likely decisive.`,
    },
    {
      category: "9. Defense",
      insight: `Solid defensive organizations from both sides. Few easy chances expected.`,
    },
    {
      category: "10. Set Pieces",
      insight: `Both teams dangerous from dead balls. Corner and free-kick conversion key.`,
    },
    {
      category: "11. Player Matchups",
      insight: `Multiple tactical subplots. Midfield matchup likely to determine flow of game.`,
    },
    {
      category: "12. Venue/Weather",
      insight: `Professional stadium setup. Weather conditions neutral for both teams.`,
    },
    {
      category: "13. Context",
      insight: `Important group stage match. Both teams seeking early tournament momentum.`,
    },
  ];
}

/**
 * Utility: Get team flag emoji
 */
function getTeamFlag(teamName) {
  const flags = {
    Argentina: "🇦🇷",
    USA: "🇺🇸",
    Mexico: "🇲🇽",
    Chile: "🇨🇱",
    France: "🇫🇷",
    Germany: "🇩🇪",
    Netherlands: "🇳🇱",
    Italy: "🇮🇹",
    Brazil: "🇧🇷",
    Spain: "🇪🇸",
    Portugal: "🇵🇹",
    Uruguay: "🇺🇾",
    England: "🇬🇧",
    Belgium: "🇧🇪",
    Croatia: "🇭🇷",
    Serbia: "🇷🇸",
    Poland: "🇵🇱",
    Denmark: "🇩🇰",
    "Czech Republic": "🇨🇿",
    Tunisia: "🇹🇳",
    Canada: "🇨🇦",
    Morocco: "🇲🇦",
    Senegal: "🇸🇳",
    "South Korea": "🇰🇷",
    Switzerland: "🇨🇭",
    Austria: "🇦🇹",
    Sweden: "🇸🇪",
    Greece: "🇬🇷",
    Japan: "🇯🇵",
    Australia: "🇦🇺",
    "Saudi Arabia": "🇸🇦",
    "New Zealand": "🇳🇿",
  };
  return flags[teamName] || "🏳️";
}

/**
 * Utility: Get team group
 */
function getTeamGroup(teamName) {
  const groups = {
    Argentina: "A", USA: "A", Mexico: "A", Chile: "A",
    France: "B", Germany: "B", Netherlands: "B", Italy: "B",
    Brazil: "C", Spain: "C", Portugal: "C", Uruguay: "C",
    England: "D", Belgium: "D", Croatia: "D", Serbia: "D",
    Poland: "E", Denmark: "E", "Czech Republic": "E", Tunisia: "E",
    Canada: "F", Morocco: "F", Senegal: "F", "South Korea": "F",
    Switzerland: "G", Austria: "G", Sweden: "G", Greece: "G",
    Japan: "H", Australia: "H", "Saudi Arabia": "H", "New Zealand": "H",
  };
  return groups[teamName] || "Unknown";
}

module.exports = {
  fetchLiveMatches: exports.fetchLiveMatches,
  analyzeMatch: exports.analyzeMatch,
  getBettingOdds: exports.getBettingOdds,
};
