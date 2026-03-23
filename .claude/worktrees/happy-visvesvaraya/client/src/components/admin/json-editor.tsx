import { useState, useEffect } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, CheckCircle } from "lucide-react";

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function JsonEditor({ value, onChange, placeholder, className }: JsonEditorProps) {
  const [error, setError] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(true);

  useEffect(() => {
    if (!value || value.trim() === "") {
      setError(null);
      setIsValid(true);
      return;
    }

    try {
      JSON.parse(value);
      setError(null);
      setIsValid(true);
    } catch (e) {
      setError((e as Error).message);
      setIsValid(false);
    }
  }, [value]);

  return (
    <div className="space-y-2">
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder || '{\n  "key": "value"\n}'}
        className={`font-mono text-sm min-h-[120px] ${className || ""}`}
        data-testid="json-editor"
      />
      <div className="flex items-center gap-2">
        {value && value.trim() !== "" && (
          isValid ? (
            <Badge variant="outline" className="text-green-600 border-green-600">
              <CheckCircle className="h-3 w-3 mr-1" />
              Giltig JSON
            </Badge>
          ) : (
            <Badge variant="outline" className="text-red-600 border-red-600">
              <AlertCircle className="h-3 w-3 mr-1" />
              Ogiltig JSON: {error}
            </Badge>
          )
        )}
      </div>
    </div>
  );
}
