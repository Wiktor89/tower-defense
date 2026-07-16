package admin

import (
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"
)

type Auth struct {
	mu     sync.RWMutex
	tokens map[string]time.Time
}

func NewAuth() *Auth {
	return &Auth{tokens: make(map[string]time.Time)}
}

func (a *Auth) IssueToken() string {
	token := randomToken()
	a.mu.Lock()
	a.tokens[token] = time.Now().Add(24 * time.Hour)
	a.cleanupLocked()
	a.mu.Unlock()
	return token
}

func (a *Auth) Valid(token string) bool {
	a.mu.RLock()
	defer a.mu.RUnlock()
	exp, ok := a.tokens[token]
	return ok && time.Now().Before(exp)
}

func (a *Auth) cleanupLocked() {
	now := time.Now()
	for t, exp := range a.tokens {
		if now.After(exp) {
			delete(a.tokens, t)
		}
	}
}

func randomToken() string {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
