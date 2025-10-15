.PHONY: install dev test lint fmt build

install:
	python -m pip install --upgrade pip
	python -m pip install -e .[dev]

dev:
	uvicorn app.main:app --reload --port $${PORT:-8000}

test:
	pytest -q

lint:
	ruff check .
	black --check .
	isort --check-only .

fmt:
	ruff check --fix .
	black .
	isort .

build:
	python -m build
