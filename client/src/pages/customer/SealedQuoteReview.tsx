import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from "@/components/ui/dialog";
import { createTRPCReact } from "@trpc/react-query";
import type { SealedReviewFixtureRouter } from "../../../../server/testFixtures/sealedReviewRouter";

export const sealedReviewTrpc = createTRPCReact<SealedReviewFixtureRouter>();
import { reviewedAcceptance, type IssuedQuoteKey } from "./sealedQuoteReview";

function ReviewCard({item}:{item:IssuedQuoteKey & {acceptedEpoch:number|null}}) {
 const utils=sealedReviewTrpc.useUtils();
 const [open,setOpen]=useState(false);
 const [openedFor,setOpenedFor]=useState<(IssuedQuoteKey & {pdfDigest:string})|null>(null);
 const [confirmed,setConfirmed]=useState(false);
 const [receipt,setReceipt]=useState(false);
 const version={quoteId:item.quoteId,issueId:item.issueId};
 const preview=sealedReviewTrpc.sealedQuote.preview.useQuery(version,{enabled:open,refetchOnWindowFocus:false,staleTime:0,gcTime:0,retry:false});
 const accept=sealedReviewTrpc.sealedQuote.accept.useMutation({onSuccess:()=>{
   setReceipt(true);void utils.sealedQuote.list.invalidate();
 }});
 const [pdfUrl,setPdfUrl]=useState<string|null>(null);
 useEffect(()=>{
  setConfirmed(false);setOpenedFor(null);
  if(!open || !preview.isSuccess || !preview.data)return;
  const bytes=Uint8Array.from(atob(preview.data.pdf),c=>c.charCodeAt(0));
  const url=URL.createObjectURL(new Blob([bytes],{type:"application/pdf"}));
  setPdfUrl(url);
  return ()=>{URL.revokeObjectURL(url);setPdfUrl(null);};
 },[open,preview.isSuccess,preview.data?.pdfDigest,preview.data?.reviewToken,item.issueId]);
 const proof=preview.isSuccess && !preview.isFetching ? preview.data:undefined;
 const payload=reviewedAcceptance({active:version,openedFor,confirmation:confirmed,proof,now:Date.now()});
 const change=(value:boolean)=>{
   setOpen(value);setConfirmed(false);setOpenedFor(null);accept.reset();
 };
 return <Card><CardContent className="flex items-center justify-between gap-4 p-4">
  <div><div className="font-medium">Issued quote #{item.quoteId}</div><p className="text-sm text-muted-foreground">
   {item.acceptedEpoch || receipt ? "Acceptance recorded" : "Review the exact issued PDF"}
  </p></div>
  <Dialog open={open} onOpenChange={change}>
   <DialogTrigger asChild><Button variant="outline">Review issued quote</Button></DialogTrigger>
   <DialogContent>
    <DialogHeader><DialogTitle>{proof?.quoteNumber??"Issued quote"}</DialogTitle>
     <DialogDescription>Approval applies only to this issued PDF. It does not create an invoice.</DialogDescription>
    </DialogHeader>
    {preview.isPending || preview.isFetching ? <p>Loading exact issued version…</p>:null}
    {preview.isError ? <p role="alert">This issued PDF is unavailable. No approval has been recorded.</p>:null}
    {proof && pdfUrl ? <div className="space-y-3">
      <p>{proof.siteName}: CAD {proof.total}</p>
      <Button variant="outline" asChild><a href={pdfUrl} target="_blank" rel="noopener noreferrer"
        onClick={()=>setOpenedFor({...version,pdfDigest:proof.pdfDigest})}>Open exact issued PDF</a></Button>
      {item.acceptedEpoch || receipt ? <p role="status">Acceptance recorded for this issued version.</p>:
      <>
       <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed}
         disabled={!openedFor||accept.isPending} onChange={e=>setConfirmed(e.target.checked)}/>
         I reviewed the issued PDF and accept its scope and price.</label>
       {accept.isError ? <p role="alert">{accept.error.message} Reopen the issued PDF or retry to check your acceptance.</p>:null}
       <Button disabled={!payload||accept.isPending} onClick={()=>{
        const current=reviewedAcceptance({active:version,openedFor,confirmation:confirmed,proof,now:Date.now()});
        if(current)accept.mutate(current);
        else {setConfirmed(false);setOpenedFor(null);void preview.refetch();}
       }}>{accept.isPending?"Recording…":"Accept this issued version"}</Button>
      </>}
     </div>:null}
   </DialogContent>
  </Dialog>
 </CardContent></Card>;
}
export default function SealedQuoteReview() {
 const list=sealedReviewTrpc.sealedQuote.list.useQuery(undefined,{retry:false});
 return <div className="space-y-4">
  <p className="text-sm text-muted-foreground">Only eligible issued versions appear here.</p>
  {list.isPending ? <p>Loading issued quotes…</p> : list.isError ? <p role="alert">Issued quotes unavailable.</p> :
   list.data.length ? list.data.map(row=><ReviewCard key={row.issueId} item={row}/>) : <p>No issued quotes are available for your account.</p>}
 </div>;
}
