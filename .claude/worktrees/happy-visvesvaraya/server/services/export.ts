import { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } from 'docx';
import PDFDocument from 'pdfkit';
import type { ApplicationSection } from '@shared/schema';

interface ApplicationData {
  grantTitle: string;
  companyName: string;
  content: string;
  sections?: ApplicationSection[];
  generatedAt: Date;
}

function sectionsToContent(sections: ApplicationSection[]): string {
  return sections.map(s => `## ${s.sectionTitle}\n\n${s.content}`).join('\n\n');
}

export async function exportToDocx(application: ApplicationData): Promise<Buffer> {
  const hasSections = application.sections && application.sections.length > 0;
  const content = hasSections ? sectionsToContent(application.sections!) : application.content;
  const paragraphs = content.split('\n\n').filter(p => p.trim());

  const docChildren = [
    new Paragraph({
      text: application.grantTitle,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [new TextRun({ text: `Ansökan från ${application.companyName}`, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: new Date(application.generatedAt).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' }),
          color: '666666',
          size: 20,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 800 },
    }),
  ];

  if (hasSections) {
    for (const section of application.sections!) {
      docChildren.push(
        new Paragraph({
          text: section.sectionTitle,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        })
      );
      if (section.maxWords) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${section.wordCount}/${section.maxWords} ord`, color: '999999', size: 18, italics: true }),
            ],
            spacing: { after: 100 },
          })
        );
      }
      const sectionParagraphs = section.content.split('\n\n').filter(p => p.trim());
      for (const para of sectionParagraphs) {
        docChildren.push(
          new Paragraph({
            children: [new TextRun({ text: para })],
            spacing: { before: 100, after: 100 },
          })
        );
      }
    }
  } else {
    for (const para of paragraphs) {
      const isHeading = para.trim().startsWith('#');
      const text = isHeading ? para.replace(/^#+\s*/, '') : para;
      if (isHeading) {
        docChildren.push(new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 200 } }));
      } else {
        docChildren.push(new Paragraph({ children: [new TextRun({ text })], spacing: { before: 200, after: 200 } }));
      }
    }
  }

  docChildren.push(
    new Paragraph({ text: '', spacing: { before: 800 } }),
    new Paragraph({
      children: [new TextRun({ text: 'Genererad med getgrant.ai', color: '999999', size: 18 })],
      alignment: AlignmentType.CENTER,
    })
  );

  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: docChildren,
    }],
  });

  return await Packer.toBuffer(doc);
}

export async function exportToPdf(application: ApplicationData): Promise<Buffer> {
  const hasSections = application.sections && application.sections.length > 0;

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
    });

    doc.on('data', chunk => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(24).font('Helvetica-Bold').text(application.grantTitle, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).font('Helvetica').text(`Ansökan från ${application.companyName}`, { align: 'center' });
    doc.moveDown();
    doc.fontSize(10).fillColor('#666666').text(
      new Date(application.generatedAt).toLocaleDateString('sv-SE', { year: 'numeric', month: 'long', day: 'numeric' }),
      { align: 'center' }
    );
    doc.moveDown(2);
    doc.fillColor('#000000');

    if (hasSections) {
      for (const section of application.sections!) {
        doc.fontSize(16).font('Helvetica-Bold').text(section.sectionTitle);
        if (section.maxWords) {
          doc.fontSize(9).fillColor('#999999').font('Helvetica-Oblique').text(`${section.wordCount}/${section.maxWords} ord`);
          doc.fillColor('#000000');
        }
        doc.moveDown(0.5);
        doc.fontSize(12).font('Helvetica').text(section.content, { align: 'justify', lineGap: 4 });
        doc.moveDown(1.5);
      }
    } else {
      const content = application.content;
      const paragraphs = content.split('\n\n').filter(p => p.trim());
      for (const para of paragraphs) {
        const isHeading = para.trim().startsWith('#');
        const text = isHeading ? para.replace(/^#+\s*/, '') : para;
        if (isHeading) {
          doc.fontSize(16).font('Helvetica-Bold').text(text);
          doc.moveDown(0.5);
        } else {
          doc.fontSize(12).font('Helvetica').text(text, { align: 'justify', lineGap: 4 });
          doc.moveDown();
        }
      }
    }

    doc.moveDown(2);
    doc.fontSize(10).fillColor('#999999').text('Genererad med getgrant.ai', { align: 'center' });
    doc.end();
  });
}
