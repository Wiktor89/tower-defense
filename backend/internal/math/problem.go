package mathpkg

import (
	"crypto/rand"
	"encoding/hex"
	"math"
	"math/big"
)

type Problem struct {
	ID     string `json:"id"`
	A      int    `json:"a"`
	B      int    `json:"b"`
	Op     string `json:"op"`
	Level  int    `json:"-"` // school grade (session key)
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

func rangeForDigits(digits int) (min, max int) {
	if digits < 1 {
		digits = 1
	}
	if digits > 6 {
		digits = 6
	}
	if digits == 1 {
		return 1, 9
	}
	min = int(math.Pow10(digits - 1))
	max = int(math.Pow10(digits)) - 1
	return min, max
}

// Generate builds a column problem with the given operand digit count.
// Grades 1–4 always use numbers from 1 to 20 (admin digit count is ignored).
func Generate(grade, digits int, opMode string) Problem {
	if grade < 1 || grade > 11 {
		grade = 1
	}
	min, max := rangeForDigits(digits)
	if grade <= 4 {
		min, max = 1, 20
	}
	op := pickOp(opMode)
	var a, b, answer int

	if op == "+" {
		a = randInt(min, max)
		b = randInt(min, max)
		answer = a + b
	} else {
		a = randInt(min, max)
		b = randInt(min, a)
		answer = a - b
	}

	return Problem{
		ID:     newID(),
		A:      a,
		B:      b,
		Op:     op,
		Level:  grade,
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
