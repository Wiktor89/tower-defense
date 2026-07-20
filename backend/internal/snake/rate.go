package snake

import (
	"sync"
	"time"
)

const minEatInterval = 200 * time.Millisecond

type RateLimiter struct {
	mu   sync.Mutex
	last map[int]time.Time
}

func NewRateLimiter() *RateLimiter {
	return &RateLimiter{last: make(map[int]time.Time)}
}

func (r *RateLimiter) Allow(userID int) bool {
	if userID <= 0 {
		return false
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	now := time.Now()
	if t, ok := r.last[userID]; ok && now.Sub(t) < minEatInterval {
		return false
	}
	r.last[userID] = now
	return true
}
