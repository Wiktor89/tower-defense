package store

import (
	"context"
	"errors"
)

const FractionsGameID = "fractions"

func (s *Store) IsGameUnlocked(ctx context.Context, userID int, gameID string) (bool, error) {
	var exists bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM user_game_unlocks WHERE user_id = $1 AND game_id = $2
		)
	`, userID, gameID).Scan(&exists)
	return exists, err
}

func (s *Store) UnlockGame(ctx context.Context, userID int, gameID string) error {
	if _, err := s.GetUser(ctx, userID); err != nil {
		return err
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO user_game_unlocks (user_id, game_id)
		VALUES ($1, $2)
		ON CONFLICT (user_id, game_id) DO NOTHING
	`, userID, gameID)
	return err
}

func (s *Store) ResetGameUnlock(ctx context.Context, userID int, gameID string) error {
	if _, err := s.GetUser(ctx, userID); err != nil {
		return err
	}
	tag, err := s.pool.Exec(ctx, `
		DELETE FROM user_game_unlocks WHERE user_id = $1 AND game_id = $2
	`, userID, gameID)
	if err != nil {
		return err
	}
	_ = tag
	return nil
}

func (s *Store) FractionsTutorialDone(ctx context.Context, userID int) (bool, error) {
	return s.IsGameUnlocked(ctx, userID, FractionsGameID)
}

func (s *Store) CompleteFractionsTutorial(ctx context.Context, userID int) error {
	return s.UnlockGame(ctx, userID, FractionsGameID)
}

func (s *Store) ResetFractionsTutorial(ctx context.Context, userID int) error {
	if err := s.ResetGameUnlock(ctx, userID, FractionsGameID); err != nil {
		if errors.Is(err, ErrUserNotFound) {
			return err
		}
		return err
	}
	return nil
}
