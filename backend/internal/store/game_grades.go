package store

import (
	"context"
	"errors"

	"games/internal/games"
)

type GameGrade struct {
	GameID   string `json:"gameId"`
	MinGrade int    `json:"minGrade"`
	MaxGrade int    `json:"maxGrade"`
}

func (s *Store) ensureGameGrades(ctx context.Context) error {
	for _, g := range games.Catalog() {
		_, err := s.pool.Exec(ctx, `
			INSERT INTO game_grades (game_id, min_grade, max_grade)
			VALUES ($1, $2, $3)
			ON CONFLICT (game_id) DO NOTHING
		`, g.ID, g.MinGrade, g.MaxGrade)
		if err != nil {
			return err
		}
	}
	return nil
}

func (s *Store) GetGameGrade(ctx context.Context, gameID string) (GameGrade, error) {
	var gg GameGrade
	err := s.pool.QueryRow(ctx, `
		SELECT game_id, min_grade, max_grade FROM game_grades WHERE game_id = $1
	`, gameID).Scan(&gg.GameID, &gg.MinGrade, &gg.MaxGrade)
	if err != nil {
		for _, g := range games.Catalog() {
			if g.ID == gameID {
				return GameGrade{GameID: g.ID, MinGrade: g.MinGrade, MaxGrade: g.MaxGrade}, err
			}
		}
		return GameGrade{}, err
	}
	return gg, nil
}

func (s *Store) ListGameGrades(ctx context.Context) ([]GameGrade, error) {
	if err := s.ensureGameGrades(ctx); err != nil {
		return nil, err
	}
	rows, err := s.pool.Query(ctx, `
		SELECT game_id, min_grade, max_grade FROM game_grades ORDER BY game_id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []GameGrade
	for rows.Next() {
		var gg GameGrade
		if err := rows.Scan(&gg.GameID, &gg.MinGrade, &gg.MaxGrade); err != nil {
			return nil, err
		}
		out = append(out, gg)
	}
	return out, rows.Err()
}

func (s *Store) SetGameGrade(ctx context.Context, gameID string, minGrade, maxGrade int) (GameGrade, error) {
	if minGrade < 1 || minGrade > 11 || maxGrade < 1 || maxGrade > 11 {
		return GameGrade{}, errors.New("grade must be between 1 and 11")
	}
	if minGrade > maxGrade {
		return GameGrade{}, errors.New("minGrade must be <= maxGrade")
	}
	known := false
	for _, g := range games.Catalog() {
		if g.ID == gameID {
			known = true
			break
		}
	}
	if !known {
		return GameGrade{}, errors.New("unknown game")
	}

	var gg GameGrade
	err := s.pool.QueryRow(ctx, `
		INSERT INTO game_grades (game_id, min_grade, max_grade)
		VALUES ($1, $2, $3)
		ON CONFLICT (game_id) DO UPDATE SET
			min_grade = EXCLUDED.min_grade,
			max_grade = EXCLUDED.max_grade
		RETURNING game_id, min_grade, max_grade
	`, gameID, minGrade, maxGrade).Scan(&gg.GameID, &gg.MinGrade, &gg.MaxGrade)
	return gg, err
}

func (s *Store) gradeMap(ctx context.Context) (map[string]GameGrade, error) {
	list, err := s.ListGameGrades(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[string]GameGrade, len(list))
	for _, gg := range list {
		out[gg.GameID] = gg
	}
	return out, nil
}

func (s *Store) CatalogWithGrades(ctx context.Context) ([]games.Game, error) {
	grades, err := s.gradeMap(ctx)
	if err != nil {
		return nil, err
	}
	all := games.Catalog()
	out := make([]games.Game, 0, len(all))
	for _, g := range all {
		if gg, ok := grades[g.ID]; ok {
			g.MinGrade = gg.MinGrade
			g.MaxGrade = gg.MaxGrade
		}
		out = append(out, g)
	}
	return out, nil
}

func (s *Store) SuitableForGrade(ctx context.Context, grade int) ([]games.Game, error) {
	if grade < 1 || grade > 11 {
		return nil, nil
	}
	all, err := s.CatalogWithGrades(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]games.Game, 0, len(all))
	for _, g := range all {
		if grade >= g.MinGrade && grade <= g.MaxGrade {
			out = append(out, g)
		}
	}
	return out, nil
}

func (s *Store) SuitableGamesForUser(ctx context.Context, userID int, grade int) ([]games.Game, error) {
	list, err := s.SuitableForGrade(ctx, grade)
	if err != nil {
		return nil, err
	}
	return s.FilterVisibleGames(ctx, userID, list)
}

func (s *Store) IsGameSuitableForGrade(ctx context.Context, gameID string, grade int) (bool, error) {
	if grade < 1 || grade > 11 {
		return false, nil
	}
	gg, err := s.GetGameGrade(ctx, gameID)
	if err != nil {
		// fallback to catalog defaults when row missing
		return games.IsSuitableForGrade(gameID, grade), nil
	}
	return grade >= gg.MinGrade && grade <= gg.MaxGrade, nil
}
