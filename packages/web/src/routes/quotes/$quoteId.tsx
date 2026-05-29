import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageContainer } from "@/components/layout/page-container";
import { QuoteForm } from "@/features/quotes/components/quote-form";
import { useQuotes } from "@/features/quotes/hooks/use-quotes";
import { ArrowLeft, Send } from "lucide-react";

export const Route = createFileRoute("/quotes/$quoteId")({
  component: QuoteDetailPage,
});

function QuoteDetailPage() {
  const { t } = useTranslation("quotes");
  const { quoteId } = Route.useParams();
  const navigate = useNavigate();
  const { quotes, loading, updateQuote } = useQuotes();
  const [markingSent, setMarkingSent] = useState(false);

  const quote = useMemo(
    () => quotes.find((q) => q.id === quoteId),
    [quotes, quoteId]
  );

  async function handleMarkSent() {
    if (!quote) return;
    setMarkingSent(true);
    try {
      await updateQuote(quote.id, { status: "sent" });
    } finally {
      setMarkingSent(false);
    }
  }

  if (loading) {
    return (
      <PageContainer title={t("detail.title")}>
        <p className="text-sm text-muted-foreground">{t("detail.loading")}</p>
      </PageContainer>
    );
  }

  if (!quote) {
    return (
      <PageContainer title={t("detail.title")}>
        <p className="text-sm text-muted-foreground">{t("detail.notFound")}</p>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title={t("detail.titleWithNumber", { number: quote.quoteNumber })}
      description={t("detail.description")}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate({ to: "/quotes" })}
            className="flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("detail.back")}
          </button>

          {quote.status === "created" && (
            <button
              type="button"
              onClick={handleMarkSent}
              disabled={markingSent}
              className="flex items-center gap-1.5 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {markingSent ? t("detail.marking") : t("detail.markSent")}
            </button>
          )}
        </div>

        <QuoteForm
          existingQuote={quote}
          onSaved={() => navigate({ to: "/quotes" })}
        />
      </div>
    </PageContainer>
  );
}
