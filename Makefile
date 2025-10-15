
SHELL := /usr/bin/env bash
PNPM := pnpm
PYTHON := python3

.PHONY: doctor bootstrap reset clean install install-frontend install-backend         dev dev-frontend dev-backend test test-frontend test-backend check ci

doctor:
	bash scripts/doctor.sh

bootstrap:
	bash scripts/bootstrap-mcp.sh

reset:
	bash scripts/reset.sh

clean:
	rm -rf logs || true

install: install-frontend install-backend

install-frontend:
	$(PNPM) install --frozen-lockfile || $(PNPM) install

install-backend:
	cd server && $(PYTHON) -m pip install --upgrade pip && $(PYTHON) -m pip install -e .[dev]

dev:
	bash scripts/dev-all.sh

dev-frontend:
	cd app && $(PNPM) dev

dev-backend:
	bash scripts/dev-backend.sh

test: test-frontend test-backend

check: doctor test

ci: check

test-frontend:
	cd app && $(PNPM) test

test-backend:
	cd server && $(PYTHON) -m pytest
