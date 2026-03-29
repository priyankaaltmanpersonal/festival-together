"""Add festival_days column to groups table.

Revision ID: 002
Revises: 001
Create Date: 2026-03-29
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    # Tables may not exist yet on a brand-new local DB (init_db runs after migrations).
    # Skip gracefully — init_db will create the column as part of the full schema.
    if "groups" not in inspector.get_table_names():
        return
    existing = [c["name"] for c in inspector.get_columns("groups")]
    if "festival_days" not in existing:
        op.add_column("groups", sa.Column("festival_days", sa.Text(), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)
    if "groups" not in inspector.get_table_names():
        return
    existing = [c["name"] for c in inspector.get_columns("groups")]
    if "festival_days" in existing:
        op.drop_column("groups", "festival_days")
