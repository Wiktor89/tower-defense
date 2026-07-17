package fractions

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"strconv"
	"strings"
)

type Problem struct {
	ID       string         `json:"id"`
	Grade    int            `json:"grade"`
	Kind     string         `json:"kind"`
	Title    string         `json:"title"`
	Prompt   string         `json:"prompt"`
	Payload  map[string]any `json:"payload"`
	Answer   any            `json:"-"`
	HintPie  map[string]any `json:"-"`
	RankHint string         `json:"rankHint,omitempty"`
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

func newID() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func gcd(a, b int) int {
	if a < 0 {
		a = -a
	}
	if b < 0 {
		b = -b
	}
	for b != 0 {
		a, b = b, a%b
	}
	if a == 0 {
		return 1
	}
	return a
}

func RankTitle(correctTotal int) string {
	switch {
	case correctTotal >= 20:
		return "Магистр Дробей"
	case correctTotal >= 10:
		return "Знаток"
	case correctTotal >= 5:
		return "Подмастерье"
	default:
		return "Ученик"
	}
}

func Generate(grade int) Problem {
	if grade < 1 {
		grade = 1
	}
	if grade > 9 {
		grade = 9
	}
	switch grade {
	case 1:
		return genShare(grade)
	case 2:
		return genBoxes(grade)
	case 3:
		return genPie(grade)
	case 4:
		return genCompare(grade)
	case 5:
		return genSimplify(grade)
	case 6:
		return genOps(grade)
	case 7:
		return genPercent(grade)
	case 8:
		return genODZ(grade)
	default:
		return genBoss(grade)
	}
}

func genShare(grade int) Problem {
	friends := []int{2, 4}[randInt(0, 1)]
	per := randInt(2, 6)
	total := friends * per
	return Problem{
		ID:     newID(),
		Grade:  grade,
		Kind:   "share",
		Title:  "Справедливый пир",
		Prompt: fmt.Sprintf("Раздели %d яблок поровну между %d друзьями. Сколько получит каждый?", total, friends),
		Payload: map[string]any{
			"total":   total,
			"friends": friends,
			"emoji":   "🍎",
		},
		Answer:  per,
		HintPie: map[string]any{"parts": friends, "take": 1, "label": "равные части"},
	}
}

func genBoxes(grade int) Problem {
	boxes := randInt(2, 5)
	per := randInt(2, 6)
	total := boxes * per
	return Problem{
		ID:     newID(),
		Grade:  grade,
		Kind:   "boxes",
		Title:  "Коробки поровну",
		Prompt: fmt.Sprintf("Разложи %d кубиков в %d одинаковые коробки. Сколько кубиков в одной?", total, boxes),
		Payload: map[string]any{
			"total": total,
			"boxes": boxes,
			"emoji": "📦",
		},
		Answer:  per,
		HintPie: map[string]any{"parts": boxes, "take": 1},
	}
}

func genPie(grade int) Problem {
	den := []int{4, 6, 8}[randInt(0, 2)]
	num := randInt(1, den-1)
	return Problem{
		ID:     newID(),
		Grade:  grade,
		Kind:   "pie",
		Title:  "Кусочки пиццы",
		Prompt: fmt.Sprintf("Пиццу разрезали на %d равных частей. Отметь %d кусочка и запиши дробь.", den, num),
		Payload: map[string]any{
			"parts": den,
			"take":  num,
		},
		Answer: map[string]int{"num": num, "den": den},
		HintPie: map[string]any{
			"parts": den,
			"take":  num,
			"label": "снизу — на сколько разрезали, сверху — сколько взяли",
		},
	}
}

func genCompare(grade int) Problem {
	den := []int{4, 5, 6, 8}[randInt(0, 3)]
	a := randInt(1, den-1)
	b := randInt(1, den-1)
	for b == a {
		b = randInt(1, den-1)
	}
	larger := "a"
	if b > a {
		larger = "b"
	}
	return Problem{
		ID:     newID(),
		Grade:  grade,
		Kind:   "compare",
		Title:  "Какой мост длиннее?",
		Prompt: "Какая доля больше? Выбери более длинный мост.",
		Payload: map[string]any{
			"aNum": a, "aDen": den,
			"bNum": b, "bDen": den,
		},
		Answer:  larger,
		HintPie: map[string]any{"parts": den, "take": max(a, b)},
	}
}

func genSimplify(grade int) Problem {
	base := randInt(2, 5)
	k := randInt(2, 4)
	num := base * k
	den := (base + randInt(1, 3)) * k
	g := gcd(num, den)
	return Problem{
		ID:     newID(),
		Grade:  grade,
		Kind:   "simplify",
		Title:  "Алхимия дробей",
		Prompt: "Сократи дробь до несократимой (числитель сверху, знаменатель снизу).",
		Payload: map[string]any{
			"num": num,
			"den": den,
		},
		Answer:  map[string]int{"num": num / g, "den": den / g},
		HintPie: map[string]any{"parts": den / g, "take": num / g, "label": "одинаковые части сокращаются"},
	}
}

func genOps(grade int) Problem {
	den := []int{4, 5, 6, 8, 10}[randInt(0, 4)]
	a := randInt(1, den/2)
	b := randInt(1, den-a)
	return Problem{
		ID:     newID(),
		Grade:  grade,
		Kind:   "add",
		Title:  "Крафт зелья",
		Prompt: "Смешай синее и красное зелье. Какая доля смеси?",
		Payload: map[string]any{
			"aNum": a, "aDen": den,
			"bNum": b, "bDen": den,
			"op":   "+",
		},
		Answer:  map[string]int{"num": a + b, "den": den},
		HintPie: map[string]any{"parts": den, "take": a + b},
	}
}

func genPercent(grade int) Problem {
	price := randInt(2, 9) * 100
	pct := []int{10, 20, 25, 50}[randInt(0, 3)]
	discount := price * pct / 100
	return Problem{
		ID:     newID(),
		Grade:  grade,
		Kind:   "percent",
		Title:  "Ярмарка скидок",
		Prompt: fmt.Sprintf("Товар стоит %d монет. Скидка %d%%. Сколько составит скидка в монетах?", price, pct),
		Payload: map[string]any{
			"price":   price,
			"percent": pct,
		},
		Answer:  discount,
		HintPie: map[string]any{"parts": 100 / gcd(pct, 100), "take": pct / gcd(pct, 100)},
	}
}

func formatXPlus(shift int) string {
	if shift >= 0 {
		return fmt.Sprintf("x+%d", shift)
	}
	return fmt.Sprintf("x−%d", -shift)
}

// formatXMinusRoot — запись (x − root) без «x−−3».
func formatXMinusRoot(root int) string {
	if root > 0 {
		return fmt.Sprintf("x−%d", root)
	}
	if root < 0 {
		return fmt.Sprintf("x+%d", -root)
	}
	return "x"
}

func genODZ(grade int) Problem {
	trap := randInt(-5, 5)
	for trap == 0 {
		trap = randInt(-5, 5)
	}
	shift := randInt(1, 4)
	// (x + shift) / (x - trap) — zero den when x == trap
	return Problem{
		ID:     newID(),
		Grade:  grade,
		Kind:   "odz",
		Title:  "Разминирование ловушки",
		Prompt: "При каком x сработает ловушка (нижняя часть дроби станет 0)?",
		Payload: map[string]any{
			"numShift": shift,
			"denRoot":  trap,
			"numExpr":  formatXPlus(shift),
			"denExpr":  formatXMinusRoot(trap),
		},
		Answer:  trap,
		HintPie: map[string]any{"parts": 4, "take": 0, "label": "снизу не может быть нуля"},
	}
}

func genBoss(grade int) Problem {
	// (x+2)/(x-1) at x=3 → 5/2, ask integer part or simplified answer as num/den
	x := randInt(2, 6)
	denRoot := 1
	for x == denRoot {
		x = randInt(2, 6)
	}
	num := x + 2
	den := x - denRoot
	g := gcd(num, den)
	return Problem{
		ID:     newID(),
		Grade:  grade,
		Kind:   "boss",
		Title:  "Удар Магистра",
		Prompt: fmt.Sprintf("Урон босса: значение дроби при x = %d. Запиши несократимую дробь.", x),
		Payload: map[string]any{
			"x":       x,
			"numExpr": "x+2",
			"denExpr": "x−1",
		},
		Answer:  map[string]int{"num": num / g, "den": den / g},
		HintPie: map[string]any{"parts": den / g, "take": num / g},
	}
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func PublicView(p Problem) Problem {
	return Problem{
		ID:      p.ID,
		Grade:   p.Grade,
		Kind:    p.Kind,
		Title:   p.Title,
		Prompt:  p.Prompt,
		Payload: p.Payload,
	}
}

func Check(p Problem, answer any) (bool, map[string]any) {
	hint := p.HintPie
	switch p.Kind {
	case "share", "boxes", "percent", "odz":
		want, ok := asInt(p.Answer)
		got, ok2 := asInt(answer)
		return ok && ok2 && want == got, hint
	case "compare":
		want, _ := p.Answer.(string)
		got, _ := answer.(string)
		return want == got, hint
	case "simplify", "boss":
		want := asFrac(p.Answer)
		got := asFrac(answer)
		if want == nil || got == nil {
			return false, hint
		}
		// Нужна именно несократимая запись, не просто равная доля.
		if gcd(got["num"], got["den"]) != 1 {
			return false, hint
		}
		return got["num"] == want["num"] && got["den"] == want["den"], hint
	case "pie", "add":
		want := asFrac(p.Answer)
		got := asFrac(answer)
		if want == nil || got == nil {
			return false, hint
		}
		wg := gcd(want["num"], want["den"])
		gg := gcd(got["num"], got["den"])
		return want["num"]/wg == got["num"]/gg && want["den"]/wg == got["den"]/gg, hint
	default:
		return false, hint
	}
}

func asInt(v any) (int, bool) {
	switch n := v.(type) {
	case int:
		return n, true
	case int32:
		return int(n), true
	case int64:
		return int(n), true
	case float32:
		return int(n), true
	case float64:
		return int(n), true
	case json.Number:
		i, err := n.Int64()
		if err != nil {
			return 0, false
		}
		return int(i), true
	case string:
		i, err := strconv.Atoi(strings.TrimSpace(n))
		if err != nil {
			return 0, false
		}
		return i, true
	default:
		return 0, false
	}
}

func asFrac(v any) map[string]int {
	switch m := v.(type) {
	case map[string]int:
		return m
	case map[string]any:
		num, ok1 := asInt(m["num"])
		den, ok2 := asInt(m["den"])
		if ok1 && ok2 && den != 0 {
			return map[string]int{"num": num, "den": den}
		}
	}
	return nil
}
