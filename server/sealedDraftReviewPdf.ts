import PDFDocument from "pdfkit";
import type { readSealedFixtureDraft } from "./sealedDraftService";
type Draft=Awaited<ReturnType<typeof readSealedFixtureDraft>>;
// This private fixture paper is a review, not an invoice. Deliberately separate
// from ordinary invoice PDF rendering and never attach/deliver this automatically.
export function renderSealedFixtureDraftReview(data:Draft):Promise<Buffer> {
 return new Promise((resolve,reject)=>{
  const doc=new PDFDocument({size:"LETTER",margin:50,info:{Title:"Draft review - not payable"}});
  const out:Buffer[]=[];
  doc.on("data",(part:Buffer)=>out.push(part));
  doc.on("error",reject);
  doc.on("end",()=>resolve(Buffer.concat(out)));
  function heading() {
   doc.font("Helvetica-Bold").fillColor("#982727").fontSize(16).text("DRAFT REVIEW - NOT PAYABLE");
   doc.font("Helvetica").fillColor("#111111").fontSize(10)
    .text("Private office review only. No payment or delivery authorized.").moveDown();
  }
  heading();doc.on("pageAdded",heading);
  doc.text("Quote: "+data.quoteNumber).text("Company: "+data.companyName).text("Customer: "+data.customerName)
   .text("Site: "+data.siteName).text("Currency: CAD").moveDown();
  for(const l of data.lines) {
   if(doc.y>670)doc.addPage();
   doc.font("Helvetica-Bold").text("Accepted item #"+l.id+" | Qty "+l.quantity+": "+l.description);
   doc.font("Helvetica").text("Net "+l.subtotal+" | GST "+l.gst+" | PST "+l.pst+" | Total "+l.total).moveDown();
  }
  if(doc.y>620)doc.addPage();
  doc.font("Helvetica-Bold").text("Subtotal: CAD "+data.subtotal).text("GST: CAD "+data.gst)
   .text("PST: CAD "+data.pst).text("Draft total: CAD "+data.total);
  doc.end();
 });
}
