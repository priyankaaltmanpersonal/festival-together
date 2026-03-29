"""Baseline schema — marks existing tables as already present.

Revision ID: 001
Revises:
Create Date: 2026-03-29
"""
revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Tables already exist in both SQLite (local) and Neon (production).
    # This migration is a no-op baseline so Alembic knows the starting state.
    pass


def downgrade() -> None:
    pass
