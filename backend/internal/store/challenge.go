package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

const ChallengeGameID = "daily-challenge"

type ChallengeGame struct {
	GameID   string `json:"gameId"`
	Title    string `json:"title,omitempty"`
	URL      string `json:"url,omitempty"`
	Position int    `json:"position"`
	Done     bool   `json:"done"`
}

type DailyChallenge struct {
	ID        int             `json:"id"`
	UserID    int             `json:"userId,omitempty"`
	UserLogin string          `json:"userLogin,omitempty"`
	Games     []ChallengeGame `json:"games"`
	CreatedAt time.Time       `json:"createdAt"`
}

type ChallengeDayProgress struct {
	Date     string `json:"date"`
	Label    string `json:"label"`
	Done     bool   `json:"done"`
	IsReward bool   `json:"isReward,omitempty"`
}

type ChallengeWeekProgress struct {
	Days   []ChallengeDayProgress `json:"days"`
	Wins   int                    `json:"wins"`
	Praise string                 `json:"praise"`
}

type ChallengeStatus struct {
	Challenge   *DailyChallenge        `json:"challenge"`
	Games       []ChallengeGame        `json:"games"`
	Completed   int                    `json:"completed"`
	Total       int                    `json:"total"`
	AllDone     bool                   `json:"allDone"`
	Reward      *StageCompletion       `json:"reward,omitempty"`
	Week        *ChallengeWeekProgress `json:"week,omitempty"`
}

var challengeWeekdayLabels = [...]string{"вс", "пн", "вт", "ср", "чт", "пт", "сб"}

func praiseForChallengeWins(wins int) string {
	switch {
	case wins <= 0:
		return "Вы готовы к прекрасной неделе"
	case wins == 1:
		return "Первая победа! Так держать"
	case wins == 2:
		return "Две победы — ты в ритме!"
	case wins == 3:
		return "Три дня силы — продолжай!"
	case wins == 4:
		return "Уже 4 из 7 — ты почти чемпион!"
	case wins == 5:
		return "Пять побед! Неделя горит"
	case wins == 6:
		return "Шесть дней! Ещё один — и подарок!"
	default:
		return "Семь из семи! Неделя твоя!"
	}
}

func (s *Store) GetChallengeWeekProgress(ctx context.Context, userID int) (*ChallengeWeekProgress, error) {
	loc, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		loc = time.FixedZone("MSK", 3*60*60)
	}
	now := time.Now().In(loc)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	lookback := today.AddDate(0, 0, -14)

	doneDays := make(map[string]bool)
	rows, err := s.pool.Query(ctx, `
		SELECT DISTINCT (completed_at AT TIME ZONE 'Europe/Moscow')::date
		FROM stage_completions
		WHERE user_id = $1
		  AND game_id = $2
		  AND completed_at >= $3
	`, userID, ChallengeGameID, lookback)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var day time.Time
		if err := rows.Scan(&day); err != nil {
			return nil, err
		}
		doneDays[day.Format("2006-01-02")] = true
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	// Серия подряд, заканчивающаяся сегодня (если сегодня ещё не пройден — 0).
	streak := 0
	if doneDays[today.Format("2006-01-02")] {
		for d := today; ; d = d.AddDate(0, 0, -1) {
			if !doneDays[d.Format("2006-01-02")] {
				break
			}
			streak++
			if streak >= 7 {
				break
			}
		}
	}

	// 7 слотов: слева реальная серия побед, справа пустые дни, последний — подарок.
	start := today
	if streak > 0 {
		start = today.AddDate(0, 0, -(streak - 1))
	}
	days := make([]ChallengeDayProgress, 0, 7)
	for i := 0; i < 7; i++ {
		day := start.AddDate(0, 0, i)
		days = append(days, ChallengeDayProgress{
			Date:     day.Format("2006-01-02"),
			Label:    challengeWeekdayLabels[day.Weekday()],
			Done:     i < streak,
			IsReward: i == 6,
		})
	}

	return &ChallengeWeekProgress{
		Days:   days,
		Wins:   streak,
		Praise: praiseForChallengeWins(streak),
	}, nil
}

func (s *Store) loadChallengeGames(ctx context.Context, challengeID int) ([]ChallengeGame, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT game_id, position FROM daily_challenge_games
		WHERE challenge_id = $1
		ORDER BY position, game_id
	`, challengeID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []ChallengeGame
	for rows.Next() {
		var g ChallengeGame
		if err := rows.Scan(&g.GameID, &g.Position); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

func (s *Store) GetActiveChallenge(ctx context.Context) (*DailyChallenge, error) {
	var ch DailyChallenge
	err := s.pool.QueryRow(ctx, `
		SELECT id, created_at FROM daily_challenges
		WHERE active = TRUE AND user_id IS NULL
		ORDER BY id DESC
		LIMIT 1
	`).Scan(&ch.ID, &ch.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	list, err := s.loadChallengeGames(ctx, ch.ID)
	if err != nil {
		return nil, err
	}
	ch.Games = list
	return &ch, nil
}

func (s *Store) SetActiveChallenge(ctx context.Context, gameIDs []string) (*DailyChallenge, error) {
	seen := make(map[string]bool, len(gameIDs))
	clean := make([]string, 0, len(gameIDs))
	for _, id := range gameIDs {
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		clean = append(clean, id)
	}
	if len(clean) == 0 {
		return nil, errors.New("at least one game is required")
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `UPDATE daily_challenges SET active = FALSE WHERE active = TRUE`); err != nil {
		return nil, err
	}

	var ch DailyChallenge
	if err := tx.QueryRow(ctx, `
		INSERT INTO daily_challenges (active, user_id) VALUES (TRUE, NULL)
		RETURNING id, created_at
	`).Scan(&ch.ID, &ch.CreatedAt); err != nil {
		return nil, err
	}

	for i, gameID := range clean {
		if _, err := tx.Exec(ctx, `
			INSERT INTO daily_challenge_games (challenge_id, game_id, position)
			VALUES ($1, $2, $3)
		`, ch.ID, gameID, i+1); err != nil {
			return nil, err
		}
		ch.Games = append(ch.Games, ChallengeGame{GameID: gameID, Position: i + 1})
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return &ch, nil
}

func (s *Store) challengeGamesForUser(ctx context.Context, userID int, all []ChallengeGame) ([]ChallengeGame, error) {
	user, err := s.GetUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	if user.Grade == nil {
		return []ChallengeGame{}, nil
	}
	grade := *user.Grade
	out := make([]ChallengeGame, 0, len(all))
	for _, g := range all {
		ok, err := s.IsGameSuitableForGrade(ctx, g.GameID, grade)
		if err != nil {
			return nil, err
		}
		if ok {
			out = append(out, g)
		}
	}
	return out, nil
}

func (s *Store) MarkChallengeGameDone(ctx context.Context, userID int, gameID string) (*StageCompletion, error) {
	ch, err := s.GetActiveChallenge(ctx)
	if err != nil || ch == nil {
		return nil, err
	}

	relevant, err := s.challengeGamesForUser(ctx, userID, ch.Games)
	if err != nil {
		return nil, err
	}
	inChallenge := false
	for _, g := range relevant {
		if g.GameID == gameID {
			inChallenge = true
			break
		}
	}
	if !inChallenge {
		return nil, nil
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO daily_challenge_progress (challenge_id, user_id, game_id)
		VALUES ($1, $2, $3)
		ON CONFLICT (challenge_id, user_id, game_id) DO NOTHING
	`, ch.ID, userID, gameID)
	if err != nil {
		return nil, err
	}

	status, err := s.GetChallengeStatus(ctx, userID)
	if err != nil || status == nil || !status.AllDone {
		return nil, err
	}
	if status.Reward != nil {
		return status.Reward, nil
	}
	reward, err := s.grantChallengeReward(ctx, userID, ch.ID)
	if err != nil {
		return nil, err
	}
	return &reward, nil
}

func (s *Store) grantChallengeReward(ctx context.Context, userID, challengeID int) (StageCompletion, error) {
	planet := randomPlanet()
	code := randomCode()

	var sc StageCompletion
	err := s.pool.QueryRow(ctx, `
		INSERT INTO stage_completions (user_id, game_id, stage, planet, code, reward_rub, verified, verified_at)
		VALUES ($1, $2, $3, $4, $5, 100, FALSE, NULL)
		ON CONFLICT (user_id, game_id, stage) DO UPDATE SET
			planet = stage_completions.planet,
			code = stage_completions.code,
			reward_rub = stage_completions.reward_rub,
			verified = stage_completions.verified,
			verified_at = stage_completions.verified_at,
			completed_at = stage_completions.completed_at
		RETURNING id, user_id, game_id, stage, planet, code, reward_rub, verified, completed_at, verified_at
	`, userID, ChallengeGameID, challengeID, planet, code).Scan(
		&sc.ID, &sc.UserID, &sc.GameID, &sc.Stage, &sc.Planet, &sc.Code, &sc.RewardRub,
		&sc.Verified, &sc.CompletedAt, &sc.VerifiedAt,
	)
	if err != nil {
		return StageCompletion{}, err
	}
	sc.PlanetName = PlanetName(sc.Planet)
	return sc, nil
}

func (s *Store) GetChallengeStatus(ctx context.Context, userID int) (*ChallengeStatus, error) {
	ch, err := s.GetActiveChallenge(ctx)
	if err != nil {
		return nil, err
	}
	week, weekErr := s.GetChallengeWeekProgress(ctx, userID)
	if weekErr != nil {
		return nil, weekErr
	}

	if ch == nil {
		return &ChallengeStatus{Games: []ChallengeGame{}, Total: 0, Week: week}, nil
	}

	relevant, err := s.challengeGamesForUser(ctx, userID, ch.Games)
	if err != nil {
		return nil, err
	}
	if len(relevant) == 0 {
		return &ChallengeStatus{Challenge: ch, Games: []ChallengeGame{}, Total: 0, Week: week}, nil
	}

	done := make(map[string]bool)
	rows, err := s.pool.Query(ctx, `
		SELECT game_id FROM daily_challenge_progress
		WHERE challenge_id = $1 AND user_id = $2
	`, ch.ID, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var gameID string
		if err := rows.Scan(&gameID); err != nil {
			return nil, err
		}
		done[gameID] = true
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	list := make([]ChallengeGame, 0, len(relevant))
	completed := 0
	for _, g := range relevant {
		item := g
		item.Done = done[g.GameID]
		if item.Done {
			completed++
		}
		list = append(list, item)
	}

	status := &ChallengeStatus{
		Challenge: ch,
		Games:     list,
		Completed: completed,
		Total:     len(list),
		AllDone:   len(list) > 0 && completed == len(list),
		Week:      week,
	}

	var sc StageCompletion
	err = s.pool.QueryRow(ctx, `
		SELECT id, user_id, game_id, stage, planet, code, reward_rub, verified, completed_at, verified_at
		FROM stage_completions
		WHERE user_id = $1 AND game_id = $2 AND stage = $3
	`, userID, ChallengeGameID, ch.ID).Scan(
		&sc.ID, &sc.UserID, &sc.GameID, &sc.Stage, &sc.Planet, &sc.Code, &sc.RewardRub,
		&sc.Verified, &sc.CompletedAt, &sc.VerifiedAt,
	)
	if err == nil {
		sc.PlanetName = PlanetName(sc.Planet)
		status.Reward = &sc
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return nil, err
	}

	return status, nil
}

func (s *Store) VerifyChallenge(ctx context.Context, userLogin, planet string, code int) (VerifyResult, error) {
	var sc StageCompletion
	err := s.pool.QueryRow(ctx, `
		SELECT sc.id, sc.user_id, u.login, sc.game_id, sc.stage, sc.planet, sc.code, sc.reward_rub, sc.verified
		FROM stage_completions sc
		JOIN users u ON u.id = sc.user_id
		WHERE u.login = $1 AND sc.game_id = $2
		ORDER BY sc.completed_at DESC
		LIMIT 1
	`, userLogin, ChallengeGameID).Scan(
		&sc.ID, &sc.UserID, &sc.UserLogin, &sc.GameID, &sc.Stage, &sc.Planet, &sc.Code, &sc.RewardRub, &sc.Verified,
	)
	if err != nil {
		return VerifyResult{Verified: false, Message: "Вызов дня не найден для этого пользователя"}, nil
	}

	if sc.Planet != planet || sc.Code != code {
		return VerifyResult{Verified: false, Message: "Код или планета не совпадают"}, nil
	}
	if sc.Verified {
		return VerifyResult{Verified: true, Message: "Уже подтверждено ранее"}, nil
	}

	_, err = s.pool.Exec(ctx, `
		UPDATE stage_completions SET verified = TRUE, verified_at = NOW() WHERE id = $1
	`, sc.ID)
	if err != nil {
		return VerifyResult{}, err
	}
	return VerifyResult{Verified: true, Message: "Вызов дня подтверждён!"}, nil
}
