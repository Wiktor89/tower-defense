package store

import (
	"testing"
	"time"
)

func TestChallengeDayStage(t *testing.T) {
	loc := time.FixedZone("MSK", 3*60*60)
	day := time.Date(2026, 7, 18, 0, 1, 0, 0, loc)
	if got := challengeDayStage(day); got != 20260718 {
		t.Fatalf("got %d, want 20260718", got)
	}
	// После полуночи — новый stage
	next := time.Date(2026, 7, 19, 0, 1, 0, 0, loc)
	if got := challengeDayStage(next); got != 20260719 {
		t.Fatalf("got %d, want 20260719", got)
	}
}

func TestMoscowTodayReadyAfterMidnight(t *testing.T) {
	loc, err := time.LoadLocation("Europe/Moscow")
	if err != nil {
		loc = time.FixedZone("MSK", 3*60*60)
	}
	now := time.Now().In(loc)
	day, key := moscowToday()
	if day.Hour() != 0 || day.Minute() != 0 {
		t.Fatalf("moscowToday should be midnight, got %v", day)
	}
	want := now.Format("2006-01-02")
	if key != want {
		t.Fatalf("day key %q != %q", key, want)
	}
}
