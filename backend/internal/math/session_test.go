package mathpkg

import "testing"

func TestSessionTrackerCompletes(t *testing.T) {
	tr := NewSessionTracker()
	for i := 1; i < 3; i++ {
		solved, done := tr.RecordCorrect(1, 2, 3)
		if done || solved != i {
			t.Fatalf("step %d: solved=%d done=%v", i, solved, done)
		}
	}
	solved, done := tr.RecordCorrect(1, 2, 3)
	if !done || solved != 3 {
		t.Fatalf("complete: solved=%d done=%v", solved, done)
	}
	solved, done = tr.RecordCorrect(1, 2, 3)
	if done || solved != 1 {
		t.Fatalf("after reset: solved=%d done=%v", solved, done)
	}
}
