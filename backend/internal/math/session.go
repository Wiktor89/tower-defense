package mathpkg

import "sync"

type sessionKey struct {
	userID int
	level  int
}

type SessionTracker struct {
	mu       sync.Mutex
	progress map[sessionKey]int
}

func NewSessionTracker() *SessionTracker {
	return &SessionTracker{progress: make(map[sessionKey]int)}
}

// RecordCorrect increments the correct streak for user+level.
// Returns (solvedInSession, completed) where completed means solved reached sessionSize
// and the counter was reset.
func (t *SessionTracker) RecordCorrect(userID, level, sessionSize int) (solved int, completed bool) {
	if userID <= 0 || level < 1 || sessionSize < 1 {
		return 0, false
	}
	key := sessionKey{userID: userID, level: level}

	t.mu.Lock()
	defer t.mu.Unlock()

	t.progress[key]++
	solved = t.progress[key]
	if solved >= sessionSize {
		t.progress[key] = 0
		return sessionSize, true
	}
	return solved, false
}

func (t *SessionTracker) Reset(userID, level int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	delete(t.progress, sessionKey{userID: userID, level: level})
}
