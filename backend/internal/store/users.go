package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var ErrUserNotFound = errors.New("user not found")

type User struct {
	ID        int       `json:"id"`
	Login     string    `json:"login"`
	CreatedAt time.Time `json:"createdAt"`
}

func (s *Store) GetOrCreateUser(ctx context.Context, login string) (User, error) {
	login = strings.TrimSpace(login)
	if login == "" {
		return User{}, errors.New("login is required")
	}
	if len(login) > 64 {
		return User{}, errors.New("login too long")
	}

	var user User
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (login) VALUES ($1)
		ON CONFLICT (login) DO UPDATE SET login = EXCLUDED.login
		RETURNING id, login, created_at
	`, login).Scan(&user.ID, &user.Login, &user.CreatedAt)
	if err != nil {
		return User{}, err
	}
	return user, nil
}

func (s *Store) GetUser(ctx context.Context, id int) (User, error) {
	var user User
	err := s.pool.QueryRow(ctx, `
		SELECT id, login, created_at FROM users WHERE id = $1
	`, id).Scan(&user.ID, &user.Login, &user.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUserNotFound
	}
	return user, err
}
