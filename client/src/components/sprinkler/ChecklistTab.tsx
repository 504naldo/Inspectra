import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Save, CheckCircle2, AlertCircle } from "lucide-react";
import { defaultChecklistQuestions } from "@/data/sprinklerChecklistQuestions";

interface ChecklistTabProps {
  inspectionId: number;
  isFinalized: boolean;
}

interface ChecklistItemData {
  id?: number;
  section: string;
  questionText: string;
  questionOrder: number;
  response: "YES" | "NO" | "NA" | null;
  comment: string | null;
  numberValue: number | null;
  dateValue: Date | null;
  tempValue: string | null;
  textValue: string | null;
}

export default function ChecklistTab({ inspectionId, isFinalized }: ChecklistTabProps) {
  const [items, setItems] = useState<ChecklistItemData[]>([]);
  const [validationErrors, setValidationErrors] = useState<Set<number>>(new Set());

  // Load existing checklist items
  const { data: existingItems, isLoading } = trpc.sprinkler.getChecklistItems.useQuery(
    { inspectionId },
    { enabled: !!inspectionId }
  );

  // Initialize checklist with default questions
  useEffect(() => {
    if (existingItems && existingItems.length > 0) {
      setItems(existingItems as ChecklistItemData[]);
    } else {
      // Initialize with default questions
      const initialized = defaultChecklistQuestions.map(q => ({
        section: q.section,
        questionText: q.questionText,
        questionOrder: q.questionOrder,
        response: null,
        comment: null,
        numberValue: null,
        dateValue: null,
        tempValue: null,
        textValue: null,
      }));
      setItems(initialized);
    }
  }, [existingItems]);

  const saveItems = trpc.sprinkler.upsertChecklistItems.useMutation({
    onSuccess: () => {
      toast.success("Checklist saved successfully");
    },
    onError: () => {
      toast.error("Failed to save checklist");
    }
  });

  const handleSave = () => {
    // Validate before saving
    const errors = new Set<number>();
    items.forEach((item, idx) => {
      // Check if response creates deficiency and requires comment
      const defaultQ = defaultChecklistQuestions.find(q => q.questionOrder === item.questionOrder);
      if (item.response && defaultQ?.createsDeficiencyWhen && item.response === defaultQ.createsDeficiencyWhen && !item.comment) {
        errors.add(idx);
      }
    });

    if (errors.size > 0) {
      setValidationErrors(errors);
      toast.error("Please add comments for all deficiency responses");
      return;
    }

    setValidationErrors(new Set());
    saveItems.mutate({
      inspectionId,
      items: items.map(item => {
        const defaultQ = defaultChecklistQuestions.find(q => q.questionOrder === item.questionOrder);
        return {
          ...item,
          response: item.response || undefined,
          comment: item.comment || undefined,
          createsDeficiencyWhen: defaultQ?.createsDeficiencyWhen || 'NEVER',
          numberValue: item.numberValue ?? undefined,
          dateValue: item.dateValue || undefined,
          tempValue: item.tempValue ?? undefined,
          textValue: item.textValue || undefined,
        };
      }),
    });
  };

  const updateItem = (index: number, field: keyof ChecklistItemData, value: any) => {
    setItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  const groupedItems = items.reduce((acc, item, index) => {
    if (!acc[item.section]) {
      acc[item.section] = [];
    }
    acc[item.section].push({ ...item, originalIndex: index });
    return acc;
  }, {} as Record<string, Array<ChecklistItemData & { originalIndex: number }>>);

  const sections = [
    "General",
    "Dry Systems",
    "Control Valves",
    "Water Supplies",
    "Wet System",
    "Alarms",
    "Sprinkler Piping"
  ];

  const getSectionCompletion = (section: string) => {
    const sectionItems = groupedItems[section] || [];
    const answered = sectionItems.filter(item => item.response !== null).length;
    return { answered, total: sectionItems.length };
  };

  const getDefaultQuestion = (questionText: string) => {
    return defaultChecklistQuestions.find(q => q.questionText === questionText);
  };

  if (isLoading) {
    return <div className="text-center py-8">Loading checklist...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          NFPA 25 / Vancouver Fire By-law Inspection Checklist
        </p>
        <Button onClick={handleSave} disabled={isFinalized || saveItems.isPending}>
          <Save className="h-4 w-4 mr-2" />
          Save Checklist
        </Button>
      </div>

      {sections.map(section => {
        const sectionItems = groupedItems[section] || [];
        const completion = getSectionCompletion(section);
        const isComplete = completion.answered === completion.total && completion.total > 0;

        return (
          <Card key={section}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{section}</CardTitle>
                <div className="flex items-center gap-2 text-sm">
                  {isComplete ? (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Complete</span>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">
                      {completion.answered} / {completion.total}
                    </span>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {sectionItems.map(item => {
                const defaultQ = getDefaultQuestion(item.questionText);
                const hasError = validationErrors.has(item.originalIndex);

                return (
                  <div
                    key={item.originalIndex}
                    className={`space-y-3 pb-4 border-b last:border-0 ${
                      hasError ? "border-red-200 bg-red-50 p-3 rounded-md" : ""
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="text-sm font-medium text-muted-foreground min-w-[30px]">
                        {item.questionOrder}.
                      </span>
                      <div className="flex-1 space-y-3">
                        <Label className="text-base font-normal">{item.questionText}</Label>

                        {/* Special input fields */}
                        {defaultQ?.hasNumberField && (
                          <div className="flex items-center gap-2">
                            <Label className="text-sm text-muted-foreground min-w-[120px]">
                              {defaultQ.fieldLabel}:
                            </Label>
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={item.numberValue ?? ''}
                              onChange={(e) => updateItem(item.originalIndex, 'numberValue', e.target.value ? parseInt(e.target.value) : null)}
                              disabled={isFinalized}
                              className="max-w-[150px]"
                            />
                          </div>
                        )}

                        {defaultQ?.hasDateField && (
                          <div className="flex items-center gap-2">
                            <Label className="text-sm text-muted-foreground min-w-[120px]">
                              {defaultQ.fieldLabel}:
                            </Label>
                            <Input
                              type="date"
                              value={item.dateValue ? new Date(item.dateValue).toISOString().split('T')[0] : ''}
                              onChange={(e) => updateItem(item.originalIndex, 'dateValue', e.target.value ? new Date(e.target.value) : null)}
                              disabled={isFinalized}
                              className="max-w-[200px]"
                            />
                          </div>
                        )}

                        {defaultQ?.hasTempField && (
                          <div className="flex items-center gap-2">
                            <Label className="text-sm text-muted-foreground min-w-[120px]">
                              {defaultQ.fieldLabel}:
                            </Label>
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={item.tempValue ?? ''}
                              onChange={(e) => updateItem(item.originalIndex, 'tempValue', e.target.value)}
                              disabled={isFinalized}
                              className="max-w-[150px]"
                              placeholder="°F"
                            />
                          </div>
                        )}

                        {defaultQ?.hasTextField && (
                          <div className="flex items-center gap-2">
                            <Label className="text-sm text-muted-foreground min-w-[120px]">
                              {defaultQ.fieldLabel}:
                            </Label>
                            <Input
                              value={item.textValue || ''}
                              onChange={(e) => updateItem(item.originalIndex, 'textValue', e.target.value)}
                              disabled={isFinalized}
                              className="max-w-[200px]"
                            />
                          </div>
                        )}

                        {/* YES/NO/NA Response (only for questions without special fields or that need response) */}
                        {(!defaultQ?.hasNumberField || item.questionOrder !== 12) && (
                          <RadioGroup
                            value={item.response || ""}
                            onValueChange={(value) => updateItem(item.originalIndex, 'response', value as "YES" | "NO" | "NA")}
                            disabled={isFinalized}
                            className="flex gap-4"
                          >
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="YES" id={`${item.originalIndex}-yes`} />
                              <Label htmlFor={`${item.originalIndex}-yes`} className="cursor-pointer font-normal">
                                YES
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="NO" id={`${item.originalIndex}-no`} />
                              <Label htmlFor={`${item.originalIndex}-no`} className="cursor-pointer font-normal">
                                NO
                              </Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="NA" id={`${item.originalIndex}-na`} />
                              <Label htmlFor={`${item.originalIndex}-na`} className="cursor-pointer font-normal">
                                N/A
                              </Label>
                            </div>
                          </RadioGroup>
                        )}

                        {/* Deficiency Warning */}
                        {item.response && defaultQ?.createsDeficiencyWhen && item.response === defaultQ.createsDeficiencyWhen && (
                          <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-800 rounded-md">
                            <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400 flex-shrink-0" />
                            <span className="text-sm text-orange-700 dark:text-orange-300">
                              This response will be recorded as a deficiency
                            </span>
                          </div>
                        )}

                        {/* Comment field (required for deficiency-creating responses) */}
                        {item.response && defaultQ?.createsDeficiencyWhen && item.response === defaultQ.createsDeficiencyWhen && (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Label className="text-sm font-medium">
                                Comment <span className="text-red-500">*</span>
                              </Label>
                              {hasError && (
                                <span className="text-xs text-red-600 flex items-center gap-1">
                                  <AlertCircle className="h-3 w-3" />
                                  Required for NO responses
                                </span>
                              )}
                            </div>
                            <Textarea
                              value={item.comment || ''}
                              onChange={(e) => updateItem(item.originalIndex, 'comment', e.target.value)}
                              disabled={isFinalized}
                              rows={2}
                              placeholder="Describe the deficiency..."
                              className={hasError ? "border-red-500" : ""}
                            />
                          </div>
                        )}

                        {/* Optional comment for YES/NA */}
                        {item.response && item.response !== "NO" && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Comment (optional)</Label>
                            <Textarea
                              value={item.comment || ''}
                              onChange={(e) => updateItem(item.originalIndex, 'comment', e.target.value)}
                              disabled={isFinalized}
                              rows={2}
                              placeholder="Additional notes..."
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
