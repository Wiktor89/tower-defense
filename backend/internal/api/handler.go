package api

import (
	"context"
	"encoding/json"
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
	mux.HandleFunc("POST /api/stats", h.addStats)
	mux.HandleFunc("POST /api/admin/login", h.adminLogin)
	mux.HandleFunc("GET /api/admin/stats", h.adminStats)
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
	Login string `json:"login"`
}

func (h *Handler) userLogin(w http.ResponseWriter, r *http.Request) {
	var req userLoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	user, err := h.db.GetOrCreateUser(ctx, req.Login)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
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
