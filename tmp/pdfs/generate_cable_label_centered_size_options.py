from __future__ import annotations

from pathlib import Path

from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import letter
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "cable-label-centered-size-options.pdf"

ARIAL = "/System/Library/Fonts/Supplemental/Arial.ttf"
ARIAL_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
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

VARIANTS = [
    ("A", 19.5, 5.7),
    ("B", 18.5, 6.1),
    ("C", 17.5, 6.5),
    ("D", 16.5, 6.9),
    ("E", 15.5, 7.3),
    ("F", 14.5, 7.7),
]


def register_fonts() -> None:
    pdfmetrics.registerFont(TTFont("Arial", ARIAL))
    pdfmetrics.registerFont(TTFont("Arial-Bold", ARIAL_BOLD))
    pdfmetrics.registerFont(TTFont("Arial-Narrow-Bold", ARIAL_NARROW_BOLD))


def text_width(text: str, font: str, size: float) -> float:
    return pdfmetrics.stringWidth(text, font, size)


def fit_size(text: str, font: str, max_width: float, preferred: float, minimum: float) -> float:
    width = text_width(text, font, preferred)
    if width <= max_width or width <= 0:
        return preferred
    return max(minimum, preferred * max_width / width)


def split_cable_title(title: str) -> tuple[str, str]:
    length, separator, ends = title.partition(" ")
    return (length, ends) if separator else (title, "")


def draw_rich_url(c: canvas.Canvas, center_x: float, baseline_y: float, size: float) -> None:
    parts = [
        ("www.", "Arial"),
        ("TheSwell", "Arial-Bold"),
        (".live", "Arial"),
    ]
    total_width = sum(text_width(text, font, size) for text, font in parts)
    x = center_x - total_width / 2
    c.setFillColor(INK)
    for text, font in parts:
        c.setFont(font, size)
        c.drawString(x, baseline_y, text)
        x += text_width(text, font, size)


def draw_centered_label(
    c: canvas.Canvas,
    x: float,
    printable_y: float,
    title: str,
    asset_id: str,
    id_size: float,
    website_size: float,
) -> None:
    center = x + LABEL_WIDTH / 2
    length, end_types = split_cable_title(title)

    c.setFillColor(INK)
    c.setFont("Arial-Bold", id_size)
    c.drawCentredString(center, printable_y + 34.5, asset_id)

    c.setFont("Arial-Bold", 12.2)
    c.drawCentredString(center, printable_y + 22.0, length)

    if end_types:
        end_size = fit_size(end_types, "Arial-Narrow-Bold", LABEL_WIDTH - 4.0, 7.2, 5.0)
        c.setFont("Arial-Narrow-Bold", end_size)
        c.drawCentredString(center, printable_y + 12.9, end_types)

    draw_rich_url(c, center, printable_y + 3.0, website_size)


def draw_cut_wrap_strip(
    c: canvas.Canvas,
    x: float,
    y: float,
    title: str,
    asset_id: str,
    id_size: float,
    website_size: float,
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

    draw_centered_label(c, x, printable_y, title, asset_id, id_size, website_size)


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
    c.setTitle("Centered cable label size options")
    c.setAuthor("The Swell")
    c.setSubject("Actual-size centered MR610-MAC cable label hierarchy options")

    c.setFillColor(PAPER)
    c.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, stroke=0, fill=1)

    c.setFillColor(INK)
    c.setFont("Arial-Bold", 17)
    c.drawString(45, 748, "Centered cable label size options")
    c.setFont("Arial", 8.5)
    c.setFillColor(MUTED)
    c.drawString(45, 730, "Print at 100% / Actual size with margins and scaling disabled. Cut each full strip on the solid outline.")
    c.drawString(45, 717, "Every option centers the same hierarchy: ID, large length, smaller end types, then website at the laminate edge.")
    draw_scale_check(c, 481, 725)

    x_positions = [45, 135, 225, 315, 405, 495]
    rows = [
        (475, "SHORT END-TYPE SAMPLE", "0002", "10' XLR-M → TRS-M"),
        (250, "LONG END-TYPE STRESS TEST", "0005", "16' 3.5 TRS-F → 3.5 TRS-M"),
    ]

    for y, row_name, asset_id, title in rows:
        c.setFillColor(MUTED)
        c.setFont("Arial-Bold", 7.5)
        c.drawString(45, y + LABEL_HEIGHT + 32, row_name)
        for index, x in enumerate(x_positions):
            key, id_size, website_size = VARIANTS[index]
            c.setFillColor(ACCENT)
            c.setFont("Arial-Bold", 6.7)
            c.drawCentredString(
                x + LABEL_WIDTH / 2,
                y + LABEL_HEIGHT + 16,
                f"{key}  ID {id_size:g} / WEB {website_size:g}",
            )
            draw_cut_wrap_strip(c, x, y, title, asset_id, id_size, website_size)

    c.setStrokeColor(HAIRLINE)
    c.setLineWidth(0.5)
    c.line(45, 219, PAGE_WIDTH - 45, 219)

    c.setFillColor(INK)
    c.setFont("Arial-Bold", 10)
    c.drawString(45, 199, "How to compare")
    c.setFont("Arial", 8)
    c.setFillColor(MUTED)
    c.drawString(45, 184, "1. Confirm the scale line measures exactly 1 inch, then cut a strip on its solid outside border.")
    c.drawString(45, 171, "2. Wrap the blank tail around a real cable with the printed block tight against the dashed laminate boundary.")
    c.drawString(45, 158, "3. Compare how quickly you can read the length, then choose the best ID and website balance from A through F.")

    c.setFillColor(INK)
    c.setFont("Arial-Bold", 8)
    c.drawString(45, 127, "Fixed title sizes")
    c.setFillColor(MUTED)
    c.setFont("Arial", 7)
    c.drawString(45, 114, "Length: 12.2 pt bold. End types: up to 7.2 pt condensed bold, reduced only when needed to fit.")
    c.drawString(45, 98, "Variant sizes: A 19.5/5.7, B 18.5/6.1, C 17.5/6.5, D 16.5/6.9, E 15.5/7.3, F 14.5/7.7 pt (ID/website).")

    c.setFillColor(MUTED)
    c.setFont("Arial", 6.5)
    c.drawRightString(PAGE_WIDTH - 45, 48, "Actual-size MR610-MAC test: 1.000 x 0.752 inch printable area plus 1.500 inch laminate tail")

    c.showPage()
    c.save()


if __name__ == "__main__":
    build_pdf()
    print(OUTPUT)
