import { ClipboardList } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Props {
  quizAnswers: Record<string, string | string[]> | null | undefined;
}

export function ContactQuizAnswersSection({ quizAnswers }: Props) {
  if (!quizAnswers || typeof quizAnswers !== "object" || Object.keys(quizAnswers).length === 0) {
    return null;
  }

  return (
    <>
      <Separator />
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <ClipboardList className="h-4 w-4" />
          Risposte Quiz
        </h3>
        <div className="space-y-3">
          {Object.entries(quizAnswers).map(([question, answer]) => (
            <div key={question} className="space-y-1">
              <p className="text-xs font-semibold text-foreground">{question}</p>
              <div className="flex flex-wrap gap-1">
                {Array.isArray(answer) ? (
                  answer.map((a, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">
                      {a}
                    </Badge>
                  ))
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    {answer}
                  </Badge>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
