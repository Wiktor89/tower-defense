package mathpkg

import (
	"sync"
	"time"
)

type storedProblem struct {
	problem   Problem
	createdAt time.Time
}

type Store struct {
	mu       sync.RWMutex
	problems map[string]storedProblem
	ttl      time.Duration
}

func NewStore(ttl time.Duration) *Store {
	s := &Store{
		problems: make(map[string]storedProblem),
		ttl:      ttl,
	}
	go s.cleanupLoop()
	return s
}

func (s *Store) Save(p Problem) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.problems[p.ID] = storedProblem{problem: p, createdAt: time.Now()}
	return p.ID
}

func (s *Store) Get(id string) (Problem, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.problems[id]
	if !ok {
		return Problem{}, false
	}
	if time.Since(entry.createdAt) > s.ttl {
		return Problem{}, false
	}
	return entry.problem, true
}

func (s *Store) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.problems, id)
}

func (s *Store) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.cleanup()
	}
}

func (s *Store) cleanup() {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := time.Now()
	for id, entry := range s.problems {
		if now.Sub(entry.createdAt) > s.ttl {
			delete(s.problems, id)
		}
	}
}
