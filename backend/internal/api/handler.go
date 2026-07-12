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
	"games/internal/games"
	mathpkg "games/internal/math"
	"games/internal/store"
)

type Handler struct {
	mathStore *mathpkg.Store
	db        *store.Store
	adminAuth *admin.Auth
}

func NewHandler(mathStore *mathpkg.Store, db *store.Store, adminAuth *admin.Auth) *Handler {
	return &Handler{mathStore: mathStore, db: db, adminAuth: adminAuth}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", h.health)
	mux.HandleFunc("GET /api/games", h.listGames)
	mux.HandleFunc("POST /api/math/problem", h.createMathProblem)
	mux.HandleFunc("POST /api/math/check", h.checkMathAnswer)
	mux.HandleFunc("POST /api/users/login", h.userLogin)
	mux.HandleFunc("PUT /api/users/password", h.setUserPassword)
	mux.HandleFunc("POST /api/stats", h.addStats)
	mux.HandleFunc("POST /api/stages/complete", h.completeStage)
	mux.HandleFunc("GET /api/settings/math-columns", h.mathColumnsSettings)
	mux.HandleFunc("POST /api/admin/login", h.adminLogin)
	mux.HandleFunc("GET /api/admin/stats", h.adminStats)
	mux.HandleFunc("GET /api/admin/stages", h.adminStages)
	mux.HandleFunc("POST /api/admin/verify", h.adminVerify)
	mux.HandleFunc("GET /api/admin/settings/math-columns", h.adminGetMathColumnsSettings)
	mux.HandleFunc("PUT /api/admin/settings/math-columns", h.adminSetMathColumnsSettings)
}

func (h *Handler) health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) listGames(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, games.Catalog())
}

type mathProblemRequest struct {
	Level int    `json:"level"`
	Op    string `json:"op"`
}

func (h *Handler) createMathProblem(w http.ResponseWriter, r *http.Request) {
	var req mathProblemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Level < 1 || req.Level > 3 {
		req.Level = 1
	}
	if req.Op == "" {
		req.Op = "add"
	}

	problem := mathpkg.Generate(req.Level, req.Op)
	h.mathStore.Save(problem)
	writeJSON(w, http.StatusOK, mathpkg.PublicView(problem))
}

type mathCheckRequest struct {
	ID     string `json:"id"`
	Answer int    `json:"answer"`
}

type mathCheckResponse struct {
	Correct       bool `json:"correct"`
	CorrectAnswer int  `json:"correctAnswer,omitempty"`
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
	writeJSON(w, http.StatusOK, resp)
}

type userLoginRequest struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

func (h *Handler) userLogin(w http.ResponseWriter, r *http.Request) {
	var req userLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.db.LoginUser(ctx, req.Login, req.Password)
	if err != nil {
		switch {
		case errors.Is(err, store.ErrPasswordRequired):
			writeError(w, http.StatusUnauthorized, "password required")
		case errors.Is(err, store.ErrInvalidPassword):
			writeError(w, http.StatusUnauthorized, "invalid password")
		default:
			writeError(w, http.StatusBadRequest, err.Error())
		}
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

type statsRequest struct {
	UserID            int    `json:"userId"`
	GameID            string `json:"gameId"`
	Correct           int    `json:"correct"`
	Wrong             int    `json:"wrong"`
	SessionsCompleted int    `json:"sessionsCompleted"`
	GamesWon          int    `json:"gamesWon"`
	GamesLost         int    `json:"gamesLost"`
}

func (h *Handler) addStats(w http.ResponseWriter, r *http.Request) {
	var req statsRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID <= 0 || req.GameID == "" {
		writeError(w, http.StatusBadRequest, "userId and gameId are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.db.GetUser(ctx, req.UserID); err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	err := h.db.AddStats(ctx, req.UserID, req.GameID, store.StatsDelta{
		Correct:           req.Correct,
		Wrong:             req.Wrong,
		SessionsCompleted: req.SessionsCompleted,
		GamesWon:          req.GamesWon,
		GamesLost:         req.GamesLost,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to save stats")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

type adminLoginRequest struct {
	Login    string `json:"login"`
	Password string `json:"password"`
}

func (h *Handler) adminLogin(w http.ResponseWriter, r *http.Request) {
	var req adminLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	token, ok := h.adminAuth.Login(req.Login, req.Password)
	if !ok {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"token": token})
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

type completeStageRequest struct {
	UserID int    `json:"userId"`
	GameID string `json:"gameId"`
	Stage  int    `json:"stage"`
}

func (h *Handler) completeStage(w http.ResponseWriter, r *http.Request) {
	var req completeStageRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID <= 0 || req.GameID == "" || req.Stage <= 0 {
		writeError(w, http.StatusBadRequest, "userId, gameId and stage are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	if _, err := h.db.GetUser(ctx, req.UserID); err != nil {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}

	result, err := h.db.CompleteStage(ctx, req.UserID, req.GameID, req.Stage)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to complete stage")
		return
	}
	writeJSON(w, http.StatusOK, result)
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
	if req.UserLogin == "" || req.GameID == "" || req.Planet == "" || req.Code < 10 {
		writeError(w, http.StatusBadRequest, "all fields are required")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	result, err := h.db.VerifyStage(ctx, req.UserLogin, req.GameID, req.Stage, req.Planet, req.Code)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "verification failed")
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (h *Handler) mathColumnsSettings(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	size, err := h.db.GetSessionSize(ctx, "math-columns")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"gameId":      "math-columns",
		"sessionSize": size,
	})
}

func (h *Handler) adminGetMathColumnsSettings(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if !h.adminAuth.Valid(token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	size, err := h.db.GetSessionSize(ctx, "math-columns")
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load settings")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"gameId":      "math-columns",
		"sessionSize": size,
	})
}

type mathColumnsSettingsRequest struct {
	SessionSize int `json:"sessionSize"`
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

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	gs, err := h.db.SetSessionSize(ctx, "math-columns", req.SessionSize)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, gs)
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
