package store

import "testing"

func TestApplyChallengeSkipPenalty(t *testing.T) {
	cases := []struct {
		base, skip, wantFinal, wantPct int
	}{
		{100, 0, 100, 0},
		{100, 1, 75, 25},
		{100, 2, 50, 50},
		{100, 3, 50, 75},
		{100, 4, 50, 100},
		{100, 7, 50, 100},
		{200, 1, 150, 25},
		{200, 4, 50, 100},
		{40, 4, 40, 100},
	}
	for _, c := range cases {
		got, pct := applyChallengeSkipPenalty(c.base, c.skip)
		if got != c.wantFinal || pct != c.wantPct {
			t.Fatalf("base=%d skip=%d: got %d/%d%%, want %d/%d%%",
				c.base, c.skip, got, pct, c.wantFinal, c.wantPct)
		}
	}
}
