package fractions

import (
	"sync"
	"time"
)

type stored struct {
	problem   Problem
	createdAt time.Time
}

type Store struct {
	mu       sync.RWMutex
	problems map[string]stored
	ttl      time.Duration
}

func NewStore(ttl time.Duration) *Store {
	s := &Store{problems: make(map[string]stored), ttl: ttl}
	go s.cleanup()
	return s
}

func (s *Store) Save(p Problem) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.problems[p.ID] = stored{problem: p, createdAt: time.Now()}
}

func (s *Store) Get(id string) (Problem, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	e, ok := s.problems[id]
	if !ok {
		return Problem{}, false
	}
	return e.problem, true
}

func (s *Store) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.problems, id)
}

func (s *Store) cleanup() {
	t := time.NewTicker(time.Minute)
	for range t.C {
		s.mu.Lock()
		now := time.Now()
		for id, e := range s.problems {
			if now.Sub(e.createdAt) > s.ttl {
				delete(s.problems, id)
			}
		}
		s.mu.Unlock()
	}
}
