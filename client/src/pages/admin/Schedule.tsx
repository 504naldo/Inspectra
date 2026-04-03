import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AlertTriangle, CalendarDays, CalendarCheck, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Link } from "wouter";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function statusColor(status: string) {
  if (status === "completed" || status === "finalized") return "bg-[var(--success)]";
  if (status === "in_progress") return "bg-accent";
  if (status === "scheduled") return "bg-[var(--warning)]";
  return "bg-gray-400";
}

export default function AdminSchedule() {
  const { user } = useAuth();
  const companyId = (user as any)?.companyId ?? 1;
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDay, setSelectedDay] = useState<number | null>(today.getDate());

  const { data, isLoading } = trpc.job.getScheduleSummary.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const jobsByDay: Record<number, any[]> = {};
  ((data as any)?.all ?? []).forEach((job: any) => {
    if (!job.scheduledDate) return;
    const d = new Date(job.scheduledDate);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      if (!jobsByDay[day]) jobsByDay[day] = [];
      jobsByDay[day].push(job);
    }
  });

  const selectedJobs = selectedDay ? (jobsByDay[selectedDay] ?? []) : [];

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <CalendarDays className="h-6 w-6 text-destructive" />
        <h1 className="text-2xl font-bold">Inspection Schedule</h1>
      </div>

      {((data as any)?.overdue?.length ?? 0) > 0 && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-destructive flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4" />
              {(data as any).overdue.length} Overdue Inspection{(data as any).overdue.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(data as any).overdue.map((job: any) => (
                <div key={job.id} className="flex items-center justify-between bg-white rounded p-2 border border-red-200">
                  <div>
                    <p className="font-medium text-sm">{job.title}</p>
                    <p className="text-xs text-gray-500">
                      Scheduled: {job.scheduledDate ? new Date(job.scheduledDate).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <Link href={`/admin/jobs/${job.id}`}>
                    <Button size="sm" variant="outline" className="text-destructive border-destructive/30">View</Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month - 1, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <CardTitle className="text-base">{MONTHS[month]} {year}</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => setViewDate(new Date(year, month + 1, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-400">Loading schedule…</div>
            ) : (
              <div className="grid grid-cols-7 gap-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-xs font-semibold text-gray-500 py-1">{d}</div>
                ))}
                {Array.from({ length: firstDay }).map((_, i) => <div key={`e${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day = i + 1;
                  const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
                  const isSelected = selectedDay === day;
                  const dayJobs = jobsByDay[day] ?? [];
                  return (
                    <button
                      key={day}
                      onClick={() => setSelectedDay(day)}
                      className={`rounded p-1 min-h-[48px] text-left transition-colors ${isSelected ? "bg-destructive/10 border border-destructive/40" : "hover:bg-gray-50"}`}
                    >
                      <span className={`text-xs block mb-1 ${isToday ? "text-destructive font-bold" : "text-gray-700"}`}>{day}</span>
                      <div className="flex flex-wrap gap-0.5">
                        {dayJobs.slice(0, 3).map((j: any) => (
                          <span key={j.id} className={`w-2 h-2 rounded-full ${statusColor(j.status)}`} title={j.title} />
                        ))}
                        {dayJobs.length > 3 && <span className="text-[9px] text-gray-400">+{dayJobs.length - 3}</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex gap-4 mt-4 text-xs text-gray-500">
              {[["bg-[var(--warning)]","Scheduled"],["bg-accent","In Progress"],["bg-[var(--success)]","Complete"],["bg-gray-400","Draft"]].map(([c,l]) => (
                <span key={l} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${c}`}/>{l}</span>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              {selectedDay ? `${MONTHS[month]} ${selectedDay}` : "Select a day"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedDay && <p className="text-sm text-gray-400">Click a date to see jobs.</p>}
            {selectedDay && selectedJobs.length === 0 && (
              <p className="text-sm text-gray-400">No jobs scheduled.</p>
            )}
            <div className="space-y-3">
              {selectedJobs.map((job: any) => (
                <div key={job.id} className="border rounded p-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-sm truncate">{job.title}</p>
                    {job.googleCalendarEventId && (
                      <CalendarCheck
                        className="h-3.5 w-3.5 shrink-0 text-[var(--success)]"
                        aria-label="Synced to Google Calendar"
                      />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{job.status?.replace("_"," ")}</Badge>
                    {job.jobType && <span className="text-xs text-gray-500">{job.jobType}</span>}
                  </div>
                  <Link href={`/admin/jobs/${job.id}`}>
                    <Button size="sm" variant="outline" className="w-full mt-1 text-xs">Open Job</Button>
                  </Link>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
