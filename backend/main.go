package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"games/internal/api"
	mathpkg "games/internal/math"
)

func main() {
	port := flag.Int("port", api.ParsePort(os.Getenv("PORT"), 8089), "server port")
	staticDir := flag.String("static", "../frontend/dist", "path to frontend build")
	flag.Parse()

	absStatic, err := filepath.Abs(*staticDir)
	if err != nil {
		log.Fatalf("resolve static dir: %v", err)
	}

	mux := http.NewServeMux()
	api.NewHandler(mathpkg.NewStore(30 * time.Minute)).Register(mux)
	mux.Handle("/", spaHandler(absStatic))

	addr := fmt.Sprintf(":%d", *port)
	log.Printf("server listening on http://localhost%s", addr)
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
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
