package store

import (
	"context"
	"errors"
)

const (
	DefaultSessionSize = 50
	MinSessionSize     = 1
	MaxSessionSize     = 200
)

type GameSettings struct {
	GameID      string `json:"gameId"`
	SessionSize int    `json:"sessionSize"`
}

func (s *Store) GetSessionSize(ctx context.Context, gameID string) (int, error) {
	var size int
	err := s.pool.QueryRow(ctx, `
		SELECT session_size FROM game_settings WHERE game_id = $1
	`, gameID).Scan(&size)
	if err != nil {
		return DefaultSessionSize, nil
	}
	return size, nil
}

func (s *Store) SetSessionSize(ctx context.Context, gameID string, size int) (GameSettings, error) {
	if size < MinSessionSize || size > MaxSessionSize {
		return GameSettings{}, errors.New("session size must be between 1 and 200")
	}

	var gs GameSettings
	err := s.pool.QueryRow(ctx, `
		INSERT INTO game_settings (game_id, session_size)
		VALUES ($1, $2)
		ON CONFLICT (game_id) DO UPDATE SET session_size = EXCLUDED.session_size
		RETURNING game_id, session_size
	`, gameID, size).Scan(&gs.GameID, &gs.SessionSize)
	return gs, err
}
