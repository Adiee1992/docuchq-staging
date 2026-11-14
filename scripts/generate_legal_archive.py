#!/usr/bin/env python3
"""Generate dated/versioned archival PDFs from the app's legal content."""

import json
import re
import subprocess
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parents[1]
VERSIONS_PATH = ROOT / "src/data/legalVersions.js"
ARCHIVE_ROOT = ROOT / "output/pdf/legal-archive"


def read_export(name):
    source = VERSIONS_PATH.read_text(encoding="utf-8")
    match = re.search(rf"export const {name} = '([^']+)';", source)
    if not match:
        raise RuntimeError(f"Could not find {name} in {VERSIONS_PATH}")
    return match.group(1)


def load_legal_content():
    node_script = r"""
const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const root = process.argv[1];

function compile(file, dependencyMap = {}) {
  const code = babel.transformFileSync(file, {
    presets: [[require.resolve('@babel/preset-env'), { targets: { node: 'current' } }]],
    sourceType: 'module'
  }).code;
  const module = { exports: {} };
  const localRequire = (request) => dependencyMap[request] || require(request);
  new Function('require', 'module', 'exports', code)(localRequire, module, module.exports);
  return module.exports;
}

const company = compile(path.join(root, 'src/data/companyDetails.js'));
const legal = compile(path.join(root, 'src/data/legalContent.js'), {
  './companyDetails': company
});
process.stdout.write(JSON.stringify({
  companyDetails: company.companyDetails,
  termsSections: legal.termsSections,
  privacySections: legal.privacySections
}));
"""
    result = subprocess.run(
        ["node", "-e", node_script, str(ROOT)],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def make_pdf(path, title, version, effective_date, sections, company):
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "LegalTitle",
        parent=styles["Title"],
        fontName="Helvetica-Bold",
        fontSize=23,
        leading=28,
        textColor=colors.HexColor("#0F172A"),
        alignment=TA_CENTER,
        spaceAfter=8,
    )
    meta_style = ParagraphStyle(
        "LegalMeta",
        parent=styles["Normal"],
        fontName="Helvetica",
        fontSize=9,
        leading=13,
        textColor=colors.HexColor("#64748B"),
        alignment=TA_CENTER,
        spaceAfter=18,
    )
    heading_style = ParagraphStyle(
        "LegalHeading",
        parent=styles["Heading2"],
        fontName="Helvetica-Bold",
        fontSize=11.5,
        leading=15,
        textColor=colors.HexColor("#0F172A"),
        spaceBefore=10,
        spaceAfter=6,
        keepWithNext=True,
    )
    body_style = ParagraphStyle(
        "LegalBody",
        parent=styles["BodyText"],
        fontName="Helvetica",
        fontSize=9.2,
        leading=14,
        textColor=colors.HexColor("#334155"),
        spaceAfter=7,
    )

    def footer(canvas, doc):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#E2E8F0"))
        canvas.line(18 * mm, 14 * mm, 192 * mm, 14 * mm)
        canvas.setFont("Helvetica", 7.5)
        canvas.setFillColor(colors.HexColor("#64748B"))
        canvas.drawString(18 * mm, 9.5 * mm, f"DocuCHQ | {title} | Version {version}")
        canvas.drawRightString(192 * mm, 9.5 * mm, f"Page {doc.page}")
        canvas.restoreState()

    path.parent.mkdir(parents=True, exist_ok=True)
    document = SimpleDocTemplate(
        str(path),
        pagesize=A4,
        rightMargin=18 * mm,
        leftMargin=18 * mm,
        topMargin=18 * mm,
        bottomMargin=20 * mm,
        title=title,
        author=company["legalName"],
        subject=f"Archived {title}, version {version}",
    )
    story = [
        Paragraph("DocuCHQ", title_style),
        Paragraph(title, title_style),
        Paragraph(f"Version {version}<br/>Effective date: {effective_date}", meta_style),
        Spacer(1, 2 * mm),
    ]
    for section in sections:
        story.append(Paragraph(section["title"], heading_style))
        for paragraph in section["paragraphs"]:
            story.append(Paragraph(paragraph, body_style))
    document.build(story, onFirstPage=footer, onLaterPages=footer)


def main():
    terms_version = read_export("TERMS_VERSION")
    privacy_version = read_export("PRIVACY_VERSION")
    terms_date = read_export("TERMS_EFFECTIVE_DATE")
    privacy_date = read_export("PRIVACY_EFFECTIVE_DATE")
    content = load_legal_content()
    archive_date = terms_version[:10]
    destination = ARCHIVE_ROOT / archive_date

    outputs = [
        destination / f"terms-of-use_version-{terms_version}.pdf",
        destination / f"privacy-notice_version-{privacy_version}.pdf",
    ]
    make_pdf(outputs[0], "Terms of Use", terms_version, terms_date, content["termsSections"], content["companyDetails"])
    make_pdf(outputs[1], "Privacy Notice", privacy_version, privacy_date, content["privacySections"], content["companyDetails"])
    print("\n".join(str(path) for path in outputs))


if __name__ == "__main__":
    main()
