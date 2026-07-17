package store

import (
	"context"
	"time"
)

type DailyGameProgress struct {
	UserID   int    `json:"userId"`
	GameID   string `json:"gameId"`
	Day      string `json:"day"`
	Solved   int    `json:"solved"`
	Correct  int    `json:"correct"`
	Wrong    int    `json:"wrong"`
	Complete bool   `json:"complete"`
}

func moscowToday() (time.Time, string) {
	loc, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		loc = time.FixedZone("MSK", 3*60*60)
	}
	now := time.Now().In(loc)
	day := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, loc)
	return day, day.Format("2006-01-02")
}

func (s *Store) GetDailyProgress(ctx context.Context, userID int, gameID string) (DailyGameProgress, error) {
	day, dayKey := moscowToday()
	var p DailyGameProgress
	err := s.pool.QueryRow(ctx, `
		SELECT user_id, game_id, day::text, solved, correct, wrong, complete
		FROM daily_game_progress
		WHERE user_id = $1 AND game_id = $2 AND day = $3::date
	`, userID, gameID, day).Scan(
		&p.UserID, &p.GameID, &p.Day, &p.Solved, &p.Correct, &p.Wrong, &p.Complete,
	)
	if err != nil {
		return DailyGameProgress{
			UserID: userID,
			GameID: gameID,
			Day:    dayKey,
		}, nil
	}
	return p, nil
}

func (s *Store) bumpDailyProgress(ctx context.Context, userID int, gameID string, solvedDelta, correctDelta, wrongDelta int) (DailyGameProgress, error) {
	day, _ := moscowToday()
	var p DailyGameProgress
	err := s.pool.QueryRow(ctx, `
		INSERT INTO daily_game_progress (user_id, game_id, day, solved, correct, wrong, complete)
		VALUES ($1, $2, $3::date, $4, $5, $6, FALSE)
		ON CONFLICT (user_id, game_id, day) DO UPDATE SET
			solved = daily_game_progress.solved + EXCLUDED.solved,
			correct = daily_game_progress.correct + EXCLUDED.correct,
			wrong = daily_game_progress.wrong + EXCLUDED.wrong,
			updated_at = NOW()
		RETURNING user_id, game_id, day::text, solved, correct, wrong, complete
	`, userID, gameID, day, solvedDelta, correctDelta, wrongDelta).Scan(
		&p.UserID, &p.GameID, &p.Day, &p.Solved, &p.Correct, &p.Wrong, &p.Complete,
	)
	return p, err
}

func (s *Store) RecordDailyCorrect(ctx context.Context, userID int, gameID string, sessionSize int) (DailyGameProgress, bool, error) {
	cur, err := s.GetDailyProgress(ctx, userID, gameID)
	if err != nil {
		return cur, false, err
	}
	// Серия уже закрыта сегодня — только копим correct, solved не трогаем.
	if sessionSize > 0 && cur.Complete {
		p, err := s.bumpDailyProgress(ctx, userID, gameID, 0, 1, 0)
		return p, false, err
	}

	p, err := s.bumpDailyProgress(ctx, userID, gameID, 1, 1, 0)
	if err != nil {
		return p, false, err
	}
	if sessionSize > 0 && p.Solved >= sessionSize && !p.Complete {
		day, _ := moscowToday()
		err = s.pool.QueryRow(ctx, `
			UPDATE daily_game_progress
			SET complete = TRUE, solved = $4, updated_at = NOW()
			WHERE user_id = $1 AND game_id = $2 AND day = $3::date
			RETURNING user_id, game_id, day::text, solved, correct, wrong, complete
		`, userID, gameID, day, sessionSize).Scan(
			&p.UserID, &p.GameID, &p.Day, &p.Solved, &p.Correct, &p.Wrong, &p.Complete,
		)
		if err != nil {
			return p, false, err
		}
		return p, true, nil
	}
	return p, false, nil
}

func (s *Store) RecordDailyWrong(ctx context.Context, userID int, gameID string) (DailyGameProgress, error) {
	return s.bumpDailyProgress(ctx, userID, gameID, 0, 0, 1)
}

func (s *Store) ResetDailyProgress(ctx context.Context, userID int, gameID string) (DailyGameProgress, error) {
	day, dayKey := moscowToday()
	var p DailyGameProgress
	err := s.pool.QueryRow(ctx, `
		INSERT INTO daily_game_progress (user_id, game_id, day, solved, correct, wrong, complete)
		VALUES ($1, $2, $3::date, 0, 0, 0, FALSE)
		ON CONFLICT (user_id, game_id, day) DO UPDATE SET
			solved = 0,
			correct = 0,
			wrong = 0,
			complete = FALSE,
			updated_at = NOW()
		RETURNING user_id, game_id, day::text, solved, correct, wrong, complete
	`, userID, gameID, day).Scan(
		&p.UserID, &p.GameID, &p.Day, &p.Solved, &p.Correct, &p.Wrong, &p.Complete,
	)
	if err != nil {
		return DailyGameProgress{UserID: userID, GameID: gameID, Day: dayKey}, err
	}
	return p, nil
}
