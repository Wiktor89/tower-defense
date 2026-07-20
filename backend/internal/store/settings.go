package store

import (
	"context"
	"errors"
)

const (
	DefaultSessionSize = 50
	MinSessionSize     = 1
	MaxSessionSize     = 200
	DefaultDigitCount  = 2
	MinDigitCount      = 1
	MaxDigitCount      = 6
)

type GameSettings struct {
	GameID      string `json:"gameId"`
	SessionSize int    `json:"sessionSize"`
	DigitCount  int    `json:"digitCount"`
}

func (s *Store) GetSessionSize(ctx context.Context, gameID string) (int, error) {
	gs, err := s.GetGameSettings(ctx, gameID)
	if err != nil {
		return DefaultSessionSize, nil
	}
	return gs.SessionSize, nil
}

func (s *Store) GetDigitCount(ctx context.Context, gameID string) (int, error) {
	gs, err := s.GetGameSettings(ctx, gameID)
	if err != nil {
		return DefaultDigitCount, nil
	}
	return gs.DigitCount, nil
}

func (s *Store) GetGameSettings(ctx context.Context, gameID string) (GameSettings, error) {
	var gs GameSettings
	err := s.pool.QueryRow(ctx, `
		SELECT game_id, session_size, digit_count FROM game_settings WHERE game_id = $1
	`, gameID).Scan(&gs.GameID, &gs.SessionSize, &gs.DigitCount)
	if err != nil {
		return GameSettings{
			GameID:      gameID,
			SessionSize: DefaultSessionSize,
			DigitCount:  DefaultDigitCount,
		}, err
	}
	if gs.DigitCount < MinDigitCount || gs.DigitCount > MaxDigitCount {
		gs.DigitCount = DefaultDigitCount
	}
	return gs, nil
}

func (s *Store) SetGameSettings(ctx context.Context, gameID string, sessionSize, digitCount int) (GameSettings, error) {
	if sessionSize < MinSessionSize || sessionSize > MaxSessionSize {
		return GameSettings{}, errors.New("session size must be between 1 and 200")
	}
	if digitCount < MinDigitCount || digitCount > MaxDigitCount {
		return GameSettings{}, errors.New("digit count must be between 1 and 6")
	}

	var gs GameSettings
	err := s.pool.QueryRow(ctx, `
		INSERT INTO game_settings (game_id, session_size, digit_count)
		VALUES ($1, $2, $3)
		ON CONFLICT (game_id) DO UPDATE SET
			session_size = EXCLUDED.session_size,
			digit_count = EXCLUDED.digit_count
		RETURNING game_id, session_size, digit_count
	`, gameID, sessionSize, digitCount).Scan(&gs.GameID, &gs.SessionSize, &gs.DigitCount)
	return gs, err
}

func (s *Store) SetMathColumnsSettings(ctx context.Context, sessionSize, digitCount int) (GameSettings, error) {
	return s.SetGameSettings(ctx, "math-columns", sessionSize, digitCount)
}

func (s *Store) SetSessionSize(ctx context.Context, gameID string, sessionSize int) (GameSettings, error) {
	if sessionSize < MinSessionSize || sessionSize > MaxSessionSize {
		return GameSettings{}, errors.New("session size must be between 1 and 200")
	}
	cur, _ := s.GetGameSettings(ctx, gameID)
	digitCount := cur.DigitCount
	if digitCount < MinDigitCount || digitCount > MaxDigitCount {
		digitCount = DefaultDigitCount
	}
	return s.SetGameSettings(ctx, gameID, sessionSize, digitCount)
}
