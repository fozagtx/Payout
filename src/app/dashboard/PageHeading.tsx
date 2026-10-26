export function PageHeading({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-6">
      <h1 className="text-3xl font-semibold tracking-[-0.045em] text-ink sm:text-[36px] sm:leading-tight">{title}</h1>
      <p className="mt-2 text-sm text-ink-soft sm:text-base">{description}</p>
    </div>
  );
}
