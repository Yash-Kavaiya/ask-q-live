import { Injectable } from '@angular/core';
import { PostSessionReport, Question, Session } from '../models/qa.models';

@Injectable({
  providedIn: 'root',
})
export class ReportExporterService {

  /**
   * Export executive summary, insights, and session questions as a formatted PDF.
   */
  public async exportPdf(
    session: Session | null,
    report: PostSessionReport | null,
    questions: Question[] = []
  ): Promise<void> {
    if (typeof window === 'undefined') return;

    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4',
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentWidth = pageWidth - margin * 2;
    let y = margin;

    const sessionTitle = session?.title || report?.sessionTitle || 'Live Q&A Session';
    const joinCode = session?.joinCode || 'ASKQ';
    const nowStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Helper: Add new page if needed
    const checkPageBreak = (neededHeight: number): void => {
      if (y + neededHeight > pageHeight - margin - 30) {
        doc.addPage();
        y = margin + 20;
        drawPageHeader();
      }
    };

    // Helper: Draw running header on subsequent pages
    const drawPageHeader = (): void => {
      doc.setFontSize(8);
      doc.setTextColor(116, 119, 117);
      doc.setFont('helvetica', 'normal');
      doc.text(`AskQlive • Executive Report • ${sessionTitle} (${joinCode})`, margin, y - 10);
      doc.setDrawColor(224, 226, 236);
      doc.line(margin, y - 5, pageWidth - margin, y - 5);
      y += 10;
    };

    // 1. BRAND HEADER & BANNER
    doc.setFillColor(26, 115, 232); // #1A73E8 Google Blue
    doc.rect(margin, y, contentWidth, 5, 'F');
    y += 18;

    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(31, 31, 31);
    doc.text('AskQlive | Executive Q&A Debrief', margin, y);
    y += 16;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(116, 119, 117);
    doc.text(`AI-Powered Real-Time Audience Intelligence & Speaker Debrief`, margin, y);
    y += 20;

    // 2. METADATA STATS BAR
    doc.setFillColor(248, 249, 250); // #F8F9FA
    doc.roundedRect(margin, y, contentWidth, 48, 6, 6, 'F');
    doc.setDrawColor(224, 226, 236);
    doc.roundedRect(margin, y, contentWidth, 48, 6, 6, 'S');

    const totalQ = report?.totalQuestions ?? questions.length;
    const totalVotes = report?.totalUpvotes ?? questions.reduce((sum, q) => sum + (q.upvotes || 0), 0);
    const approvedQ = questions.filter(q => q.status === 'APPROVED' || q.status === 'ANSWERED').length;

    doc.setFontSize(9);
    doc.setTextColor(68, 71, 70);
    doc.setFont('helvetica', 'bold');
    doc.text(`Session:`, margin + 14, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.text(`${sessionTitle} (Code: ${joinCode})`, margin + 60, y + 18);

    doc.setFont('helvetica', 'bold');
    doc.text(`Exported:`, margin + 14, y + 34);
    doc.setFont('helvetica', 'normal');
    doc.text(`${nowStr}`, margin + 60, y + 34);

    const statsX = margin + contentWidth - 180;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Questions:`, statsX, y + 18);
    doc.setFont('helvetica', 'normal');
    doc.text(`${totalQ} (${approvedQ} on stage)`, statsX + 80, y + 18);

    doc.setFont('helvetica', 'bold');
    doc.text(`Total Upvotes:`, statsX, y + 34);
    doc.setFont('helvetica', 'normal');
    doc.text(`${totalVotes} audience votes`, statsX + 80, y + 34);

    y += 62;

    // 3. EXECUTIVE SUMMARY
    if (report?.executiveSummary) {
      checkPageBreak(100);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 115, 232);
      doc.text('1. Executive Debrief Summary', margin, y);
      y += 14;

      doc.setFillColor(232, 240, 254); // #E8F0FE
      doc.setDrawColor(210, 227, 252);
      
      const summaryLines = doc.splitTextToSize(report.executiveSummary, contentWidth - 24);
      const boxHeight = summaryLines.length * 13 + 18;
      
      doc.roundedRect(margin, y, contentWidth, boxHeight, 6, 6, 'FD');
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(31, 31, 31);
      doc.text(summaryLines, margin + 12, y + 16);

      y += boxHeight + 18;
    }

    // 4. TOP AUDIENCE THEMATIC CLUSTERS
    if (report?.topThemes && report.topThemes.length > 0) {
      checkPageBreak(80);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(26, 115, 232);
      doc.text('2. Top Audience Thematic Clusters', margin, y);
      y += 14;

      for (const theme of report.topThemes) {
        checkPageBreak(65);
        doc.setFillColor(248, 249, 250);
        doc.setDrawColor(224, 226, 236);

        const descLines = doc.splitTextToSize(theme.description, contentWidth - 24);
        let themeBoxHeight = 28 + descLines.length * 12;

        if (theme.questionExamples && theme.questionExamples.length > 0) {
          themeBoxHeight += theme.questionExamples.length * 12 + 10;
        }

        checkPageBreak(themeBoxHeight + 10);
        doc.roundedRect(margin, y, contentWidth, themeBoxHeight, 5, 5, 'FD');

        // Theme Title
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(31, 31, 31);
        doc.text(`• ${theme.title}`, margin + 12, y + 16);

        // Description
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(68, 71, 70);
        doc.text(descLines, margin + 12, y + 30);

        let currentInnerY = y + 30 + descLines.length * 12 + 6;

        if (theme.questionExamples && theme.questionExamples.length > 0) {
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8.5);
          doc.setTextColor(116, 119, 117);
          for (const eg of theme.questionExamples) {
            const egLine = doc.splitTextToSize(`"${eg}"`, contentWidth - 32);
            doc.text(egLine, margin + 18, currentInnerY);
            currentInnerY += egLine.length * 11;
          }
        }

        y += themeBoxHeight + 10;
      }
      y += 8;
    }

    // 5. UNRESOLVED HIGH-FRICTION TOPICS
    if (report?.unresolvedTopics && report.unresolvedTopics.length > 0) {
      checkPageBreak(80);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(176, 96, 0); // #B06000 Amber
      doc.text('3. Unresolved Audience Topics & High-Friction Points', margin, y);
      y += 14;

      for (const item of report.unresolvedTopics) {
        const sigLines = doc.splitTextToSize(item.significance, contentWidth - 28);
        const itemHeight = 24 + sigLines.length * 12;
        checkPageBreak(itemHeight + 8);

        doc.setFillColor(254, 247, 224); // #FEF7E0
        doc.setDrawColor(254, 239, 195);
        doc.roundedRect(margin, y, contentWidth, itemHeight, 4, 4, 'FD');

        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(176, 96, 0);
        doc.text(`! ${item.topic}`, margin + 12, y + 14);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(68, 71, 70);
        doc.text(sigLines, margin + 12, y + 26);

        y += itemHeight + 6;
      }
      y += 10;
    }

    // 6. ACTIONABLE SPEAKER FOLLOW-UPS
    if (report?.actionableFollowUps && report.actionableFollowUps.length > 0) {
      checkPageBreak(90);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(19, 115, 51); // #137333 Green
      doc.text('4. Actionable Speaker Follow-ups & Takeaways', margin, y);
      y += 14;

      let idx = 1;
      for (const followUp of report.actionableFollowUps) {
        const itemLines = doc.splitTextToSize(followUp, contentWidth - 36);
        const itemHeight = Math.max(26, itemLines.length * 12 + 14);
        checkPageBreak(itemHeight + 6);

        doc.setFillColor(230, 244, 234); // #E6F4EA
        doc.setDrawColor(206, 234, 214);
        doc.roundedRect(margin, y, contentWidth, itemHeight, 4, 4, 'FD');

        doc.setFillColor(30, 142, 62);
        doc.circle(margin + 16, y + 12, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(`${idx}`, margin + 14, y + 15);

        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(31, 31, 31);
        doc.text(itemLines, margin + 30, y + 15);

        y += itemHeight + 6;
        idx++;
      }
      y += 12;
    }

    // 7. COMPLETE QUESTIONS LOG TRANSCRIPT
    if (questions.length > 0) {
      checkPageBreak(100);
      doc.setFontSize(13);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(31, 31, 31);
      doc.text(`5. Live Session Questions Log (${questions.length} Total)`, margin, y);
      y += 14;

      const sortedQuestions = [...questions].sort((a, b) => b.upvotes - a.upvotes);

      for (const q of sortedQuestions) {
        const contentLines = doc.splitTextToSize(q.content, contentWidth - 28);
        let qHeight = 26 + contentLines.length * 12;
        if (q.aiLine1) qHeight += 24;

        checkPageBreak(qHeight + 6);

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(224, 226, 236);
        doc.roundedRect(margin, y, contentWidth, qHeight, 4, 4, 'FD');

        // Upvotes badge + Author + Category
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(26, 115, 232);
        doc.text(`▲ ${q.upvotes} votes`, margin + 10, y + 14);

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(116, 119, 117);
        doc.text(`• ${q.authorName} (${q.category || 'General'}) • Status: ${q.status}`, margin + 65, y + 14);

        // Content
        doc.setFontSize(9);
        doc.setTextColor(31, 31, 31);
        doc.setFont('helvetica', 'normal');
        doc.text(contentLines, margin + 10, y + 26);

        // AI 2-Line Answer preview
        if (q.aiLine1) {
          const aiY = y + 26 + contentLines.length * 12 + 2;
          doc.setFontSize(8);
          doc.setFont('helvetica', 'italic');
          doc.setTextColor(26, 115, 232);
          const aiText = doc.splitTextToSize(`AI Synthesis: "${q.aiLine1} ${q.aiLine2 || ''}"`, contentWidth - 28);
          doc.text(aiText, margin + 10, aiY);
        }

        y += qHeight + 6;
      }
    }

    // FOOTER (Page Numbers on all pages)
    const totalPages = doc.internal.pages.length - 1;
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `AskQlive • Generated on ${nowStr} • Page ${i} of ${totalPages}`,
        pageWidth / 2,
        pageHeight - 18,
        { align: 'center' }
      );
    }

    // Save and Trigger Download
    const cleanFilename = `AskQlive_Executive_Report_${joinCode}_${new Date().toISOString().slice(0, 10)}.pdf`;
    doc.save(cleanFilename);
  }

  /**
   * Export executive summary, insights, clusters, follow-ups, and question logs as a structured CSV file.
   */
  public exportCsv(
    session: Session | null,
    report: PostSessionReport | null,
    questions: Question[] = []
  ): void {
    const rows: string[][] = [];

    const escapeCsv = (field: string | number | null | undefined): string => {
      if (field === null || field === undefined) return '""';
      const str = String(field);
      // Double up internal quotes
      return `"${str.replace(/"/g, '""')}"`;
    };

    const addRow = (...cols: (string | number | null | undefined)[]) => {
      rows.push(cols.map(escapeCsv));
    };

    const sessionTitle = session?.title || report?.sessionTitle || 'Live Q&A Session';
    const joinCode = session?.joinCode || 'ASKQ';
    const exportDate = new Date().toISOString();

    // 1. SESSION METADATA BLOCK
    addRow('=== AskQlive Executive Report & Session Insights ===');
    addRow('Session Title', sessionTitle);
    addRow('Join Code', joinCode);
    addRow('Export Timestamp', exportDate);
    addRow('Total Questions', report?.totalQuestions ?? questions.length);
    const totalUpvotes = report?.totalUpvotes ?? questions.reduce((sum, q) => sum + (q.upvotes || 0), 0);
    addRow('Total Upvotes', totalUpvotes);
    addRow('');

    // 2. EXECUTIVE SUMMARY
    if (report?.executiveSummary) {
      addRow('=== Executive Debrief Summary ===');
      addRow('Summary Text', report.executiveSummary);
      addRow('');
    }

    // 3. THEMATIC CLUSTERS
    if (report?.topThemes && report.topThemes.length > 0) {
      addRow('=== Top Audience Thematic Clusters ===');
      addRow('Theme Title', 'Description', 'Sample Questions');
      for (const theme of report.topThemes) {
        const samples = theme.questionExamples ? theme.questionExamples.join(' | ') : '';
        addRow(theme.title, theme.description, samples);
      }
      addRow('');
    }

    // 4. UNRESOLVED HIGH-FRICTION TOPICS
    if (report?.unresolvedTopics && report.unresolvedTopics.length > 0) {
      addRow('=== Unresolved Audience Topics & Knowledge Gaps ===');
      addRow('Topic', 'Significance / Reason');
      for (const item of report.unresolvedTopics) {
        addRow(item.topic, item.significance);
      }
      addRow('');
    }

    // 5. ACTIONABLE SPEAKER FOLLOW-UPS
    if (report?.actionableFollowUps && report.actionableFollowUps.length > 0) {
      addRow('=== Actionable Speaker Follow-ups ===');
      addRow('Step #', 'Follow-up Action');
      report.actionableFollowUps.forEach((item, index) => {
        addRow(index + 1, item);
      });
      addRow('');
    }

    // 6. DETAILED QUESTIONS LOG
    addRow('=== Full Live Questions Log ===');
    addRow(
      'Question ID',
      'Author',
      'Anonymous',
      'Category',
      'Content',
      'Upvotes',
      'Status',
      'AI Synthesis Line 1',
      'AI Synthesis Line 2',
      'AI Confidence',
      'Spam Flagged',
      'Sentiment Score',
      'Cluster Count',
      'Created At'
    );

    const sortedQuestions = [...questions].sort((a, b) => b.upvotes - a.upvotes);
    for (const q of sortedQuestions) {
      addRow(
        q.id,
        q.authorName,
        q.isAnonymous ? 'Yes' : 'No',
        q.category || 'General',
        q.content,
        q.upvotes,
        q.status,
        q.aiLine1 || '',
        q.aiLine2 || '',
        q.aiConfidence ?? '',
        q.isSpam ? 'Yes' : 'No',
        q.sentimentScore ?? '',
        q.clusterCount ?? 0,
        q.createdAt
      );
    }

    const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `AskQlive_Report_${joinCode}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
