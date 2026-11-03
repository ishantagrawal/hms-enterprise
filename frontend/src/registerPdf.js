export async function downloadComplaintRegister({ title, hostel, wing, category, complaints }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);
  const document = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  document.setFontSize(15);
  document.text('SVNIT Campus Hostel Management System', 14, 14);
  document.setFontSize(12);
  document.text(title, 14, 22);
  document.setFontSize(9);
  document.text(`Hostel: ${hostel}   |   Wing: ${wing || 'All'}   |   Category: ${category || 'All'}   |   Generated: ${new Date().toLocaleString()}`, 14, 28);

  autoTable(document, {
    startY: 33,
    theme: 'grid',
    head: [['No.', 'Ticket / Date', 'Wing / Room', 'Student / Roll No.', 'Mobile No.', 'Category', 'Complaint / Action Taken', 'Status', 'Staff Sign']],
    body: complaints.map((complaint, index) => [
      String(index + 1),
      `${complaint.ticket_id}\n${complaint.created_at}`,
      `${complaint.wing || 'Unassigned'}\nRoom ${complaint.room}`,
      `${complaint.student_name}\n${complaint.student_id}`,
      complaint.phone || '—',
      complaint.routed_to || complaint.category,
      `${complaint.summary}\n${complaint.staff_remark || complaint.description}`,
      complaint.status,
      ''
    ]),
    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [100, 116, 139], lineWidth: 0.15, overflow: 'linebreak' },
    headStyles: { fillColor: [0, 41, 112], textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [245, 247, 250] },
    columnStyles: { 0: { cellWidth: 8 }, 4: { cellWidth: 22 }, 8: { cellWidth: 24 } },
    margin: { left: 10, right: 10 }
  });

  document.save('svnit-hostel-complaint-register.pdf');
}