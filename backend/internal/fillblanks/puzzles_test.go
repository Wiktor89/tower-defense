package fillblanks

import (
	"strings"
	"testing"
	"time"
)

func TestCreateFromTextNoSplitUnder30Words(t *testing.T) {
	s := NewStore(time.Hour)
	text := "Первое тестовое предложение содержит достаточно длинных слов для генерации. Второе тоже."
	if wordCount(text) > 30 {
		t.Fatalf("fixture too long: %d", wordCount(text))
	}
	puzzle, err := s.CreateFromText(text, 40)
	if err != nil {
		t.Fatal(err)
	}
	if len(puzzle.Paragraphs) != 1 {
		t.Fatalf("expected 1 paragraph, got %d", len(puzzle.Paragraphs))
	}
}

func TestCreateFromTextSplitOver30Words(t *testing.T) {
	s := NewStore(time.Hour)
	parts := make([]string, 0, 12)
	for i := 0; i < 12; i++ {
		parts = append(parts, "Длинное тестовое предложение номер содержит несколько подходящих слов.")
	}
	text := strings.Join(parts, " ")
	if wordCount(text) <= 30 {
		t.Fatalf("fixture too short: %d", wordCount(text))
	}
	puzzle, err := s.CreateFromText(text, 40)
	if err != nil {
		t.Fatal(err)
	}
	if len(puzzle.Paragraphs) < 2 {
		t.Fatalf("expected split into paragraphs, got %d", len(puzzle.Paragraphs))
	}
}

func TestCreateFromTextTooShort(t *testing.T) {
	s := NewStore(time.Hour)
	_, err := s.CreateFromText("Раз два три", 30)
	if err != ErrTextTooShort {
		t.Fatalf("got %v", err)
	}
}
