.PHONY: dev-api dev-web build run install

install:
	cd frontend && npm install

build:
	cd frontend && npm run build

dev-api:
	cd backend && go run . -port 8089

dev-web:
	cd frontend && npm run dev

run: build
	cd backend && go run . -port 8089
