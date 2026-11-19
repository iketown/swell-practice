from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "cable-label-typography-wrap-test.pdf"

ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf"
ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
ARIAL_NARROW = "/System/Library/Fonts/Supplemental/Arial Narrow.ttf"
ARIAL_NARROW_BOLD = "/System/Library/Fonts/Supplemental/Arial Narrow Bold.ttf"

PAGE_WIDTH, PAGE_HEIGHT = letter
INCH = 72.0
LABEL_WIDTH = 1.0 * INCH
PRINTABLE_HEIGHT = (1083 / 1440) * INCH
LAMINATE_HEIGHT = 1.5 * INCH
LABEL_HEIGHT = PRINTABLE_HEIGHT + LAMINATE_HEIGHT

INK = HexColor("#11100E")
MUTED = HexColor("#6D665E")
HAIRLINE = HexColor("#B8B0A6")
PAPER = HexColor("#FBFAF6")
ACCENT = HexColor("#1D6F7A")


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Arial", ARIAL))
    pdfmetrics.registerFont(TTFont("Arial-Bold", ARIAL_BOLD))
    pdfmetrics.registerFont(TTFont("Arial-Narrow", ARIAL_NARROW))
    pdfmetrics.registerFont(TTFont("Arial-Narrow-Bold", ARIAL_NARROW_BOLD))


def text_width(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def fit_size(text: str, font: str, max_width: float, preferred: float, minimum: float) -> float:
    width = text_width(text, font, preferred)
    if width <= max_width:
        return preferred
    if width <= 0:
        return preferred
    return max(minimum, preferred * max_width / width)


def draw_rich_url(c: canvas.Canvas, center_x: float, baseline_y: float, size: float, left_x: float | None = None) -> None:
    parts = [
        ("www.", "Arial"),
        ("TheSwell", "Arial-Bold"),
        (".live", "Arial"),
    ]
    total_width = sum(text_width(text, font, size) for text, font in parts)
    x = left_x if left_x is not None else center_x - total_width / 2
    c.setFillColor(INK)
    for text, font in parts:
        c.setFont(font, size)
        c.drawString(x, baseline_y, text)
        x += text_width(text, font, size)


def split_title_at_arrow(title: str) -> list[str]:
    if " → " not in title:
        return [title]
    left, right = title.split(" → ", 1)
    return [f"{left} →", right]


def draw_variant_a(c: canvas.Canvas, x: float, printable_y: float, title: str, asset_id: str) -> None:
    center = x + LABEL_WIDTH / 2
    c.setFillColor(INK)
    c.setFont("Arial-Bold", 21.5)
    c.drawCentredString(center, printable_y + 29.0, asset_id)

    title_size = fit_size(title, "Arial-Bold", LABEL_WIDTH - 5.0, 7.7, 5.3)
    c.setFont("Arial-Bold", title_size)
    c.drawCentredString(center, printable_y + 14.0, title)
    draw_rich_url(c, center, printable_y + 5.0, 4.8)


def draw_variant_b(c: canvas.Canvas, x: float, printable_y: float, title: str, asset_id: str) -> None:
    center = x + LABEL_WIDTH / 2
    c.setFillColor(INK)
    c.setFont("Arial-Bold", 25.0)
    c.drawCentredString(center, printable_y + 27.0, asset_id)

    title_size = fit_size(title, "Arial-Narrow-Bold", LABEL_WIDTH - 4.0, 7.4, 5.0)
    c.setFont("Arial-Narrow-Bold", title_size)
    c.drawCentredString(center, printable_y + 12.0, title)
    draw_rich_url(c, center, printable_y + 3.8, 4.45)


def draw_variant_c(c: canvas.Canvas, x: float, printable_y: float, title: str, asset_id: str) -> None:
    center = x + LABEL_WIDTH / 2
    c.setFillColor(INK)
    c.setFont("Arial-Bold", 20.0)
    c.drawCentredString(center, printable_y + 31.0, asset_id)

    c.setStrokeColor(INK)
    c.setLineWidth(0.55)
    c.line(x + 5.0, printable_y + 26.0, x + LABEL_WIDTH - 5.0, printable_y + 26.0)

    title_size = fit_size(title, "Arial-Narrow-Bold", LABEL_WIDTH - 4.0, 8.6, 5.5)
    c.setFont("Arial-Narrow-Bold", title_size)
    c.drawCentredString(center, printable_y + 14.0, title)
    draw_rich_url(c, center, printable_y + 4.5, 4.8)


def draw_variant_d(c: canvas.Canvas, x: float, printable_y: float, title: str, asset_id: str) -> None:
    left = x + 3.5
    c.setFillColor(INK)
    c.setFont("Arial-Bold", 20.5)
    c.drawString(left, printable_y + 31.0, asset_id)

    max_width = LABEL_WIDTH - 7.0
    one_line_size = fit_size(title, "Arial-Narrow-Bold", max_width, 8.4, 6.2)
    if one_line_size >= 6.2 and text_width(title, "Arial-Narrow-Bold", one_line_size) <= max_width:
        lines = [title]
    else:
        lines = split_title_at_arrow(title)

    if len(lines) == 1:
        title_size = fit_size(lines[0], "Arial-Narrow-Bold", max_width, 8.4, 5.4)
        c.setFont("Arial-Narrow-Bold", title_size)
        c.drawString(left, printable_y + 14.0, lines[0])
    else:
        title_size = min(fit_size(line, "Arial-Narrow-Bold", max_width, 8.0, 5.4) for line in lines)
        c.setFont("Arial-Narrow-Bold", title_size)
        c.drawString(left, printable_y + 17.0, lines[0])
        c.drawString(left, printable_y + 10.0, lines[1])
    draw_rich_url(c, x + LABEL_WIDTH / 2, printable_y + 2.8, 4.45, left_x=left)


VARIANTS = [
    ("A", "Balanced center", "Number and title share the space evenly.", draw_variant_a),
    ("B", "Largest number", "Maximum ID size with a compact title.", draw_variant_b),
    ("C", "Larger title + rule", "A divider echoes the existing QR labels.", draw_variant_c),
    ("D", "Left aligned", "Allows a long title to break at the arrow.", draw_variant_d),
]


def draw_cut_wrap_strip(
    c: canvas.Canvas,
    x: float,
    y: float,
    title: str,
    asset_id: str,
    variant_index: int,
) -> None:
    printable_y = y + LAMINATE_HEIGHT

    c.setFillColor(white)
    c.rect(x, y, LABEL_WIDTH, LABEL_HEIGHT, stroke=0, fill=1)
    c.setStrokeColor(INK)
    c.setLineWidth(0.55)
    c.rect(x, y, LABEL_WIDTH, LABEL_HEIGHT, stroke=1, fill=0)

    c.saveState()
    c.setStrokeColor(HAIRLINE)
    c.setLineWidth(0.45)
    c.setDash(2, 2)
    c.line(x, printable_y, x + LABEL_WIDTH, printable_y)
    c.restoreState()

    VARIANTS[variant_index][3](c, x, printable_y, title, asset_id)


def draw_scale_check(c: canvas.Canvas, x: float, y: float) -> None:
    c.setStrokeColor(INK)
    c.setLineWidth(0.75)
    c.line(x, y, x + INCH, y)
    c.line(x, y - 4, x, y + 4)
    c.line(x + INCH, y - 4, x + INCH, y + 4)
    c.setFillColor(MUTED)
    c.setFont("Arial", 7)
    c.drawCentredString(x + INCH / 2, y + 7, "This line must measure exactly 1 inch")


def build_pdf() -> None:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    c = canvas.Canvas(str(OUTPUT), pagesize=letter, pageCompression=1)
    c.setTitle("Cable label typography wrap test")
    c.setAuthor("The Swell")
    c.setSubject("Actual-size MR610-MAC cable label typography options")

    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)

    c.setFillColor(INK)
    c.setFont("Arial-Bold", 17)
    c.drawString(54, 748, "Cable label typography wrap test")
    c.setFont("Arial", 8.5)
    c.setFillColor(MUTED)
    c.drawString(54, 730, "Print at 100% / Actual size with margins and scaling disabled. Cut each full strip on the solid outline.")
    c.drawString(54, 717, "The top 1.000 x 0.752 inch box is printable. The remaining 1.500 inches simulates the blank laminate tail.")
    draw_scale_check(c, 478, 725)

    x_positions = [72, 216, 360, 504]
    rows = [
        (480, "Short cable name", "0002", "10' XLR-M → TRS-M"),
        (255, "Long cable name stress test", "0005", "16' 3.5 TRS-F → 3.5 TRS-M"),
    ]

    for y, row_name, asset_id, title in rows:
        c.setFillColor(MUTED)
        c.setFont("Arial-Bold", 7.5)
        c.drawString(54, y + LABEL_HEIGHT + 32, row_name.upper())
        for index, x in enumerate(x_positions):
            key, variant_name, _, _ = VARIANTS[index]
            c.setFillColor(ACCENT)
            c.setFont("Arial-Bold", 8.5)
            c.drawCentredString(x + LABEL_WIDTH / 2, y + LABEL_HEIGHT + 16, f"{key}  {variant_name}")
            draw_cut_wrap_strip(c, x, y, title, asset_id, index)

    c.setStrokeColor(HAIRLINE)
    c.setLineWidth(0.5)
    c.line(54, 226, PAGE_WIDTH - 54, 226)

    c.setFillColor(INK)
    c.setFont("Arial-Bold", 10)
    c.drawString(54, 205, "How to compare")
    c.setFont("Arial", 8)
    c.setFillColor(MUTED)
    c.drawString(54, 190, "1. Cut a strip on the solid outside border. The faint dashed line marks the laminate boundary.")
    c.drawString(54, 177, "2. Wrap the blank tail around a real cable with the printed block tight against the boundary.")
    c.drawString(54, 164, "3. Choose the version whose four-digit ID is fastest to read while the full title remains clear.")

    legend_y = 126
    column_width = 126
    for index, (key, name, note, _) in enumerate(VARIANTS):
        x = 54 + index * column_width
        c.setFillColor(ACCENT)
        c.setFont("Arial-Bold", 9)
        c.drawString(x, legend_y, key)
        c.setFillColor(INK)
        c.setFont("Arial-Bold", 7.5)
        c.drawString(x + 14, legend_y, name)
        c.setFillColor(MUTED)
        c.setFont("Arial", 6.5)
        words = note.split()
        lines: list[str] = []
        current = ""
        for word in words:
            candidate = f"{current} {word}".strip()
            if text_width(candidate, "Arial", 6.5) <= column_width - 5:
                current = candidate
            else:
                lines.append(current)
                current = word
        if current:
            lines.append(current)
        for line_index, line in enumerate(lines[:2]):
            c.drawString(x, legend_y - 13 - line_index * 9, line)

    c.setFillColor(MUTED)
    c.setFont("Arial", 6.5)
    c.drawRightString(PAGE_WIDTH - 54, 48, "Actual-size test for the MR610-MAC 1.000 x 0.752 inch printable area")

    c.showPage()
    c.save()


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT)
