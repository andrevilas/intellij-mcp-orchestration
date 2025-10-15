
SHELL := /usr/bin/env bash
PNPM := pnpm
PYTHON := python3

.PHONY: doctor bootstrap reset clean install install-frontend install-backend \
        dev dev-frontend dev-backend test test-frontend test-backend test-agents \
        smoke check ci \
        build package-electron

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

build:
	bash scripts/build-local.sh

package-electron:
	bash scripts/package-electron.sh

dev:
	bash scripts/dev-all.sh

dev-frontend:
	cd app && $(PNPM) dev

dev-backend:
	bash scripts/dev-backend.sh

test: test-frontend test-backend test-agents

check: doctor test

ci: check smoke

test-frontend:
	cd app && $(PNPM) test

test-backend:
	cd server && $(PYTHON) -m pytest

test-agents:
	cd agents-hub && $(PYTHON) -m pytest

smoke:
	$(PYTHON) scripts/smoke.py
