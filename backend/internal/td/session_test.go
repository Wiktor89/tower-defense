package td

import "testing"

func TestMinWinDurationLongerThanLoss(t *testing.T) {
	if MinWinDuration() <= MinLossDuration() {
		t.Fatalf("win duration %v should exceed loss %v", MinWinDuration(), MinLossDuration())
	}
}

func TestFinishTooEarly(t *testing.T) {
	s := NewStore()
	sess := s.Start(1)
	_, err := s.Finish(sess.ID, "won")
	if err != ErrTooEarly {
		t.Fatalf("expected ErrTooEarly, got %v", err)
	}
}

func TestFinishLostReuse(t *testing.T) {
	s := NewStore()
	sess := s.Start(42)
	// Force startedAt into the past for loss min duration.
	s.mu.Lock()
	sess.StartedAt = sess.StartedAt.Add(-MinLossDuration() - 1)
	s.mu.Unlock()

	userID, err := s.Finish(sess.ID, "lost")
	if err != nil {
		t.Fatalf("finish: %v", err)
	}
	if userID != 42 {
		t.Fatalf("userID=%d", userID)
	}
	_, err = s.Finish(sess.ID, "lost")
	if err != ErrSessionNotFound {
		t.Fatalf("expected not found after finish, got %v", err)
	}
}
