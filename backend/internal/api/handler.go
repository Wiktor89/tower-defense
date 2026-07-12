package api

import (
	"encoding/json"
	"net/http"
	"strconv"

	"games/internal/games"
	mathpkg "games/internal/math"
)

type Handler struct {
	mathStore *mathpkg.Store
}

func NewHandler(mathStore *mathpkg.Store) *Handler {
	return &Handler{mathStore: mathStore}
}

func (h *Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/health", h.health)
	mux.HandleFunc("GET /api/games", h.listGames)
	mux.HandleFunc("POST /api/math/problem", h.createMathProblem)
	mux.HandleFunc("POST /api/math/check", h.checkMathAnswer)
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
