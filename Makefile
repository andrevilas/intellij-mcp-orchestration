
SHELL := /usr/bin/env bash

.PHONY: doctor bootstrap reset clean

doctor:
	bash scripts/doctor.sh

bootstrap:
	bash scripts/bootstrap-mcp.sh

reset:
	bash scripts/reset.sh

clean:
	rm -rf logs || true
