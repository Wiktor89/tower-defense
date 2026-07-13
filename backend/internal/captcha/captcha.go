package captcha

import (
	"crypto/rand"
	"encoding/hex"
	"math/big"
	"sync"
	"time"
)

type Challenge struct {
	ID          string `json:"id"`
	Background  string `json:"background"`
	Piece       string `json:"piece"`
	PieceY      int    `json:"pieceY"`
	TrackWidth  int    `json:"trackWidth"`
	PieceWidth  int    `json:"pieceWidth"`
	ImageHeight int    `json:"imageHeight"`
}

type entry struct {
	targetX int
	exp     time.Time
}

type Store struct {
	mu         sync.Mutex
	challenges map[string]entry
}

func NewStore() *Store {
	return &Store{challenges: make(map[string]entry)}
}

func randInt(min, max int) int {
	if max <= min {
		return min
	}
	n, err := rand.Int(rand.Reader, big.NewInt(int64(max-min+1)))
	if err != nil {
		return min
	}
	return int(n.Int64()) + min
}

func (s *Store) Create() Challenge {
	seed := randInt(1, 10000)
	minX := 50
	maxX := ImageWidth - PieceWidth - 30
	targetX := randInt(minX, maxX)
	targetY := randInt(15, ImageHeight-PieceHeight-15)

	id := make([]byte, 16)
	_, _ = rand.Read(id)

	bgSVG := generateBackground(seed, targetX, targetY)
	pieceSVG := generatePiece(seed, targetX, targetY)

	ch := Challenge{
		ID:          hex.EncodeToString(id),
		Background:  toDataURL(bgSVG),
		Piece:       toDataURL(pieceSVG),
		PieceY:      targetY,
		TrackWidth:  ImageWidth,
		PieceWidth:  PieceWidth,
		ImageHeight: ImageHeight,
	}

	s.mu.Lock()
	s.cleanupLocked()
	s.challenges[ch.ID] = entry{targetX: targetX, exp: time.Now().Add(10 * time.Minute)}
	s.mu.Unlock()

	return ch
}

func (s *Store) Verify(id string, sliderX int) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	e, ok := s.challenges[id]
	delete(s.challenges, id)
	if !ok || time.Now().After(e.exp) {
		return false
	}

	diff := sliderX - e.targetX
	if diff < 0 {
		diff = -diff
	}
	return diff <= Tolerance
}

func (s *Store) cleanupLocked() {
	now := time.Now()
	for id, e := range s.challenges {
		if now.After(e.exp) {
			delete(s.challenges, id)
		}
	}
}
