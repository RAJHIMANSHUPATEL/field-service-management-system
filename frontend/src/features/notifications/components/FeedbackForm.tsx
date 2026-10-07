import { Star } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useSubmitFeedback } from "../hooks/useNotifications";

export type FeedbackSummary = { rating: number; satisfied: boolean; comment: string | null } | null | undefined;

export function Stars({ rating }: { rating: number }) {
  return (
    <span aria-label={`${rating} out of 5`} className="inline-flex">
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} className={value <= rating ? "size-4 fill-amber-400 text-amber-400" : "size-4 text-muted-foreground"} />
      ))}
    </span>
  );
}

// The customer rates a completed job once; afterwards the card shows what they said.
export function FeedbackCard({ workOrderId, feedback }: { workOrderId: string; feedback: FeedbackSummary }) {
  const submit = useSubmitFeedback(workOrderId);
  const [rating, setRating] = useState(0);
  const [satisfied, setSatisfied] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");

  if (feedback) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your feedback</CardTitle>
          <CardDescription>Thank you for rating this service.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <Stars rating={feedback.rating} />
          <p>{feedback.satisfied ? "Satisfied" : "Not satisfied"}</p>
          {feedback.comment ? <p className="text-muted-foreground">“{feedback.comment}”</p> : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rate this service</CardTitle>
        <CardDescription>How did the visit go?</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (rating > 0 && satisfied !== null) {
              submit.mutate({ rating, satisfied, comment: comment.trim() || undefined });
            }
          }}
        >
          <div role="radiogroup" aria-label="Rating" className="flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} star${value > 1 ? "s" : ""}`}
                className="p-1"
                onClick={() => setRating(value)}
              >
                <Star className={value <= rating ? "size-6 fill-amber-400 text-amber-400" : "size-6 text-muted-foreground"} />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant={satisfied === true ? "default" : "outline"} onClick={() => setSatisfied(true)}>
              Satisfied
            </Button>
            <Button type="button" variant={satisfied === false ? "default" : "outline"} onClick={() => setSatisfied(false)}>
              Not satisfied
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor="feedback-comment">Comments</Label>
            <textarea
              id="feedback-comment"
              className="min-h-20 w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              value={comment}
              maxLength={2000}
              onChange={(event) => setComment(event.target.value)}
            />
          </div>
          {submit.isError ? <p className="text-sm text-destructive">{submit.error.message}</p> : null}
          <Button type="submit" disabled={rating === 0 || satisfied === null || submit.isPending}>
            Send feedback
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
