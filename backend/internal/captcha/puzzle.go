package captcha

import (
	"bytes"
	"fmt"
	"net/url"
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
	return fmt.Sprintf("hsl(%d 65%% 55%%)", h)
}

func puzzlePath(x, y, w, h int) string {
	tab := 8
	r := 6
	return fmt.Sprintf(
		`M %d %d h %d a %d %d 0 0 1 %d %d v %d a %d %d 0 0 0 %d %d h %d a %d %d 0 0 1 %d %d v %d a %d %d 0 0 0 -%d %d h -%d a %d %d 0 0 1 -%d -%d v -%d a %d %d 0 0 0 -%d -%d Z`,
		x+r, y,
		w/2-tab-r, r, r, r, r,
		h/2-tab, tab, tab, tab, tab,
		w/2-tab, tab, tab, tab, tab,
		h/2-tab, tab, tab, tab, tab,
		w/2-tab, tab, tab, tab, tab,
		h/2-tab-r, r, r, r, r,
		w, r, r, r, r,
		h-2*r,
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
	path := puzzlePath(targetX, targetY, PieceWidth, PieceHeight)
	pattern := generatePatternRects(seed, 0, 0, ImageWidth, ImageHeight)

	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">
%s
<path d="%s" fill="rgba(0,0,0,0.55)" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
</svg>`, ImageWidth, ImageHeight, ImageWidth, ImageHeight, pattern, path)
}

func generatePiece(seed, targetX, targetY int) string {
	path := puzzlePath(0, 0, PieceWidth, PieceHeight)
	pattern := generatePatternRects(seed, -targetX, -targetY, PieceWidth, PieceHeight)

	return fmt.Sprintf(`<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">
<defs><clipPath id="p"><path d="%s"/></clipPath></defs>
<g clip-path="url(#p)">%s</g>
<path d="%s" fill="none" stroke="rgba(255,255,255,0.7)" stroke-width="1.5"/>
</svg>`, PieceWidth, PieceHeight, PieceWidth, PieceHeight, path, pattern, path)
}

func toDataURL(svg string) string {
	return "data:image/svg+xml;charset=utf-8," + url.QueryEscape(svg)
}
