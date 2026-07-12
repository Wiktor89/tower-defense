package mathpkg

import (
	"crypto/rand"
	"encoding/hex"
	"math/big"
)

type LevelRange struct {
	Min int
	Max int
}

var levelRanges = map[int]LevelRange{
	1: {Min: 1, Max: 9},
	2: {Min: 10, Max: 99},
	3: {Min: 100, Max: 999},
}

type Problem struct {
	ID     string `json:"id"`
	A      int    `json:"a"`
	B      int    `json:"b"`
	Op     string `json:"op"`
	Answer int    `json:"-"`
	Width  int    `json:"width"`
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

func pickOp(opMode string) string {
	switch opMode {
	case "add":
		return "+"
	case "sub":
		return "−"
	default:
		if randInt(0, 1) == 0 {
			return "+"
		}
		return "−"
	}
}

func digitWidth(nums ...int) int {
	max := 0
	for _, n := range nums {
		if w := len(itoa(n)); w > max {
			max = w
		}
	}
	return max
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	digits := make([]byte, 0, 10)
	for n > 0 {
		digits = append([]byte{byte('0' + n%10)}, digits...)
		n /= 10
	}
	if neg {
		return "-" + string(digits)
	}
	return string(digits)
}

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func Generate(level int, opMode string) Problem {
	rangeCfg, ok := levelRanges[level]
	if !ok {
		rangeCfg = levelRanges[1]
	}

	op := pickOp(opMode)
	var a, b, answer int

	if op == "+" {
		a = randInt(rangeCfg.Min, rangeCfg.Max)
		b = randInt(rangeCfg.Min, rangeCfg.Max)
		answer = a + b
	} else {
		a = randInt(rangeCfg.Min, rangeCfg.Max)
		b = randInt(rangeCfg.Min, a)
		answer = a - b
	}

	return Problem{
		ID:     newID(),
		A:      a,
		B:      b,
		Op:     op,
		Answer: answer,
		Width:  digitWidth(a, b, answer),
	}
}

func PublicView(p Problem) Problem {
	return Problem{
		ID:    p.ID,
		A:     p.A,
		B:     p.B,
		Op:    p.Op,
		Width: p.Width,
	}
}
