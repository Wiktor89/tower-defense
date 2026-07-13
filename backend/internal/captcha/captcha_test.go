package captcha

import "testing"

func TestPuzzleGeneratesValidDataURL(t *testing.T) {
	ch := NewStore().Create()
	if ch.ID == "" {
		t.Fatal("empty id")
	}
	if len(ch.Background) < 100 || ch.Background[:26] != "data:image/svg+xml;base64," {
		t.Fatalf("bad background url prefix")
	}
	if len(ch.Piece) < 100 {
		t.Fatal("empty piece")
	}
}

func TestVerifySlider(t *testing.T) {
	s := NewStore()
	ch := s.Create()
	if s.Verify(ch.ID, -999) {
		t.Fatal("should reject wrong position")
	}
}
