package store

import (
	"context"
	"crypto/rand"
	"errors"
	"math/big"
	"time"
)

var Planets = []struct {
	ID   string
	Name string
}{
	{"mercury", "Меркурий"},
	{"venus", "Венера"},
	{"earth", "Земля"},
	{"mars", "Марс"},
	{"jupiter", "Юпитер"},
	{"saturn", "Сатурн"},
	{"uranus", "Уран"},
	{"neptune", "Нептун"},
}

func PlanetName(id string) string {
	for _, p := range Planets {
		if p.ID == id {
			return p.Name
		}
	}
	return id
}

type StageCompletion struct {
	ID          int       `json:"id"`
	UserID      int       `json:"userId"`
	UserLogin   string    `json:"userLogin,omitempty"`
	GameID      string    `json:"gameId"`
	Stage       int       `json:"stage"`
	Planet      string    `json:"planet"`
	PlanetName  string    `json:"planetName"`
	Code        int       `json:"code"`
	RewardRub   int       `json:"rewardRub"`
	Verified    bool      `json:"verified"`
	CompletedAt time.Time `json:"completedAt"`
	VerifiedAt  *time.Time `json:"verifiedAt,omitempty"`
}

func randomPlanet() string {
	n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(Planets))))
	return Planets[n.Int64()].ID
}

func randomCode() int {
	n, _ := rand.Int(rand.Reader, big.NewInt(90))
	return int(n.Int64()) + 10
}

func (s *Store) CompleteStage(ctx context.Context, userID int, gameID string, stage int) (StageCompletion, error) {
	if stage < 1 || stage > 3 {
		return StageCompletion{}, errors.New("invalid stage")
	}

	planet := randomPlanet()
	code := randomCode()

	var sc StageCompletion
	err := s.pool.QueryRow(ctx, `
		INSERT INTO stage_completions (user_id, game_id, stage, planet, code, reward_rub, verified, verified_at)
		VALUES ($1, $2, $3, $4, $5, 100, FALSE, NULL)
		ON CONFLICT (user_id, game_id, stage) DO UPDATE SET
			planet = EXCLUDED.planet,
			code = EXCLUDED.code,
			reward_rub = EXCLUDED.reward_rub,
			verified = FALSE,
			verified_at = NULL,
			completed_at = NOW()
		RETURNING id, user_id, game_id, stage, planet, code, reward_rub, verified, completed_at, verified_at
	`, userID, gameID, stage, planet, code).Scan(
		&sc.ID, &sc.UserID, &sc.GameID, &sc.Stage, &sc.Planet, &sc.Code, &sc.RewardRub,
		&sc.Verified, &sc.CompletedAt, &sc.VerifiedAt,
	)
	if err != nil {
		return StageCompletion{}, err
	}
	sc.PlanetName = PlanetName(sc.Planet)
	return sc, nil
}

type VerifyResult struct {
	Verified bool   `json:"verified"`
	Message  string `json:"message"`
}

func (s *Store) VerifyStage(ctx context.Context, userLogin, gameID string, stage int, planet string, code int) (VerifyResult, error) {
	var sc StageCompletion
	err := s.pool.QueryRow(ctx, `
		SELECT sc.id, sc.user_id, u.login, sc.game_id, sc.stage, sc.planet, sc.code, sc.reward_rub, sc.verified
		FROM stage_completions sc
		JOIN users u ON u.id = sc.user_id
		WHERE u.login = $1 AND sc.game_id = $2 AND sc.stage = $3
	`, userLogin, gameID, stage).Scan(
		&sc.ID, &sc.UserID, &sc.UserLogin, &sc.GameID, &sc.Stage, &sc.Planet, &sc.Code, &sc.RewardRub, &sc.Verified,
	)
	if err != nil {
		return VerifyResult{Verified: false, Message: "Этап не найден для этого пользователя"}, nil
	}

	if sc.Planet != planet || sc.Code != code {
		return VerifyResult{
			Verified: false,
			Message:  "Код или планета не совпадают",
		}, nil
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

	return VerifyResult{
		Verified: true,
		Message:  "Пользователь подтверждён! Этап пройден.",
	}, nil
}

func (s *Store) ListStageCompletions(ctx context.Context) ([]StageCompletion, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT sc.id, sc.user_id, u.login, sc.game_id, sc.stage, sc.planet, sc.code,
		       sc.reward_rub, sc.verified, sc.completed_at, sc.verified_at
		FROM stage_completions sc
		JOIN users u ON u.id = sc.user_id
		ORDER BY sc.completed_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []StageCompletion
	for rows.Next() {
		var sc StageCompletion
		if err := rows.Scan(
			&sc.ID, &sc.UserID, &sc.UserLogin, &sc.GameID, &sc.Stage, &sc.Planet, &sc.Code,
			&sc.RewardRub, &sc.Verified, &sc.CompletedAt, &sc.VerifiedAt,
		); err != nil {
			return nil, err
		}
		sc.PlanetName = PlanetName(sc.Planet)
		result = append(result, sc)
	}
	return result, rows.Err()
}
