package store

import (
	"context"
	"errors"
	"strings"
	"unicode/utf8"
)

var (
	ErrFillTextEmpty   = errors.New("text is empty")
	ErrFillTextTooShort = errors.New("text must contain at least 3 words")
	ErrFillTextNotFound = errors.New("text not found")
)

const (
	MinFillTextRunes = 20
	MaxFillTextRunes = 4000
)

type FillBlankText struct {
	ID        int    `json:"id"`
	Body      string `json:"body"`
	CreatedAt string `json:"createdAt"`
}

func (s *Store) ListFillBlankTexts(ctx context.Context) ([]FillBlankText, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, body, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM fill_blank_texts
		ORDER BY id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []FillBlankText
	for rows.Next() {
		var t FillBlankText
		if err := rows.Scan(&t.ID, &t.Body, &t.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, t)
	}
	return result, rows.Err()
}

func (s *Store) AddFillBlankText(ctx context.Context, body string) (FillBlankText, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return FillBlankText{}, ErrFillTextEmpty
	}
	n := utf8.RuneCountInString(body)
	if n < MinFillTextRunes {
		return FillBlankText{}, ErrFillTextTooShort
	}
	if n > MaxFillTextRunes {
		return FillBlankText{}, errors.New("text is too long")
	}

	var t FillBlankText
	err := s.pool.QueryRow(ctx, `
		INSERT INTO fill_blank_texts (body)
		VALUES ($1)
		RETURNING id, body, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
	`, body).Scan(&t.ID, &t.Body, &t.CreatedAt)
	return t, err
}

func (s *Store) DeleteFillBlankText(ctx context.Context, id int) error {
	tag, err := s.pool.Exec(ctx, `DELETE FROM fill_blank_texts WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrFillTextNotFound
	}
	return nil
}

func (s *Store) RandomFillBlankText(ctx context.Context) (FillBlankText, error) {
	var t FillBlankText
	err := s.pool.QueryRow(ctx, `
		SELECT id, body, to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM fill_blank_texts
		ORDER BY random()
		LIMIT 1
	`).Scan(&t.ID, &t.Body, &t.CreatedAt)
	if err != nil {
		return FillBlankText{}, ErrFillTextNotFound
	}
	return t, nil
}
