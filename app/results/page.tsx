import { Suspense } from "react";
import ResultsContent from "./ResultsContent";

export default function ResultsPage() {
  return (
    <Suspense fallback={<p className="p-6 text-gray-500">Loading results...</p>}>
      <ResultsContent />
    </Suspense>
  );
}