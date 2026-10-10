import { estimateUnits } from "@/lib/estimateUnits";
import AdminLayout from "@/components/AdminLayout";
import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { EwfEstimate } from "../../../server/ewfIntegration";
export default function SprinklerDesk({
  siteId = 0,
  deficiencyId = 0,
}: {
  siteId?: number;
  deficiencyId?: number;
}) {
  const { user } = useAuth();
  const desk = (
    <Desk
      key={`${user?.id}:${user?.companyId}:${siteId}:${deficiencyId}`}
      siteId={siteId}
      deficiencyId={deficiencyId}
      accountScope={`${user?.id}:${user?.companyId}`}
      office={user?.role === "admin" || user?.role === "office"}
    />
  );
  return user?.role === "admin" || user?.role === "office" ? (
    <AdminLayout>{desk}</AdminLayout>
  ) : (
    desk
  );
}
function Desk({
  siteId,
  deficiencyId,
  office,
  accountScope,
}: {
  siteId: number;
  deficiencyId: number;
  office: boolean;
  accountScope: string;
}) {
  const [, navigate] = useLocation(),
    [selectedSite, setSite] = useState(siteId),
    [error, setError] = useState(""),
    [reviewedHash, setReviewedHash] = useState(""),
    [quoteId, setQuoteId] = useState(""),
    [quoteVersion, setQuoteVersion] = useState(""),
    [fitter, setFitter] = useState("");
  const ids = { siteId, deficiencyId, accountScope };
  const properties = trpc.ewf.properties.useQuery(
    { accountScope },
    { enabled: office && !deficiencyId }
  );
  const deficiencies = trpc.ewf.deficiencies.useQuery(
    { siteId: selectedSite, accountScope },
    { enabled: office && !deficiencyId && selectedSite > 0 }
  );
  const source = trpc.ewf.source.useQuery(ids, {
    enabled: office && deficiencyId > 0,
  });
  const view = trpc.ewf.read.useQuery(ids, {
    enabled: deficiencyId > 0,
    retry: false,
  });
  const open = trpc.ewf.open.useMutation({
    onSuccess: () => {
      setError("");
      void view.refetch();
    },
    onError: e => setError(e.message),
  });
  const command = trpc.ewf.command.useMutation({
    onSuccess: () => {
      setError("");
      void view.refetch();
    },
    onError: e => setError(e.message),
  });
  const data = view.data;
  return (
    <main className="container max-w-4xl py-6 space-y-5 break-words">
      <Link href={office ? "/admin/sites" : "/tech"}>← Back to Inspectra</Link>
      <h1 className="text-2xl font-bold">Sprinkler Desk</h1>
      <p>
        Internal estimating. Office staff prepare commercial scope and selling
        prices separately. Planning does not authorize shutdowns or certify
        compliance.
      </p>
      {!deficiencyId && office && (
        <section>
          <label>
            Inspectra property
            <select
              className="block w-full border p-2"
              value={selectedSite}
              onChange={e => setSite(Number(e.target.value))}
            >
              <option value="0">Choose property</option>
              {properties.data?.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <h2>Recorded deficiencies</h2>
          {deficiencies.data?.map(d => (
            <Button
              key={d.id}
              variant="outline"
              onClick={() =>
                navigate(`/sprinkler-desk/${selectedSite}/${d.id}`)
              }
            >
              {d.title}
            </Button>
          ))}
        </section>
      )}
      {source.data && (
        <section className="border rounded p-4 space-y-3">
          <h2 className="font-bold">Review source context</h2>
          <p>
            {source.data.source.property.name} —{" "}
            {source.data.source.property.address}
          </p>
          <p>{source.data.source.deficiency.title}</p>
          <p className="whitespace-pre-wrap">
            {source.data.source.deficiency.description}
          </p>
          <small className="break-all">
            Captured source version: {source.data.source.version}
          </small>
          {!data && (
            <>
              <label className="block">
                <input
                  type="checkbox"
                  checked={reviewedHash === source.data.hash}
                  onChange={e =>
                    setReviewedHash(e.target.checked ? source.data!.hash : "")
                  }
                />{" "}
                I reviewed this property and deficiency context
              </label>
              <label>
                Existing EWF draft quote ID (optional)
                <Input
                  value={quoteId}
                  onChange={e => setQuoteId(e.target.value)}
                />
              </label>
              {quoteId && (
                <label>
                  Reviewed quote revision
                  <Input
                    value={quoteVersion}
                    onChange={e => setQuoteVersion(e.target.value)}
                    type="number"
                  />
                </label>
              )}
              <Button
                disabled={
                  reviewedHash !== source.data.hash ||
                  open.isPending ||
                  (!!quoteId && quoteVersion.trim() === "")
                }
                onClick={() =>
                  open.mutate({
                    ...ids,
                    reviewedSourceHash: source.data!.hash,
                    ...(quoteId
                      ? { quoteId, quoteVersion: Number(quoteVersion) }
                      : {}),
                  })
                }
              >
                Create or link draft quote
              </Button>
            </>
          )}
        </section>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      {view.error && <p role="status">{view.error.message}</p>}
      {data && (
        <section className="space-y-4">
          <h2 className="font-bold break-all">
            Linked quote {data.quoteNumber}
          </h2>
          {data.sourceStale && (
            <p role="alert">
              Inspectra source changed. This retained estimate is read-only;
              office reconciliation is required before a new request.
            </p>
          )}
          <p>
            {data.source.property.name} — {data.source.property.address}
          </p>
          <p>
            {data.source.deficiency.title}: {data.source.deficiency.description}
          </p>
          <p>
            Recorded source: {data.source.deficiency.severity},{" "}
            {data.source.deficiency.status}. Version{" "}
            <span className="break-all">{data.source.version}</span>
          </p>
          <p>
            Return to this linked quote:{" "}
            <Link href={`/sprinkler-desk/${siteId}/${deficiencyId}`}>
              Inspectra estimate workspace
            </Link>
          </p>
          {office && (
            <div>
              <label>
                Active mapped fitter
                <select
                  className="block border p-2 w-full"
                  value={fitter}
                  onChange={e => setFitter(e.target.value)}
                >
                  <option value="">Choose fitter</option>
                  {data.fitters.map(f => (
                    <option key={f.id} value={f.id}>
                      {f.display_name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                disabled={data.sourceStale || !fitter || command.isPending}
                onClick={() =>
                  command.mutate({
                    ...ids,
                    command: {
                      action: "assign",
                      payload: {
                        quote_row_version: data.quoteVersion,
                        fitter_user_id: fitter,
                        request_brief:
                          "Estimate total labour-hours, parts and scope from the retained source. No shutdown authorization.",
                      },
                    },
                  })
                }
              >
                Assign estimate request
              </Button>
            </div>
          )}
          {data.items.map(item => (
            <Estimate
              key={`${item.id}:${item.row_version}`}
              item={item}
              office={office}
              busy={command.isPending}
              save={payload =>
                command.mutate({
                  ...ids,
                  command: {
                    action: "save",
                    payload: {
                      estimateId: item.id,
                      row_version: item.row_version,
                      ...payload,
                    },
                  },
                })
              }
              submit={() =>
                command.mutate({
                  ...ids,
                  command: {
                    action: "submit",
                    payload: {
                      estimateId: item.id,
                      row_version: item.row_version,
                    },
                  },
                })
              }
              review={note =>
                command.mutate({
                  ...ids,
                  command: {
                    action: "review",
                    payload: {
                      estimateId: item.id,
                      row_version: item.row_version,
                      quote_row_version: data.quoteVersion,
                      reviewed: true,
                      review_note: note,
                    },
                  },
                })
              }
            />
          ))}
        </section>
      )}
    </main>
  );
}
function Estimate({
  item,
  office,
  busy,
  save,
  submit,
  review,
}: {
  item: EwfEstimate;
  office: boolean;
  busy: boolean;
  save: (p: {
    estimated_hours_hundredths: number;
    scope: string;
    restrictions: string;
    notes: string;
    parts: EwfEstimate["parts"];
  }) => void;
  submit: () => void;
  review: (note: string) => void;
}) {
  const [hours, setHours] = useState(
      String((item.estimated_hours_hundredths ?? 0) / 100)
    ),
    [scope, setScope] = useState(item.scope),
    [restrictions, setRestrictions] = useState(item.restrictions),
    [notes, setNotes] = useState(item.notes),
    [parts, setParts] = useState(
      item.parts.map(p => ({ ...p, quantity: String(p.quantity_milli / 1000) }))
    ),
    [note, setNote] = useState(""),
    [dirty, setDirty] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [unitError, setUnitError] = useState("");
  const change = (fn: () => void) => {
    setDirty(true);
    fn();
  };
  return (
    <article className="border rounded p-4 space-y-3">
      <h3>
        {item.fitter_name} — {item.status}
      </h3>
      <label>
        Total labour-hours (two fitters × four hours = eight)
        <Input
          disabled={!item.writable}
          type="number"
          step="0.01"
          min="0"
          value={hours}
          onChange={e => change(() => setHours(e.target.value))}
        />
      </label>
      <label>
        Proposed scope
        <Textarea
          disabled={!item.writable}
          value={scope}
          onChange={e => change(() => setScope(e.target.value))}
        />
      </label>
      <label>
        Restrictions
        <Textarea
          disabled={!item.writable}
          value={restrictions}
          onChange={e => change(() => setRestrictions(e.target.value))}
        />
      </label>
      <label>
        Internal notes
        <Textarea
          disabled={!item.writable}
          value={notes}
          onChange={e => change(() => setNotes(e.target.value))}
        />
      </label>
      <h4>Structured parts (no selling prices)</h4>
      {unitError && <p role="alert">{unitError}</p>}
      {parts.map((part, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-3">
          <Input
            aria-label={`Part ${i + 1} description`}
            disabled={!item.writable}
            value={part.description}
            onChange={e =>
              change(() =>
                setParts(
                  parts.map((p, j) =>
                    j === i ? { ...p, description: e.target.value } : p
                  )
                )
              )
            }
          />
          <Input
            aria-label={`Part ${i + 1} quantity`}
            type="number"
            step="0.001"
            disabled={!item.writable}
            value={part.quantity}
            onChange={e =>
              change(() =>
                setParts(
                  parts.map((p, j) =>
                    j === i ? { ...p, quantity: e.target.value } : p
                  )
                )
              )
            }
          />
          <Input
            aria-label={`Part ${i + 1} unit`}
            disabled={!item.writable}
            value={part.unit}
            onChange={e =>
              change(() =>
                setParts(
                  parts.map((p, j) =>
                    j === i ? { ...p, unit: e.target.value } : p
                  )
                )
              )
            }
          />
        </div>
      ))}
      {item.writable && (
        <>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              change(() =>
                setParts([
                  ...parts,
                  {
                    description: "",
                    quantity_milli: 1000,
                    quantity: "1",
                    unit: "each",
                  },
                ])
              )
            }
          >
            Add part
          </Button>
          <Button
            disabled={busy || !dirty}
            onClick={() => {
              try {
                setUnitError("");
                save({
                  estimated_hours_hundredths: estimateUnits(hours, 2),
                  scope,
                  restrictions,
                  notes,
                  parts: parts.map(({ quantity, description, unit }) => ({
                    description,
                    unit,
                    quantity_milli: estimateUnits(quantity, 3),
                  })),
                });
              } catch (e) {
                setUnitError(
                  e instanceof Error ? e.message : "Invalid estimating units"
                );
              }
            }}
          >
            Save draft
          </Button>
          <Button disabled={busy || dirty} onClick={submit}>
            Submit saved estimate
          </Button>
          <p>Submission freezes fitter content. Save all edits first.</p>
        </>
      )}
      {office && item.reviewable && (
        <>
          <label>
            Office review note
            <Textarea value={note} onChange={e => setNote(e.target.value)} />
          </label>
          <label className="block">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={e => setConfirmed(e.target.checked)}
            />{" "}
            I reviewed the retained estimate; commercial preparation remains
            separate
          </label>
          <Button
            disabled={busy || !confirmed || !note.trim()}
            onClick={() => review(note)}
          >
            Record office review
          </Button>
        </>
      )}
      {item.review_note && <p>Retained office review: {item.review_note}</p>}
    </article>
  );
}
