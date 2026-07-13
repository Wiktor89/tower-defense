package store

import (
	"context"
	"fmt"
	"os"
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
			created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		);

		ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);

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

		INSERT INTO game_settings (game_id, session_size)
		VALUES ('math-columns', 50)
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
	`)
	return err
}
