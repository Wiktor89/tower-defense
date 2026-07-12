package admin

import (
	"crypto/rand"
	"encoding/hex"
	"os"
	"sync"
	"time"
)

type Auth struct {
	login    string
	password string
	mu       sync.RWMutex
	tokens   map[string]time.Time
}

func NewAuth() *Auth {
	login := os.Getenv("ADMIN_LOGIN")
	if login == "" {
		login = "admin"
	}
	password := os.Getenv("ADMIN_PASSWORD")
	if password == "" {
		password = "admin"
	}
	return &Auth{
		login:    login,
		password: password,
		tokens:   make(map[string]time.Time),
	}
}

func (a *Auth) Login(login, password string) (string, bool) {
	if login != a.login || password != a.password {
		return "", false
	}
	token := randomToken()
	a.mu.Lock()
	a.tokens[token] = time.Now().Add(24 * time.Hour)
	a.cleanupLocked()
	a.mu.Unlock()
	return token, true
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
