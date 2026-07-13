package fillblanks

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"math/big"
	"strings"
	"sync"
	"time"
	"unicode"
)

var ErrTextTooShort = errors.New("not enough words to create blanks")

type token struct {
	word  bool
	value string
}

type issued struct {
	answers   []string
	createdAt time.Time
}

type Store struct {
	mu     sync.Mutex
	issued map[string]issued
	ttl    time.Duration
}

func NewStore(ttl time.Duration) *Store {
	s := &Store{issued: make(map[string]issued), ttl: ttl}
	go s.cleanupLoop()
	return s
}

type PublicToken struct {
	Type  string `json:"type"` // "text" | "blank"
	Value string `json:"value,omitempty"`
	Index int    `json:"index,omitempty"`
}

type PublicParagraph struct {
	Tokens     []PublicToken `json:"tokens"`
	Words      []string      `json:"words"`
	BlankCount int           `json:"blankCount"`
}

type PublicPuzzle struct {
	ID         string            `json:"id"`
	Paragraphs []PublicParagraph `json:"paragraphs"`
	BlankCount int               `json:"blankCount"`
}

func (s *Store) CreateFromText(fullText string, blankPercent int) (PublicPuzzle, error) {
	if blankPercent < 10 {
		blankPercent = 10
	}
	if blankPercent > 90 {
		blankPercent = 90
	}

	units := splitUnits(fullText)
	if len(units) == 0 {
		return PublicPuzzle{}, ErrTextTooShort
	}

	paragraphs := make([]PublicParagraph, 0, len(units))
	allAnswers := make([]string, 0)
	globalBlank := 0

	for _, unit := range units {
		para, answers, next, err := buildParagraph(unit, blankPercent, globalBlank)
		if err != nil {
			// keep as plain text paragraph without blanks
			paragraphs = append(paragraphs, PublicParagraph{
				Tokens: []PublicToken{{Type: "text", Value: unit}},
			})
			continue
		}
		globalBlank = next
		allAnswers = append(allAnswers, answers...)
		paragraphs = append(paragraphs, para)
	}

	if len(allAnswers) == 0 {
		return PublicPuzzle{}, ErrTextTooShort
	}

	id := newID()
	s.mu.Lock()
	s.issued[id] = issued{answers: allAnswers, createdAt: time.Now()}
	s.mu.Unlock()

	return PublicPuzzle{
		ID:         id,
		Paragraphs: paragraphs,
		BlankCount: len(allAnswers),
	}, nil
}

func buildParagraph(text string, blankPercent, startIndex int) (PublicParagraph, []string, int, error) {
	tokens := tokenize(text)
	wordIdxs := make([]int, 0)
	for i, t := range tokens {
		if t.word && isBlankable(t.value) {
			wordIdxs = append(wordIdxs, i)
		}
	}
	if len(wordIdxs) == 0 {
		return PublicParagraph{}, nil, startIndex, ErrTextTooShort
	}

	blankCount := (len(wordIdxs)*blankPercent + 99) / 100
	if blankCount < 1 {
		blankCount = 1
	}
	if blankCount > len(wordIdxs) {
		blankCount = len(wordIdxs)
	}

	chosen := pickN(wordIdxs, blankCount)
	blankAt := make(map[int]int, len(chosen))
	answers := make([]string, len(chosen))
	for i, idx := range chosen {
		blankAt[idx] = startIndex + i
		answers[i] = tokens[idx].value
	}

	publicTokens := make([]PublicToken, 0, len(tokens))
	for i, t := range tokens {
		if blankIdx, ok := blankAt[i]; ok {
			publicTokens = append(publicTokens, PublicToken{Type: "blank", Index: blankIdx})
			continue
		}
		publicTokens = append(publicTokens, PublicToken{Type: "text", Value: t.value})
	}

	answerSet := make(map[string]bool, len(answers))
	for _, a := range answers {
		answerSet[normalize(a)] = true
	}
	distractors := make([]string, 0)
	for _, idx := range wordIdxs {
		if _, isBlank := blankAt[idx]; isBlank {
			continue
		}
		w := tokens[idx].value
		if answerSet[normalize(w)] {
			continue
		}
		distractors = append(distractors, w)
		if len(distractors) >= blankCount {
			break
		}
	}

	words := append([]string{}, answers...)
	words = append(words, distractors...)
	shuffle(words)

	return PublicParagraph{
		Tokens:     publicTokens,
		Words:      words,
		BlankCount: len(answers),
	}, answers, startIndex + len(answers), nil
}

func (s *Store) Check(id string, answers []string) (correct bool, ok bool) {
	s.mu.Lock()
	entry, found := s.issued[id]
	if found {
		delete(s.issued, id)
	}
	s.mu.Unlock()

	if !found || time.Since(entry.createdAt) > s.ttl {
		return false, false
	}
	if len(answers) != len(entry.answers) {
		return false, true
	}
	for i, want := range entry.answers {
		if normalize(answers[i]) != normalize(want) {
			return false, true
		}
	}
	return true, true
}

func splitUnits(text string) []string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}

	raw := strings.Split(text, "\n")
	paras := make([]string, 0, len(raw))
	for _, p := range raw {
		p = strings.TrimSpace(p)
		if p != "" {
			paras = append(paras, p)
		}
	}
	if len(paras) == 0 {
		return nil
	}
	if len(paras) > 1 {
		return paras
	}

	sents := splitSentences(paras[0])
	if len(sents) > 1 {
		return sents
	}
	return paras
}

func splitSentences(text string) []string {
	runes := []rune(text)
	var out []string
	start := 0
	for i := 0; i < len(runes); i++ {
		r := runes[i]
		if r != '.' && r != '!' && r != '?' {
			continue
		}
		end := i + 1
		for end < len(runes) && (runes[end] == '"' || runes[end] == '»' || runes[end] == '\'') {
			end++
		}
		if end < len(runes) && !unicode.IsSpace(runes[end]) {
			continue
		}
		chunk := strings.TrimSpace(string(runes[start:end]))
		if chunk != "" {
			out = append(out, chunk)
		}
		for end < len(runes) && unicode.IsSpace(runes[end]) {
			end++
		}
		start = end
		i = end - 1
	}
	tail := strings.TrimSpace(string(runes[start:]))
	if tail != "" {
		out = append(out, tail)
	}
	return out
}

func tokenize(text string) []token {
	runes := []rune(strings.TrimSpace(text))
	out := make([]token, 0)
	i := 0
	for i < len(runes) {
		if isWordRune(runes[i]) {
			j := i + 1
			for j < len(runes) && isWordRune(runes[j]) {
				j++
			}
			out = append(out, token{word: true, value: string(runes[i:j])})
			i = j
			continue
		}
		j := i + 1
		for j < len(runes) && !isWordRune(runes[j]) {
			j++
		}
		out = append(out, token{word: false, value: string(runes[i:j])})
		i = j
	}
	return out
}

func isWordRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r) || r == '-' || r == '\''
}

func isBlankable(word string) bool {
	letters := 0
	for _, r := range word {
		if unicode.IsLetter(r) {
			letters++
		}
	}
	return letters >= 4
}

func pickN(items []int, n int) []int {
	cp := append([]int{}, items...)
	shuffleInts(cp)
	if n > len(cp) {
		n = len(cp)
	}
	chosen := cp[:n]
	for i := 0; i < len(chosen); i++ {
		for j := i + 1; j < len(chosen); j++ {
			if chosen[j] < chosen[i] {
				chosen[i], chosen[j] = chosen[j], chosen[i]
			}
		}
	}
	return chosen
}

func shuffleInts(items []int) {
	for i := len(items) - 1; i > 0; i-- {
		n, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		j := 0
		if err == nil {
			j = int(n.Int64())
		}
		items[i], items[j] = items[j], items[i]
	}
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
