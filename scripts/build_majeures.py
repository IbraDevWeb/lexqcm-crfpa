from __future__ import annotations
from pathlib import Path
import re
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, PageBreak, Table, TableStyle

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public-majeures'
SRC = ROOT / 'majeures-src'
OUT.mkdir(parents=True, exist_ok=True)

SUBJECTS = {
    'obligations': ('Majeures_types_Droit_des_obligations_LexQCM.pdf', '#6757D9'),
    'social': ('Majeures_types_Droit_social_LexQCM.pdf', '#17865F'),
    'procedure': ('Majeures_types_Procedure_civile_LexQCM.pdf', '#22A9C7'),
}

font_candidates = [
    ('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'),
    ('/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf', '/usr/share/fonts/truetype/liberation2/LiberationSans-Bold.ttf'),
]
for regular, bold in font_candidates:
    if Path(regular).exists() and Path(bold).exists():
        pdfmetrics.registerFont(TTFont('LexSans', regular))
        pdfmetrics.registerFont(TTFont('LexSansBold', bold))
        break
else:
    raise SystemExit('No Unicode TTF font found')


def load_source(subject: str) -> str:
    parts = sorted((SRC / subject).glob('part*.txt'), key=lambda p: int(re.search(r'(\d+)', p.stem).group(1)))
    if not parts:
        raise FileNotFoundError(f'No source parts for {subject}')
    return ''.join(p.read_text(encoding='utf-8') for p in parts)


def parse_source(text: str):
    meta, fiches, current = {}, [], None
    for raw in text.splitlines():
        if not raw.strip() or '|' not in raw:
            continue
        key, val = raw.split('|', 1)
        if key in {'DOCUMENT', 'SUBTITLE', 'NOTE'} and current is None:
            meta[key.lower()] = val
            continue
        if key == 'FICHE':
            if current:
                fiches.append(current)
            current = {'num': val, 'title': '', 'question': '', 'major': '', 'check': [], 'conclusion': '', 'refs': ''}
        elif current is not None:
            mapping = {'TITLE': 'title', 'QUESTION': 'question', 'MAJOR': 'major', 'CONCLUSION': 'conclusion', 'REFS': 'refs'}
            if key == 'CHECK':
                current['check'].append(val)
            elif key in mapping:
                current[mapping[key]] = val
    if current:
        fiches.append(current)
    return meta, fiches


def esc(text: str) -> str:
    return text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')


def build(subject: str, filename: str, accent_hex: str):
    meta, fiches = parse_source(load_source(subject))
    accent = colors.HexColor(accent_hex)
    dark = colors.HexColor('#172033')
    muted = colors.HexColor('#68738A')
    pale = colors.HexColor('#F4F6FB')
    line = colors.HexColor('#E2E7F0')

    out = OUT / filename
    doc = SimpleDocTemplate(
        str(out), pagesize=A4, rightMargin=18 * mm, leftMargin=18 * mm,
        topMargin=18 * mm, bottomMargin=16 * mm,
        title=meta.get('document', 'LexQCM - Majeures types'), author='LexQCM'
    )

    base = ParagraphStyle('base', fontName='LexSans', fontSize=9.2, leading=13, textColor=dark, spaceAfter=4)
    small = ParagraphStyle('small', parent=base, fontSize=8.2, leading=11.5, textColor=muted)
    title = ParagraphStyle('title', fontName='LexSansBold', fontSize=26, leading=30, textColor=dark, alignment=TA_CENTER, spaceAfter=10)
    subtitle = ParagraphStyle('subtitle', fontName='LexSans', fontSize=12, leading=17, textColor=muted, alignment=TA_CENTER)
    h1 = ParagraphStyle('h1', fontName='LexSansBold', fontSize=18, leading=22, textColor=dark, spaceAfter=7)
    eyebrow = ParagraphStyle('eyebrow', fontName='LexSansBold', fontSize=8, leading=10, textColor=accent, spaceAfter=3)
    qstyle = ParagraphStyle('question', parent=base, fontSize=9, leading=12.5, textColor=muted, spaceAfter=8)
    section = ParagraphStyle('section', fontName='LexSansBold', fontSize=8.1, leading=10, textColor=accent, spaceBefore=3, spaceAfter=4)
    major_style = ParagraphStyle('major', parent=base, fontSize=8.85, leading=12.2)
    conclusion_style = ParagraphStyle('conclusion', parent=base, fontSize=8.85, leading=12.2)
    refs_style = ParagraphStyle('refs', parent=small, fontSize=7.8, leading=10.6)

    counter = {'n': 0}
    def footer(canvas, _doc):
        counter['n'] += 1
        canvas.saveState()
        canvas.setStrokeColor(line)
        canvas.line(18 * mm, 13 * mm, A4[0] - 18 * mm, 13 * mm)
        canvas.setFont('LexSans', 7.2)
        canvas.setFillColor(muted)
        canvas.drawString(18 * mm, 8.5 * mm, 'LexQCM - Majeures types')
        canvas.drawRightString(A4[0] - 18 * mm, 8.5 * mm, f'p. {counter["n"]}')
        canvas.restoreState()

    story = [
        Spacer(1, 34 * mm), Paragraph(esc(meta.get('document', 'Majeures types')), title),
        Spacer(1, 5 * mm), Paragraph(esc(meta.get('subtitle', '')), subtitle), Spacer(1, 10 * mm)
    ]
    cover_box = Table([[Paragraph('<b>Mode d’emploi</b><br/>Ces majeures sont des constructions modulaires : sélectionne uniquement les règles utiles au problème, puis développe une mineure précise et factuelle. Chaque fiche suit le même ordre : question-type, majeure, points à vérifier, conclusion et fondements essentiels.', base)]], colWidths=[160 * mm])
    cover_box.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), pale), ('BOX', (0, 0), (-1, -1), 0.8, line),
        ('LEFTPADDING', (0, 0), (-1, -1), 12), ('RIGHTPADDING', (0, 0), (-1, -1), 12),
        ('TOPPADDING', (0, 0), (-1, -1), 10), ('BOTTOMPADDING', (0, 0), (-1, -1), 10)
    ]))
    story += [
        cover_box, Spacer(1, 7 * mm),
        Paragraph('<b>Important.</b> Synthèse originale de révision fondée sur les fascicules 2025. Elle ne remplace ni le cours, ni le Code, ni la vérification des actualisations ultérieures.', small),
        PageBreak(), Paragraph('Sommaire', h1), Spacer(1, 3 * mm)
    ]
    for f in fiches:
        story.append(Paragraph(f'<b>{esc(f["num"])}.</b> {esc(f["title"])}', base))
    story.append(PageBreak())

    for idx, f in enumerate(fiches):
        story += [
            Paragraph(f'FICHE {esc(f["num"])}', eyebrow),
            Paragraph(esc(f['title']), h1),
            Paragraph(f'<b>Question-type.</b> {esc(f["question"])}', qstyle)
        ]
        major_box = Table([[Paragraph('MAJEURE À TIROIRS', section)], [Paragraph(esc(f['major']), major_style)]], colWidths=[160 * mm])
        major_box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#F0EDFF') if subject == 'obligations' else pale),
            ('BOX', (0, 0), (-1, -1), 0.7, line),
            ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 6), ('BOTTOMPADDING', (0, 0), (-1, -1), 7)
        ]))
        story += [major_box, Spacer(1, 4 * mm), Paragraph('À VÉRIFIER DANS LA MINEURE', section)]
        for item in f['check']:
            story.append(Paragraph(f'• {esc(item)}', base))
        story += [Spacer(1, 2 * mm), Paragraph('CONCLUSION-TYPE', section)]
        conclusion_box = Table([[Paragraph(esc(f['conclusion']), conclusion_style)]], colWidths=[160 * mm])
        conclusion_box.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), pale), ('BOX', (0, 0), (-1, -1), 0.7, line),
            ('LEFTPADDING', (0, 0), (-1, -1), 10), ('RIGHTPADDING', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 7), ('BOTTOMPADDING', (0, 0), (-1, -1), 7)
        ]))
        story += [
            conclusion_box, Spacer(1, 4 * mm), Paragraph('FONDEMENTS ESSENTIELS', section),
            Paragraph(esc(f['refs']), refs_style)
        ]
        if idx != len(fiches) - 1:
            story.append(PageBreak())

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(out)


if __name__ == '__main__':
    for key, (filename, accent) in SUBJECTS.items():
        build(key, filename, accent)
