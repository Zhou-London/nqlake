import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

export function ErrorNotice({
  title = "Request failed",
  message,
  problems = [],
}: {
  title?: string;
  message: string;
  problems?: string[];
}) {
  return (
    <Alert variant="destructive">
      <AlertCircle />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        <p className="break-words">{message}</p>
        {problems.length > 0 && (
          <ul className="mt-1 list-disc pl-4">
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        )}
      </AlertDescription>
    </Alert>
  );
}
