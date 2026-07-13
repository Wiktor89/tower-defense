package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"games/internal/admin"
	"games/internal/api"
	"games/internal/captcha"
	mathpkg "games/internal/math"
	"games/internal/store"
)

func main() {
	port := flag.Int("port", api.ParsePort(os.Getenv("PORT"), 8089), "server port")
	staticDir := flag.String("static", "../frontend/dist", "path to frontend build")
	flag.Parse()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	db, err := store.Connect(ctx)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer db.Close()
	log.Println("connected to PostgreSQL")

	absStatic, err := filepath.Abs(*staticDir)
	if err != nil {
		log.Fatalf("resolve static dir: %v", err)
	}

	mux := http.NewServeMux()
	api.NewHandler(
		mathpkg.NewStore(30*time.Minute),
		db,
		admin.NewAuth(),
		captcha.NewStore(),
	).Register(mux)
	mux.Handle("/", spaHandler(absStatic))

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("server listening on http://0.0.0.0%s (все интерфейсы)", addr)
	log.Printf("локально: http://localhost%s", addr)
	log.Printf("serving static files from %s", absStatic)
	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil {
		log.Fatal(err)
	}
}

func spaHandler(staticDir string) http.Handler {
	fileServer := http.FileServer(http.Dir(staticDir))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/api/") {
			http.NotFound(w, r)
			return
		}

		cleanPath := strings.TrimPrefix(filepath.Clean(r.URL.Path), "/")
		target := filepath.Join(staticDir, cleanPath)

		if info, err := os.Stat(target); err == nil {
			if !info.IsDir() {
				fileServer.ServeHTTP(w, r)
				return
			}
			indexPath := filepath.Join(target, "index.html")
			if _, err := os.Stat(indexPath); err == nil {
				http.ServeFile(w, r, indexPath)
				return
			}
		}

		indexPath := filepath.Join(target, "index.html")
		if _, err := os.Stat(indexPath); err == nil {
			http.ServeFile(w, r, indexPath)
			return
		}

		http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
	})
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
