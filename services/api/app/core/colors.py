CHIP_COLOR_PALETTE = [
    '#4D73FF',  # cobalt
    '#20A36B',  # emerald
    '#E17A2D',  # tangerine
    '#C558A0',  # magenta
    '#2B9FA8',  # teal
    '#8A5CE6',  # violet
    '#B44242',  # brick
    '#4D7A2A',  # olive
    '#3578C4',  # azure
    '#D18A1F',  # amber
    '#6D5A4C',  # stone
    '#9A4FB5',  # plum
]


def normalize_chip_color(color: str | None) -> str | None:
    if color is None:
        return None
    normalized = color.strip().upper()
    if normalized and not normalized.startswith('#'):
        normalized = f"#{normalized}"
    return normalized


def validate_chip_color(color: str) -> bool:
    return color in CHIP_COLOR_PALETTE
