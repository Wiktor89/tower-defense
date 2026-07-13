package fillblanks

import (
	"testing"
	"time"
)

func TestCreateFromTextAndCheck(t *testing.T) {
	s := NewStore(time.Hour)
	text := "Первое тестовое предложение содержит достаточно длинных слов для генерации пропусков."
	puzzle, err := s.CreateFromText(text, 40)
	if err != nil {
		t.Fatal(err)
	}
	if puzzle.BlankCount < 1 {
		t.Fatalf("blankCount=%d", puzzle.BlankCount)
	}
	if len(puzzle.Words) < puzzle.BlankCount {
		t.Fatalf("words=%d blanks=%d", len(puzzle.Words), puzzle.BlankCount)
	}

	wrong := make([]string, puzzle.BlankCount)
	for i := range wrong {
		wrong[i] = "xxx"
	}
	ok, found := s.Check(puzzle.ID, wrong)
	if !found {
		t.Fatal("puzzle should exist")
	}
	if ok {
		t.Fatal("wrong answers must fail")
	}
}

func TestCreateFromTextTooShort(t *testing.T) {
	s := NewStore(time.Hour)
	_, err := s.CreateFromText("Раз два три", 30)
	if err != ErrTextTooShort {
		t.Fatalf("got %v", err)
	}
}
