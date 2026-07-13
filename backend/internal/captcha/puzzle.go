package captcha

import (
	"bytes"
	"encoding/base64"
	"fmt"
)

const (
	ImageWidth  = 300
	ImageHeight = 150
	PieceWidth  = 44
	PieceHeight = 44
	Tolerance   = 8
)

func colorAt(seed, x, y int) string {
	h := (seed*131 + x*17 + y*23) % 360
	return fmt.Sprintf("hsl(%d, 65%%, 55%%)", h)
}

func holeMarkup(x, y int) string {
	tabR := 7
	return fmt.Sprintf(
		`<rect x="%d" y="%d" width="%d" height="%d" rx="6" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>`+
			`<circle cx="%d" cy="%d" r="%d" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>`,
		x, y, PieceWidth, PieceHeight,
		x+PieceWidth, y+PieceHeight/2, tabR,
	)
}

func clipMarkup() string {
	tabR := 7
	w := PieceWidth
	h := PieceHeight
	return fmt.Sprintf(
		`<rect x="0" y="0" width="%d" height="%d" rx="6"/>`+
			`<circle cx="%d" cy="%d" r="%d"/>`,
		w, h, w, h/2, tabR,
	)
}

func generatePatternRects(seed, ox, oy, w, h int) string {
	var buf bytes.Buffer
	step := 12
	for py := 0; py < h; py += step {
		for px := 0; px < w; px += step {
			x := ox + px
			y := oy + py
			rw := step
			rh := step
			if px+step > w {
				rw = w - px
			}
			if py+step > h {
				rh = h - py
			}
			fmt.Fprintf(&buf, `<rect x="%d" y="%d" width="%d" height="%d" fill="%s"/>`, x, y, rw, rh, colorAt(seed, x, y))
		}
	}
	return buf.String()
}

func generateBackground(seed, targetX, targetY int) string {
	pattern := generatePatternRects(seed, 0, 0, ImageWidth, ImageHeight)
	hole := holeMarkup(targetX, targetY)
	return fmt.Sprintf(
		`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">%s%s</svg>`,
		ImageWidth, ImageHeight, ImageWidth, ImageHeight, pattern, hole,
	)
}

func generatePiece(seed, targetX, targetY int) string {
	pattern := generatePatternRects(seed, -targetX, -targetY, PieceWidth, PieceHeight)
	clip := clipMarkup()
	border := fmt.Sprintf(
		`<rect x="0" y="0" width="%d" height="%d" rx="6" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>`+
			`<circle cx="%d" cy="%d" r="7" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>`,
		PieceWidth, PieceHeight, PieceWidth, PieceHeight/2,
	)
	return fmt.Sprintf(
		`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">`+
			`<defs><clipPath id="p">%s</clipPath></defs>`+
			`<g clip-path="url(#p)">%s</g>%s</svg>`,
		PieceWidth, PieceHeight, PieceWidth, PieceHeight, clip, pattern, border,
	)
}

func toDataURL(svg string) string {
	return "data:image/svg+xml;base64," + base64.StdEncoding.EncodeToString([]byte(svg))
}
