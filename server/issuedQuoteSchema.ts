import { mysqlTable, int, varchar, mysqlEnum, timestamp, json, customType, bigint, index, primaryKey } from "drizzle-orm/mysql-core";
export type SealedTerms = {
 issueId:string; companyId:number; customerOrgId:number; quoteId:number; siteId:number;
 quoteNumber:string; issuerName:string; customerName:string; siteName:string; currency:"CAD";
 issuedEpoch:number; expiresEpoch:number;
 lines:Array<{ id:number; quantity:number; description:string; subtotal:string; gst:string; pst:string; total:string }>;
 subtotal:string; gst:string; pst:string; total:string;
};
const mediumblob=customType<{data:Buffer;driverData:Buffer}>({dataType:()=>"mediumblob"});
export const quoteAccess=mysqlTable("issued_quote_access",{
 companyId:int().notNull(),customerOrgId:int().notNull(),userId:int().notNull(),
 action:mysqlEnum(["issue","accept"]).notNull(),grantedBy:int().notNull(),
 grantedAt:timestamp().notNull().defaultNow(),revokedAt:timestamp(),
},table=>[primaryKey({columns:[table.companyId,table.customerOrgId,table.userId,table.action]})]);
export const issueVersions=mysqlTable("issued_quote_versions",{
 seq:int().notNull().autoincrement().primaryKey(),issueId:varchar({length:36}).notNull().unique(),
 companyId:int().notNull(),customerOrgId:int().notNull(),quoteId:int().notNull(),issuerId:int().notNull(),
 terms:json().$type<SealedTerms>().notNull(),termsDigest:varchar({length:64}).notNull(),
 pdf:mediumblob().notNull(),pdfDigest:varchar({length:64}).notNull(),
 issuedEpoch:bigint({mode:"number"}).notNull(),expiresEpoch:bigint({mode:"number"}).notNull(),
},table=>[index("issued_quote_active").on(table.companyId,table.quoteId,table.seq)]);
export const issueAcceptances=mysqlTable("issued_quote_acceptances",{
 issueId:varchar({length:36}).notNull().primaryKey(),companyId:int().notNull(),customerOrgId:int().notNull(),
 quoteId:int().notNull(),accepterId:int().notNull(),acceptedEpoch:bigint({mode:"number"}).notNull(),
 termsDigest:varchar({length:64}).notNull(),pdfDigest:varchar({length:64}).notNull(),
});
