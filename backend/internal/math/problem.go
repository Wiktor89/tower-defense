package mathpkg

import (
	"crypto/rand"
	"encoding/hex"
	"math/big"
)

type Problem struct {
	ID     string `json:"id"`
	A      int    `json:"a"`
	B      int    `json:"b"`
	Op     string `json:"op"`
	Level  int    `json:"-"` // school grade used for generation
	Answer int    `json:"-"`
	Width  int    `json:"width"`
}

type gradeSpec struct {
	Min    int
	Max    int
	MaxSum int // 0 = no sum cap
}

func specForGrade(grade int) gradeSpec {
	switch {
	case grade <= 1:
		return gradeSpec{Min: 1, Max: 9, MaxSum: 18}
	case grade == 2:
		return gradeSpec{Min: 1, Max: 20, MaxSum: 20}
	case grade == 3:
		return gradeSpec{Min: 1, Max: 99}
	case grade == 4:
		return gradeSpec{Min: 10, Max: 999}
	case grade == 5:
		return gradeSpec{Min: 100, Max: 9999}
	case grade == 6:
		return gradeSpec{Min: 100, Max: 99999}
	default:
		// 7–11: крупные многозначные, до 6 цифр
		return gradeSpec{Min: 1000, Max: 999999}
	}
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

// Generate builds a column problem for school grade 1–11.
func Generate(grade int, opMode string) Problem {
	if grade < 1 || grade > 11 {
		grade = 1
	}
	spec := specForGrade(grade)
	op := pickOp(opMode)
	var a, b, answer int

	if op == "+" {
		if spec.MaxSum > 0 {
			a = randInt(spec.Min, minInt(spec.Max, spec.MaxSum-1))
			maxB := minInt(spec.Max, spec.MaxSum-a)
			if maxB < 1 {
				maxB = 1
			}
			b = randInt(1, maxB)
		} else {
			a = randInt(spec.Min, spec.Max)
			b = randInt(spec.Min, spec.Max)
		}
		answer = a + b
	} else {
		a = randInt(spec.Min, spec.Max)
		bMax := minInt(a, spec.Max)
		if bMax < 1 {
			bMax = 1
		}
		b = randInt(1, bMax)
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

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
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
