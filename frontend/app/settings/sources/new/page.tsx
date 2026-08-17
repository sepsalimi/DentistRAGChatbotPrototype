// Serves the safe source ingestion wizard at /settings/sources/new.
import Link from "next/link";
import { SourceIngestionWizard } from "@/components/SourceIngestionWizard";

export default function NewSourcePage() {
  return (
    <main className="standard-page ingestion-page">
      <header className="page-heading">
        <div>
          <span className="eyebrow">Source Registry</span>
          <h1>Add a source</h1>
          <p>Describe the source, its rights, hosting, and access before ingestion begins.</p>
        </div>
        <Link className="secondary-button" href="/settings/sources">Back to registry</Link>
      </header>
      <SourceIngestionWizard />
    </main>
  );
}
