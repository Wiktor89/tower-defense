package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"games/internal/admin"
	"games/internal/captcha"
	"games/internal/fillblanks"
	"games/internal/games"
	mathpkg "games/internal/math"
	"games/internal/store"
	"games/internal/td"
)

type Handler struct {
	mathStore    *mathpkg.Store
	mathSessions *mathpkg.SessionTracker
	tdSessions   *td.Store
	fillStore    *fillblanks.Store
	db           *store.Store
	adminAuth    *admin.Auth
	captcha      *captcha.Store
}

func NewHandler(
	mathStore *mathpkg.Store,
	mathSessions *mathpkg.SessionTracker,
	tdSessions *td.Store,
	fillStore *fillblanks.Store,
	db *store.Store,
	adminAuth *admin.Auth,
	captchaStore *captcha.Store,
) *Handler {
	return &Handler{
		mathStore:    mathStore,
		mathSessions: mathSessions,
		tdSessions:   tdSessions,
		fillStore:    fillStore,
		db:           db,
		adminAuth:    adminAuth,
		captcha:      captchaStore,
	}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", h.health)
	mux.HandleFunc("GET /api/captcha", h.getCaptcha)
	mux.HandleFunc("GET /api/games", h.listGames)
	mux.HandleFunc("GET /api/challenge", h.getChallenge)
	mux.HandleFunc("POST /api/math/problem", h.createMathProblem)
	mux.HandleFunc("POST /api/math/check", h.checkMathAnswer)
	mux.HandleFunc("POST /api/users/login", h.userLogin)
	mux.HandleFunc("PUT /api/users/password", h.setUserPassword)
	mux.HandleFunc("PUT /api/users/avatar", h.setUserAvatar)
	mux.HandleFunc("POST /api/tower-defense/start", h.tdStart)
	mux.HandleFunc("POST /api/tower-defense/finish", h.tdFinish)
	mux.HandleFunc("GET /api/fill-blanks/puzzle", h.fillBlanksPuzzle)
	mux.HandleFunc("POST /api/fill-blanks/check", h.fillBlanksCheck)
	mux.HandleFunc("POST /api/disassemble/complete", h.disassembleComplete)
	mux.HandleFunc("GET /api/settings/math-columns", h.mathColumnsSettings)
	mux.HandleFunc("POST /api/admin/login", h.adminLogin)
	mux.HandleFunc("GET /api/admin/stats", h.adminStats)
	mux.HandleFunc("GET /api/admin/stages", h.adminStages)
	mux.HandleFunc("POST /api/admin/verify", h.adminVerify)
	mux.HandleFunc("GET /api/admin/settings/math-columns", h.adminGetMathColumnsSettings)
	mux.HandleFunc("PUT /api/admin/settings/math-columns", h.adminSetMathColumnsSettings)
	mux.HandleFunc("GET /api/admin/settings/fill-blanks", h.adminListFillTexts)
	mux.HandleFunc("POST /api/admin/settings/fill-blanks", h.adminAddFillText)
	mux.HandleFunc("PUT /api/admin/settings/fill-blanks/{id}", h.adminSetFillBlankPercent)
	mux.HandleFunc("DELETE /api/admin/settings/fill-blanks/{id}", h.adminDeleteFillText)
	mux.HandleFunc("GET /api/admin/settings/daily-challenge", h.adminGetChallenge)
	mux.HandleFunc("PUT /api/admin/settings/daily-challenge", h.adminSetChallenge)
	mux.HandleFunc("PUT /api/admin/users/{id}/grade", h.adminSetUserGrade)
	mux.HandleFunc("DELETE /api/admin/users/{id}", h.adminDeleteUser)
}

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) getCaptcha(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, h.captcha.Create())
}

func (h *Handler) checkCaptcha(w http.ResponseWriter, id string, answer int) bool {
	if id == "" {
		writeError(w, http.StatusBadRequest, "captcha is required")
		return false
	}
	if !h.captcha.Verify(id, answer) {
		writeError(w, http.StatusBadRequest, "invalid captcha")
		return false
	}
	return true
}

func (h *Handler) listGames(w http.ResponseWriter, r *http.Request) {
	userIDStr := r.URL.Query().Get("userId")
	if userIDStr == "" {
		writeJSON(w, http.StatusOK, games.Catalog())
		return
	}
	userID, err := strconv.Atoi(userIDStr)
	if err != nil || userID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid userId")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.db.GetUser(ctx, userID)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	if user.Role == store.RoleAdmin {
		writeJSON(w, http.StatusOK, games.Catalog())
		return
	}
	if user.Grade == nil {
		writeJSON(w, http.StatusOK, []games.Game{})
		return
	}

	var challengeIDs []string
	if ch, err := h.db.GetActiveChallenge(ctx, userID); err == nil && ch != nil {
		challengeIDs = make([]string, 0, len(ch.Games))
		for _, g := range ch.Games {
			challengeIDs = append(challengeIDs, g.GameID)
		}
	}
	writeJSON(w, http.StatusOK, games.SuitableForGradeOrIDs(*user.Grade, challengeIDs))
}

func enrichChallengeGames(list []store.ChallengeGame) {
	meta := map[string]games.Game{}
	for _, g := range games.Catalog() {
		meta[g.ID] = g
	}
	for i := range list {
		if g, ok := meta[list[i].GameID]; ok {
			list[i].Title = g.Title
			list[i].URL = g.URL
		}
	}
}

type mathProblemRequest struct {
	UserID int `json:"userId"`
}

func (h *Handler) createMathProblem(w http.ResponseWriter, r *http.Request) {
	var req mathProblemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID <= 0 {
		writeError(w, http.StatusBadRequest, "userId is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.db.GetUser(ctx, req.UserID)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to load user")
		return
	}
	if user.Grade == nil {
		writeError(w, http.StatusBadRequest, "user grade is not set")
		return
	}

	digits, err := h.db.GetDigitCount(ctx, "math-columns")
	if err != nil {
		digits = store.DefaultDigitCount
	}

	problem := mathpkg.Generate(*user.Grade, digits, "mixed")
	h.mathStore.Save(problem)
	writeJSON(w, http.StatusOK, mathpkg.PublicView(problem))
}

type mathCheckRequest struct {
	ID     string `json:"id"`
	Answer int    `json:"answer"`
	UserID int    `json:"userId"`
}

type mathCheckResponse struct {
	Correct         bool                   `json:"correct"`
	CorrectAnswer   int                    `json:"correctAnswer,omitempty"`
	SessionSolved   int                    `json:"sessionSolved,omitempty"`
	SessionComplete bool                   `json:"sessionComplete,omitempty"`
	StageCompletion *store.StageCompletion `json:"stageCompletion,omitempty"`
}

func (h *Handler) checkMathAnswer(w http.ResponseWriter, r *http.Request) {
	var req mathCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ID == "" {
		writeError(w, http.StatusBadRequest, "missing problem id")
		return
	}

	problem, ok := h.mathStore.Get(req.ID)
	if !ok {
		writeError(w, http.StatusNotFound, "problem not found or expired")
		return
	}
	defer h.mathStore.Delete(req.ID)

	correct := req.Answer == problem.Answer
	resp := mathCheckResponse{Correct: correct}
	if !correct {
		resp.CorrectAnswer = problem.Answer
	}

	if req.UserID > 0 {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		if _, err := h.db.GetUser(ctx, req.UserID); err != nil {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		delta := store.StatsDelta{}
		if correct {
			delta.Correct = 1
		} else {
			delta.Wrong = 1
		}
		if err := h.db.AddStats(ctx, req.UserID, "math-columns", delta); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save stats")
			return
		}

		if correct {
			sessionSize, err := h.db.GetSessionSize(ctx, "math-columns")
			if err != nil {
				sessionSize = store.DefaultSessionSize
			}
			solved, completed := h.mathSessions.RecordCorrect(req.UserID, problem.Level, sessionSize)
			resp.SessionSolved = solved
			if completed {
				resp.SessionComplete = true
				if err := h.db.AddStats(ctx, req.UserID, "math-columns", store.StatsDelta{SessionsCompleted: 1}); err != nil {
					writeError(w, http.StatusInternalServerError, "failed to save stats")
					return
				}
				if reward, err := h.db.MarkChallengeGameDone(ctx, req.UserID, "math-columns"); err != nil {
					writeError(w, http.StatusInternalServerError, "failed to update challenge")
					return
				} else if reward != nil {
					resp.StageCompletion = reward
				}
			}
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

type userLoginRequest struct {
	Login         string `json:"login"`
	Password      string `json:"password"`
	CaptchaID     string `json:"captchaId"`
	CaptchaAnswer int    `json:"captchaAnswer"`
}

func (h *Handler) userLogin(w http.ResponseWriter, r *http.Request) {
	var req userLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !h.checkCaptcha(w, req.CaptchaID, req.CaptchaAnswer) {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.db.LoginUser(ctx, req.Login, req.Password)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrPasswordRequired):
			writeError(w, http.StatusUnauthorized, "password required")
		case errors.Is(err, store.ErrPasswordTooShort):
			writeError(w, http.StatusBadRequest, "password must be at least 4 characters")
		case errors.Is(err, store.ErrInvalidPassword):
			writeError(w, http.StatusUnauthorized, "invalid password")
		default:
			writeError(w, http.StatusBadRequest, err.Error())
		}
		return
	}

	resp := map[string]any{
		"id":          user.ID,
		"login":       user.Login,
		"role":        user.Role,
		"grade":       user.Grade,
		"avatar":      user.Avatar,
		"hasPassword": user.HasPassword,
		"createdAt":   user.CreatedAt,
	}
	if user.Role == store.RoleAdmin {
		resp["adminToken"] = h.adminAuth.IssueToken()
	}
	writeJSON(w, http.StatusOK, resp)
}

type setUserAvatarRequest struct {
	UserID int    `json:"userId"`
	Avatar string `json:"avatar"`
}

func (h *Handler) setUserAvatar(w http.ResponseWriter, r *http.Request) {
	var req setUserAvatarRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID <= 0 || req.Avatar == "" {
		writeError(w, http.StatusBadRequest, "userId and avatar are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.db.SetUserAvatar(ctx, req.UserID, req.Avatar)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, user)
}

type setUserPasswordRequest struct {
	UserID          int    `json:"userId"`
	Password        string `json:"password"`
	CurrentPassword string `json:"currentPassword"`
}

func (h *Handler) setUserPassword(w http.ResponseWriter, r *http.Request) {
	var req setUserPasswordRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID <= 0 || req.Password == "" {
		writeError(w, http.StatusBadRequest, "userId and password are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.db.SetUserPassword(ctx, req.UserID, req.Password, req.CurrentPassword)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrUserNotFound):
			writeError(w, http.StatusNotFound, "user not found")
		case errors.Is(err, store.ErrPasswordRequired):
			writeError(w, http.StatusBadRequest, "current password is required")
		case errors.Is(err, store.ErrPasswordMismatch):
			writeError(w, http.StatusUnauthorized, "current password is incorrect")
		case errors.Is(err, store.ErrPasswordTooShort):
			writeError(w, http.StatusBadRequest, "password must be at least 4 characters")
		default:
			writeError(w, http.StatusInternalServerError, "failed to set password")
		}
		return
	}
	writeJSON(w, http.StatusOK, user)
}

type tdStartRequest struct {
	UserID int `json:"userId"`
}

func (h *Handler) tdStart(w http.ResponseWriter, r *http.Request) {
	var req tdStartRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID <= 0 {
		writeError(w, http.StatusBadRequest, "userId is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.db.GetUser(ctx, req.UserID); err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	sess := h.tdSessions.Start(req.UserID)
	writeJSON(w, http.StatusOK, map[string]any{
		"sessionId":      sess.ID,
		"minDurationMs":  td.MinWinDuration().Milliseconds(),
		"minLossDurationMs": td.MinLossDuration().Milliseconds(),
	})
}

type tdFinishRequest struct {
	SessionID string `json:"sessionId"`
	Result    string `json:"result"`
}

func (h *Handler) tdFinish(w http.ResponseWriter, r *http.Request) {
	var req tdFinishRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SessionID == "" {
		writeError(w, http.StatusBadRequest, "sessionId is required")
		return
	}

	userID, err := h.tdSessions.Finish(req.SessionID, req.Result)
	if err != nil {
		switch {
		case errors.Is(err, td.ErrSessionNotFound):
			writeError(w, http.StatusNotFound, "session not found or expired")
		case errors.Is(err, td.ErrSessionUsed):
			writeError(w, http.StatusConflict, "session already finished")
		case errors.Is(err, td.ErrTooEarly):
			writeError(w, http.StatusBadRequest, "finished too early")
		case errors.Is(err, td.ErrInvalidResult):
			writeError(w, http.StatusBadRequest, "result must be won or lost")
		default:
			writeError(w, http.StatusInternalServerError, "failed to finish session")
		}
		return
	}

	delta := store.StatsDelta{}
	if req.Result == "won" {
		delta.GamesWon = 1
	} else {
		delta.GamesLost = 1
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.db.AddStats(ctx, userID, "tower-defense", delta); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save stats")
		return
	}

	out := map[string]any{"status": "ok"}
	if req.Result == "won" {
		if reward, err := h.db.MarkChallengeGameDone(ctx, userID, "tower-defense"); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to update challenge")
			return
		} else if reward != nil {
			out["challengeReward"] = reward
		}
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) fillBlanksPuzzle(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	text, err := h.db.RandomFillBlankText(ctx)
	if err != nil {
		writeError(w, http.StatusNotFound, "no texts configured")
		return
	}
	puzzle, err := h.fillStore.CreateFromText(text.Body, text.BlankPercent)
	if err != nil {
		writeError(w, http.StatusBadRequest, "text is too short for this game")
		return
	}
	writeJSON(w, http.StatusOK, puzzle)
}

type fillBlanksCheckRequest struct {
	ID      string   `json:"id"`
	Answers []string `json:"answers"`
	UserID  int      `json:"userId"`
}

type fillBlanksCheckResponse struct {
	Correct          bool                   `json:"correct"`
	ChallengeReward  *store.StageCompletion `json:"challengeReward,omitempty"`
}

func (h *Handler) fillBlanksCheck(w http.ResponseWriter, r *http.Request) {
	var req fillBlanksCheckRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.ID == "" {
		writeError(w, http.StatusBadRequest, "missing puzzle id")
		return
	}

	correct, ok := h.fillStore.Check(req.ID, req.Answers)
	if !ok {
		writeError(w, http.StatusNotFound, "puzzle not found or expired")
		return
	}

	resp := fillBlanksCheckResponse{Correct: correct}

	if req.UserID > 0 {
		ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
		defer cancel()

		if _, err := h.db.GetUser(ctx, req.UserID); err != nil {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}

		delta := store.StatsDelta{}
		if correct {
			delta.Correct = 1
			delta.SessionsCompleted = 1
		} else {
			delta.Wrong = 1
		}
		if err := h.db.AddStats(ctx, req.UserID, "fill-blanks", delta); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to save stats")
			return
		}
		if correct {
			if reward, err := h.db.MarkChallengeGameDone(ctx, req.UserID, "fill-blanks"); err != nil {
				writeError(w, http.StatusInternalServerError, "failed to update challenge")
				return
			} else if reward != nil {
				resp.ChallengeReward = reward
			}
		}
	}

	writeJSON(w, http.StatusOK, resp)
}

func (h *Handler) disassembleComplete(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID int `json:"userId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.UserID <= 0 {
		writeError(w, http.StatusBadRequest, "userId is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.db.GetUser(ctx, req.UserID); err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err := h.db.AddStats(ctx, req.UserID, "disassemble", store.StatsDelta{GamesWon: 1, SessionsCompleted: 1}); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save stats")
		return
	}

	out := map[string]any{"status": "ok"}
	if reward, err := h.db.MarkChallengeGameDone(ctx, req.UserID, "disassemble"); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update challenge")
		return
	} else if reward != nil {
		out["challengeReward"] = reward
	}
	writeJSON(w, http.StatusOK, out)
}

func (h *Handler) getChallenge(w http.ResponseWriter, r *http.Request) {
	userID, err := strconv.Atoi(r.URL.Query().Get("userId"))
	if err != nil || userID <= 0 {
		writeError(w, http.StatusBadRequest, "userId is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	status, err := h.db.GetChallengeStatus(ctx, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load challenge")
		return
	}
	if status != nil {
		enrichChallengeGames(status.Games)
	}
	writeJSON(w, http.StatusOK, status)
}

func (h *Handler) adminGetChallenge(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if userIDStr := r.URL.Query().Get("userId"); userIDStr != "" {
		userID, err := strconv.Atoi(userIDStr)
		if err != nil || userID <= 0 {
			writeError(w, http.StatusBadRequest, "invalid userId")
			return
		}
		ch, err := h.db.GetActiveChallenge(ctx, userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to load challenge")
			return
		}
		if ch == nil {
			writeJSON(w, http.StatusOK, store.DailyChallenge{UserID: userID, Games: []store.ChallengeGame{}})
			return
		}
		enrichChallengeGames(ch.Games)
		writeJSON(w, http.StatusOK, ch)
		return
	}

	list, err := h.db.ListActiveUserChallenges(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load challenges")
		return
	}
	for i := range list {
		enrichChallengeGames(list[i].Games)
	}
	writeJSON(w, http.StatusOK, map[string]any{"assignments": list})
}

func (h *Handler) adminSetChallenge(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var req struct {
		UserID  int      `json:"userId"`
		GameIDs []string `json:"gameIds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID <= 0 {
		writeError(w, http.StatusBadRequest, "userId is required")
		return
	}

	valid := map[string]bool{}
	for _, g := range games.Catalog() {
		if g.Available {
			valid[g.ID] = true
		}
	}
	for _, id := range req.GameIDs {
		if !valid[id] {
			writeError(w, http.StatusBadRequest, "unknown or unavailable game: "+id)
			return
		}
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	ch, err := h.db.SetActiveChallenge(ctx, req.UserID, req.GameIDs)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	enrichChallengeGames(ch.Games)
	writeJSON(w, http.StatusOK, ch)
}

func (h *Handler) adminListFillTexts(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	texts, err := h.db.ListFillBlankTexts(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load texts")
		return
	}
	if texts == nil {
		texts = []store.FillBlankText{}
	}
	writeJSON(w, http.StatusOK, texts)
}

type addFillTextRequest struct {
	Text string `json:"text"`
}

func (h *Handler) adminAddFillText(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req addFillTextRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	text, err := h.db.AddFillBlankText(ctx, req.Text)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrFillTextEmpty):
			writeError(w, http.StatusBadRequest, "text is empty")
		case errors.Is(err, store.ErrFillTextTooShort):
			writeError(w, http.StatusBadRequest, "text is too short")
		default:
			writeError(w, http.StatusBadRequest, err.Error())
		}
		return
	}
	writeJSON(w, http.StatusOK, text)
}

func (h *Handler) adminSetFillBlankPercent(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	var req struct {
		BlankPercent *int    `json:"blankPercent"`
		Text         *string `json:"text"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.BlankPercent == nil && req.Text == nil {
		writeError(w, http.StatusBadRequest, "blankPercent or text is required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	var text store.FillBlankText
	if req.Text != nil {
		text, err = h.db.UpdateFillBlankText(ctx, id, *req.Text)
		if err != nil {
			switch {
			case errors.Is(err, store.ErrFillTextEmpty):
				writeError(w, http.StatusBadRequest, "text is empty")
			case errors.Is(err, store.ErrFillTextTooShort):
				writeError(w, http.StatusBadRequest, "text is too short")
			case errors.Is(err, store.ErrFillTextNotFound):
				writeError(w, http.StatusNotFound, "text not found")
			default:
				writeError(w, http.StatusBadRequest, err.Error())
			}
			return
		}
	}
	if req.BlankPercent != nil {
		text, err = h.db.SetFillBlankPercent(ctx, id, *req.BlankPercent)
		if err != nil {
			switch {
			case errors.Is(err, store.ErrInvalidBlankPercent):
				writeError(w, http.StatusBadRequest, "blankPercent must be between 10 and 90")
			case errors.Is(err, store.ErrFillTextNotFound):
				writeError(w, http.StatusNotFound, "text not found")
			default:
				writeError(w, http.StatusInternalServerError, "failed to update")
			}
			return
		}
	}
	writeJSON(w, http.StatusOK, text)
}

func (h *Handler) adminDeleteFillText(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || id <= 0 {
		writeError(w, http.StatusBadRequest, "invalid id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.db.DeleteFillBlankText(ctx, id); err != nil {
		if errors.Is(err, store.ErrFillTextNotFound) {
			writeError(w, http.StatusNotFound, "text not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete text")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type adminLoginRequest struct {
	Login         string `json:"login"`
	Password      string `json:"password"`
	CaptchaID     string `json:"captchaId"`
	CaptchaAnswer int    `json:"captchaAnswer"`
}

func (h *Handler) adminLogin(w http.ResponseWriter, r *http.Request) {
	var req adminLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !h.checkCaptcha(w, req.CaptchaID, req.CaptchaAnswer) {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.db.AuthenticateAdmin(ctx, req.Login, req.Password); err != nil {
		switch {
		case errors.Is(err, store.ErrNotAdmin):
			writeError(w, http.StatusForbidden, "admin role required")
		case errors.Is(err, store.ErrPasswordTooShort):
			writeError(w, http.StatusBadRequest, "password must be at least 4 characters")
		default:
			writeError(w, http.StatusUnauthorized, "invalid credentials")
		}
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"token": h.adminAuth.IssueToken()})
}

func (h *Handler) adminStats(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	stats, err := h.db.ListAllUserStats(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load stats")
		return
	}
	writeJSON(w, http.StatusOK, stats)
}

func (h *Handler) adminStages(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	stages, err := h.db.ListStageCompletions(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load stages")
		return
	}
	writeJSON(w, http.StatusOK, stages)
}

type adminVerifyRequest struct {
	UserLogin string `json:"userLogin"`
	GameID    string `json:"gameId"`
	Stage     int    `json:"stage"`
	Planet    string `json:"planet"`
	Code      int    `json:"code"`
}

func (h *Handler) adminVerify(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req adminVerifyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserLogin == "" || req.Planet == "" || req.Code < 10 {
		writeError(w, http.StatusBadRequest, "login, planet and code are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	result, err := h.db.VerifyChallenge(ctx, req.UserLogin, req.Planet, req.Code)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "verification failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) mathColumnsSettings(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	gs, err := h.db.GetGameSettings(ctx, "math-columns")
	if err != nil {
		writeJSON(w, http.StatusOK, store.GameSettings{
			GameID:      "math-columns",
			SessionSize: store.DefaultSessionSize,
			DigitCount:  store.DefaultDigitCount,
		})
		return
	}
	writeJSON(w, http.StatusOK, gs)
}

func (h *Handler) adminGetMathColumnsSettings(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	gs, err := h.db.GetGameSettings(ctx, "math-columns")
	if err != nil {
		writeJSON(w, http.StatusOK, store.GameSettings{
			GameID:      "math-columns",
			SessionSize: store.DefaultSessionSize,
			DigitCount:  store.DefaultDigitCount,
		})
		return
	}
	writeJSON(w, http.StatusOK, gs)
}

type mathColumnsSettingsRequest struct {
	SessionSize int `json:"sessionSize"`
	DigitCount  int `json:"digitCount"`
}

func (h *Handler) adminSetMathColumnsSettings(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req mathColumnsSettingsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SessionSize < store.MinSessionSize || req.SessionSize > store.MaxSessionSize {
		writeError(w, http.StatusBadRequest, "sessionSize must be between 1 and 200")
		return
	}
	if req.DigitCount < store.MinDigitCount || req.DigitCount > store.MaxDigitCount {
		writeError(w, http.StatusBadRequest, "digitCount must be between 1 and 6")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	gs, err := h.db.SetMathColumnsSettings(ctx, req.SessionSize, req.DigitCount)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, gs)
}

func (h *Handler) adminSetUserGrade(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	userID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || userID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	var req struct {
		Grade int `json:"grade"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.db.SetUserGrade(ctx, userID, req.Grade)
	if err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *Handler) adminDeleteUser(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	userID, err := strconv.Atoi(r.PathValue("id"))
	if err != nil || userID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if err := h.db.DeleteUser(ctx, userID); err != nil {
		if errors.Is(err, store.ErrUserNotFound) {
			writeError(w, http.StatusNotFound, "user not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "failed to delete user")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func bearerToken(r *http.Request) string {
	auth := r.Header.Get("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return ""
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func ParsePort(value string, fallback int) int {
	port, err := strconv.Atoi(value)
	if err != nil || port <= 0 {
		return fallback
	}
	return port
}
