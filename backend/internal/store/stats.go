package store

import (
	"context"
	"time"
)

type GameStats struct {
	GameID             string    `json:"gameId"`
	Correct            int       `json:"correct"`
	Wrong              int       `json:"wrong"`
	SessionsCompleted  int       `json:"sessionsCompleted"`
	GamesWon           int       `json:"gamesWon"`
	GamesLost          int       `json:"gamesLost"`
	UpdatedAt          time.Time `json:"updatedAt"`
}

type StatsDelta struct {
	Correct           int
	Wrong             int
	SessionsCompleted int
	GamesWon          int
	GamesLost         int
}

type UserStatsRow struct {
	UserID    int         `json:"userId"`
	Login     string      `json:"login"`
	Role      string      `json:"role"`
	Grade     *int        `json:"grade"`
	CreatedAt time.Time   `json:"createdAt"`
	Games     []GameStats `json:"games"`
}

func (s *Store) AddStats(ctx context.Context, userID int, gameID string, delta StatsDelta) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO user_game_stats (user_id, game_id, correct, wrong, sessions_completed, games_won, games_lost)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
		ON CONFLICT (user_id, game_id) DO UPDATE SET
			correct = user_game_stats.correct + EXCLUDED.correct,
			wrong = user_game_stats.wrong + EXCLUDED.wrong,
			sessions_completed = user_game_stats.sessions_completed + EXCLUDED.sessions_completed,
			games_won = user_game_stats.games_won + EXCLUDED.games_won,
			games_lost = user_game_stats.games_lost + EXCLUDED.games_lost,
			updated_at = NOW()
	`, userID, gameID,
		delta.Correct, delta.Wrong, delta.SessionsCompleted, delta.GamesWon, delta.GamesLost)
	return err
}

func (s *Store) GetGameStats(ctx context.Context, userID int, gameID string) (GameStats, error) {
	var gs GameStats
	err := s.pool.QueryRow(ctx, `
		SELECT game_id, correct, wrong, sessions_completed, games_won, games_lost, updated_at
		FROM user_game_stats
		WHERE user_id = $1 AND game_id = $2
	`, userID, gameID).Scan(
		&gs.GameID, &gs.Correct, &gs.Wrong, &gs.SessionsCompleted, &gs.GamesWon, &gs.GamesLost, &gs.UpdatedAt,
	)
	if err != nil {
		return GameStats{GameID: gameID}, err
	}
	return gs, nil
}

func (s *Store) ListAllUserStats(ctx context.Context) ([]UserStatsRow, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT u.id, u.login, u.role, u.grade, u.created_at,
		       COALESCE(s.game_id, ''),
		       COALESCE(s.correct, 0),
		       COALESCE(s.wrong, 0),
		       COALESCE(s.sessions_completed, 0),
		       COALESCE(s.games_won, 0),
		       COALESCE(s.games_lost, 0),
		       COALESCE(s.updated_at, u.created_at)
		FROM users u
		LEFT JOIN user_game_stats s ON s.user_id = u.id
		ORDER BY u.login, s.game_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byUser := make(map[int]*UserStatsRow)
	order := make([]int, 0)

	for rows.Next() {
		var userID int
		var login string
		var role string
		var grade *int
		var createdAt time.Time
		var gameID string
		var gs GameStats

		if err := rows.Scan(
			&userID, &login, &role, &grade, &createdAt,
			&gameID, &gs.Correct, &gs.Wrong, &gs.SessionsCompleted, &gs.GamesWon, &gs.GamesLost, &gs.UpdatedAt,
		); err != nil {
			return nil, err
		}

		row, ok := byUser[userID]
		if !ok {
			if role == "" {
				role = RoleUser
			}
			row = &UserStatsRow{UserID: userID, Login: login, Role: role, Grade: grade, CreatedAt: createdAt, Games: []GameStats{}}
			byUser[userID] = row
			order = append(order, userID)
		}
		if gameID != "" {
			gs.GameID = gameID
			row.Games = append(row.Games, gs)
		}
	}

	result := make([]UserStatsRow, 0, len(order))
	for _, id := range order {
		result = append(result, *byUser[id])
	}
	return result, rows.Err()
}
