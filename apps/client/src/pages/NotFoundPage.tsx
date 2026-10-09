import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { paths, useRouter } from "../lib/router";

export function NotFoundPage() {
  const { navigate } = useRouter();
  return (
    <div className="mx-auto flex w-full max-w-[560px] px-4 py-16">
      <Card className="flex w-full flex-col items-center gap-4 p-8 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink">This page doesn't exist</h1>
        <p className="text-[15px] text-ink-muted">Check the link, or head back to the start.</p>
        <Button variant="primary" onClick={() => navigate(paths.home())}>
          Back to home
        </Button>
      </Card>
    </div>
  );
}
