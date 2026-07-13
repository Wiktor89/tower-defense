package td

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

var (
	ErrSessionNotFound = errors.New("session not found or expired")
	ErrSessionUsed     = errors.New("session already finished")
	ErrTooEarly        = errors.New("session finished too early")
	ErrInvalidResult   = errors.New("result must be won or lost")
)

type wave struct {
	count    int
	interval time.Duration
}

// Mirrors frontend/src/games/tower-defense/config.ts WAVES + pauses.
var waves = []wave{
	{count: 3, interval: 3000 * time.Millisecond},
	{count: 5, interval: 2500 * time.Millisecond},
	{count: 7, interval: 2200 * time.Millisecond},
	{count: 9, interval: 2000 * time.Millisecond},
	{count: 12, interval: 1800 * time.Millisecond},
}

const (
	initialWavePause = 3000 * time.Millisecond
	betweenWaves     = 5000 * time.Millisecond
	firstSpawnDelay  = 2000 * time.Millisecond
	// Slowest zombie (~18 px/s) across ~720px lawn.
	zombieTravel = 40 * time.Second
	sessionTTL   = 2 * time.Hour
)

func MinWinDuration() time.Duration {
	d := initialWavePause
	for i, w := range waves {
		d += firstSpawnDelay
		if w.count > 1 {
			d += time.Duration(w.count-1) * w.interval
		}
		if i < len(waves)-1 {
			d += betweenWaves
		}
	}
	d += zombieTravel
	return d
}

func MinLossDuration() time.Duration {
	return firstSpawnDelay + zombieTravel/2
}

type Session struct {
	ID        string
	UserID    int
	StartedAt time.Time
	Finished  bool
}

type Store struct {
	mu       sync.Mutex
	sessions map[string]*Session
}

func NewStore() *Store {
	s := &Store{sessions: make(map[string]*Session)}
	go s.cleanupLoop()
	return s
}

func (s *Store) Start(userID int) *Session {
	id := newID()
	sess := &Session{
		ID:        id,
		UserID:    userID,
		StartedAt: time.Now(),
	}
	s.mu.Lock()
	s.cleanupLocked()
	s.sessions[id] = sess
	s.mu.Unlock()
	return sess
}

func (s *Store) Finish(sessionID, result string) (userID int, err error) {
	if result != "won" && result != "lost" {
		return 0, ErrInvalidResult
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	sess, ok := s.sessions[sessionID]
	if !ok || time.Since(sess.StartedAt) > sessionTTL {
		delete(s.sessions, sessionID)
		return 0, ErrSessionNotFound
	}
	if sess.Finished {
		return 0, ErrSessionUsed
	}

	minDur := MinLossDuration()
	if result == "won" {
		minDur = MinWinDuration()
	}
	if time.Since(sess.StartedAt) < minDur {
		return 0, ErrTooEarly
	}

	sess.Finished = true
	delete(s.sessions, sessionID)
	return sess.UserID, nil
}

func (s *Store) cleanupLoop() {
	ticker := time.NewTicker(10 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		s.cleanupLocked()
		s.mu.Unlock()
	}
}

func (s *Store) cleanupLocked() {
	now := time.Now()
	for id, sess := range s.sessions {
		if sess.Finished || now.Sub(sess.StartedAt) > sessionTTL {
			delete(s.sessions, id)
		}
	}
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
