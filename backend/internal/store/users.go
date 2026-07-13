package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrUserNotFound      = errors.New("user not found")
	ErrPasswordRequired  = errors.New("password required")
	ErrInvalidPassword   = errors.New("invalid password")
	ErrPasswordTooShort  = errors.New("password must be at least 4 characters")
	ErrPasswordMismatch  = errors.New("current password is incorrect")
)

type User struct {
	ID          int       `json:"id"`
	Login       string    `json:"login"`
	HasPassword bool      `json:"hasPassword"`
	CreatedAt   time.Time `json:"createdAt"`
}

func normalizeLogin(login string) (string, error) {
	login = strings.TrimSpace(login)
	if login == "" {
		return "", errors.New("login is required")
	}
	if len(login) > 64 {
		return "", errors.New("login too long")
	}
	return login, nil
}

func hashPassword(password string) (string, error) {
	if len(password) < 4 {
		return "", ErrPasswordTooShort
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

func checkPassword(password, hash string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password)) == nil
}

func (s *Store) LoginUser(ctx context.Context, login, password string) (User, error) {
	login, err := normalizeLogin(login)
	if err != nil {
		return User{}, err
	}

	var user User
	var passwordHash *string
	err = s.pool.QueryRow(ctx, `
		SELECT id, login, password_hash, created_at FROM users WHERE login = $1
	`, login).Scan(&user.ID, &user.Login, &passwordHash, &user.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return s.createUser(ctx, login)
	}
	if err != nil {
		return User{}, err
	}

	user.HasPassword = passwordHash != nil && *passwordHash != ""
	if user.HasPassword {
		if password == "" {
			return User{}, ErrPasswordRequired
		}
		if !checkPassword(password, *passwordHash) {
			return User{}, ErrInvalidPassword
		}
	}

	return user, nil
}

func (s *Store) createUser(ctx context.Context, login string) (User, error) {
	var user User
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (login) VALUES ($1)
		RETURNING id, login, created_at
	`, login).Scan(&user.ID, &user.Login, &user.CreatedAt)
	if err != nil {
		return User{}, err
	}
	user.HasPassword = false
	return user, nil
}

func (s *Store) GetOrCreateUser(ctx context.Context, login string) (User, error) {
	return s.LoginUser(ctx, login, "")
}

func (s *Store) GetUser(ctx context.Context, id int) (User, error) {
	var user User
	var passwordHash *string
	err := s.pool.QueryRow(ctx, `
		SELECT id, login, password_hash, created_at FROM users WHERE id = $1
	`, id).Scan(&user.ID, &user.Login, &passwordHash, &user.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, err
	}
	user.HasPassword = passwordHash != nil && *passwordHash != ""
	return user, err
}

func (s *Store) SetUserPassword(ctx context.Context, userID int, newPassword, currentPassword string) (User, error) {
	if len(newPassword) < 4 {
		return User{}, ErrPasswordTooShort
	}

	var passwordHash *string
	var user User
	err := s.pool.QueryRow(ctx, `
		SELECT id, login, password_hash, created_at FROM users WHERE id = $1
	`, userID).Scan(&user.ID, &user.Login, &passwordHash, &user.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, err
	}

	hasPassword := passwordHash != nil && *passwordHash != ""
	if hasPassword {
		if currentPassword == "" {
			return User{}, ErrPasswordRequired
		}
		if !checkPassword(currentPassword, *passwordHash) {
			return User{}, ErrPasswordMismatch
		}
	}

	hash, err := hashPassword(newPassword)
	if err != nil {
		return User{}, err
	}

	err = s.pool.QueryRow(ctx, `
		UPDATE users SET password_hash = $2 WHERE id = $1
		RETURNING id, login, created_at
	`, userID, hash).Scan(&user.ID, &user.Login, &user.CreatedAt)
	if err != nil {
		return User{}, err
	}
	user.HasPassword = true
	return user, nil
}

func (s *Store) DeleteUser(ctx context.Context, userID int) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}
