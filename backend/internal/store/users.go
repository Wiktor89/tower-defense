package store

import (
	"context"
	"errors"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	RoleUser  = "user"
	RoleAdmin = "admin"
)

var (
	ErrUserNotFound     = errors.New("user not found")
	ErrLoginTaken       = errors.New("login already taken")
	ErrPasswordRequired = errors.New("password required")
	ErrInvalidPassword  = errors.New("invalid password")
	ErrPasswordTooShort = errors.New("password must be at least 4 characters")
	ErrPasswordMismatch = errors.New("current password is incorrect")
	ErrNotAdmin         = errors.New("admin role required")
)

type User struct {
	ID          int       `json:"id"`
	Login       string    `json:"login"`
	Role        string    `json:"role"`
	Grade       *int      `json:"grade"`
	Avatar      string    `json:"avatar"`
	HasPassword bool      `json:"hasPassword"`
	CreatedAt   time.Time `json:"createdAt"`
}

func finalizeUser(user *User, passwordHash *string) {
	if user.Role == "" {
		user.Role = RoleUser
	}
	user.HasPassword = passwordHash != nil && *passwordHash != ""
}

func normalizeLogin(login string) (string, error) {
	login = strings.ToLower(strings.TrimSpace(login))
	if login == "" {
		return "", errors.New("login is required")
	}
	if len([]rune(login)) > 64 {
		return "", errors.New("login too long")
	}
	return login, nil
}

func (s *Store) findUserByLogin(ctx context.Context, login string) (User, *string, error) {
	var user User
	var passwordHash *string
	err := s.pool.QueryRow(ctx, `
		SELECT id, login, role, grade, avatar, password_hash, created_at
		FROM users
		WHERE lower(login) = $1
		ORDER BY id
		LIMIT 1
	`, login).Scan(&user.ID, &user.Login, &user.Role, &user.Grade, &user.Avatar, &passwordHash, &user.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, nil, ErrUserNotFound
	}
	if err != nil {
		return User{}, nil, err
	}
	finalizeUser(&user, passwordHash)
	return user, passwordHash, nil
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

func (s *Store) EnsureAdminUser(ctx context.Context, login, password string) error {
	login, err := normalizeLogin(login)
	if err != nil {
		return err
	}
	if password == "" {
		password = "admin"
	}
	hash, err := hashPassword(password)
	if err != nil {
		return err
	}

	_, err = s.pool.Exec(ctx, `
		INSERT INTO users (login, password_hash, role)
		VALUES ($1, $2, $3)
		ON CONFLICT (login) DO UPDATE SET
			password_hash = EXCLUDED.password_hash,
			role = $3
	`, login, hash, RoleAdmin)
	return err
}

func (s *Store) LoginUser(ctx context.Context, login, password string) (User, error) {
	login, err := normalizeLogin(login)
	if err != nil {
		return User{}, err
	}
	if strings.TrimSpace(password) == "" {
		return User{}, ErrPasswordRequired
	}
	if len(password) < 4 {
		return User{}, ErrPasswordTooShort
	}

	user, passwordHash, err := s.findUserByLogin(ctx, login)
	if errors.Is(err, ErrUserNotFound) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, err
	}

	if !user.HasPassword {
		return s.SetUserPassword(ctx, user.ID, password, "")
	}
	if passwordHash == nil || !checkPassword(password, *passwordHash) {
		return User{}, ErrInvalidPassword
	}
	return user, nil
}

func (s *Store) RegisterUser(ctx context.Context, login, password string) (User, error) {
	login, err := normalizeLogin(login)
	if err != nil {
		return User{}, err
	}
	if strings.TrimSpace(password) == "" {
		return User{}, ErrPasswordRequired
	}
	if len(password) < 4 {
		return User{}, ErrPasswordTooShort
	}

	if _, _, err := s.findUserByLogin(ctx, login); err == nil {
		return User{}, ErrLoginTaken
	} else if !errors.Is(err, ErrUserNotFound) {
		return User{}, err
	}

	return s.createUser(ctx, login, password, RoleUser)
}

func (s *Store) AuthenticateAdmin(ctx context.Context, login, password string) (User, error) {
	login, err := normalizeLogin(login)
	if err != nil {
		return User{}, err
	}
	if strings.TrimSpace(password) == "" {
		return User{}, ErrPasswordRequired
	}

	user, passwordHash, err := s.findUserByLogin(ctx, login)
	if errors.Is(err, ErrUserNotFound) {
		return User{}, ErrInvalidPassword
	}
	if err != nil {
		return User{}, err
	}
	if user.Role != RoleAdmin {
		return User{}, ErrNotAdmin
	}
	if passwordHash == nil || *passwordHash == "" || !checkPassword(password, *passwordHash) {
		return User{}, ErrInvalidPassword
	}
	return user, nil
}

func (s *Store) createUser(ctx context.Context, login, password, role string) (User, error) {
	hash, err := hashPassword(password)
	if err != nil {
		return User{}, err
	}
	if role == "" {
		role = RoleUser
	}

	var user User
	err = s.pool.QueryRow(ctx, `
		INSERT INTO users (login, password_hash, role) VALUES ($1, $2, $3)
		RETURNING id, login, role, grade, avatar, created_at
	`, login, hash, role).Scan(&user.ID, &user.Login, &user.Role, &user.Grade, &user.Avatar, &user.CreatedAt)
	if err != nil {
		return User{}, err
	}
	user.HasPassword = true
	return user, nil
}

func (s *Store) GetUser(ctx context.Context, id int) (User, error) {
	var user User
	var passwordHash *string
	err := s.pool.QueryRow(ctx, `
		SELECT id, login, role, grade, avatar, password_hash, created_at FROM users WHERE id = $1
	`, id).Scan(&user.ID, &user.Login, &user.Role, &user.Grade, &user.Avatar, &passwordHash, &user.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, err
	}
	finalizeUser(&user, passwordHash)
	return user, err
}

func (s *Store) SetUserGrade(ctx context.Context, userID int, grade int) (User, error) {
	if grade < 1 || grade > 11 {
		return User{}, errors.New("grade must be between 1 and 11")
	}
	var user User
	var passwordHash *string
	err := s.pool.QueryRow(ctx, `
		UPDATE users SET grade = $2 WHERE id = $1
		RETURNING id, login, role, grade, avatar, password_hash, created_at
	`, userID, grade).Scan(&user.ID, &user.Login, &user.Role, &user.Grade, &user.Avatar, &passwordHash, &user.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, err
	}
	finalizeUser(&user, passwordHash)
	return user, nil
}

func (s *Store) SetUserAvatar(ctx context.Context, userID int, avatar string) (User, error) {
	avatar, err := NormalizeAvatar(avatar)
	if err != nil {
		return User{}, err
	}
	if avatar == "" {
		return User{}, errors.New("avatar is required")
	}

	var user User
	var passwordHash *string
	err = s.pool.QueryRow(ctx, `
		UPDATE users SET avatar = $2 WHERE id = $1
		RETURNING id, login, role, grade, avatar, password_hash, created_at
	`, userID, avatar).Scan(&user.ID, &user.Login, &user.Role, &user.Grade, &user.Avatar, &passwordHash, &user.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, err
	}
	finalizeUser(&user, passwordHash)
	return user, nil
}

func (s *Store) SetUserPassword(ctx context.Context, userID int, newPassword, currentPassword string) (User, error) {
	if len(newPassword) < 4 {
		return User{}, ErrPasswordTooShort
	}

	var passwordHash *string
	var user User
	err := s.pool.QueryRow(ctx, `
		SELECT id, login, role, grade, avatar, password_hash, created_at FROM users WHERE id = $1
	`, userID).Scan(&user.ID, &user.Login, &user.Role, &user.Grade, &user.Avatar, &passwordHash, &user.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrUserNotFound
	}
	if err != nil {
		return User{}, err
	}
	finalizeUser(&user, passwordHash)

	if user.HasPassword {
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
		RETURNING id, login, role, grade, avatar, created_at
	`, userID, hash).Scan(&user.ID, &user.Login, &user.Role, &user.Grade, &user.Avatar, &user.CreatedAt)
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

func AdminBootstrapFromEnv() (login, password string) {
	login = os.Getenv("ADMIN_LOGIN")
	if login == "" {
		login = "admin"
	}
	password = os.Getenv("ADMIN_PASSWORD")
	if password == "" {
		password = "admin"
	}
	return login, password
}
