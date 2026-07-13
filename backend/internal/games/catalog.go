package games

type Game struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Description string   `json:"description"`
	Icon        string   `json:"icon"`
	URL         string   `json:"url"`
	Available   bool     `json:"available"`
	Tags        []string `json:"tags"`
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
		},
		{
			ID:          "math-columns",
			Title:       "Столбик",
			Description: "Сложение и вычитание столбиком",
			Icon:        "📐",
			URL:         "/games/math-columns/",
			Available:   true,
			Tags:        []string{"математика", "обучение"},
		},
		{
			ID:          "fill-blanks",
			Title:       "Заполни пропуски",
			Description: "Перетащите слова в пропуски — тексты задаёт администратор.",
			Icon:        "📝",
			URL:         "/games/fill-blanks/",
			Available:   true,
			Tags:        []string{"слова", "скороговорка"},
		},
		{
			ID:          "snake",
			Title:       "Змейка",
			Description: "Классическая аркада — собирайте яблоки и не врезайтесь в стены.",
			Icon:        "🐍",
			URL:         "/games/snake/",
			Available:   false,
			Tags:        []string{"аркада", "классика"},
		},
		{
			ID:          "breakout",
			Title:       "Арканоид",
			Description: "Разбивайте блоки мячом и не дайте ему упасть.",
			Icon:        "🧱",
			URL:         "/games/breakout/",
			Available:   false,
			Tags:        []string{"аркада"},
		},
		{
			ID:          "memory",
			Title:       "Найди пару",
			Description: "Запоминайте карточки и находите одинаковые пары.",
			Icon:        "🃏",
			URL:         "/games/memory/",
			Available:   false,
			Tags:        []string{"головоломка"},
		},
	}
}
