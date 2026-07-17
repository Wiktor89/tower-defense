package fractions

import (
	"encoding/json"
	"testing"
	"time"
)

// Имитация POST /api/fractions/check: ответ как после json.Decoder.
func TestStoreCheckRoundTripAllKinds(t *testing.T) {
	store := NewStore(time.Minute)
	kinds := map[int]string{
		1: "share", 2: "boxes", 3: "pie", 4: "compare", 5: "simplify",
		6: "add", 7: "percent", 8: "odz", 9: "boss",
	}
	for grade, kind := range kinds {
		p := Generate(grade)
		if p.Kind != kind {
			t.Fatalf("grade %d: want kind %s, got %s", grade, kind, p.Kind)
		}
		store.Save(p)
		got, ok := store.Get(p.ID)
		if !ok {
			t.Fatalf("problem %s not in store", p.ID)
		}
		want, err := expectedFromPayload(got)
		if err != nil {
			t.Fatal(err)
		}
		body, _ := json.Marshal(map[string]any{"id": p.ID, "answer": want, "userId": 1})
		var req struct {
			ID     string `json:"id"`
			Answer any    `json:"answer"`
			UserID int    `json:"userId"`
		}
		if err := json.Unmarshal(body, &req); err != nil {
			t.Fatal(err)
		}
		correct, _ := Check(got, req.Answer)
		if !correct {
			t.Fatalf("kind=%s grade=%d answer=%#v rejected after JSON", kind, grade, req.Answer)
		}
		store.Delete(p.ID)
		if _, ok := store.Get(p.ID); ok {
			t.Fatal("expected delete")
		}
	}
}
