package store

import (
	"context"
	"errors"

	"games/internal/games"
)

type GameEnabled struct {
	GameID  string `json:"gameId"`
	Enabled bool   `json:"enabled"`
	Title   string `json:"title,omitempty"`
}

type UserGameAccess struct {
	GameID   string `json:"gameId"`
	Enabled  bool   `json:"enabled"`
	Override bool   `json:"override"`
	Title    string `json:"title,omitempty"`
}

func knownGameID(gameID string) bool {
	for _, g := range games.Catalog() {
		if g.ID == gameID {
			return true
		}
	}
	return false
}

func (s *Store) ensureGameEnabled(ctx context.Context) error {
	for _, g := range games.Catalog() {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO game_enabled (game_id, enabled)
			VALUES ($1, TRUE)
			ON CONFLICT (game_id) DO NOTHING
		`, g.ID)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) ListGameEnabled(ctx context.Context) ([]GameEnabled, error) {
	if err := s.ensureGameEnabled(ctx); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT game_id, enabled FROM game_enabled ORDER BY game_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byID := make(map[string]bool)
	for rows.Next() {
		var id string
		var enabled bool
		if err := rows.Scan(&id, &enabled); err != nil {
			return nil, err
		}
		byID[id] = enabled
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := make([]GameEnabled, 0, len(games.Catalog()))
	for _, g := range games.Catalog() {
		enabled, ok := byID[g.ID]
		if !ok {
			enabled = true
		}
		out = append(out, GameEnabled{GameID: g.ID, Enabled: enabled, Title: g.Title})
	}
	return out, nil
}

func (s *Store) SetGameEnabled(ctx context.Context, items []GameEnabled) ([]GameEnabled, error) {
	if err := s.ensureGameEnabled(ctx); err != nil {
		return nil, err
	}
	for _, item := range items {
		if !knownGameID(item.GameID) {
			return nil, errors.New("unknown game: " + item.GameID)
		}
		_, err := s.pool.Exec(ctx, `
			INSERT INTO game_enabled (game_id, enabled)
			VALUES ($1, $2)
			ON CONFLICT (game_id) DO UPDATE SET enabled = EXCLUDED.enabled
		`, item.GameID, item.Enabled)
		if err != nil {
			return nil, err
		}
	}
	return s.ListGameEnabled(ctx)
}

func (s *Store) globalEnabledMap(ctx context.Context) (map[string]bool, error) {
	list, err := s.ListGameEnabled(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]bool, len(list))
	for _, g := range list {
		out[g.GameID] = g.Enabled
	}
	return out, nil
}

func (s *Store) userAccessMap(ctx context.Context, userID int) (map[string]bool, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT game_id, enabled FROM user_game_access WHERE user_id = $1
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	out := make(map[string]bool)
	for rows.Next() {
		var id string
		var enabled bool
		if err := rows.Scan(&id, &enabled); err != nil {
			return nil, err
		}
		out[id] = enabled
	}
	return out, rows.Err()
}

func (s *Store) IsGameVisibleForUser(ctx context.Context, userID int, gameID string) (bool, error) {
	globals, err := s.globalEnabledMap(ctx)
	if err != nil {
		return false, err
	}
	if enabled, ok := globals[gameID]; ok && !enabled {
		return false, nil
	}
	overrides, err := s.userAccessMap(ctx, userID)
	if err != nil {
		return false, err
	}
	if enabled, ok := overrides[gameID]; ok {
		return enabled, nil
	}
	return true, nil
}

func (s *Store) FilterVisibleGames(ctx context.Context, userID int, list []games.Game) ([]games.Game, error) {
	overrides, err := s.userAccessMap(ctx, userID)
	if err != nil {
		return nil, err
	}
	globals, err := s.globalEnabledMap(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]games.Game, 0, len(list))
	for _, g := range list {
		if enabled, ok := globals[g.ID]; ok && !enabled {
			continue
		}
		if enabled, ok := overrides[g.ID]; ok && !enabled {
			continue
		}
		out = append(out, g)
	}
	return out, nil
}

func (s *Store) ListUserGameAccess(ctx context.Context, userID int) ([]UserGameAccess, error) {
	if _, err := s.GetUser(ctx, userID); err != nil {
		return nil, err
	}
	globals, err := s.globalEnabledMap(ctx)
	if err != nil {
		return nil, err
	}
	overrides, err := s.userAccessMap(ctx, userID)
	if err != nil {
		return nil, err
	}

	out := make([]UserGameAccess, 0, len(games.Catalog()))
	for _, g := range games.Catalog() {
		item := UserGameAccess{GameID: g.ID, Title: g.Title}
		if v, ok := overrides[g.ID]; ok {
			item.Enabled = v
			item.Override = true
		} else if v, ok := globals[g.ID]; ok {
			item.Enabled = v
		} else {
			item.Enabled = true
		}
		// Глобально выключенную нельзя «включить» персонально — только скрыть сверх глобального.
		if v, ok := globals[g.ID]; ok && !v {
			item.Enabled = false
		}
		out = append(out, item)
	}
	return out, nil
}

func (s *Store) SetUserGameAccess(ctx context.Context, userID int, items []UserGameAccess) ([]UserGameAccess, error) {
	if _, err := s.GetUser(ctx, userID); err != nil {
		return nil, err
	}
	for _, item := range items {
		if !knownGameID(item.GameID) {
			return nil, errors.New("unknown game: " + item.GameID)
		}
		if !item.Override {
			_, err := s.pool.Exec(ctx, `
				DELETE FROM user_game_access WHERE user_id = $1 AND game_id = $2
			`, userID, item.GameID)
			if err != nil {
				return nil, err
			}
			continue
		}
		_, err := s.pool.Exec(ctx, `
			INSERT INTO user_game_access (user_id, game_id, enabled)
			VALUES ($1, $2, $3)
			ON CONFLICT (user_id, game_id) DO UPDATE SET enabled = EXCLUDED.enabled
		`, userID, item.GameID, item.Enabled)
		if err != nil {
			return nil, err
		}
	}
	return s.ListUserGameAccess(ctx, userID)
}
