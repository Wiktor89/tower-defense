package fillblanks

import (
	"testing"
	"time"
)

func TestCreateFromTextParagraphs(t *testing.T) {
	s := NewStore(time.Hour)
	text := "Первое тестовое предложение содержит достаточно длинных слов для генерации. Второе предложение также содержит несколько подходящих слов для задания."
	puzzle, err := s.CreateFromText(text, 40)
	if err != nil {
		t.Fatal(err)
	}
	if len(puzzle.Paragraphs) < 2 {
		t.Fatalf("paragraphs=%d", len(puzzle.Paragraphs))
	}
	for i, p := range puzzle.Paragraphs {
		if p.BlankCount > 0 && len(p.Words) < p.BlankCount {
			t.Fatalf("para %d words=%d blanks=%d", i, len(p.Words), p.BlankCount)
		}
	}
	if puzzle.BlankCount < 1 {
		t.Fatal("no blanks")
	}
}

func TestCreateFromTextTooShort(t *testing.T) {
	s := NewStore(time.Hour)
	_, err := s.CreateFromText("Раз два три", 30)
	if err != ErrTextTooShort {
		t.Fatalf("got %v", err)
	}
}
