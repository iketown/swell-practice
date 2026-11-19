from pathlib import Path

from reportlab.graphics.barcode.qr import QrCode
from reportlab.lib.colors import black
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


PAGE_WIDTH = 25.4 * mm
PAGE_HEIGHT = 38.1 * mm
NUMBER_BAND_HEIGHT = 7.7 * mm
QR_SIZE = 18 * mm
GAP = 0.3 * mm
SAFE_TOP_OFFSETS_MM = (2.8, 1.8, 0.8)
ASSET_TAG = "0203"
QR_VALUE = "https://theswell.live/g/0203"

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "output" / "pdf" / "gear-label-offset-calibration-0.8-to-2.8mm.pdf"


def register_fonts() -> None:
    pdfmetrics.registerFont(
        TTFont("ArialBlack", "/System/Library/Fonts/Supplemental/Arial Black.ttf")
    )
    pdfmetrics.registerFont(
        TTFont("ArialBold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    )


def draw_centered_spaced_text(
    pdf: canvas.Canvas,
    text: str,
    center_x: float,
    baseline_y: float,
    font_name: str,
    font_size: float,
    char_space: float,
) -> None:
    text_width = pdfmetrics.stringWidth(text, font_name, font_size)
    text_width += char_space * max(len(text) - 1, 0)
    text_object = pdf.beginText(center_x - text_width / 2, baseline_y)
    text_object.setFont(font_name, font_size)
    text_object.setCharSpace(char_space)
    text_object.textOut(text)
    pdf.drawText(text_object)


def draw_label(pdf: canvas.Canvas, safe_top_mm: float) -> None:
    safe_top = safe_top_mm * mm
    band_top = PAGE_HEIGHT - safe_top
    band_bottom = band_top - NUMBER_BAND_HEIGHT

    number_font_size = 6.5 * mm
    ascent = pdfmetrics.getAscent("ArialBlack", number_font_size)
    descent = pdfmetrics.getDescent("ArialBlack", number_font_size)
    visual_height = ascent - descent
    baseline = band_bottom + (NUMBER_BAND_HEIGHT - visual_height) / 2 - descent

    pdf.setFillColor(black)
    draw_centered_spaced_text(
        pdf,
        ASSET_TAG,
        PAGE_WIDTH / 2,
        baseline,
        "ArialBlack",
        number_font_size,
        0.65 * mm,
    )

    pdf.setLineWidth(0.35 * mm)
    pdf.line(1.15 * mm, band_bottom, PAGE_WIDTH - 1.15 * mm, band_bottom)

    qr_bottom = band_bottom - GAP - QR_SIZE
    qr = QrCode(
        QR_VALUE,
        width=QR_SIZE,
        height=QR_SIZE,
        qrBorder=4,
        qrLevel="L",
    )
    qr.drawOn(pdf, (PAGE_WIDTH - QR_SIZE) / 2, qr_bottom)

    label = f"TOP {safe_top_mm:.1f} MM"
    name_font_size = 2.45 * mm
    name_baseline = qr_bottom - GAP - name_font_size * 0.8
    pdf.setFont("ArialBold", name_font_size)
    pdf.drawCentredString(PAGE_WIDTH / 2, name_baseline, label)


def main() -> None:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=(PAGE_WIDTH, PAGE_HEIGHT), pageCompression=1)
    pdf.setTitle("Gear label top-offset calibration")
    pdf.setAuthor("The Swell")
    pdf.setSubject("DYMO LabelWriter 450 Turbo 1 x 1.5 inch label calibration")

    for safe_top_mm in SAFE_TOP_OFFSETS_MM:
        draw_label(pdf, safe_top_mm)
        pdf.showPage()

    pdf.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
