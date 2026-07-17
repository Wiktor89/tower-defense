package fractions

import (
	"encoding/json"
	"fmt"
	"testing"
)

func expectedFromPayload(p Problem) (any, error) {
	switch p.Kind {
	case "share":
		total := intFrom(p.Payload["total"])
		friends := intFrom(p.Payload["friends"])
		if friends == 0 || total%friends != 0 {
			return nil, fmt.Errorf("share payload invalid: total=%d friends=%d", total, friends)
		}
		return total / friends, nil
	case "boxes":
		total := intFrom(p.Payload["total"])
		boxes := intFrom(p.Payload["boxes"])
		if boxes == 0 || total%boxes != 0 {
			return nil, fmt.Errorf("boxes payload invalid: total=%d boxes=%d", total, boxes)
		}
		return total / boxes, nil
	case "pie":
		return map[string]int{
			"num": intFrom(p.Payload["take"]),
			"den": intFrom(p.Payload["parts"]),
		}, nil
	case "compare":
		a := intFrom(p.Payload["aNum"])
		b := intFrom(p.Payload["bNum"])
		denA := intFrom(p.Payload["aDen"])
		denB := intFrom(p.Payload["bDen"])
		if denA != denB || denA == 0 || a == b {
			return nil, fmt.Errorf("compare payload invalid: %v", p.Payload)
		}
		if b > a {
			return "b", nil
		}
		return "a", nil
	case "simplify":
		num := intFrom(p.Payload["num"])
		den := intFrom(p.Payload["den"])
		if den == 0 {
			return nil, fmt.Errorf("simplify den=0")
		}
		g := gcd(num, den)
		return map[string]int{"num": num / g, "den": den / g}, nil
	case "add":
		a := intFrom(p.Payload["aNum"])
		b := intFrom(p.Payload["bNum"])
		den := intFrom(p.Payload["aDen"])
		if den == 0 || den != intFrom(p.Payload["bDen"]) {
			return nil, fmt.Errorf("add payload invalid: %v", p.Payload)
		}
		return map[string]int{"num": a + b, "den": den}, nil
	case "percent":
		price := intFrom(p.Payload["price"])
		pct := intFrom(p.Payload["percent"])
		return price * pct / 100, nil
	case "odz":
		root := intFrom(p.Payload["denRoot"])
		if root == 0 {
			return nil, fmt.Errorf("odz root=0")
		}
		return root, nil
	case "boss":
		x := intFrom(p.Payload["x"])
		num := x + 2
		den := x - 1
		if den == 0 {
			return nil, fmt.Errorf("boss den=0 at x=%d", x)
		}
		g := gcd(num, den)
		return map[string]int{"num": num / g, "den": den / g}, nil
	default:
		return nil, fmt.Errorf("unknown kind %q", p.Kind)
	}
}

func intFrom(v any) int {
	n, ok := asInt(v)
	if !ok {
		return 0
	}
	return n
}

func viaJSON(answer any) any {
	raw, err := json.Marshal(map[string]any{"answer": answer})
	if err != nil {
		panic(err)
	}
	var wrap struct {
		Answer any `json:"answer"`
	}
	if err := json.Unmarshal(raw, &wrap); err != nil {
		panic(err)
	}
	return wrap.Answer
}

func TestCheckShareAcceptsJSONNumber(t *testing.T) {
	p := Problem{Kind: "share", Answer: 5}
	for _, ans := range []any{float64(5), 5, "5", json.Number("5")} {
		ok, _ := Check(p, ans)
		if !ok {
			t.Fatalf("expected %#v to match answer 5", ans)
		}
	}
	ok, _ := Check(p, 4)
	if ok {
		t.Fatal("expected 4 to be wrong")
	}
}

func TestAllGradesGenerateAndCheck(t *testing.T) {
	for grade := 1; grade <= 9; grade++ {
		grade := grade
		t.Run(fmt.Sprintf("grade_%d", grade), func(t *testing.T) {
			for i := 0; i < 80; i++ {
				p := Generate(grade)
				if p.Kind == "" || p.ID == "" {
					t.Fatalf("empty problem: %+v", p)
				}
				want, err := expectedFromPayload(p)
				if err != nil {
					t.Fatalf("payload: %v (problem=%+v)", err, p)
				}
				ok, _ := Check(p, want)
				if !ok {
					t.Fatalf("stored answer rejected: kind=%s answer=%#v payload=%v", p.Kind, p.Answer, p.Payload)
				}
				// как приходит с фронта после JSON
				ok, _ = Check(p, viaJSON(want))
				if !ok {
					t.Fatalf("JSON answer rejected: kind=%s want=%#v json=%#v", p.Kind, want, viaJSON(want))
				}
				// явный неверный ответ
				if !checkRejectsWrong(p, want) {
					t.Fatalf("wrong answer accepted: kind=%s", p.Kind)
				}
			}
		})
	}
}

func checkRejectsWrong(p Problem, want any) bool {
	switch p.Kind {
	case "share", "boxes", "percent", "odz":
		n, _ := asInt(want)
		ok, _ := Check(p, n+1)
		return !ok
	case "compare":
		other := "a"
		if want == "a" {
			other = "b"
		}
		ok, _ := Check(p, other)
		return !ok
	case "pie", "add":
		m := asFrac(want)
		ok, _ := Check(p, map[string]any{"num": float64(m["num"] + 1), "den": float64(m["den"])})
		return !ok
	case "simplify", "boss":
		m := asFrac(want)
		// несокращённая эквивалентная — для simplify/boss должна быть отвергнута, если g>1
		okEq, _ := Check(p, map[string]any{"num": float64(m["num"] * 2), "den": float64(m["den"] * 2)})
		okWrong, _ := Check(p, map[string]any{"num": float64(m["num"] + 1), "den": float64(m["den"])})
		return !okEq && !okWrong
	default:
		return false
	}
}

func TestSimplifyRequiresIrreducible(t *testing.T) {
	p := Problem{
		Kind:   "simplify",
		Answer: map[string]int{"num": 1, "den": 2},
		Payload: map[string]any{"num": 2, "den": 4},
	}
	ok, _ := Check(p, map[string]any{"num": float64(1), "den": float64(2)})
	if !ok {
		t.Fatal("1/2 should pass")
	}
	ok, _ = Check(p, map[string]any{"num": float64(2), "den": float64(4)})
	if ok {
		t.Fatal("2/4 must fail for simplify")
	}
}

func TestAddAllowsEquivalentFraction(t *testing.T) {
	p := Problem{
		Kind:   "add",
		Answer: map[string]int{"num": 1, "den": 2},
	}
	ok, _ := Check(p, map[string]any{"num": float64(2), "den": float64(4)})
	if !ok {
		t.Fatal("2/4 should equal 1/2 for add")
	}
}

func TestODZNegativeRootDisplayAndAnswer(t *testing.T) {
	// генерируем много раз — среди них должны быть отрицательные корни
	sawNeg := false
	for i := 0; i < 200; i++ {
		p := Generate(8)
		root := intFrom(p.Payload["denRoot"])
		if root == 0 {
			t.Fatal("odz root must not be 0")
		}
		denExpr := fmt.Sprint(p.Payload["denExpr"])
		if root > 0 && denExpr != fmt.Sprintf("x−%d", root) {
			t.Fatalf("denExpr=%q for root=%d", denExpr, root)
		}
		if root < 0 {
			sawNeg = true
			if denExpr != fmt.Sprintf("x+%d", -root) {
				t.Fatalf("denExpr=%q for root=%d, want x+%d", denExpr, root, -root)
			}
		}
		ok, _ := Check(p, viaJSON(root))
		if !ok {
			t.Fatalf("odz answer %d rejected", root)
		}
	}
	if !sawNeg {
		t.Fatal("expected at least one negative ODZ root in 200 samples")
	}
}

func TestBossNeverZeroDenominator(t *testing.T) {
	for i := 0; i < 100; i++ {
		p := Generate(9)
		x := intFrom(p.Payload["x"])
		if x == 1 {
			t.Fatalf("x must not be 1, got %d", x)
		}
		want, err := expectedFromPayload(p)
		if err != nil {
			t.Fatal(err)
		}
		ok, _ := Check(p, viaJSON(want))
		if !ok {
			t.Fatalf("boss rejected: x=%d want=%#v", x, want)
		}
	}
}

func TestNoSlashInPrompts(t *testing.T) {
	for grade := 1; grade <= 9; grade++ {
		for i := 0; i < 30; i++ {
			p := Generate(grade)
			if containsSlashFraction(p.Prompt) {
				t.Fatalf("prompt has a/b slash notation: %q", p.Prompt)
			}
		}
	}
}

func containsSlashFraction(s string) bool {
	// грубо: цифра/цифра или )/(
	for i := 1; i < len(s)-1; i++ {
		if s[i] != '/' {
			continue
		}
		prev, next := s[i-1], s[i+1]
		if (prev >= '0' && prev <= '9' && next >= '0' && next <= '9') ||
			(prev == ')' && next == '(') {
			return true
		}
	}
	return false
}
