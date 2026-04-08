"""Add source column to canonical_sets table.

Revision ID: 003
Revises: 002
Create Date: 2026-04-07
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "canonical_sets" not in inspector.get_table_names():
        return
    existing = [c["name"] for c in inspector.get_columns("canonical_sets")]
    if "source" not in existing:
        op.add_column(
            "canonical_sets",
            sa.Column("source", sa.Text(), nullable=False, server_default="member"),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "canonical_sets" not in inspector.get_table_names():
        return
    existing = [c["name"] for c in inspector.get_columns("canonical_sets")]
    if "source" in existing:
        op.drop_column("canonical_sets", "source")
