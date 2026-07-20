package store

import "testing"

func TestFillBlankRotationIndex(t *testing.T) {
	// 10 текстов, серия по 5 — окна дней не пересекаются
	cases := []struct {
		day, slot, want int
	}{
		{0, 0, 0},
		{0, 4, 4},
		{1, 0, 5},
		{1, 4, 9},
		{2, 0, 0},
		{2, 2, 2},
	}
	for _, c := range cases {
		got := FillBlankRotationIndex(c.day, 5, c.slot, 10)
		if got != c.want {
			t.Fatalf("day=%d slot=%d: got %d, want %d", c.day, c.slot, got, c.want)
		}
	}

	// мало текстов — крутим по модулю
	if got := FillBlankRotationIndex(1, 5, 0, 7); got != 5 {
		t.Fatalf("wrap start: got %d", got)
	}
	if got := FillBlankRotationIndex(1, 5, 2, 7); got != 0 {
		t.Fatalf("wrap slot: got %d", got)
	}
}
