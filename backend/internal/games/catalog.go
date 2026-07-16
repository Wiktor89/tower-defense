package games

type Game struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Icon        string   `json:"icon"`
	URL         string   `json:"url"`
	Available   bool     `json:"available"`
	Tags        []string `json:"tags"`
	MinGrade    int      `json:"minGrade"`
	MaxGrade    int      `json:"maxGrade"`
}

func Catalog() []Game {
	return []Game{
		{
			ID:          "tower-defense",
			Title:       "Защита от зомби",
			Description: "Tower defense в стиле Plants vs Zombies. Сажайте растения и отбивайте волны зомби.",
			Icon:        "🌻",
			URL:         "/games/tower-defense/",
			Available:   true,
			Tags:        []string{"стратегия", "tower defense"},
			MinGrade:    5,
			MaxGrade:    11,
		},
		{
			ID:          "math-columns",
			Title:       "Столбик",
			Description: "Сложение и вычитание столбиком",
			Icon:        "📐",
			URL:         "/games/math-columns/",
			Available:   true,
			Tags:        []string{"математика", "обучение"},
			MinGrade:    1,
			MaxGrade:    11,
		},
		{
			ID:          "fill-blanks",
			Title:       "Заполни пропуски",
			Description: "Перетащите слова в пропуски.",
			Icon:        "📝",
			URL:         "/games/fill-blanks/",
			Available:   true,
			Tags:        []string{"слова", "скороговорка"},
			MinGrade:    2,
			MaxGrade:    6,
		},
		{
			ID:          "disassemble",
			Title:       "Разбери и собери",
			Description: "Разберите предмет на детали и соберите снова.",
			Icon:        "🔧",
			URL:         "/games/disassemble/",
			Available:   true,
			Tags:        []string{"3D", "логика"},
			MinGrade:    5,
			MaxGrade:    11,
		},
		{
			ID:          "snake",
			Title:       "Змейка",
			Description: "Классическая аркада — собирайте яблоки и не врезайтесь в стены.",
			Icon:        "🐍",
			URL:         "/games/snake/",
			Available:   false,
			Tags:        []string{"аркада", "классика"},
			MinGrade:    1,
			MaxGrade:    6,
		},
		{
			ID:          "breakout",
			Title:       "Арканоид",
			Description: "Разбивайте блоки мячом и не дайте ему упасть.",
			Icon:        "🧱",
			URL:         "/games/breakout/",
			Available:   false,
			Tags:        []string{"аркада"},
			MinGrade:    2,
			MaxGrade:    8,
		},
		{
			ID:          "memory",
			Title:       "Найди пару",
			Description: "Запоминайте карточки и находите одинаковые пары.",
			Icon:        "🃏",
			URL:         "/games/memory/",
			Available:   false,
			Tags:        []string{"головоломка"},
			MinGrade:    1,
			MaxGrade:    4,
		},
	}
}

func SuitableForGrade(grade int) []Game {
	return SuitableForGradeOrIDs(grade, nil)
}

func IsSuitableForGrade(gameID string, grade int) bool {
	if grade < 1 || grade > 11 {
		return false
	}
	for _, g := range Catalog() {
		if g.ID == gameID {
			return grade >= g.MinGrade && grade <= g.MaxGrade
		}
	}
	return false
}

func SuitableForGradeOrIDs(grade int, extraIDs []string) []Game {
	all := Catalog()
	if grade < 1 || grade > 11 {
		return nil
	}
	extra := make(map[string]bool, len(extraIDs))
	for _, id := range extraIDs {
		if id != "" {
			extra[id] = true
		}
	}
	out := make([]Game, 0, len(all))
	for _, g := range all {
		if (grade >= g.MinGrade && grade <= g.MaxGrade) || extra[g.ID] {
			out = append(out, g)
		}
	}
	return out
}
