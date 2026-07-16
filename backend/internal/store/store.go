package store

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	pool *pgxpool.Pool
}

func Connect(ctx context.Context) (*Store, error) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://games:games@localhost:5432/games?sslmode=disable"
	}

	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse database url: %w", err)
	}
	cfg.MaxConns = 10

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect database: %w", err)
	}

	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	s := &Store{pool: pool}
	if err := s.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	login, password := AdminBootstrapFromEnv()
	if err := s.EnsureAdminUser(ctx, login, password); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ensure admin user: %w", err)
	}
	return s, nil
}

func (s *Store) Close() {
	s.pool.Close()
}

func (s *Store) migrate(ctx context.Context) error {
	_, err := s.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS users (
			id SERIAL PRIMARY KEY,
			login VARCHAR(64) UNIQUE NOT NULL,
			password_hash VARCHAR(255),
			role VARCHAR(16) NOT NULL DEFAULT 'user',
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
		ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(16) NOT NULL DEFAULT 'user';
		ALTER TABLE users ADD COLUMN IF NOT EXISTS grade INTEGER
			CHECK (grade IS NULL OR (grade >= 1 AND grade <= 11));
		ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar VARCHAR(32) NOT NULL DEFAULT '';
		UPDATE users SET role = 'user' WHERE role IS NULL OR role = '';

		CREATE TABLE IF NOT EXISTS user_game_stats (
			id SERIAL PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			game_id VARCHAR(64) NOT NULL,
			correct INTEGER NOT NULL DEFAULT 0,
			wrong INTEGER NOT NULL DEFAULT 0,
			sessions_completed INTEGER NOT NULL DEFAULT 0,
			games_won INTEGER NOT NULL DEFAULT 0,
			games_lost INTEGER NOT NULL DEFAULT 0,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			UNIQUE(user_id, game_id)
		);

		CREATE TABLE IF NOT EXISTS stage_completions (
			id SERIAL PRIMARY KEY,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			game_id VARCHAR(64) NOT NULL,
			stage INTEGER NOT NULL,
			planet VARCHAR(32) NOT NULL,
			code INTEGER NOT NULL CHECK (code >= 10 AND code <= 99),
			reward_rub INTEGER NOT NULL DEFAULT 100,
			verified BOOLEAN NOT NULL DEFAULT FALSE,
			completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			verified_at TIMESTAMPTZ,
			UNIQUE(user_id, game_id, stage)
		);

		CREATE TABLE IF NOT EXISTS game_settings (
			game_id VARCHAR(64) PRIMARY KEY,
			session_size INTEGER NOT NULL DEFAULT 50 CHECK (session_size >= 1 AND session_size <= 200)
		);

		ALTER TABLE game_settings
			ADD COLUMN IF NOT EXISTS digit_count INTEGER NOT NULL DEFAULT 2;

		INSERT INTO game_settings (game_id, session_size, digit_count)
		VALUES ('math-columns', 50, 2)
		ON CONFLICT (game_id) DO NOTHING;

		CREATE TABLE IF NOT EXISTS fill_blank_texts (
			id SERIAL PRIMARY KEY,
			body TEXT NOT NULL,
			blank_percent INTEGER NOT NULL DEFAULT 30
				CHECK (blank_percent >= 10 AND blank_percent <= 90),
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		ALTER TABLE fill_blank_texts
			ADD COLUMN IF NOT EXISTS blank_percent INTEGER NOT NULL DEFAULT 30;

		CREATE TABLE IF NOT EXISTS daily_challenges (
			id SERIAL PRIMARY KEY,
			active BOOLEAN NOT NULL DEFAULT TRUE,
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		ALTER TABLE daily_challenges
			ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;

		CREATE UNIQUE INDEX IF NOT EXISTS daily_challenges_one_active_per_user
			ON daily_challenges (user_id)
			WHERE active = TRUE AND user_id IS NOT NULL;

		CREATE TABLE IF NOT EXISTS daily_challenge_games (
			challenge_id INTEGER NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
			game_id VARCHAR(64) NOT NULL,
			position INTEGER NOT NULL DEFAULT 1,
			PRIMARY KEY (challenge_id, game_id)
		);

		CREATE TABLE IF NOT EXISTS daily_challenge_progress (
			challenge_id INTEGER NOT NULL REFERENCES daily_challenges(id) ON DELETE CASCADE,
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			game_id VARCHAR(64) NOT NULL,
			completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (challenge_id, user_id, game_id)
		);

		CREATE TABLE IF NOT EXISTS game_grades (
			game_id VARCHAR(64) PRIMARY KEY,
			min_grade INTEGER NOT NULL CHECK (min_grade >= 1 AND min_grade <= 11),
			max_grade INTEGER NOT NULL CHECK (max_grade >= 1 AND max_grade <= 11),
			CHECK (min_grade <= max_grade)
		);

		CREATE TABLE IF NOT EXISTS user_game_unlocks (
			user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
			game_id VARCHAR(64) NOT NULL,
			unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
			PRIMARY KEY (user_id, game_id)
		);
	`)
	if err != nil {
		return err
	}
	if err := s.normalizeLoginCase(ctx); err != nil {
		return err
	}
	return s.ensureGameGrades(ctx)
}

func (s *Store) normalizeLoginCase(ctx context.Context) error {
	rows, err := s.pool.Query(ctx, `
		SELECT id, login FROM users ORDER BY id
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type row struct {
		id    int
		login string
	}
	var all []row
	for rows.Next() {
		var r row
		if err := rows.Scan(&r.id, &r.login); err != nil {
			return err
		}
		all = append(all, r)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	keep := make(map[string]int)
	for _, r := range all {
		canon := strings.ToLower(strings.TrimSpace(r.login))
		if canon == "" {
			continue
		}
		if first, ok := keep[canon]; ok {
			if _, err := s.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, r.id); err != nil {
				return err
			}
			_ = first
			continue
		}
		keep[canon] = r.id
		if r.login != canon {
			if _, err := s.pool.Exec(ctx, `UPDATE users SET login = $2 WHERE id = $1`, r.id, canon); err != nil {
				return err
			}
		}
	}

	_, err = s.pool.Exec(ctx, `
		CREATE UNIQUE INDEX IF NOT EXISTS users_login_lower_uidx ON users (lower(login))
	`)
	return err
}
