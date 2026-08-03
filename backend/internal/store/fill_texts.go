package store

import (
	"context"
	"errors"
	"strings"
	"time"
	"unicode/utf8"
)

var (
	ErrFillTextEmpty     = errors.New("text is empty")
	ErrFillTextTooShort  = errors.New("text must contain at least 3 words")
	ErrFillTextNotFound  = errors.New("text not found")
	ErrInvalidBlankPercent = errors.New("blank percent must be between 10 and 90")
)

const (
	MinFillTextRunes   = 20
	MaxFillTextRunes   = 4000
	DefaultBlankPercent = 30
	MinBlankPercent     = 10
	MaxBlankPercent     = 90
)

type FillBlankText struct {
	ID           int    `json:"id"`
	Body         string `json:"body,omitempty"`
	Preview      string `json:"preview"`
	BlankPercent int    `json:"blankPercent"`
	CreatedAt    string `json:"createdAt"`
}

func PreviewFillText(body string) string {
	fields := strings.Fields(strings.TrimSpace(body))
	if len(fields) == 0 {
		return ""
	}
	if len(fields) <= 4 {
		return strings.Join(fields, " ")
	}
	return strings.Join(fields[:4], " ") + "…"
}

func scanFillBlankText(id int, body string, blankPercent int, createdAt string) FillBlankText {
	return FillBlankText{
		ID:           id,
		Body:         body,
		Preview:      PreviewFillText(body),
		BlankPercent: blankPercent,
		CreatedAt:    createdAt,
	}
}

func validateFillBody(body string) (string, error) {
	body = strings.TrimSpace(body)
	if body == "" {
		return "", ErrFillTextEmpty
	}
	n := utf8.RuneCountInString(body)
	if n < MinFillTextRunes {
		return "", ErrFillTextTooShort
	}
	if n > MaxFillTextRunes {
		return "", errors.New("text is too long")
	}
	return body, nil
}

func (s *Store) ListFillBlankTexts(ctx context.Context) ([]FillBlankText, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, body, blank_percent,
		       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM fill_blank_texts
		ORDER BY id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []FillBlankText
	for rows.Next() {
		var id, blankPercent int
		var body, createdAt string
		if err := rows.Scan(&id, &body, &blankPercent, &createdAt); err != nil {
			return nil, err
		}
		result = append(result, scanFillBlankText(id, body, blankPercent, createdAt))
	}
	return result, rows.Err()
}

func (s *Store) AddFillBlankText(ctx context.Context, body string) (FillBlankText, error) {
	body, err := validateFillBody(body)
	if err != nil {
		return FillBlankText{}, err
	}

	var id, blankPercent int
	var storedBody, createdAt string
	err = s.pool.QueryRow(ctx, `
		INSERT INTO fill_blank_texts (body, blank_percent)
		VALUES ($1, $2)
		RETURNING id, body, blank_percent,
		          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
	`, body, DefaultBlankPercent).Scan(&id, &storedBody, &blankPercent, &createdAt)
	if err != nil {
		return FillBlankText{}, err
	}
	return scanFillBlankText(id, storedBody, blankPercent, createdAt), nil
}

func (s *Store) UpdateFillBlankText(ctx context.Context, id int, body string) (FillBlankText, error) {
	body, err := validateFillBody(body)
	if err != nil {
		return FillBlankText{}, err
	}

	var outID, blankPercent int
	var storedBody, createdAt string
	err = s.pool.QueryRow(ctx, `
		UPDATE fill_blank_texts
		SET body = $2
		WHERE id = $1
		RETURNING id, body, blank_percent,
		          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
	`, id, body).Scan(&outID, &storedBody, &blankPercent, &createdAt)
	if err != nil {
		return FillBlankText{}, ErrFillTextNotFound
	}
	return scanFillBlankText(outID, storedBody, blankPercent, createdAt), nil
}

func (s *Store) SetFillBlankPercent(ctx context.Context, id, percent int) (FillBlankText, error) {
	if percent < MinBlankPercent || percent > MaxBlankPercent {
		return FillBlankText{}, ErrInvalidBlankPercent
	}

	var outID, blankPercent int
	var body, createdAt string
	err := s.pool.QueryRow(ctx, `
		UPDATE fill_blank_texts
		SET blank_percent = $2
		WHERE id = $1
		RETURNING id, body, blank_percent,
		          to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
	`, id, percent).Scan(&outID, &body, &blankPercent, &createdAt)
	if err != nil {
		return FillBlankText{}, ErrFillTextNotFound
	}
	return scanFillBlankText(outID, body, blankPercent, createdAt), nil
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

func (s *Store) GetFillBlankText(ctx context.Context, id int) (FillBlankText, error) {
	var blankPercent int
	var body, createdAt string
	err := s.pool.QueryRow(ctx, `
		SELECT body, blank_percent,
		       to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
		FROM fill_blank_texts
		WHERE id = $1
	`, id).Scan(&body, &blankPercent, &createdAt)
	if err != nil {
		return FillBlankText{}, ErrFillTextNotFound
	}
	return scanFillBlankText(id, body, blankPercent, createdAt), nil
}

// listFillBlankIDsOrdered — порядок как в админке (новые сверху = №1).
func (s *Store) listFillBlankIDsOrdered(ctx context.Context) ([]int, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id FROM fill_blank_texts ORDER BY id DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// FillBlankRotationIndex — равномерная ротация без пересечения окон дня.
// dayIndex * sessionSize сдвигает окно; slot — номер задания в серии (0-based).
func FillBlankRotationIndex(dayIndex, sessionSize, slot, total int) int {
	if total <= 0 {
		return 0
	}
	if sessionSize < 1 {
		sessionSize = 1
	}
	if slot < 0 {
		slot = 0
	}
	start := (dayIndex * sessionSize) % total
	return (start + slot) % total
}

func moscowDayIndex(day time.Time) int {
	return int(day.Unix() / 86400)
}

// PickFillBlankTextForUser выбирает текст по дню и прогрессу серии (без повторов окна дня).
func (s *Store) PickFillBlankTextForUser(ctx context.Context, userID int) (FillBlankText, error) {
	ids, err := s.listFillBlankIDsOrdered(ctx)
	if err != nil {
		return FillBlankText{}, err
	}
	if len(ids) == 0 {
		return FillBlankText{}, ErrFillTextNotFound
	}

	sessionSize, err := s.SessionSizeForUser(ctx, userID, "fill-blanks")
	if err != nil || sessionSize < 1 {
		sessionSize = DefaultSessionSize
	}

	slot := 0
	if userID > 0 {
		prog, err := s.GetDailyProgress(ctx, userID, "fill-blanks")
		if err != nil {
			return FillBlankText{}, err
		}
		slot = prog.Solved
	}

	day, _ := moscowToday()
	idx := FillBlankRotationIndex(moscowDayIndex(day), sessionSize, slot, len(ids))
	return s.GetFillBlankText(ctx, ids[idx])
}
