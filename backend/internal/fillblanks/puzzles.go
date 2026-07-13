package fillblanks

import (
	"crypto/rand"
	"encoding/hex"
	"math/big"
	"strings"
	"sync"
	"time"
)

type PuzzleDef struct {
	Fragments  []string // text around blanks: len = len(Answers)+1
	Answers    []string
	Distractors []string
}

// Liguria tongue-twister split into fill-in levels.
var catalog = []PuzzleDef{
	{
		Fragments: []string{
			"В четверг ",
			" числа в четыре с четвертью ",
			" лигурийский ",
			"",
		},
		Answers:     []string{"четвертого", "часа", "регулировщик"},
		Distractors: []string{"лавировали", "тридцать", "корабля"},
	},
	{
		Fragments: []string{
			"",
			" в Лигурии. Но тридцать три ",
			" лавировали, лавировали, да так и не ",
			"",
		},
		Answers:     []string{"регулировал", "корабля", "вылавировали"},
		Distractors: []string{"часа", "четвертого", "протокол"},
	},
	{
		Fragments: []string{
			"А потом ",
			" про протокол протоколом ",
			". Как интервьюером интервьюируемый лигурийский регулировщик речисто, да не чисто ",
			"",
		},
		Answers:     []string{"протокол", "запротоколировал", "рапортовал"},
		Distractors: []string{"лавировали", "корабля", "часа"},
	},
	{
		Fragments: []string{
			"Да не дорапортовал, ",
			", да так зарапортовался про ",
			" погоду, что дабы ",
			" не стал претендентом на судебный прецедент,",
		},
		Answers:     []string{"дорапортовывал", "размокропогодившуюся", "инцидент"},
		Distractors: []string{"регулировщик", "протокол", "лигурийский"},
	},
	{
		Fragments: []string{
			"лигурийский регулировщик ",
			" в неконституционном ",
			". Где хохлатые хохотушки хохотом ",
			" и кричали турке.",
		},
		Answers:     []string{"акклиматизировался", "Константинополе", "хохотали"},
		Distractors: []string{"лавировали", "рапортовал", "вылавировали"},
	},
}

type issued struct {
	level     int
	createdAt time.Time
}

type Store struct {
	mu      sync.Mutex
	issued  map[string]issued
	ttl     time.Duration
}

func NewStore(ttl time.Duration) *Store {
	s := &Store{issued: make(map[string]issued), ttl: ttl}
	go s.cleanupLoop()
	return s
}

func LevelCount() int {
	return len(catalog)
}

type PublicPuzzle struct {
	ID        string   `json:"id"`
	Level     int      `json:"level"`
	Total     int      `json:"total"`
	Fragments []string `json:"fragments"`
	Words     []string `json:"words"`
	BlankCount int     `json:"blankCount"`
}

func (s *Store) Create(level int) (PublicPuzzle, bool) {
	if level < 1 || level > len(catalog) {
		return PublicPuzzle{}, false
	}
	def := catalog[level-1]
	id := newID()

	s.mu.Lock()
	s.issued[id] = issued{level: level, createdAt: time.Now()}
	s.mu.Unlock()

	words := append([]string{}, def.Answers...)
	words = append(words, def.Distractors...)
	shuffle(words)

	return PublicPuzzle{
		ID:         id,
		Level:      level,
		Total:      len(catalog),
		Fragments:  append([]string{}, def.Fragments...),
		Words:      words,
		BlankCount: len(def.Answers),
	}, true
}

func (s *Store) Check(id string, answers []string) (correct bool, level int, ok bool) {
	s.mu.Lock()
	entry, found := s.issued[id]
	if found {
		delete(s.issued, id)
	}
	s.mu.Unlock()

	if !found || time.Since(entry.createdAt) > s.ttl {
		return false, 0, false
	}

	def := catalog[entry.level-1]
	if len(answers) != len(def.Answers) {
		return false, entry.level, true
	}
	for i, want := range def.Answers {
		if normalize(answers[i]) != normalize(want) {
			return false, entry.level, true
		}
	}
	return true, entry.level, true
}

func normalize(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func shuffle(items []string) {
	for i := len(items) - 1; i > 0; i-- {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		j := 0
		if err == nil {
			j = int(n.Int64())
		}
		items[i], items[j] = items[j], items[i]
	}
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func (s *Store) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		now := time.Now()
		for id, e := range s.issued {
			if now.Sub(e.createdAt) > s.ttl {
				delete(s.issued, id)
			}
		}
		s.mu.Unlock()
	}
}
