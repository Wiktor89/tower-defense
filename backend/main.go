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
	"games/internal/fillblanks"
	"games/internal/fractions"
	mathpkg "games/internal/math"
	"games/internal/store"
	"games/internal/td"
)

func main() {
	port := flag.Int("port", api.ParsePort(os.Getenv("PORT"), 8089), "server port")
	staticDir := flag.String("static", "../frontend/dist", "path to frontend build")
	tlsCert := flag.String("tls-cert", os.Getenv("TLS_CERT"), "path to TLS certificate (enables HTTPS)")
	tlsKey := flag.String("tls-key", os.Getenv("TLS_KEY"), "path to TLS private key")
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
		mathpkg.NewSessionTracker(),
		td.NewStore(),
		fillblanks.NewStore(30*time.Minute),
		fractions.NewStore(30*time.Minute),
		db,
		admin.NewAuth(),
		captcha.NewStore(),
	).Register(mux)
	mux.Handle("/", spaHandler(absStatic))

	handler := withCORS(mux)
	addr := fmt.Sprintf(":%d", *port)
	useTLS := *tlsCert != "" && *tlsKey != ""

	if useTLS {
		log.Printf("server listening on https://0.0.0.0%s (все интерфейсы)", addr)
		log.Printf("локально: https://localhost%s", addr)
		log.Printf("TLS cert: %s", *tlsCert)
		log.Printf("serving static files from %s", absStatic)
		if err := http.ListenAndServeTLS(addr, *tlsCert, *tlsKey, handler); err != nil {
			log.Fatal(err)
		}
		return
	}

	log.Printf("server listening on http://0.0.0.0%s (все интерфейсы)", addr)
	log.Printf("локально: http://localhost%s", addr)
	log.Printf("serving static files from %s", absStatic)
	log.Printf("для HTTPS задайте TLS_CERT и TLS_KEY или запустите ./run.sh с HTTPS=1")
	if err := http.ListenAndServe(addr, handler); err != nil {
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
	allowed := map[string]bool{
		"http://localhost:8089":  true,
		"http://127.0.0.1:8089":  true,
		"https://localhost:8089": true,
		"https://127.0.0.1:8089": true,
		"http://localhost:5173":  true,
		"http://127.0.0.1:5173":  true,
		"https://localhost:5173": true,
		"https://127.0.0.1:5173": true,
	}
	for _, origin := range strings.Split(os.Getenv("CORS_ORIGINS"), ",") {
		origin = strings.TrimSpace(origin)
		if origin != "" {
			allowed[origin] = true
		}
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin == "" || allowed[origin] {
			if origin != "" {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
			}
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
